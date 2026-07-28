import { useEffect, useRef, useState } from 'react';
import './App.css'
import Device from './components/device';
import axios from 'axios';

type Device = {
  id:string;
  name: string;
  typ: string;
  ip: string;
}

type DeviceType = 
  | 'iPhone' 
  | 'iPad' 
  | 'Android' 
  | 'TV' 
  | 'Mac' 
  | 'Windows' 
  | 'Linux' 
  | 'Unknown';

type WSDmsg = {
  event: string;
  users?: Device[];
  filename?:string;
  transfer_id?:string;
  id?:string;
  senderName?:string;
}

type Filereq = {
  filename: string;
  transferid: string;
  senderName:string;
}

type Outgoingfilereq = {
  targetdevice: string;
  file: File;
}

type OutgoingItemUI = {
  transferId: string;
  filename: string;
  targetDeviceName: string;
  status: 'waiting' | 'uploading' | 'done' | 'failed';
};

function App() {
  const [ws, setWs] = useState(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicename, setdevicename] = useState(null)
  const [devicetype, setdevicetype] = useState<DeviceType>(null)
  const [own_id, setownid] = useState(null)
  const [incomingfilereqs, setincomingfilereqs] = useState<Filereq[]>([])
  const [api_url, setapi_url] = useState<string>("192.168.1.31:3000")
  const [progress, setProgress] = useState<Map<string, number>>(new Map());
  const outgoingfilereqsRef = useRef<Map<string, Outgoingfilereq>>(new Map())
  const [outgoingList, setOutgoingList] = useState<OutgoingItemUI[]>([]);
  const logging = true

  useEffect(() => {
    if (!logging) return;
    console.log("[DEVICES] - ", devices);
    console.log("[DEVICENAME] - ", devicename);
    console.log("[DEVICETYPE] - ", devicetype);
    console.log("[OWNID] - ", own_id);
    console.log("[OUTGOINGFILEREQS] - ", outgoingfilereqsRef.current);
    console.log("[PROGRESS] - ", progress);
  }, [devices, devicename, devicetype, own_id, progress, logging]);

  useEffect(() => {
    const detectedType = getDeviceType();
    setdevicetype(detectedType);

    const params = new URLSearchParams();
    if (devicename) params.append('name', devicename);
    if (detectedType) params.append('type', detectedType);

    const queryString = params.toString();
    const url = `ws://${api_url}/ws${queryString ? `?${queryString}` : ''}`;

    const socket = new WebSocket(url);
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data) as WSDmsg;
      switch (data.event) {
        case "devices_update":
          setDevices(data.users || []);
          break;

        case "incoming_transfer":
          setincomingfilereqs(prevItems => [...prevItems, {filename: data.filename || "unknown", transferid: data.transfer_id || "", senderName:data.senderName || "unknown"}]);
          break;

        case "receiver_ready":
          startaxiosupload(data.transfer_id); 
          console.log("[DEBUG] 3. Received receiver_ready from server Transfer ID:", data.transfer_id);
          break;

        case "welcome":
          setownid(data.id);
          break;
      }
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, []); 

  function getDeviceType(): DeviceType {
    const ua = navigator.userAgent;
    if (/smart-tv|smarttv|googletv|appletv|hbbtv|pov_tv|netcast|webos|tizen|roku|aftt|aftm|firetv/i.test(ua)) {
      return 'TV';
    }
    if (/iPhone/i.test(ua)) return 'iPhone';
    const isiPad = /iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isiPad) return 'iPad';
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Unknown';
  }

  const handleDrop = (file:File, targetDeviceID:string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error("WebSocket is not connected");
      return;
    }
    const targetDevice = devices.find(d => d.id === targetDeviceID);
    const transferId = crypto.randomUUID();
    outgoingfilereqsRef.current.set(transferId, {
      targetdevice: targetDeviceID,
      file: file,
    });
    setOutgoingList(prev => [
    ...prev,
    {
      transferId,
      filename: file.name,
      targetDeviceName: targetDevice?.name || "unknown",
      status: 'waiting', 
    }
  ]);
    ws.send(JSON.stringify({
        event: "upload_request",
        target_id: targetDeviceID,
        transfer_id: transferId,
        filename: file.name
        
    }));
  }

  const handleaccept = (filetoaccept:Filereq) => {
    const iframe = document.createElement("iframe")
    iframe.style.display = "none"
    iframe.src = `http://${api_url}/download/${filetoaccept.transferid}`
    document.body.appendChild(iframe)
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 60000);
    setincomingfilereqs(prevItems => prevItems.filter(item => item.transferid != filetoaccept.transferid))
  }

  const startaxiosupload = async (transferId) => {
    const fileToUpload = outgoingfilereqsRef.current?.get(transferId).file;

    console.log("[DEBUG] 3.5 startaxiosupload fired. File status:", fileToUpload ? "File exists" : "NULL");
    if (!fileToUpload) {
      console.log("[DEBUG] ERROR: Upload aborted because no file was found in ref");
      return;
    }
    setOutgoingList(prev =>
      prev.map(item => item.transferId === transferId ? { ...item, status: 'uploading' } : item)
    );
    try {
        await axios.post(`http://${api_url}/stream/${transferId}`, fileToUpload, {
        headers:{
          "Content-Type": fileToUpload.type || "application/octet-stream",
          
        },
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || 1;
          const percentCompleted = Math.round((progressEvent.loaded * 100) / total);
          setProgress(prev => new Map(prev.set(transferId, percentCompleted)));
          console.log(`uploading: ${percentCompleted}%`);
        }
      })

      console.log("upload complete")
      outgoingfilereqsRef.current.delete(transferId);
      setOutgoingList(prev => prev.filter(item => item.transferId !== transferId));
      setProgress(prev => {
        const next = new Map(prev);
        next.delete(transferId);
        return next;
      });
    }
    catch (e) {
      console.log("error during upload:", e)
      setOutgoingList(prev =>
        prev.map(item => item.transferId === transferId ? { ...item, status: 'failed' } : item)
      );
    }
  }

  return (
    <>
      <div className='min-w-screen min-h-screen bg-[#252527] flex flex-row'>
        <div className='text-white m-12'>
          <div className=''>
            <h1 className='text-3xl mb-6'>Connected devices</h1>
            <div className='flex-col gap-2 flex ml-2'>
                {devices.map((device) => device.id != own_id && (
                  <Device key={device.id} handle_drop={handleDrop} target_device={device.id} device_name={device.name} />
                ))}
            </div>
          </div>
          {incomingfilereqs.length>0 && 
          <div>
            <h1 className='text-3xl mb-6'>File upload requests</h1>
            {
              incomingfilereqs.map((filereq:Filereq)=>(
                <div  key={filereq.transferid} className=' bg-[#637aef] flex pl-4  justify-between rounded-[5px] items-center'>
                  <div>
                    {filereq.filename}
                    {filereq.senderName.length>0 && 
                      <h1>from: {filereq.senderName}</h1>
                    }
                  </div>
                  <button className='h-full bg-[#cc3636] p-4 cursor-pointer' onClick={()=>handleaccept(filereq)}>Accept</button>
                </div>
              ))
            }
          </div>
          }
          <div>
            {
                outgoingList.map((item)=>(
                  <div className='bg-amber-300' key={item.transferId}>
                    <h1>To: {item.targetDeviceName}</h1>
                    <h1>{item.filename}</h1>
                    <h1>{item.status}</h1>
                    {progress.get(item.transferId) && <h1>{progress.get(item.transferId)}</h1>}
                  </div>
                ))

            }
          </div>
        </div>
      </div>
    </>
  )
}

export default App
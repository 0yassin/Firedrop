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
}

function App() {
  const [ws, setWs] = useState(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pendingFile, setPendingFile] = useState(null);
  const pendingFileRef = useRef(null);
  const [incomingAlert, setIncomingAlert] = useState(null);
  const [devicename, setdevicename] = useState(null)
  const [devicetype, setdevicetype] = useState<DeviceType>(null)
  const [own_id, setownid] = useState(null)
  const logging = true

  {logging &&
    useEffect(()=>{
      console.log("[DEVICES] - ", devices)
      console.log("-----")
      console.log("[DEVICENAME] - ", devicename)
      console.log("-----")
      console.log("[DEVICETYPE] - ", devicetype)
      console.log("-----")
      console.log("[OWNID] - ", own_id)
      console.log("-----")
      console.log("[PENDINGFILE] - ", pendingFile)
    }, [devices, devicename, devicetype, own_id, pendingFile])
  }

  useEffect(() => {
    const detectedType = getDeviceType();
    setdevicetype(detectedType);

    const params = new URLSearchParams();
    if (devicename) params.append('name', devicename);
    if (detectedType) params.append('type', detectedType);

    const queryString = params.toString();
    const url = `ws://192.168.1.31:3000/ws${queryString ? `?${queryString}` : ''}`;

    const socket = new WebSocket(url);
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data) as WSDmsg;
      switch (data.event) {
        case "devices_update":
          setDevices(data.users || []);
          break;

        case "incoming_transfer":
          setIncomingAlert({
            transferId: data.transfer_id,
            filename: data.filename
          });
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

  const handleDrop = (file, targetDeviceID) => {
    setPendingFile(file); 
    pendingFileRef.current = file;
    const transferId = crypto.randomUUID();

    ws.send(JSON.stringify({
        event: "upload_request",
        target_id: targetDeviceID,
        transfer_id: transferId,
        filename: file.name
    }));
  }

  const handleaccept = () => {
    const {transferId, filename} = incomingAlert
    const link = document.createElement("a")
    link.href = `http://192.168.1.31:3000/download/${transferId}`;
    link.setAttribute("download", filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setIncomingAlert(null)
  }

  const startaxiosupload = async (transferId) => {
    const fileToUpload = pendingFileRef.current;
    console.log("[DEBUG] 3.5 startaxiosupload fired. File status:", fileToUpload ? "File exists" : "NULL");
    if (!fileToUpload) {
      console.log("[DEBUG] ERROR: Upload aborted because no file was found in ref");
      return;
    }
    const formData = new FormData()
    formData.append("file", pendingFileRef.current);
    try { 
        console.log("[DEBUG] 3.8 Starting Axios POST request");
        await axios.post(`http://192.168.1.31:3000/stream/${transferId}`, formData, {
          onUploadProgress: (progressEvent) => {

          }
        })
        console.log("[DEBUG] 7. Axios upload POST promise resolved successfully")
        setPendingFile(null)
        pendingFileRef.current = null;
      
    } catch (e) {
      console.error("[DEBUG] ERROR: Axios upload failed", e)
    }
  }

  return (
    <>
      <div className='min-w-screen min-h-screen bg-[#252527] flex flex-row'>
        <div className='text-white m-12'>
          <div className=''>
            <h1 className='text-3xl mb-6'>Connected devices</h1>
            <div className='flex-col gap-2 flex ml-2'>
                {devices.map((device, index) => device.id != own_id && (
                  <Device key={index} handle_drop={handleDrop} target_device={device.id} device_name={device.name} />
                )
                  
                )}
            </div>
          </div>
          {incomingAlert != null &&
            <div>
              <h1 className='text-3xl mb-6'>File download request</h1>
              <div className='flex-col gap-2 flex ml-2'>
                  {incomingAlert?.filename}
              </div>
              <button onClick={()=>handleaccept()} >Accept</button>
            </div>
          }
        </div>
      </div>
    </>
  )
}

export default App
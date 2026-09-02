import { useEffect, useRef, useState } from 'react';
import './App.css';
import Device from './components/device';
import axios from 'axios';
import Request from './components/request';
import Outgoing from './components/outgoing';
import Settings from './components/Settings';
import { motion, AnimatePresence } from "motion/react";

type Device = {
  id: string;
  name: string;
  type: string;
  ip: string;
};

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
  event: WSevent;
  users?: Device[];
  filename?: string;
  transfer_id?: string;
  id?: string;
  senderName?: string;
  filetype?: string;
  preview?: string;
  status?: string;
  filesize?: number;
};

type Filereq = {
  filename: string;
  transferid: string;
  senderName: string;
  status: string;
  preview?: string;
  filetype?: string;
  filesize?: number; 
};

type Outgoingfilereq = {
  targetdevice: string;
  file: File;
  filetype: string;
  preview?: string;
};

type OutgoingItemUI = {
  transferId: string;
  filename: string;
  targetDeviceName: string;
  status: 'waiting' | 'uploading' | 'done' | 'failed' | 'rejected' | 'canceled';
};

type WSevent = 
  | "devices_update" 
  | "incoming_transfer" 
  | "receiver_ready" 
  | "welcome" 
  | "transfer_rejected" 
  | "transfer_canceled";

function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [devicename, setdevicename] = useState<string | null>(() => {
    try {
      const savedname = localStorage.getItem('device-name');
      return savedname ? JSON.parse(savedname) : null;
    } catch {
      return null;
    }
  });

  const [settingsvisible, setsettingsvisible] = useState<boolean>(false);
  const [newName, setnewName] = useState<string>("");
  const [devicetype, setdevicetype] = useState<DeviceType | null>(null);
  const [own_id, setownid] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [incomingfilereqs, setincomingfilereqs] = useState<Filereq[]>([]);
  const [progress, setProgress] = useState<Map<string, number>>(new Map());
  const outgoingfilereqsRef = useRef<Map<string, Outgoingfilereq>>(new Map());
  const [outgoingList, setOutgoingList] = useState<OutgoingItemUI[]>([]);
  const logging = true;
  const maxHeight = 100;
  const maxWidth = 100;

  useEffect(() => {
    if (devicename) {
      localStorage.setItem('device-name', JSON.stringify(devicename));
    }
  }, [devicename]);

  useEffect(() => {
    if (!logging) return;
    console.log("[DEVICES] - ", devices);
    console.log("[DEVICENAME] - ", devicename);
    console.log("[DEVICETYPE] - ", devicetype);
    console.log("[OWNID] - ", own_id);
    console.log("[OUTGOINGFILEREQS] - ", outgoingfilereqsRef.current);
    console.log("[PROGRESS] - ", progress);
    console.log("[HOST] - ", window.location.host);
  }, [devices, devicename, devicetype, own_id, progress, logging]);

  useEffect(() => {
    const detectedType = getDeviceType();
    setdevicetype(detectedType);

    const params = new URLSearchParams();
    if (devicename) params.append('name', devicename);
    if (detectedType) params.append('type', detectedType);

    const queryString = params.toString();
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${wsProtocol}//${window.location.host}/ws${queryString ? `?${queryString}` : ''}`;

    const socket = new WebSocket(url);
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data) as WSDmsg;
      switch (data.event as WSevent) {
        case "devices_update":
          setDevices(data.users || []);
          break;

        case "incoming_transfer":
          setincomingfilereqs(prevItems => [
            ...prevItems, 
            {
              filename: data.filename || "unknown", 
              transferid: data.transfer_id || "", 
              senderName: data.senderName || "unknown", 
              filetype: data.filetype || "unknown", 
              preview: data.preview || null, 
              status: data.status || null, 
              filesize: data.filesize || 0,
            }
          ]);
          break;

        case "receiver_ready":
          if (data.transfer_id) startaxiosupload(data.transfer_id); 
          break;

        case "welcome":
          if (data.id) setownid(data.id);
          break;
        
        case "transfer_rejected":
          if (data.transfer_id) {
            console.log("transfer rejected:", data.transfer_id);
            setOutgoingList(prev => 
              prev.map(item => item.transferId === data.transfer_id ? {...item, status: 'rejected'} : item)
            );
          }
          break;

        case "transfer_canceled":
          if (data.transfer_id) {
            console.log("transfer canceled:", data.transfer_id);
            setincomingfilereqs(prev =>
              prev.map(item => item.transferid === data.transfer_id ? {...item, status: 'canceled'} : item)
            );
          }
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

  const handleDrop = (file: File, targetDeviceID: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error("WebSocket is not connected");
      return;
    }
    const targetDevice = devices.find(d => d.id === targetDeviceID);
    const transferId = crypto.randomUUID();

    const finalizeAndSend = (previewData: string | null) => {
      outgoingfilereqsRef.current.set(transferId, {
        targetdevice: targetDeviceID,
        file: file,
        filetype: file.type
      });
      
      setOutgoingList(prev => [...prev, {
        transferId,
        filename: file.name,
        targetDeviceName: targetDevice?.name || "unknown",
        status: 'waiting',
      }]);

      ws.send(JSON.stringify({
        event: "upload_request",
        target_id: targetDeviceID,
        transfer_id: transferId,
        filename: file.name,
        filetype: file.type,
        preview: previewData,
        filesize: file.size,
      }));
    };

    if (file.type.startsWith("image")) {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          finalizeAndSend(canvas.toDataURL("image/jpeg", 0.8));
        };
      };
    } else {
      finalizeAndSend(null);
    }
  };

  const handleaccept = async (transfertoaccept: Filereq) => {
    setincomingfilereqs(prev =>
      prev.map(item =>
        item.transferid === transfertoaccept.transferid
          ? { ...item, status: 'accepted' }
          : item
      )
    );

    try {
      const response = await axios.get(`/download/${transfertoaccept.transferid}`,
        {
          responseType: 'blob',
          onDownloadProgress: (progressEvent) => {
            const total = progressEvent.total || transfertoaccept.filesize || 0;

            if (total > 0) {
              const percentCompleted = Math.min(
                100,
                Math.round((progressEvent.loaded * 100) / total)
              );

              setProgress(prev => {
                const next = new Map(prev);
                next.set(transfertoaccept.transferid, percentCompleted);
                return next;
              });
            }
          },
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', transfertoaccept.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setincomingfilereqs(prev =>
        prev.map(item =>
          item.transferid === transfertoaccept.transferid
            ? { ...item, status: 'done' }
            : item
        )
      );
    } catch (error) {
      console.error('Download failed:', error);
      setincomingfilereqs(prev =>
        prev.map(item =>
          item.transferid === transfertoaccept.transferid
            ? { ...item, status: 'failed' }
            : item
        )
      );
    }
  };
  
  const handlereject = (transfertoreject: Filereq) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error("WebSocket is not connected");
      return;
    }
    ws.send(JSON.stringify({
      event: "transfer_rejected",
      transfer_id: transfertoreject.transferid,
    }));
    setincomingfilereqs(prev =>
      prev.map(item => item.transferid === transfertoreject.transferid ? { ...item, status: 'rejected' } : item)
    );
  };

  const startaxiosupload = async (transferId: string) => {
    const fileToUpload = outgoingfilereqsRef.current.get(transferId)?.file;
    if (!fileToUpload) {
      console.log("[DEBUG] ERROR: Upload aborted because no file was found in ref");
      return;
    }

    setOutgoingList(prev =>
      prev.map(item => item.transferId === transferId ? { ...item, status: 'uploading' } : item)
    );

    try {
      await axios.post(`/stream/${transferId}`, fileToUpload, {
        headers: {
          "Content-Type": fileToUpload.type || "application/octet-stream",
        },
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || fileToUpload.size || 1;
          const percentCompleted = Math.min(100, Math.round((progressEvent.loaded * 100) / total));
          setProgress(prev => {
            const next = new Map(prev);
            next.set(transferId, percentCompleted);
            return next;
          });
        }
      });
      console.log("upload complete");
      outgoingfilereqsRef.current.delete(transferId);
      setOutgoingList(prev => prev.filter(item => item.transferId !== transferId));
      setProgress(prev => {
        const next = new Map(prev);
        next.delete(transferId);
        return next;
      });
    } catch (e) {
      console.log("error during upload:", e);
      setOutgoingList(prev =>
        prev.map(item => item.transferId === transferId ? { ...item, status: 'failed' } : item)
      );
    }
  };

  const handlecancel = (transferID: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error("WebSocket is not connected");
      return;
    }
    ws.send(JSON.stringify({
      event: "transfer_canceled",
      transfer_id: transferID,
    }));
    setOutgoingList(prev =>
      prev.map(item => item.transferId === transferID ? { ...item, status: 'canceled' } : item)
    );
  };

  const handledeleteReq = (transferID: string) => {
    setincomingfilereqs(prev => prev.filter(item => item.transferid !== transferID));
  };

  const handledeleteOutgoing = (transferID: string) => {
    setOutgoingList(prev => prev.filter(item => item.transferId !== transferID));
  };

  const handlenamechange = (nameToSet: string) => {
    const trimmed = nameToSet.trim();
    if (!trimmed) return;

    setdevicename(trimmed);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        event: "update_settings",
        settings: {
          name: trimmed,
        }
      }));
    }
  };

  return (
    <>
      <div className='min-w-screen min-h-screen bg-[#242424] flex justify-center'>
        <Settings 
          visible={settingsvisible} 
          setvisible={setsettingsvisible} 
          handlenamechange={() => handlenamechange(newName)} 
          newName={newName} 
          setnewName={setnewName}
        />

        <div className='text-white flex flex-col gap-8 p-5 w-full max-w-lg lg:flex-row lg:gap-12 lg:m-12 lg:p-0 lg:w-auto lg:max-w-none'>
          
          <div className='w-full lg:w-auto'>
            <h1 className='text-3xl mb-4 lg:min-w-64 font-semibold '>Devices</h1>
            <div className='flex-col gap-2 flex'>
              
              <section className="flex flex-col gap-2">
                <div className="w-full lg:min-w-64 rounded-[10px] border bg-[#006239] border-black transition-colors flex justify-between items-stretch min-h-17">
                  
                  <div className="flex flex-col justify-center px-4 py-4 text-white min-w-0 flex-1">
                    <span className="text-[20px] truncate font-semibold">
                      {devicename || "My Device"} (You)
                    </span>
                    <span className="text-[12.5px] opacity-80 font-medium">
                      {devicetype || "Unknown"}
                    </span>
                  </div>
                  <div 
                    onClick={() => {
                      setnewName(devicename || "");
                      setsettingsvisible(true);
                    }}
                    className="bg-[#4C4C4C] rounded-r-[10px] aspect-square border-l p-5 border-black w-21 shrink-0 flex items-center justify-center cursor-pointer hover:bg-[#434343] transition-colors"
                  >
                    <img className='w-full h-full' src='./src/assets/settings.svg' alt="Settings" />
                  </div>

                </div>
              </section>
              <AnimatePresence mode="popLayout">
                {devices.map((device) => device.id !== own_id && (
                  <motion.div
                    key={device.id}
                    initial={{ opacity: 0, y: 15, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                    layout
                  >
                    <Device 
                      key={device.id} 
                      device_type={device.type} 
                      handle_drop={handleDrop} 
                      device_ip={device.ip} 
                      target_device={device.id} 
                      device_name={device.name} 
                      />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          <div className='w-full lg:w-auto'>
            <h1 className='text-3xl mb-4 lg:min-w-64 font-semibold'>Requests</h1> 
              <div className='flex-col gap-2 flex'>
                <AnimatePresence mode="popLayout">
                  {incomingfilereqs.map((filereq) => (
                    <motion.div
                      key={filereq.transferid}
                      initial={{ opacity: 0, y: 15, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                      layout
                    >
                      <Request
                        filename={filereq.filename}
                        sender={filereq.senderName}
                        filetype={filereq.filetype}
                        status={filereq.status}
                        progress={progress.get(filereq.transferid)}
                        accept={() => handleaccept(filereq)}
                        reject={() => handlereject(filereq)}
                        deletefunc={() => handledeleteReq(filereq.transferid)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
          </div>

          <div className='w-full lg:w-auto'>
            <h1 className='text-3xl mb-4 lg:min-w-64 font-semibold'>Outgoing</h1>           
              <AnimatePresence mode="popLayout">
                {outgoingList.map((item) => (
                    <motion.div
                      key={item.transferId}
                      initial={{ opacity: 0, y: 15, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                      layout
                    >
                    <Outgoing 
                      key={item.transferId}
                      filename={item.filename}
                      target={item.targetDeviceName}
                      status={item.status}
                      progress={progress.get(item.transferId)}
                      cancel={() => handlecancel(item.transferId)}
                      deletefunc={() => handledeleteOutgoing(item.transferId)}
                    />
                  </motion.div>
                ))}
            </AnimatePresence>

          </div>

        </div>
      </div>
    </>
  );
}

export default App;
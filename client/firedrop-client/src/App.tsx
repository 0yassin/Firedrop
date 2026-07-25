import { useEffect, useState } from 'react';
import './App.css'
import Device from './components/device';
import axios from 'axios';


type Device = {
  id:string;
  name: string;
  typ: string;
  ip: string;
}

type WSDmsg = {
  event: string;
  users?: Device[];
  filename?:string;
  transfer_id:string;
}
  function App() {
  const [ws, setWs] = useState(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pendingFile, setPendingFile] = useState(null); 
  const [incomingAlert, setIncomingAlert] = useState(null);
  const [devicename, setdevicename] = useState(null)
  const [devicetype, setdevicetype] = useState(null)

  useEffect(()=>{
    const socket = new WebSocket(`ws://192.168.1.31:3000/ws${devicename != null? `?name=${devicename}` : ''}${devicetype != null ? `&type=${devicetype}` : ''}`)    
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data) as WSDmsg;
      switch (data.event){
        case "devices_update":
          setDevices(data.users)
          break

        case "incoming_transfer":
          setIncomingAlert({
            transferId: data.transfer_id,
            filename: data.filename
          });
          break;

        case "receiver_ready":
          startaxiosupload(data.transfer_id); 
          break;
      }
    }
    setWs(socket);
      return () => socket.close();
  }, [])


  const handleDrop = (file, targetDeviceID) => {
    setPendingFile(file); 
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
    if (!pendingFile) return;
    const formData = new FormData()
    formData.append("file", pendingFile);
    try { 
        await axios.post(`http://192.168.1.31:3000/stream/${transferId}`, formData, {
          headers: {
            "Content-Type":"multipart/form-data"
          },
          onUploadProgress: (progressEvent) => {

          }
        })
        console.log("Upload complete")
        setPendingFile(null)
      
    } catch (e) {
      console.log("upload failed", e)
    }
  }

  return (
    <>
      <div className='min-w-screen min-h-screen bg-[#252527] flex flex-row'>
        <div className='text-white m-12'>
          <div className=''>
            <h1 className='text-3xl mb-6'>Connected devices</h1>
            <ul>
              {devices.map((device, index) => (
                  <li key={index}>{device.name}</li>
                ))}
            </ul>
            <div className='flex-col gap-2 flex ml-2'>
              
              <Device device_id={3} device_name='device?' />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default App

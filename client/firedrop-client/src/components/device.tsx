import axios from "axios";
import { useState } from "react";
import { useDropzone } from "react-dropzone";

interface DeviceProps {
    device_name: string;
    handle_drop: any;
    target_device:string;
    device_ip:string;
}

export default function Device({device_name, handle_drop, target_device, device_ip }: DeviceProps) {
    // const [progress, setProgress] = useState(0);
    // const [status, setStatus] = useState('');
   

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop: (acceptedFiles) => handle_drop(acceptedFiles[0], target_device),
        multiple: false 
    });

    return (
        <section className="flex flex-col gap-2">
            <div 
                {...getRootProps()} 
                className={`w-full lg:min-w-64 p-4 rounded-[10px] border bg-[#4C4C4C] border-black overflow-hidden relative cursor-pointer transition-colors ${
                isDragActive ? '' : ''
                }`}>
                <input {...getInputProps()} />
                <div className="w-full h-full flex items-center text-white">
                    <div className="w-full h-full flex-col flex gap-1 flex-3">
                        <span className="text-[20px] font-med">{device_name}</span>
                        <span className="text-[12.5px] opacity-80">{device_ip}</span>
                    </div>
                    <div className="h-full w-full flex-1">
                        
                    </div>
                </div>

            </div>
        
        </section>
    );
}
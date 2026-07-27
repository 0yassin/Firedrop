import axios from "axios";
import { useState } from "react";
import { useDropzone } from "react-dropzone";

interface DeviceProps {
    device_name: string;
    handle_drop: any;
    target_device:any;
}

export default function Device({device_name, handle_drop, target_device }: DeviceProps) {
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('');
    const serveraddr = 'http://192.168.1.31:3000/upload';

   

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop: (acceptedFiles) => handle_drop(acceptedFiles[0], target_device),
        multiple: false 
    });

    return (
        <section className="flex flex-col gap-2">
            <div 
                {...getRootProps()} 
                className={`w-64 h-20 rounded-[10px] border-[2px] overflow-hidden relative cursor-pointer transition-colors ${
                    isDragActive ? 'border-green-400 bg-[#637aef]' : 'border-black bg-[#536acf]'
                }`}
            >
                <input {...getInputProps()} />
                
                <div className='w-full h-full flex items-center z-20 relative'>
                    <div className='bg-[#a3541c] h-full flex-1 flex justify-center items-center'>
                        <p className='text-center text-white font-semibold'>{device_name}</p>
                    </div>
                    <div className='flex justify-between w-full h-full flex-[2] items-center px-4 text-white text-sm'>
                        <p>{isDragActive ? "Drop it!" : "Drop files to send"}</p>
                        <p>+</p>
                    </div>
                </div>

                <div 
                    className="absolute top-0 left-0 h-full bg-green-500/50 z-10 transition-all duration-200 ease-out" 
                    style={{ width: `${progress}%` }}
                ></div>
            </div>
            
            <p className="text-sm font-medium text-white text-center h-4">
                {status}
            </p>
        </section>
    );
}
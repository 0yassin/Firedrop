import axios from "axios";
import { useState } from "react";
import { useDropzone } from "react-dropzone";

interface DeviceProps {
    device_id: number;
    device_name: string;
}

export default function Device({ device_id, device_name }: DeviceProps) {
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('');
    const serveraddr = 'http://192.168.1.31:3000/upload';

    const handleUpload = async (file: File) => {
        if (!file) {
            setStatus('Please select a file first.');
            return;
        }

        const formData = new FormData();
        formData.append('document', file);
        formData.append('target_id', device_id.toString()); 

        try {
            setStatus("Uploading...");
            await axios.post(serveraddr, formData, {
                headers: {
                    "Content-Type": "multipart/form-data"
                },
                onUploadProgress: (progressEvent) => {
                    if (progressEvent.total) {
                        const percentage = Math.round(
                            (progressEvent.loaded * 100) / progressEvent.total
                        );
                        setProgress(percentage);
                    }
                },
            });
            setStatus('Upload successful!');
            setTimeout(() => { setProgress(0); setStatus(''); }, 3000);

        } catch (error) {
            console.error(error);
            setStatus('Upload failed.');
            setProgress(0);
        }
    }

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop: (acceptedFiles) => handleUpload(acceptedFiles[0]),
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
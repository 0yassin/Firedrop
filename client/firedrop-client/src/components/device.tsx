import { useDropzone } from "react-dropzone";

interface DeviceProps {
    device_name: string;
    handle_drop: any;
    target_device:string;
    device_ip:string;
    device_type:string;
}

export default function Device({device_type, device_name, handle_drop, target_device, device_ip }: DeviceProps) {
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop: (acceptedFiles) => handle_drop(acceptedFiles[0], target_device),
        multiple: false 
    });

    return (
        <section className="flex flex-col gap-2">
            <div 
                {...getRootProps()} 
                className={`w-full lg:min-w-64 rounded-[10px] border border- bg-[#4C4C4C] hover:bg-[#434343] transition-all overflow-hidden relative cursor-pointer ${
                    isDragActive ? 'border-[#ffffff]' : 'border-black'
                }`}>
                <input {...getInputProps()} />
                <div className="w-full h-full flex items-center text-white">
                    <div className="w-full h-full flex-col flex gap-1 flex-3 p-4">
                        <span className="text-[20px] truncate font-semibold">{device_name}</span>
                        <span className="text-[12.5px] opacity-80 font-medium">{device_ip}</span>
                    </div>
                    <div className="bg-transparent rounded-r-[10px] aspect-square p-5 w-21 shrink-0 flex items-center justify-center cursor-pointer transition-colors">
                        <img className='w-full h-full ' src={`./src/assets/${device_type || "Unknown"}.svg`} />
                    </div>

                    
                </div>

            </div>
        
        </section>
    );
}
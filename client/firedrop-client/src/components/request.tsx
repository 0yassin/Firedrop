interface ReqProps {
    filename: string;
    accept: any;
    reject:any;
    sender:string;
    filetype:string;
}

export default function Request({filename, accept, reject, filetype, sender}: ReqProps) {


    return (
        <section className="flex flex-col gap-2">
            <div 
                className={`w-full lg:min-w-64 rounded-[10px] border bg-[#4C4C4C] border-black overflow-hidden relative cursor-pointer transition-colors`}>                <div className="w-full h-full flex items-center flex-col text-white">
                    <div className="w-full h-full flex flex-col px-4 py-3">
                        <span className="text-[20px]">{filename}</span>
                        <div className="flex gap-2 text-[12.5px] opacity-80">
                            <span>{filetype}</span>
                            <span>{sender}</span>

                        </div>
                    </div>
                    <div className="w-full h-full flex items-center justify-center border-t content-center border-black">
                        <button onClick={accept} className="w-full p-2 cursor-pointer hover:bg-[#03030342] transition-colors active:bg-[#03030368] border-r border-black text-[#31ED35] opacity-70 ">Accept</button>
                        <button onClick={reject} className="w-full p-2 cursor-pointer hover:bg-[#03030342] transition-colors active:bg-[#03030368]">Reject</button>
                    </div>
                </div>

            </div>
        
        </section>
    );
}
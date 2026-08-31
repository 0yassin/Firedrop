interface OutProp {
  filename: string;
  cancel: () => void;
  target: string;
  status: 'waiting' | 'uploading' | 'done' | 'failed' | 'rejected' | 'canceled' | string;
  progress?: number;
  deletefunc: () => void;
}

export default function Outgoing({
  filename,
  cancel,
  status,
  target,
  progress,
  deletefunc,
}: OutProp) {
  return (
    <section className="flex flex-col gap-2 mb-2">
      <div className="w-full lg:min-w-64 lg:max-w-74 rounded-[10px] border bg-[#4C4C4C] border-black overflow-hidden relative transition-colors">
        <div className="w-full h-full flex items-center flex-col text-white">
          
          <div className="w-full h-full flex flex-col px-4 py-3">
            <span className="text-[20px] truncate">{filename}</span>
            <div className="flex gap-2 text-[12.5px] opacity-80">
              <span className="capitalize">{status}</span>
              <span>•</span>
              <span>To: {target}</span>
            </div>
          </div>

          <div className="w-full h-full flex items-center justify-center border-t border-black">
            {status === 'uploading' ? (
              <div className="w-full p-2 text-center text-sm font-medium text-blue-400">
                Uploading: {progress ?? 0}%
              </div>
            ) : status === 'done' || status === 'canceled' || status === 'rejected' || status === 'failed' ? (
              <button
                onClick={deletefunc}
                className="w-full p-2 cursor-pointer hover:bg-[#03030342] transition-colors active:bg-[#03030368] text-sm"
              >
                {status === 'done'
                  ? 'Completed (Dismiss)'
                  : status === 'rejected'
                  ? 'Rejected (Dismiss)'
                  : 'Delete'}
              </button>
            ) : (
              <button
                onClick={cancel}
                className="w-full p-2 cursor-pointer hover:bg-[#03030342] transition-colors active:bg-[#03030368] text-red-400 opacity-80 text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
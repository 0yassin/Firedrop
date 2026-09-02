type SettingsProps = {
  handlenamechange: () => void;
  visible: boolean;
  newName: string;
  setnewName: (name: string) => void;
  setvisible: (visible: boolean) => void;
};

export default function Settings({
  handlenamechange,
  visible,
  newName,
  setnewName,
  setvisible,
}: SettingsProps) {
  if (!visible) return null;

  return (
    <section className="fixed inset-0 backdrop-blur-sm p-4 flex justify-center items-center bg-black/50 z-50">
      <div className="flex flex-col w-full max-w-sm rounded-[10px] border border-black bg-[#4C4C4C] shadow-2xl overflow-hidden">
        
        <div className="p-4 flex flex-col gap-3">
          <span className="text-[20px] font-medium text-white">Settings</span>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-white/80">Display name</span>
            <input
              value={newName}
              onChange={(e) => setnewName(e.target.value)}
              type="text"
              placeholder="Enter preferd name"
              className="w-full text-sm border-black border p-2 outline-none bg-[#3D3D3D] text-white rounded-md"
            />
          </div>
        </div>

        <div className="w-full flex items-center border-t border-black bg-[#434343]">
          <button
            onClick={() => {
              handlenamechange();
              setvisible(false);
            }}
            className="w-full p-2.5 cursor-pointer hover:bg-[#03030342] transition-colors active:bg-[#03030368] border-r border-black text-[#31ED35] font-medium"
          >
            Accept
          </button>
          <button
            onClick={() => setvisible(false)}
            className="w-full p-2.5 cursor-pointer hover:bg-[#03030342] transition-colors active:bg-[#03030368] text-white/80"
          >
            Cancel
          </button>
        </div>

      </div>
    </section>
  );
}
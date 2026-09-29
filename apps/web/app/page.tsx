import { 
  Coffee, 
  QrCode, 
  Zap, 
  ConciergeBell, 
  ShieldCheck, 
  Heart 
} from "lucide-react";

export default function HomePage() {
  return (
    // 'h-[100dvh]' aur 'overflow-hidden' se page bilkul lock ho jayega ek hi screen pe
    <main className="relative flex h-[100dvh] w-full flex-col items-center bg-[#FDFBF7] font-sans overflow-hidden">
      
      {/* Background Blurs */}
      <div className="absolute -left-20 top-0 h-64 w-64 rounded-full bg-orange-100 opacity-40 blur-3xl"></div>
      <div className="absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-green-100 opacity-40 blur-3xl"></div>

      {/* Main Container - using flex column to manage available height */}
      <div className="z-10 flex h-full w-full max-w-md flex-col pb-6">
        
        {/* 1. Header Area (Fixed size) */}
        <header className="flex shrink-0 items-center justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex flex-col text-left">
              <span className="text-2xl font-black text-[#0A2A22] leading-none">BillRaw</span>
              <span className="mt-1 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
                Scan &middot; Order &middot; Enjoy
              </span>
            </div>
          </div>
          
          {/* Table Badge */}
          <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#0A2A22] shadow-sm border border-gray-100">
            <QrCode size={16} className="text-gray-500" />
            <span>Table 12</span>
          </div>
        </header>

        {/* 2. Hero Image Placeholder (FLEXIBLE - adjusts to any screen height) */}
        <div className="flex flex-1 min-h-[150px] items-center justify-center px-6 py-4">
          {/* Ye box utni hi jagah lega jitni screen pe bachi hogi */}
          <div className="flex h-full max-h-[300px] w-full items-center justify-center rounded-[2rem] border-2 border-dashed border-orange-200 bg-orange-50/50 backdrop-blur-sm">
            <div className="text-center">
              <p className="text-sm font-semibold text-orange-500">Illustration Placeholder</p>
              <p className="text-[10px] text-orange-400 mt-1 uppercase tracking-wide">Image will fit here</p>
            </div>
          </div>
        </div>

        {/* 3. Main Headings (Fixed size) */}
        <div className="flex shrink-0 flex-col items-center px-6 text-center">
          <h1 className="text-[2rem] font-extrabold text-[#0A2A22] tracking-tight leading-tight">BillRaw</h1>
          <p className="mt-2 max-w-[280px] text-[14px] leading-relaxed text-gray-500 font-medium">
            Scan the QR code on your table to view the menu and place an order.
          </p>
        </div>

        {/* 4. Features Grid (Fixed size) */}
        <div className="mt-6 flex shrink-0 w-full grid-cols-3 grid gap-2 px-6">
          <div className="flex flex-col items-center text-center">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-50">
              <Zap size={20} className="text-[#10B981] fill-[#10B981]/20" />
            </div>
            <h3 className="text-[12px] font-bold text-[#0A2A22]">Quick & Easy</h3>
            <p className="mt-1 px-1 text-[10px] leading-snug text-gray-400">Scan and order in seconds</p>
          </div>

          <div className="flex flex-col items-center text-center border-x border-gray-200/60 px-2">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-orange-50">
              <ConciergeBell size={20} className="text-[#F97316]" />
            </div>
            <h3 className="text-[12px] font-bold text-[#0A2A22]">View Menu</h3>
            <p className="mt-1 px-1 text-[10px] leading-snug text-gray-400">Explore our delicious items</p>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-50">
              <ShieldCheck size={20} className="text-[#10B981]" />
            </div>
            <h3 className="text-[12px] font-bold text-[#0A2A22]">Safe & Hygienic</h3>
            <p className="mt-1 px-1 text-[10px] leading-snug text-gray-400">No physical contact, more safety</p>
          </div>
        </div>

        {/* 5. Footer Decor (Fixed size) */}
        <div className="mt-6 flex shrink-0 w-full px-10 justify-start">
          <div className="transform -rotate-6">
            <p className="text-lg font-bold text-[#0A2A22] italic leading-none">Good Food</p>
            <p className="text-lg font-bold text-[#0A2A22] italic flex items-center gap-2 mt-1 leading-none">
              Good Mood <Heart className="text-[#F97316] fill-[#F97316]" size={14} />
            </p>
            <div className="w-14 h-[2px] bg-[#0A2A22] mt-1 ml-1 rounded-full opacity-80"></div>
          </div>
        </div>

      </div>
    </main>
  );
}
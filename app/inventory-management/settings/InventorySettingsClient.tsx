'use client';

export default function InventorySettingsClient({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <div className="p-6 max-w-[800px] mx-auto space-y-8">
      <div><h1 className="text-xl font-bold text-slate-100 uppercase tracking-tight">Inventory Settings</h1><p className="text-sm text-slate-500 mt-1">Configure global stock behaviors and thresholds</p></div>
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 space-y-6">
         <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-800/40 rounded-2xl border border-slate-700/50">
               <div><p className="text-sm font-bold text-slate-200">Auto Deduct Stock</p><p className="text-xs text-slate-500">Automatically reduce inventory when order is paid</p></div>
               <div className="w-12 h-6 bg-cyan-600 rounded-full flex items-center justify-end px-1 cursor-pointer"><div className="w-4 h-4 bg-white rounded-full"></div></div>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-800/40 rounded-2xl border border-slate-700/50">
               <div><p className="text-sm font-bold text-slate-200">Low Stock Threshold</p><p className="text-xs text-slate-500">Global fallback value for stock alerts</p></div>
               <input type="number" defaultValue="5" className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center text-white" />
            </div>
         </div>
         <div className="pt-6 border-t border-slate-800"><button className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-bold transition-all border border-slate-700">Save Configurations</button></div>
      </div>
    </div>
  );
}

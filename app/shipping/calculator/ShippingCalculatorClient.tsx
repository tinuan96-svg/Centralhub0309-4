'use client';

import { useState, useMemo } from 'react';
import { DHLParcelInput, DHLCalculationInput, DHLRateCalculatorService } from '@/lib/services/shipping/dhlRateCalculatorService';
import { formatCurrency } from '@/lib/utils/currency';

export default function DHLCalculatorPage({ params, searchParams }: { params: any; searchParams: any }) {
  const [input, setInput] = useState<{
    shipmentDate: Date;
    zone: 'A' | 'B' | 'C' | 'D';
    parcels: DHLParcelInput[];
    timedService: DHLCalculationInput['timedService'];
    isIsleOfWight: boolean;
    isCongestionZone: boolean;
  }>({
    shipmentDate: new Date(),
    zone: 'A',
    parcels: [{ weightKg: 1, lengthCm: 30, widthCm: 30, heightCm: 30 }],
    timedService: 'none',
    isIsleOfWight: false,
    isCongestionZone: false
  });

  const result = useMemo(() => {
    try {
      return DHLRateCalculatorService.calculate(input);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [input]);

  const updateParcel = (idx: number, key: keyof DHLParcelInput, val: string) => {
    const num = parseFloat(val) || 0;
    setInput(prev => {
      const newParcels = [...prev.parcels];
      newParcels[idx] = { ...newParcels[idx], [key]: num };
      return { ...prev, parcels: newParcels };
    });
  };

  const addParcel = () => {
    setInput(prev => ({
      ...prev,
      parcels: [...prev.parcels, { weightKg: 1, lengthCm: 30, widthCm: 30, heightCm: 30 }]
    }));
  };

  const removeParcel = (idx: number) => {
    if (input.parcels.length <= 1) return;
    setInput(prev => ({
      ...prev,
      parcels: prev.parcels.filter((_, i) => i !== idx)
    }));
  };

  const labelClass = "block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5";
  const inputClass = "w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <span className="text-4xl">🚚</span>
            DHL Cost Calculator
          </h1>
          <p className="text-slate-400 mt-1">Estimate shipment costs based on Mallu Spices Global Ltd contract rates</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl px-4 py-2 flex items-center gap-3 shadow-xl">
          <span className="text-xs font-bold text-slate-500 uppercase">Rate Version:</span>
          <span className="text-sm font-black text-cyan-400 uppercase tracking-tighter">{result?.rateVersion || 'Unknown'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Shipment Controls */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
              Shipment Details
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>Shipment Date</label>
                <input
                  type="date"
                  value={input.shipmentDate.toISOString().split('T')[0]}
                  onChange={e => setInput(prev => ({ ...prev, shipmentDate: new Date(e.target.value) }))}
                  className={inputClass}
                />
                <p className="text-[10px] text-slate-500 mt-2 italic">Select date to apply historical rates automatically.</p>
              </div>

              <div>
                <label className={labelClass}>DHL Zone</label>
                <select
                  value={input.zone}
                  onChange={e => setInput(prev => ({ ...prev, zone: e.target.value as any }))}
                  className={inputClass}
                >
                  <option value="A">Zone A (England/Wales/Industrial Scotland)</option>
                  <option value="B">Zone B (Highlands)</option>
                  <option value="C">Zone C (Islands/Northern Ireland)</option>
                  <option value="D">Zone D (Channel Islands/Isle of Man)</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Timed Service</label>
                <select
                  value={input.timedService}
                  onChange={e => setInput(prev => ({ ...prev, timedService: e.target.value as any }))}
                  className={inputClass}
                >
                  <option value="none">Standard Next Day</option>
                  <option value="noon">By Noon</option>
                  <option value="tenThirty">By 10:30 AM</option>
                  <option value="nineAm">By 9:00 AM</option>
                  <option value="saturday">Saturday Delivery</option>
                  <option value="saturdayTenThirty">Saturday by 10:30 AM</option>
                  <option value="saturdayNineAm">Saturday by 9:00 AM</option>
                </select>
              </div>

              <div className="space-y-4 pt-2">
                <label className={labelClass}>Location Surcharges</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input type="checkbox" checked={input.isIsleOfWight} onChange={e => setInput(prev => ({ ...prev, isIsleOfWight: e.target.checked }))} className="w-5 h-5 rounded-lg border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0" />
                    <span className="text-xs text-slate-300 group-hover:text-white transition-colors">Isle of Wight</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input type="checkbox" checked={input.isCongestionZone} onChange={e => setInput(prev => ({ ...prev, isCongestionZone: e.target.checked }))} className="w-5 h-5 rounded-lg border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0" />
                    <span className="text-xs text-slate-300 group-hover:text-white transition-colors">London Congestion</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Parcels */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                Parcels ({input.parcels.length})
              </h2>
              <button
                onClick={addParcel}
                className="text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors py-1 px-3 bg-cyan-500/10 rounded-lg border border-cyan-500/20"
              >
                + Add Parcel
              </button>
            </div>

            {input.parcels.map((parcel, idx) => (
              <div key={idx} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative group overflow-hidden">
                <div className="absolute top-0 left-0 bottom-0 w-1 bg-cyan-500/30"></div>
                <div className="flex justify-between items-start mb-4">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Parcel #{idx + 1} {idx === 0 ? '(Primary)' : '(Subsequent)'}</span>
                  {input.parcels.length > 1 && (
                    <button onClick={() => removeParcel(idx)} className="text-slate-600 hover:text-rose-400 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className={labelClass}>Weight (kg)</label>
                    <input type="number" step="0.1" value={parcel.weightKg} onChange={e => updateParcel(idx, 'weightKg', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Length (cm)</label>
                    <input type="number" value={parcel.lengthCm} onChange={e => updateParcel(idx, 'lengthCm', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Width (cm)</label>
                    <input type="number" value={parcel.widthCm} onChange={e => updateParcel(idx, 'widthCm', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Height (cm)</label>
                    <input type="number" value={parcel.heightCm} onChange={e => updateParcel(idx, 'heightCm', e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Breakdown */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-700/50 rounded-3xl p-6 shadow-2xl sticky top-8">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"></span>
              Estimate Breakdown
            </h2>

            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Total Base Rates</span>
                <span className="text-slate-200 font-mono font-semibold">{formatCurrency(result?.totalBaseCost || 0)}</span>
              </div>

              {(result?.totalOverWeightCharge || 0) > 0 && (
                <div className="flex justify-between text-sm text-amber-400">
                  <span className="font-medium">Over 30kg Weight Charge</span>
                  <span className="font-mono">{formatCurrency(result?.totalOverWeightCharge || 0)}</span>
                </div>
              )}

              {(result?.totalHeavyweightSurcharge || 0) > 0 && (
                <div className="flex justify-between text-sm text-orange-400">
                  <span className="font-medium">Heavyweight Surcharges</span>
                  <span className="font-mono">{formatCurrency(result?.totalHeavyweightSurcharge || 0)}</span>
                </div>
              )}

              {(result?.totalLongLengthSurcharge || 0) > 0 && (
                <div className="flex justify-between text-sm text-indigo-400">
                  <span className="font-medium">Long Length Surcharges</span>
                  <span className="font-mono">{formatCurrency(result?.totalLongLengthSurcharge || 0)}</span>
                </div>
              )}

              {(result?.totalOutOfGaugeSurcharge || 0) > 0 && (
                <div className="flex justify-between text-sm text-purple-400">
                  <span className="font-medium">Out of Gauge Surcharges</span>
                  <span className="font-mono">{formatCurrency(result?.totalOutOfGaugeSurcharge || 0)}</span>
                </div>
              )}

              {(result?.timedServiceCharge || 0) > 0 && (
                <div className="flex justify-between text-sm text-blue-400">
                  <span className="font-medium">Timed Service ({input.timedService})</span>
                  <span className="font-mono">{formatCurrency(result?.timedServiceCharge || 0)}</span>
                </div>
              )}

              {(result?.otherCharges || 0) > 0 && (
                <div className="flex justify-between text-sm text-slate-400">
                  <span className="font-medium">Location Surcharges</span>
                  <span className="font-mono">{formatCurrency(result?.otherCharges || 0)}</span>
                </div>
              )}

              <div className="mt-6 pt-6 border-t border-slate-800">
                <div className="flex justify-between text-sm text-slate-400 mb-2">
                  <span>Net Subtotal</span>
                  <span className="font-mono">{formatCurrency(result?.netSubtotal || 0)}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-500 italic mb-4">
                  <span>Fuel Surcharge (12%)</span>
                  <span className="font-mono">{formatCurrency(result?.fuelSurcharge || 0)}</span>
                </div>

                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-cyan-500 uppercase tracking-widest">Total Estimate</p>
                    <p className="text-2xl font-black text-white font-mono">{formatCurrency(result?.totalEstimatedCost || 0)}</p>
                  </div>
                  <div className="text-2xl">💰</div>
                </div>
              </div>
            </div>

            <div className="mt-8 bg-slate-800/50 rounded-2xl p-4">
               <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">Technical Summary</p>
               <div className="space-y-1 text-[9px] font-mono text-slate-400 leading-tight">
                  <p>VERSION: {result?.rateVersion}</p>
                  <p>EFFECTIVE: {input.shipmentDate.toLocaleDateString()}</p>
                  <p>PARCELS: {input.parcels.length}</p>
                  <p>ZONE: {input.zone}</p>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CameraOff, ChevronLeft, ChevronRight, Image as ImageIcon, Maximize2, MessageCircle, ShieldCheck, X } from 'lucide-react';
import type { PublicFeatureGalleryItem } from '@/lib/publicFeatureGallery';

type OpenPhoto = {feature:number;screen:number};

export default function PublicRealIntegrationsShowcase({items}:{items:PublicFeatureGalleryItem[]}) {
  const [active,setActive] = useState(0);
  const [open,setOpen] = useState<OpenPhoto|null>(null);
  const closeRef = useRef<HTMLButtonElement|null>(null);
  const priorFocus = useRef<HTMLElement|null>(null);
  const selected=items[active];
  const photo = open===null?null:items[open.feature]?.screens[open.screen];
  const images=selected.screens;

  useEffect(()=>{
    if(!open)return;
    priorFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const priorOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    closeRef.current?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setOpen(null);}
      if(event.key!=='Tab')return;
      const dialog=document.getElementById('centralhub-public-image-dialog');
      const elements=dialog?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href], [tabindex="0"]');
      if(!elements?.length)return;
      const first=elements[0],last=elements[elements.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',onKey);
    return()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=priorOverflow;priorFocus.current?.focus();};
  },[open]);

  const choose=(idx:number)=>{setActive(idx);setOpen(null);};
  const openPhoto=(screen:number)=>setOpen({feature:active,screen});
  const step=(direction:-1|1)=>{
    if(!open)return;
    const gallery=items[open.feature].screens;
    if(!gallery.length)return;
    setOpen({feature:open.feature,screen:(open.screen+direction+gallery.length)%gallery.length});
  };

  return <section id="real-integrations" aria-labelledby="real-integrations-heading" className="scroll-mt-24 border-y border-white/10 bg-[#071625] py-20 sm:py-24">
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Inside the actual CentralHub application</p>
          <h2 id="real-integrations-heading" className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">See the integrations. Explore how they work.</h2>
          <p className="mt-5 text-base leading-8 text-slate-300">Tour the real CentralHub feature areas, from WhatsApp and marketing integrations to fulfilment, finance and NORA. Screenshots appear here only after they have been captured from the actual application and approved for public display with fictional or redacted data.</p>
        </div>
        <a href="#interactive-demo" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300">Try the interactive demo <ArrowRight aria-hidden="true" className="h-4 w-4"/></a>
      </div>

      <div className="mt-9 flex gap-2 overflow-x-auto pb-3" role="tablist" aria-label="CentralHub feature screen galleries">
        {items.map((entry,idx)=><button type="button" role="tab" id={'integration-tab-'+entry.id} aria-controls="integration-panel" aria-selected={idx===active} tabIndex={idx===active?0:-1} key={entry.id} onClick={()=>choose(idx)}
          onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?items.length-1:(active+(e.key==='ArrowRight'?1:-1)+items.length)%items.length;choose(next);document.getElementById('integration-tab-'+items[next].id)?.focus();}}
          className={'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-4 py-3 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 '+(idx===active?'border-cyan-300/50 bg-cyan-300 text-slate-950':'border-white/10 bg-white/5 text-slate-200 hover:border-cyan-300/30 hover:bg-white/10')}>{entry.title}</button>)}
      </div>

      <div id="integration-panel" role="tabpanel" aria-labelledby={'integration-tab-'+selected.id} className="mt-5 grid overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0c1c2f] lg:grid-cols-[0.9fr_1.1fr]">
        <div className="p-5 sm:p-8 lg:p-10">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">{selected.screenLabel}</p>
          <h3 className="mt-4 text-2xl font-black text-white sm:text-3xl">{selected.title}</h3>
          <p className="mt-4 text-base font-semibold leading-7 text-cyan-100">{selected.subtitle}</p>
          <p className="mt-4 text-sm leading-7 text-slate-300">{selected.description}</p>
          <div className="mt-7 rounded-xl border border-cyan-300/15 bg-[#091728] p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">How it works in CentralHub</p>
            <ol className="mt-4 space-y-4">{selected.howItWorks.map((instruction,index)=><li key={instruction} className="flex items-start gap-3 text-sm leading-6 text-slate-200"><span aria-hidden="true" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-300/15 text-xs font-black text-cyan-200">{index+1}</span>{instruction}</li>)}</ol>
          </div>
          <p className="mt-6 flex items-start gap-2 text-xs leading-6 text-slate-400"><ShieldCheck aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-cyan-200"/>Supported integrations may require third-party authorisation, account permissions and configuration. The public tour does not access any private store data.</p>
        </div>

        <div className="min-w-0 border-t border-white/10 bg-[#071321] p-4 sm:p-6 lg:border-l lg:border-t-0">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4"><p className="text-sm font-bold text-white">Actual application screens</p><span className="rounded-lg border border-white/15 bg-white/[0.04] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">{images.length?images.length+' approved screenshot'+(images.length===1?'':'s'):'Awaiting privacy-safe captures'}</span></div>
          {images.length?(
            <div className="grid gap-4">
              {images.map((screen,index)=><button type="button" key={screen.src} onClick={()=>openPhoto(index)} aria-label={'Expand actual CentralHub screenshot: '+screen.title} className="group min-w-0 overflow-hidden rounded-xl border border-cyan-300/20 bg-[#0e2134] text-left transition hover:border-cyan-300/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#091626]"><Image src={screen.src} alt={screen.alt} width={1200} height={675} sizes="(max-width: 1024px) 100vw, 50vw" className="h-full w-full object-contain" loading="lazy"/><span className="absolute right-3 top-3 rounded-lg border border-white/20 bg-slate-950/85 p-2 text-white"><Maximize2 aria-hidden="true" className="h-4 w-4"/></span></div>
                <div className="flex items-center justify-between gap-3 p-3"><span className="text-sm font-bold text-white">{screen.title}</span><span className="text-xs font-semibold text-cyan-200">View full screen</span></div>
              </button>)}
              <p className="text-xs leading-6 text-slate-400">Actual CentralHub screen · published with reviewed sample or redacted information. The image shows a captured screen, not a live service connection.</p>
            </div>
          ):(
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-300/25 bg-gradient-to-br from-[#122b3f] via-[#0a1b2c] to-[#071321] px-6 py-10 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10"><CameraOff aria-hidden="true" className="h-7 w-7 text-cyan-200"/></span>
              <p className="mt-5 text-lg font-extrabold text-white">Privacy-safe screenshot not published yet</p>
              <p className="mt-3 max-w-sm text-sm leading-7 text-slate-300">The feature exists in the actual CentralHub application. We will only display its real screen here once private accounts, tokens and customer information have been removed from the screenshot file.</p>
              <a href="#interactive-demo" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-4 py-2.5 text-sm font-bold text-cyan-100 hover:bg-cyan-300/20"><MessageCircle aria-hidden="true" className="h-4 w-4"/>Explore the safe demo <ArrowRight aria-hidden="true" className="h-4 w-4"/></a>
            </div>
          )}
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-xs leading-6 text-slate-300"><ImageIcon aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-cyan-300"/><p>Screens are captured from the existing product. We never use live passwords, private conversations, unredacted customer information or payment credentials as marketing assets.</p></div>
        </div>
      </div>
    </div>
    {photo&&open&&<div id="centralhub-public-image-dialog" role="dialog" aria-modal="true" aria-label={'Enlarged feature screenshot: '+photo.title} className="fixed inset-0 z-[100] flex items-center justify-center bg-[#01050c]/95 p-3 sm:p-8">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close screenshot preview" tabIndex={-1} onClick={()=>setOpen(null)}/>
      <div className="relative z-10 flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-cyan-300/30 bg-[#0b182b] shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{photo.title}</p><p className="text-xs text-slate-400">Actual CentralHub screen · reviewed demo data</p></div><button ref={closeRef} type="button" aria-label="Close enlarged screenshot" onClick={()=>setOpen(null)} className="flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-white/20 text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"><X aria-hidden="true" className="h-5 w-5"/></button></div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2 sm:p-5"><Image src={photo.src} alt={photo.alt} width={1600} height={900} sizes="95vw" className="max-h-[72dvh] h-auto w-auto max-w-full object-contain"/></div>
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3"><button type="button" onClick={()=>step(-1)} disabled={items[open.feature].screens.length<2} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-bold text-white disabled:opacity-30"><ChevronLeft aria-hidden="true" className="h-4 w-4"/>Previous</button><span className="text-xs text-slate-300">{open.screen+1} / {items[open.feature].screens.length}</span><button type="button" onClick={()=>step(1)} disabled={items[open.feature].screens.length<2} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-bold text-white disabled:opacity-30">Next <ChevronRight aria-hidden="true" className="h-4 w-4"/></button></div>
      </div>
    </div>}
  </section>;
}

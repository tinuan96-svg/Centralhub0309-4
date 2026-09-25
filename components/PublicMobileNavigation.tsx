'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

const links = [
  { href: '#platform', label: 'Platform' },
  { href: '#addons', label: 'Features' },
  { href: '#interactive-demo', label: 'Quick interactive demo' },
  { href: '/demo', label: 'Full dashboard demo' },
  { href: '#real-integrations', label: 'Integrations' },
  { href: '#how-it-works', label: 'How it works' },
];

export default function PublicMobileNavigation() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative ml-auto shrink-0 md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="centralhub-mobile-site-links"
        aria-label={open ? 'Close site menu' : 'Open site menu'}
        onClick={() => setOpen(value => !value)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-white/5 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
      >
        {open ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
      </button>
      {open && (
        <div
          id="centralhub-mobile-site-links"
          role="group"
          aria-label="Mobile site links"
          className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-cyan-300/25 bg-[#0a1b2d] p-2 shadow-[0_20px_55px_rgba(0,0,0,0.65)]"
        >
          {links.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-cyan-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

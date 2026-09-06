'use client';

/**
 * FORCE REFRESH - CDN VERSION v2
 * This file intentionally does NOT import 'html5-qrcode' to bypass environment build issues.
 * It loads the library from UNPKG CDN at runtime.
 */
import { useEffect, useRef, useState } from 'react';

interface BarcodeScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
  active?: boolean;
}

export default function BarcodeScanner({ onScan, onClose, active = true }: BarcodeScannerProps) {
  const scannerRef = useRef<any>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;

    // 1. Explicitly request camera permission (Best for Chrome/PWA)
    const requestPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        // Permission granted, stop the stream immediately so scanner can take over
        stream.getTracks().forEach(track => track.stop());

        // 2. Load the script from CDN if not already present
        if ((window as any).Html5QrcodeScanner) {
          setScriptLoaded(true);
          return;
        }

        const script = document.createElement('script');
        script.id = 'html5-qrcode-script';
        script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
        script.async = true;
        script.onload = () => {
          console.log("[BarcodeScanner] html5-qrcode script loaded from CDN");
          setScriptLoaded(true);
        };
        script.onerror = () => {
          console.error("[BarcodeScanner] Failed to load script from CDN");
          setError("Scanner library failed to load. Please check your internet connection.");
        };
        document.body.appendChild(script);
      } catch (err: any) {
        console.error("Camera permission denied:", err);
        setError("Camera permission is required for barcode scanning. Please enable it in your browser settings.");
      }
    };

    requestPermission();
  }, [active]);

  useEffect(() => {
    if (!scriptLoaded || !active || !document.getElementById('barcode-reader')) return;

    // Initialize scanner from global scope
    const Lib = (window as any).Html5QrcodeScanner;
    const Formats = (window as any).Html5QrcodeSupportedFormats;

    if (!Lib) {
       console.error("[BarcodeScanner] Library not found in global window object");
       return;
    }

    try {
      const scanner = new Lib(
        'barcode-reader',
        {
          fps: 20,
          qrbox: { width: 300, height: 200 },
          aspectRatio: 1.0,
          formatsToSupport: [
            Formats.EAN_13,
            Formats.EAN_8,
            Formats.UPC_A,
            Formats.UPC_E,
            Formats.CODE_128,
            Formats.QR_CODE
          ]
        },
        /* verbose= */ false
      );

      scannerRef.current = scanner;

      scanner.render(
        (decodedText: string) => {
          onScan(decodedText);
          scanner.clear().catch((e: any) => console.warn("Scanner clear error:", e));
        },
        () => { /* Quietly ignore frame scan failures */ }
      );
    } catch (err) {
      console.error("[BarcodeScanner] Initialization error:", err);
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch((err: any) => console.log("Cleanup: scanner already closed or errored"));
      }
    };
  }, [scriptLoaded, active, onScan]);

  return (
    <div className="fixed inset-0 z-[110] bg-black flex flex-col animate-in fade-in duration-300">
      <div className="flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800 pt-safe-top">
        <h3 className="text-white font-bold uppercase tracking-tight">Camera Scanner</h3>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-white"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {!scriptLoaded && !error && (
          <div className="text-center space-y-4">
            <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-400 text-sm font-medium uppercase tracking-widest">Waking Up Camera...</p>
          </div>
        )}

        {error && (
          <div className="text-center space-y-4 max-w-xs">
            <span className="text-4xl">⚠️</span>
            <p className="text-rose-400 text-sm font-bold leading-relaxed">{error}</p>
            <button onClick={onClose} className="px-8 py-3 bg-slate-800 text-white rounded-2xl font-black uppercase text-xs">Return to Manual</button>
          </div>
        )}

        <div id="barcode-reader" className={`w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border-4 border-cyan-500/30 ${!scriptLoaded ? 'hidden' : ''}`}></div>

        {scriptLoaded && (
          <div className="mt-8 text-center space-y-4 max-w-xs animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
              <p className="text-cyan-400 text-xs font-bold uppercase tracking-wide">Box the Barcode</p>
              <p className="text-slate-400 text-[10px] mt-1">Position items clearly in front of the lens.</p>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 bg-slate-950 border-t border-slate-900 pb-safe-bottom">
        <button
          onClick={onClose}
          className="w-full py-5 bg-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all"
        >
          Close Scanner
        </button>
      </div>
    </div>
  );
}

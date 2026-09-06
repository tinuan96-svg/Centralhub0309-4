'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-[#0D1117] flex flex-col items-center justify-center min-h-screen text-white p-4 font-sans">
        <div className="bg-[#161B22] border border-[#30363D] p-8 rounded-2xl max-w-md w-full shadow-2xl text-center">
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">Critical System Error</h2>
          <p className="text-[#8B949E] mb-8">
            A root-level system error occurred. This prevents the application from starting correctly.
          </p>
          <button
            onClick={() => reset()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)]"
          >
            Attempt System Reset
          </button>
        </div>
      </body>
    </html>
  );
}

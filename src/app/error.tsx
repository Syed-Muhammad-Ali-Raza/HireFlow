'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error boundary:', error);
  }, [error]);

  return (
    <div className="flex-1 flex flex-col justify-center items-center bg-slate-950 p-6 min-h-screen">
      <div className="bg-red-950/20 border border-red-900/50 p-8 rounded-2xl max-w-md text-center space-y-4">
        <h2 className="text-lg font-display font-bold text-red-400">Something went wrong</h2>
        <p className="text-sm text-slate-400">
          {error.message || 'An unexpected error occurred. You can try again or return home.'}
        </p>
        {error.digest && (
          <p className="text-[10px] text-slate-600 font-mono">Ref: {error.digest}</p>
        )}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={reset}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 cursor-pointer"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

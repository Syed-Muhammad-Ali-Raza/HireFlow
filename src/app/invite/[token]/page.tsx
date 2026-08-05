'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

interface InviteMeta {
  email: string;
  role: string;
  company_name: string;
}

export default function InviteAcceptPage() {
  const { token } = useParams() as { token: string };
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invite, setInvite] = useState<InviteMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setSessionEmail(session?.user.email ?? null);

        const res = await fetch(`/api/team/invites/accept?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Invitation is invalid or expired.');
        setInvite(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load invitation.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, supabase]);

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch('/api/team/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to accept invitation');
      router.push('/');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation.');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/50 border border-slate-800 rounded-3xl p-8 relative z-10 space-y-6">
        <div className="flex items-center space-x-2">
          <span className="h-8 w-8 rounded-lg bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center font-display font-bold text-white text-sm">
            H
          </span>
          <span className="font-display font-bold text-white">HireFlow</span>
        </div>

        <div>
          <h1 className="text-2xl font-display font-extrabold text-white">Team invitation</h1>
          <p className="text-sm text-slate-400 mt-1">Join a hiring workspace with a preset role.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <svg className="animate-spin h-7 w-7 text-violet-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : error && !invite ? (
          <div className="rounded-xl bg-red-950/40 border border-red-900/40 p-4 text-sm text-red-400">{error}</div>
        ) : invite ? (
          <>
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-2 text-sm">
              <p className="text-slate-300">
                <span className="text-slate-500">Company:</span>{' '}
                <strong className="text-white">{invite.company_name}</strong>
              </p>
              <p className="text-slate-300">
                <span className="text-slate-500">Role:</span>{' '}
                <strong className="text-violet-300 uppercase text-xs tracking-wider">{invite.role}</strong>
              </p>
              <p className="text-slate-300">
                <span className="text-slate-500">Invited email:</span> {invite.email}
              </p>
            </div>

            {error && (
              <div className="rounded-xl bg-red-950/40 border border-red-900/40 p-3 text-xs text-red-400">{error}</div>
            )}

            {sessionEmail ? (
              <button
                type="button"
                onClick={handleAccept}
                disabled={accepting}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 cursor-pointer"
              >
                {accepting ? 'Joining…' : 'Accept invitation'}
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Sign in or create an account with <strong className="text-slate-300">{invite.email}</strong> to join.
                </p>
                <Link
                  href={`/login?token=${encodeURIComponent(token)}`}
                  className="block text-center w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
                >
                  Continue to sign in / sign up
                </Link>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

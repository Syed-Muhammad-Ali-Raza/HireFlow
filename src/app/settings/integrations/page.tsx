'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function IntegrationsPage() {
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Read status params from redirect callback
    if (searchParams.get('success') === 'true') {
      setSuccess(true);
    }
    const err = searchParams.get('error');
    if (err) {
      setError(err.replace(/_/g, ' '));
    }

    async function loadProfile() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data, error: profileErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profileErr) throw profileErr;
        setProfile(data);
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [supabase, searchParams]);

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          calendar_connected: false,
          calendar_provider: null,
          calendar_refresh_token: null,
        })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

      // Update local state
      setProfile((prev: any) => ({
        ...prev,
        calendar_connected: false,
        calendar_provider: null,
        calendar_refresh_token: null,
      }));
      setSuccess(false);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect calendar.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center bg-slate-950">
        <svg className="animate-spin h-8 w-8 text-violet-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />

      {/* Navigation */}
      <nav className="relative z-10 border-b border-slate-900 bg-slate-950/60 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-2">
              <Link href="/" className="h-8 w-8 rounded-lg bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center">
                <span className="font-display font-bold text-white text-base">H</span>
              </Link>
              <Link href="/" className="font-display font-bold text-lg text-white">HireFlow</Link>
            </div>
            <Link
              href="/"
              className="text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </nav>

      {/* Settings Grid */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10 relative z-10">
        <div className="pb-6 border-b border-slate-900">
          <h1 className="text-3xl font-display font-extrabold text-white tracking-tight">Settings & Integrations</h1>
          <p className="text-sm text-slate-400 mt-1">Manage connected services for schedule checking and interview booking.</p>
        </div>

        {/* Success/Error Alerts */}
        <div className="mt-6 space-y-4">
          {success && (
            <div className="rounded-xl bg-emerald-950/40 border border-emerald-900/40 p-4 flex items-center text-sm text-emerald-400 font-medium">
              <svg className="w-5 h-5 mr-3 shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              Google Calendar connected successfully! You can now check interviewer availability.
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-950/40 border border-red-900/40 p-4 flex items-center text-sm text-red-400 font-medium">
              <svg className="w-5 h-5 mr-3 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Connection failed: {error}
            </div>
          )}
        </div>

        {/* Calendar Connection card */}
        <div className="mt-8 grid grid-cols-1 gap-6">
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-900 p-6 sm:p-8 rounded-2xl shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start space-x-4">
              {/* Google Icon */}
              <div className="h-12 w-12 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 shadow-inner">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Google Calendar Integration</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  Sync interviewer calendars to check dynamic availability overlaps and directly publish calendar bookings with Google Meet video links.
                </p>
                {profile?.calendar_connected && (
                  <div className="inline-flex items-center space-x-2 mt-4 text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-900/40 px-3 py-1.5 rounded-xl">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Connected to: <strong>{profile.email}</strong></span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 sm:mt-0 shrink-0">
              {profile?.calendar_connected ? (
                <button
                  onClick={handleDisconnect}
                  className="w-full sm:w-auto px-5 py-2.5 border border-red-900/40 text-xs font-semibold text-red-400 bg-red-950/10 hover:bg-red-950/30 rounded-xl transition-all cursor-pointer"
                >
                  Disconnect Account
                </button>
              ) : (
                <a
                  href="/api/calendar/connect"
                  className="block text-center px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition-all cursor-pointer shadow-lg shadow-violet-600/20"
                >
                  Connect Google Calendar
                </a>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

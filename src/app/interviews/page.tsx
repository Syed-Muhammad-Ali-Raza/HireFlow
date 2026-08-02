'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/components/ToastProvider';

interface InterviewRow {
  id: string;
  scheduled_time: string;
  status: string;
  meeting_link: string | null;
  candidates: {
    name: string;
    email: string | null;
    job_id: string;
    job_postings: { title: string } | null;
  } | null;
}

export default function InterviewsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { error: toastError } = useToast();

  const [loading, setLoading] = useState(true);
  const [interviews, setInterviews] = useState<InterviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          router.push('/login');
          return;
        }

        const res = await fetch('/api/interviews');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load interviews');
        setInterviews(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load interviews';
        setError(message);
        toastError(message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router, supabase, toastError]);

  const [nowMs] = useState(() => Date.now());
  const cutoff = nowMs - 60 * 60 * 1000;

  const upcoming = interviews.filter(
    (i) => new Date(i.scheduled_time).getTime() >= cutoff
  );
  const past = interviews.filter(
    (i) => new Date(i.scheduled_time).getTime() < cutoff
  );

  const statusStyles = (status: string) => {
    if (status === 'confirmed') return 'bg-emerald-950/40 text-emerald-400 border-emerald-900/40';
    if (status === 'cancelled') return 'bg-red-950/40 text-red-400 border-red-900/40';
    return 'bg-amber-950/40 text-amber-400 border-amber-900/40';
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 min-h-screen">
      <nav className="border-b border-slate-900 bg-slate-950/60 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-2">
              <Link
                href="/"
                className="h-8 w-8 rounded-lg bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center"
              >
                <span className="font-display font-bold text-white text-base">H</span>
              </Link>
              <Link href="/" className="font-display font-bold text-lg text-white hover:text-violet-400 transition-colors">
                HireFlow
              </Link>
              <span className="text-slate-700">/</span>
              <span className="text-sm text-slate-300 font-medium">Interviews</span>
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

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 lg:px-8 py-10">
        <div className="pb-8 border-b border-slate-900">
          <h1 className="text-3xl font-display font-extrabold text-white tracking-tight">Interviews</h1>
          <p className="text-sm text-slate-400 mt-1">
            Scheduled meetings for your company. Candidates book via signed invite links.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <svg className="animate-spin h-8 w-8 text-violet-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : error ? (
          <div className="mt-8 rounded-xl bg-red-950/40 border border-red-900/40 p-4 text-sm text-red-400">
            {error}
          </div>
        ) : interviews.length === 0 ? (
          <div className="mt-16 text-center space-y-3">
            <p className="text-sm text-slate-400 font-medium">No interviews scheduled yet.</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Shortlist a candidate, connect Google Calendar under Integrations, then copy their booking invite link.
            </p>
            <Link
              href="/settings/integrations"
              className="inline-block mt-4 px-5 py-2.5 rounded-xl border border-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-900"
            >
              Open Integrations
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-10">
            <InterviewSection title="Upcoming" items={upcoming} statusStyles={statusStyles} />
            <InterviewSection title="Past" items={past} statusStyles={statusStyles} />
          </div>
        )}
      </main>
    </div>
  );
}

function InterviewSection({
  title,
  items,
  statusStyles,
}: {
  title: string;
  items: InterviewRow[];
  statusStyles: (s: string) => string;
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">{title}</h2>
      <div className="space-y-3">
        {items.map((row) => {
          const jobTitle = row.candidates?.job_postings?.title || 'Role';
          const candName = row.candidates?.name || 'Candidate';
          return (
            <div
              key={row.id}
              className="bg-slate-900/30 border border-slate-900 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-sm font-bold text-white">{candName}</h3>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${statusStyles(row.status)}`}>
                    {row.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  {jobTitle}
                  {row.candidates?.email ? ` · ${row.candidates.email}` : ''}
                </p>
                <p className="text-xs text-violet-400 font-semibold mt-2">
                  {new Date(row.scheduled_time).toLocaleString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {row.candidates?.job_id && (
                  <Link
                    href={`/jobs/${row.candidates.job_id}`}
                    className="px-4 py-2 rounded-xl border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-900"
                  >
                    Open Job
                  </Link>
                )}
                {row.meeting_link && (
                  <a
                    href={row.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
                  >
                    Join Meet
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

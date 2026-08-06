'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import ChatPanel from '@/components/ChatPanel';

interface JobPosting {
  id: string;
  title: string;
  description: string;
  required_skills: string[];
  created_at: string;
}

interface Company {
  id: string;
  name: string;
}

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [jobs, setJobs] = useState<JobPosting[]>([]);

  // Company creation state
  const [newCompanyName, setNewCompanyName] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSession() {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        setSession(currentSession);
        
        if (currentSession) {
          // Fetch profile
          const { data: profileData, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentSession.user.id)
            .single();

          if (profileErr) throw profileErr;
          setProfile(profileData);

          // Fetch Company & Jobs
          await fetchData(currentSession.user.id);
        }
      } catch (err) {
        console.error('Error loading session:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, currentSession) => {
        setSession(currentSession);
        if (currentSession) {
          await fetchData(currentSession.user.id);
        } else {
          setCompany(null);
          setJobs([]);
        }
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function fetchData(userId: string) {
    try {
      // 1. Fetch profile to get company_id
      const { data: profileData } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', userId)
        .single();

      if (profileData?.company_id) {
        // 2. Fetch Company Details
        const { data: compData } = await supabase
          .from('companies')
          .select('*')
          .eq('id', profileData.company_id)
          .single();

        setCompany(compData);

        // 3. Fetch Jobs
        const { data: jobsData } = await supabase
          .from('job_postings')
          .select('*')
          .eq('company_id', profileData.company_id)
          .order('created_at', { ascending: false });

        setJobs(jobsData || []);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  }

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) return;

    setCreatingCompany(true);
    setCompanyError(null);

    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCompanyName.trim() }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to create company');

      setCompany(data);
      // Reload session/profile details
      if (session?.user?.id) {
        await fetchData(session.user.id);
      }
    } catch (err: any) {
      setCompanyError(err.message || 'Something went wrong');
    } finally {
      setCreatingCompany(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
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

  // --- UNAUTHENTICATED VISITOR PAGE ---
  if (!session) {
    return (
      <div className="flex-1 flex flex-col relative overflow-hidden bg-slate-950">
        {/* Background Gradients */}
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-violet-600/10 blur-[130px] pointer-events-none glow-purple" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[130px] pointer-events-none glow-blue" />

        {/* Header */}
        <header className="relative z-10 max-w-7xl mx-auto w-full px-6 py-6 flex items-center justify-between border-b border-slate-900">
          <div className="flex items-center space-x-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center">
              <span className="font-display font-bold text-white text-lg">H</span>
            </div>
            <span className="font-display font-extrabold text-xl text-white">HireFlow</span>
          </div>
          <div>
            <Link
              href="/login"
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 transition-all cursor-pointer"
            >
              Sign In
            </Link>
          </div>
        </header>

        {/* Hero Section */}
        <main className="flex-1 flex flex-col justify-center items-center px-6 relative z-10 text-center max-w-4xl mx-auto py-16">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-violet-500/20 bg-violet-500/5 text-xs text-violet-400 font-semibold mb-6 animate-pulse-subtle">
            <span>✨ Powered by Advanced LLMs</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-display font-extrabold text-white tracking-tight leading-tight">
            Screen & Rank Resumes <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400">
              in Seconds with AI
            </span>
          </h1>
          <p className="mt-6 text-lg text-slate-400 max-w-2xl">
            HireFlow extracts, parses, and matches candidate resumes against your job descriptions using state-of-the-art semantic matching. No black-box scores — get detailed strengths, gaps, and missing skills.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <Link
              href="/login"
              className="px-8 py-4 rounded-xl text-base font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition-all cursor-pointer shadow-lg shadow-violet-600/30 hover:scale-[1.02]"
            >
              Get Started for Free
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // --- COMPILATION WITHOUT COMPANY PROFILE ---
  if (session && !company) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 bg-slate-950 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none glow-purple" />
        
        <div className="max-w-md w-full space-y-8 bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 p-8 shadow-2xl rounded-2xl relative z-10">
          <div className="text-center">
            <h2 className="text-3xl font-display font-bold text-white">Create Company</h2>
            <p className="mt-2 text-sm text-slate-400">
              Set up your organization to start posting jobs and screening candidates.
            </p>
          </div>
          <form className="mt-8 space-y-6" onSubmit={handleCreateCompany}>
            <div>
              <label htmlFor="companyName" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Company Name
              </label>
              <div className="mt-1">
                <input
                  id="companyName"
                  name="companyName"
                  type="text"
                  required
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="Acme Recruiting"
                  className="block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
                />
              </div>
            </div>

            {companyError && (
              <div className="rounded-xl bg-red-950/50 border border-red-800/80 p-4">
                <p className="text-sm text-red-400 font-medium">{companyError}</p>
              </div>
            )}

            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={creatingCompany}
                className="flex-1 flex justify-center py-3 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 outline-none transition-all cursor-pointer disabled:opacity-50"
              >
                {creatingCompany ? 'Creating...' : 'Create Organization'}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-3 border border-slate-800 rounded-xl text-sm font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
              >
                Logout
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // --- AUTHENTICATED RECRUITER DASHBOARD ---
  return (
    <div className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none glow-purple" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-blue-600/5 blur-[120px] pointer-events-none glow-blue" />

      {/* Navigation */}
      <nav className="relative z-10 border-b border-slate-900 bg-slate-950/60 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center">
                <span className="font-display font-bold text-white text-base">H</span>
              </div>
              <span className="font-display font-bold text-lg text-white">HireFlow</span>
              <span className="text-slate-600">/</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                {company?.name}
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-slate-400">
                Logged in as <strong className="text-slate-200">{profile?.name || session.user.email}</strong>
                {profile?.role && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-violet-400 font-bold">
                    {profile.role}
                  </span>
                )}
              </span>
              <Link
                href="/interviews"
                className="px-4 py-1.5 border border-slate-800 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-900 hover:text-white hover:border-slate-700 transition-all"
              >
                Interviews
              </Link>
              <Link
                href="/settings/team"
                className="px-4 py-1.5 border border-slate-800 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-900 hover:text-white hover:border-slate-700 transition-all"
              >
                Team
              </Link>
              <Link
                href="/settings/integrations"
                className="px-4 py-1.5 border border-slate-800 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-900 hover:text-white hover:border-slate-700 transition-all"
              >
                Integrations
              </Link>
              <button
                onClick={handleLogout}
                className="px-4 py-1.5 border border-slate-800 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-900 hover:text-white hover:border-slate-700 transition-all cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 lg:px-8 py-10 relative z-10 flex flex-col">
        {/* Welcome Banner */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-8 border-b border-slate-900">
          <div>
            <h1 className="text-3xl font-display font-extrabold text-white tracking-tight">Active Jobs</h1>
            <p className="text-sm text-slate-400 mt-1">Manage jobs and screen incoming candidate resume PDFs.</p>
          </div>
          {profile?.role !== 'interviewer' && (
            <div className="mt-4 md:mt-0">
              <Link
                href="/jobs/new"
                className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition-all cursor-pointer shadow-lg shadow-violet-600/20 hover:scale-[1.01]"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Create Job Posting
              </Link>
            </div>
          )}
        </div>

        {/* Job Listings Grid */}
        <div className="flex-1 mt-8">
          {jobs.length === 0 ? (
            /* Empty State */
            <div className="text-center py-20 bg-slate-900/30 border border-dashed border-slate-800/80 rounded-2xl flex flex-col items-center justify-center">
              <div className="h-12 w-12 rounded-2xl bg-slate-900 flex items-center justify-center border border-slate-800 text-slate-400 mb-4 shadow-inner">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white">No jobs posted yet</h3>
              <p className="text-sm text-slate-400 mt-1 max-w-sm">
                Get started by creating your first job description. You'll be able to upload resumes immediately.
              </p>
              <div className="mt-6">
                <Link
                  href="/jobs/new"
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all cursor-pointer"
                >
                  Create First Job
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="group block bg-slate-900/40 backdrop-blur-sm border border-slate-900 hover:border-slate-800/80 hover:bg-slate-900/60 p-6 rounded-2xl transition-all shadow-xl hover:shadow-2xl hover:shadow-violet-600/5 flex flex-col justify-between hover:scale-[1.01]"
                >
                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-violet-400 transition-colors">
                      {job.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Posted on {new Date(job.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-slate-400 mt-4 line-clamp-3 leading-relaxed">
                      {job.description}
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-900 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-semibold uppercase tracking-wider">
                      {job.required_skills.length} Skills Required
                    </span>
                    <span className="text-violet-400 group-hover:translate-x-1 transition-transform inline-flex items-center font-bold">
                      View Board
                      <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      
      {/* AI Recruiter Copilot */}
      <ChatPanel />
    </div>
  );
}

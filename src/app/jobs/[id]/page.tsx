'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/components/ToastProvider';

interface Candidate {
  id: string;
  name: string;
  email: string;
  resume_file_url: string;
  match_score: number;
  match_reasoning: string;
  matched_skills: string[];
  missing_skills: string[];
  status: 'new' | 'shortlisted' | 'rejected' | 'interview_scheduled';
  created_at: string;
  assigned_interviewer_ids?: string[] | null;
}

interface JobPosting {
  id: string;
  title: string;
  description: string;
  required_skills: string[];
  created_at: string;
}

interface UploadTask {
  id: string;
  fileName: string;
  status: 'uploading' | 'parsing' | 'ranking' | 'success' | 'failed';
  errorMessage?: string;
  score?: number;
}

export default function JobDashboardPage() {
  const router = useRouter();
  const { id: jobId } = useParams() as { id: string };
  const supabase = createClient();
  const { success: toastSuccess, error: toastError } = useToast();

  const [job, setJob] = useState<JobPosting | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'score' | 'name' | 'date'>('score');

  // File Uploading state
  const [uploadQueue, setUploadQueue] = useState<UploadTask[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selected candidate drawer state
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  // Override score state
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideScore, setOverrideScore] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideCandidate, setOverrideCandidate] = useState<Candidate | null>(null);
  const [overriding, setOverriding] = useState(false);

  // Clipboard copy state
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [copyingInvite, setCopyingInvite] = useState(false);

  // Edit / delete job
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSkills, setEditSkills] = useState('');
  const [savingJob, setSavingJob] = useState(false);
  const [deletingJob, setDeletingJob] = useState(false);

  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>('recruiter');
  const [assigningInterviewerId, setAssigningInterviewerId] = useState<string | null>(null);

  const handleCopyInviteLink = async (candidateId: string) => {
    setCopyingInvite(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/booking-link`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create booking link');
      await navigator.clipboard.writeText(data.url);
      setCopiedInviteId(candidateId);
      toastSuccess('Signed booking link copied (expires in 7 days)');
      setTimeout(() => setCopiedInviteId(null), 2000);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to copy invite link');
    } finally {
      setCopyingInvite(false);
    }
  };

  const openEditJob = () => {
    if (!job) return;
    setEditTitle(job.title);
    setEditDescription(job.description);
    setEditSkills((job.required_skills || []).join(', '));
    setIsEditOpen(true);
  };

  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingJob(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          required_skills: editSkills,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update job');
      setJob(data);
      setIsEditOpen(false);
      toastSuccess('Job updated');
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to update job');
    } finally {
      setSavingJob(false);
    }
  };

  const handleDeleteJob = async () => {
    if (!job) return;
    const confirmed = window.confirm(
      `Delete "${job.title}" and all of its candidates? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingJob(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete job');
      toastSuccess('Job deleted');
      router.push('/');
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to delete job');
      setDeletingJob(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        // Verify session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.push('/login');
          return;
        }

        // Fetch user profile role
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();
        if (profile) {
          setCurrentUserRole(profile.role);
        }

        // Fetch Job Details
        const jobRes = await fetch(`/api/jobs/${jobId}`);
        const jobData = await jobRes.json();
        if (!jobRes.ok) throw new Error(jobData.error || 'Job description not found');
        setJob(jobData);

        // Fetch Team Members
        const teamRes = await fetch('/api/team/members');
        const teamData = await teamRes.json();
        if (teamRes.ok) {
          setTeamMembers(teamData);
        }

        // Fetch Candidates
        await refreshCandidates();
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [jobId, supabase, router]);

  const refreshCandidates = async () => {
    const candRes = await fetch(`/api/jobs/${jobId}/candidates`);
    const candData = await candRes.json();
    if (candRes.ok) {
      setCandidates(candData);
    }
  };

  // Upload Handlers
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    uploadFiles(Array.from(files));
  };

  const uploadFiles = async (files: File[]) => {
    const newTasks = files.map(file => ({
      id: `${Date.now()}-${file.name}`,
      fileName: file.name,
      status: 'uploading' as const,
    }));

    setUploadQueue(prev => [...newTasks, ...prev]);

    // Process tasks sequentially or in parallel
    for (const task of newTasks) {
      const targetFile = files.find(f => f.name === task.fileName);
      if (!targetFile) continue;

      try {
        // Step 1: Uploading state
        setUploadQueue(prev =>
          prev.map(t => (t.id === task.id ? { ...t, status: 'parsing' } : t))
        );

        const formData = new FormData();
        formData.append('file', targetFile);

        // Step 2: Ranking state
        setUploadQueue(prev =>
          prev.map(t => (t.id === task.id ? { ...t, status: 'ranking' } : t))
        );

        const res = await fetch(`/api/jobs/${jobId}/candidates`, {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to rank candidate');

        setUploadQueue(prev =>
          prev.map(t =>
            t.id === task.id
              ? { ...t, status: 'success', score: data.match_score }
              : t
          )
        );

        // Refresh list
        refreshCandidates();
      } catch (err: any) {
        console.error('Upload task error:', err);
        setUploadQueue(prev =>
          prev.map(t =>
            t.id === task.id
              ? { ...t, status: 'failed', errorMessage: err.message || 'Failed' }
              : t
          )
        );
      }
    }
  };

  // Status Modifiers
  const updateCandidateStatus = async (candId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/candidates/${candId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to update status');
      }
      
      const updated = await res.json();
      setCandidates(prev => prev.map(c => (c.id === candId ? updated : c)));
      if (selectedCandidate && selectedCandidate.id === candId) {
        setSelectedCandidate(updated);
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  // Score Override Handlers
  const handleOpenOverride = (candidate: Candidate, e: React.MouseEvent) => {
    e.stopPropagation();
    setOverrideCandidate(candidate);
    setOverrideScore(candidate.match_score.toString());
    setOverrideReason(candidate.match_reasoning || '');
    setIsOverrideModalOpen(true);
  };

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideCandidate) return;

    setOverriding(true);
    try {
      const res = await fetch(`/api/candidates/${overrideCandidate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match_score: Number(overrideScore),
          match_reasoning: overrideReason,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to override score');
      }

      const updated = await res.json();
      setCandidates(prev => prev.map(c => (c.id === overrideCandidate.id ? updated : c)));
      if (selectedCandidate && selectedCandidate.id === overrideCandidate.id) {
        setSelectedCandidate(updated);
      }
      setIsOverrideModalOpen(false);
      toastSuccess('Score override saved');
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to override score');
    } finally {
      setOverriding(false);
    }
  };

  // Filter & Sort Logic
  const filteredCandidates = candidates
    .filter(cand => {
      const matchesSearch = cand.name.toLowerCase().includes(search.toLowerCase()) ||
        (cand.email && cand.email.toLowerCase().includes(search.toLowerCase()));
      const matchesStatus = statusFilter === 'all' || cand.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'score') return b.match_score - a.match_score;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  // Score badge color helper
  const getScoreBadgeStyles = (score: number) => {
    if (score >= 80) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (score >= 50) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-red-500/10 text-red-400 border-red-500/20';
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

  if (error || !job) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-slate-950 p-6">
        <div className="bg-red-950/20 border border-red-900/50 p-6 rounded-2xl max-w-md text-center">
          <h3 className="text-lg font-bold text-red-400">Error Loading Board</h3>
          <p className="text-sm text-slate-400 mt-2">{error || 'Job details could not be found.'}</p>
          <Link href="/" className="mt-6 inline-block px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm font-semibold text-white hover:bg-slate-800">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden h-screen">
      {/* Navigation */}
      <nav className="border-b border-slate-900 bg-slate-950/60 backdrop-blur-md relative z-10 shrink-0">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-2">
              <Link href="/" className="h-8 w-8 rounded-lg bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center">
                <span className="font-display font-bold text-white text-base">H</span>
              </Link>
              <Link href="/" className="font-display font-bold text-lg text-white hover:text-violet-400 transition-colors">
                HireFlow
              </Link>
              <span className="text-slate-700">/</span>
              <span className="text-sm text-slate-300 font-medium truncate max-w-[200px] md:max-w-xs">
                {job.title}
              </span>
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

      {/* Main Board View: Left/Right panels split */}
      <div className="flex-1 flex overflow-hidden max-w-7xl mx-auto w-full relative z-10">
        {/* LEFT PANEL: Job Description & Upload Widget */}
        <aside className="w-80 md:w-96 border-r border-slate-900 bg-slate-950 p-6 flex flex-col overflow-y-auto shrink-0">
          <div>
            <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest bg-violet-950/50 px-2 py-0.5 border border-violet-800/30 rounded-md">
              Hiring Criteria
            </span>
            <h2 className="text-xl font-display font-bold text-white mt-3">{job.title}</h2>
            <p className="text-[11px] text-slate-500 mt-1">
              Created on {new Date(job.created_at).toLocaleDateString()}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={openEditJob}
                className="px-3 py-1.5 rounded-lg border border-slate-800 text-[10px] font-semibold text-slate-400 hover:text-white hover:bg-slate-900 cursor-pointer"
              >
                Edit Job
              </button>
              <button
                type="button"
                onClick={handleDeleteJob}
                disabled={deletingJob}
                className="px-3 py-1.5 rounded-lg border border-red-900/40 text-[10px] font-semibold text-red-400 hover:bg-red-950/30 cursor-pointer disabled:opacity-50"
              >
                {deletingJob ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>

          {/* Drag & Drop File Upload */}
          <div className="mt-6 shrink-0">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-800 hover:border-violet-500/50 hover:bg-violet-950/5 bg-slate-900/20 py-8 px-4 rounded-2xl text-center cursor-pointer transition-all group flex flex-col items-center shadow-inner"
            >
              <svg className="w-8 h-8 text-slate-500 group-hover:text-violet-400 transition-colors mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-xs font-bold text-slate-300">Upload candidate resumes</span>
              <span className="text-[10px] text-slate-500 mt-1">Drag and drop or click to browse PDFs</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          </div>

          {/* Active Upload Tasks list */}
          {uploadQueue.length > 0 && (
            <div className="mt-5 space-y-3 shrink-0">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Processing Queue</h4>
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {uploadQueue.map((task) => (
                  <div key={task.id} className="bg-slate-900/60 border border-slate-800/80 p-2.5 rounded-xl text-xs flex flex-col">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-300 truncate pr-2 max-w-[160px]">{task.fileName}</span>
                      {task.status === 'success' && task.score !== undefined && (
                        <span className="text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-900/40 px-1.5 py-0.5 rounded text-[10px]">
                          {task.score}%
                        </span>
                      )}
                      {task.status === 'failed' && (
                        <span className="text-red-400 text-[10px] font-bold">Failed</span>
                      )}
                      {(task.status === 'uploading' || task.status === 'parsing' || task.status === 'ranking') && (
                        <span className="flex items-center space-x-1.5 text-violet-400 text-[10px] font-medium">
                          <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>{task.status}</span>
                        </span>
                      )}
                    </div>
                    {task.errorMessage && (
                      <span className="text-[10px] text-red-500 mt-1 truncate">{task.errorMessage}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Job description scroll block */}
          <div className="mt-6 flex-1 flex flex-col min-h-0 border-t border-slate-900 pt-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Job Description</h3>
            <div className="mt-3 flex-1 overflow-y-auto text-sm text-slate-400 pr-1 leading-relaxed whitespace-pre-wrap">
              {job.description}
            </div>
          </div>
        </aside>

        {/* RIGHT PANEL: Dynamic Candidate Search Table */}
        <section className="flex-1 bg-slate-950 p-6 flex flex-col overflow-hidden">
          {/* Header filters */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center shrink-0 border-b border-slate-900 pb-5">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search candidates by name..."
                className="block w-full rounded-xl border border-slate-800 bg-slate-900/20 pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-violet-500 transition-all"
              />
            </div>

            {/* Filter selectors */}
            <div className="flex items-center space-x-3 text-xs">
              {/* Status Filter */}
              <div className="flex items-center space-x-2">
                <span className="text-slate-500">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-800 bg-slate-900/30 px-3.5 py-2 text-white outline-none cursor-pointer focus:border-violet-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="new">New</option>
                  <option value="shortlisted">Shortlisted</option>
                  <option value="interview_scheduled">Interviewing</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {/* Sort selector */}
              <div className="flex items-center space-x-2">
                <span className="text-slate-500">Sort By:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="rounded-xl border border-slate-800 bg-slate-900/30 px-3.5 py-2 text-white outline-none cursor-pointer focus:border-violet-500"
                >
                  <option value="score">Highest Match</option>
                  <option value="name">Alphabetical</option>
                  <option value="date">Recently Uploaded</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-y-auto mt-6">
            {filteredCandidates.length === 0 ? (
              <div className="text-center py-20 flex flex-col items-center">
                <svg className="w-10 h-10 text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <p className="text-sm text-slate-500 font-medium">No candidates match your criteria.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCandidates.map((cand) => (
                  <div
                    key={cand.id}
                    onClick={() => setSelectedCandidate(cand)}
                    className="bg-slate-900/30 hover:bg-slate-900/60 border border-slate-900 hover:border-slate-800/80 rounded-2xl p-4.5 transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center cursor-pointer relative overflow-hidden group shadow-lg"
                  >
                    <div className="flex items-center space-x-4">
                      {/* Score Circle Badge */}
                      <div className={`h-12 w-12 rounded-xl flex flex-col items-center justify-center border font-display font-extrabold shrink-0 shadow-inner ${getScoreBadgeStyles(cand.match_score)}`}>
                        <span className="text-sm">{cand.match_score}</span>
                        <span className="text-[7px] uppercase tracking-wider font-semibold opacity-70">match</span>
                      </div>

                      {/* Details */}
                      <div>
                        <h4 className="font-bold text-white group-hover:text-violet-400 transition-colors text-sm">{cand.name}</h4>
                        <div className="flex items-center space-x-3 text-xs text-slate-500 mt-1 font-medium">
                          <span className="truncate max-w-[180px]">{cand.email || 'No email provided'}</span>
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-800" />
                          <span>Uploaded {new Date(cand.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions and Status pills */}
                    <div className="flex items-center space-x-3 mt-4 sm:mt-0 shrink-0 self-end sm:self-auto relative z-10" onClick={(e) => e.stopPropagation()}>
                      {/* Status Badges */}
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                        cand.status === 'shortlisted' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/40' :
                        cand.status === 'rejected' ? 'bg-red-950/40 text-red-400 border-red-900/40' :
                        cand.status === 'interview_scheduled' ? 'bg-blue-950/40 text-blue-400 border-blue-900/40' :
                        'bg-slate-900 text-slate-400 border-slate-800'
                      }`}>
                        {cand.status === 'interview_scheduled' ? 'Interviewing' : cand.status}
                      </span>

                      {/* Quick Actions Menu */}
                      <div className="flex items-center border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                        <button
                          onClick={() => updateCandidateStatus(cand.id, 'shortlisted')}
                          title="Shortlist Candidate"
                          className="p-2 text-slate-500 hover:text-emerald-400 hover:bg-slate-900 transition-all border-r border-slate-800"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => updateCandidateStatus(cand.id, 'rejected')}
                          title="Reject Candidate"
                          className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-900 transition-all border-r border-slate-800"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => handleOpenOverride(cand, e)}
                          title="Manual Score Override"
                          className="p-2 text-slate-500 hover:text-violet-400 hover:bg-slate-900 transition-all"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* SELECTED CANDIDATE SLIDE-OUT DRAWER */}
      {selectedCandidate && (
        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-40 transition-opacity flex justify-end" onClick={() => setSelectedCandidate(null)}>
          <div
            className="w-full max-w-lg bg-slate-900 border-l border-slate-800 h-full flex flex-col p-6 shadow-2xl relative animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-5 shrink-0">
              <div className="flex items-center space-x-3.5">
                <div className={`h-12 w-12 rounded-xl flex flex-col items-center justify-center border font-display font-extrabold shadow-inner ${getScoreBadgeStyles(selectedCandidate.match_score)}`}>
                  <span className="text-sm">{selectedCandidate.match_score}</span>
                  <span className="text-[7px] uppercase tracking-wider font-semibold opacity-70">match</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white leading-snug">{selectedCandidate.name}</h3>
                  <p className="text-xs text-slate-500 font-medium">{selectedCandidate.email || 'No email provided'}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                className="p-1 rounded-lg border border-slate-800 text-slate-500 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto py-6 space-y-6 min-h-0 pr-1">
              {/* Match reasoning */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">AI Match Reasoning</h4>
                <p className="text-sm text-slate-300 leading-relaxed bg-slate-950/40 border border-slate-950 p-4 rounded-2xl whitespace-pre-wrap">
                  {selectedCandidate.match_reasoning}
                </p>
              </div>

              {/* Core Skills match */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-950/10 border border-emerald-900/20 p-4.5 rounded-2xl flex flex-col">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2.5">Matched Skills</span>
                  {selectedCandidate.matched_skills.length === 0 ? (
                    <span className="text-xs text-slate-500 font-medium">None identified</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedCandidate.matched_skills.map((skill, i) => (
                        <span key={i} className="text-[10px] font-semibold bg-emerald-950/40 border border-emerald-900/40 text-emerald-400 px-2 py-0.5 rounded">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-red-950/10 border border-red-900/20 p-4.5 rounded-2xl flex flex-col">
                  <span className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2.5">Missing Skills</span>
                  {selectedCandidate.missing_skills.length === 0 ? (
                    <span className="text-xs text-slate-500 font-medium">None identified</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedCandidate.missing_skills.map((skill, i) => (
                        <span key={i} className="text-[10px] font-semibold bg-red-950/40 border border-red-900/40 text-red-400 px-2 py-0.5 rounded">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Assign Interviewers Section */}
              <div className="border-t border-slate-800 pt-6">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Assign Interviewers</h4>
                {teamMembers.length === 0 ? (
                  <p className="text-xs text-slate-500">No team members available.</p>
                ) : (
                  <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                    {teamMembers.map((member) => {
                      const isAssigned = selectedCandidate.assigned_interviewer_ids?.includes(member.id) || false;
                      return (
                        <label
                          key={member.id}
                          className="flex items-center space-x-3 text-xs text-slate-300 hover:text-white cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={isAssigned}
                            disabled={assigningInterviewerId === member.id}
                            onChange={async () => {
                              setAssigningInterviewerId(member.id);
                              try {
                                let newIds = [...(selectedCandidate.assigned_interviewer_ids || [])];
                                if (isAssigned) {
                                  newIds = newIds.filter((id) => id !== member.id);
                                } else {
                                  newIds.push(member.id);
                                }

                                const res = await fetch(`/api/candidates/${selectedCandidate.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ assigned_interviewer_ids: newIds }),
                                });
                                const updatedCandidate = await res.json();
                                if (!res.ok) throw new Error(updatedCandidate.error || 'Failed to update interviewers');

                                // Update state
                                setCandidates((prev) =>
                                  prev.map((c) =>
                                    c.id === selectedCandidate.id
                                      ? { ...c, assigned_interviewer_ids: newIds }
                                      : c
                                  )
                                );
                                setSelectedCandidate((prev) =>
                                  prev ? { ...prev, assigned_interviewer_ids: newIds } : null
                                );
                                toastSuccess(isAssigned ? 'Interviewer unassigned' : 'Interviewer assigned');
                              } catch (err: any) {
                                toastError(err.message || 'Failed to update assignment');
                              } finally {
                                setAssigningInterviewerId(null);
                              }
                            }}
                            className="rounded border-slate-800 bg-slate-950 text-violet-600 focus:ring-violet-500 focus:ring-offset-slate-950"
                          />
                          <div className="flex flex-col">
                            <span className="font-semibold">{member.name || member.email}</span>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                              {member.role} {member.calendar_connected && '• Calendar Connected'}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Status Update Actions */}
              <div className="border-t border-slate-800 pt-6">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Change Pipeline Status</h4>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    onClick={() => updateCandidateStatus(selectedCandidate.id, 'shortlisted')}
                    className={`px-4 py-2 border rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                      selectedCandidate.status === 'shortlisted'
                        ? 'bg-emerald-600 border-transparent text-white'
                        : 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    Shortlist
                  </button>
                  <button
                    onClick={() => updateCandidateStatus(selectedCandidate.id, 'interview_scheduled')}
                    className={`px-4 py-2 border rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                      selectedCandidate.status === 'interview_scheduled'
                        ? 'bg-blue-600 border-transparent text-white'
                        : 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    Schedule Interview
                  </button>
                  <button
                    onClick={() => updateCandidateStatus(selectedCandidate.id, 'rejected')}
                    className={`px-4 py-2 border rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                      selectedCandidate.status === 'rejected'
                        ? 'bg-red-600 border-transparent text-white'
                        : 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Actions footer */}
            <div className="shrink-0 border-t border-slate-800 pt-5 flex flex-col gap-3">
              <div className="flex gap-3">
                <button
                  onClick={(e) => handleOpenOverride(selectedCandidate, e)}
                  className="px-5 py-2.5 rounded-xl border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-all cursor-pointer"
                >
                  Override AI Grade
                </button>
                {selectedCandidate.resume_file_url && (
                  <a
                    href={selectedCandidate.resume_file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 transition-all border border-slate-700 hover:scale-[1.01]"
                  >
                    View Original PDF
                  </a>
                )}
              </div>
              <button
                onClick={() => handleCopyInviteLink(selectedCandidate.id)}
                disabled={copyingInvite}
                className="w-full text-center px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition-all cursor-pointer disabled:opacity-50"
              >
                {copiedInviteId === selectedCandidate.id
                  ? 'Copied Invite Link!'
                  : copyingInvite
                    ? 'Generating signed link...'
                    : 'Copy Candidate Interview Booking Link'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT JOB MODAL */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl relative">
            <h3 className="text-lg font-bold text-white">Edit Job</h3>
            <p className="text-xs text-slate-500 mt-1">Update title, skills, and description.</p>
            <form onSubmit={handleSaveJob} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Title</label>
                <input
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Required skills (comma-separated)</label>
                <input
                  value={editSkills}
                  onChange={(e) => setEditSkills(e.target.value)}
                  className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Description</label>
                <textarea
                  rows={6}
                  required
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500 resize-none"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2.5 border border-slate-800 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingJob}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 cursor-pointer disabled:opacity-50"
                >
                  {savingJob ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OVERRIDE SCORE MODAL */}
      {isOverrideModalOpen && overrideCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl relative">
            <h3 className="text-lg font-bold text-white">Manual Score Override</h3>
            <p className="text-xs text-slate-500 mt-1">Adjust {overrideCandidate.name}'s score and explain the adjustments.</p>

            <form onSubmit={handleSaveOverride} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Manual Match Score (0 - 100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  required
                  value={overrideScore}
                  onChange={(e) => setOverrideScore(e.target.value)}
                  className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Recruiter Evaluation & Reason</label>
                <textarea
                  rows={4}
                  required
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Explain why you adjusted the AI score..."
                  className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500 transition-all resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsOverrideModalOpen(false)}
                  className="px-4 py-2.5 border border-slate-800 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={overriding}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 outline-none transition-all cursor-pointer disabled:opacity-50"
                >
                  {overriding ? 'Updating...' : 'Save Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

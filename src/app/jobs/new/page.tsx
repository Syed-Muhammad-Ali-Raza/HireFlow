'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';

export default function NewJobPage() {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [skillsInput, setSkillsInput] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!title.trim() || !description.trim()) {
      setError('Job Title and Job Description are required.');
      setLoading(false);
      return;
    }

    try {
      // Split skills by comma, clean whitespace, remove empty values
      const required_skills = skillsInput
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          required_skills,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create job posting');
      }

      router.push(`/jobs/${data.id}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'An error occurred while creating the job.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />

      {/* Navigation */}
      <nav className="relative z-10 border-b border-slate-900 bg-slate-950/60 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center">
                <span className="font-display font-bold text-white text-base">H</span>
              </div>
              <span className="font-display font-bold text-lg text-white">HireFlow</span>
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

      {/* Form Container */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10 relative z-10">
        <div className="pb-6 border-b border-slate-900">
          <h1 className="text-3xl font-display font-extrabold text-white tracking-tight">Create Job Posting</h1>
          <p className="text-sm text-slate-400 mt-1">Specify requirements. Candidates will be ranked based on this text.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-5 bg-slate-900/40 backdrop-blur-xl border border-slate-900 p-6 sm:p-8 rounded-2xl shadow-xl">
            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Job Title
              </label>
              <input
                id="title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Senior Full Stack Engineer"
                className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
              />
            </div>

            {/* Required Skills */}
            <div>
              <label htmlFor="skills" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Required Skills (Comma separated)
              </label>
              <input
                id="skills"
                type="text"
                value={skillsInput}
                onChange={(e) => setSkillsInput(e.target.value)}
                placeholder="React, TypeScript, Node.js, Postgres, AWS"
                className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Separating tags with commas helps extract core competencies for comparisons.
              </p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Job Description
              </label>
              <textarea
                id="description"
                rows={10}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Paste the full job description details here, including responsibilities, requirements, benefits, etc."
                className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all resize-y"
              />
            </div>

            {error && (
              <div className="rounded-xl bg-red-950/50 border border-red-800/80 p-4">
                <p className="text-sm text-red-400 font-medium">{error}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-4">
            <Link
              href="/"
              className="px-5 py-3 border border-slate-800 rounded-xl text-sm font-semibold text-slate-400 hover:bg-slate-900 hover:text-white transition-all cursor-pointer"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-6 py-3 border border-transparent rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition-all cursor-pointer shadow-lg shadow-violet-600/20 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Publishing...
                </>
              ) : 'Publish Job Posting'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

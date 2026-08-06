'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/components/ToastProvider';

interface MemberProfile {
  id: string;
  name: string | null;
  email: string;
  role: 'admin' | 'recruiter' | 'interviewer';
  calendar_connected: boolean;
  created_at: string;
}

interface PendingInvite {
  id: string;
  email: string;
  role: 'admin' | 'recruiter' | 'interviewer';
  token: string;
  created_at: string;
  expires_at: string;
  invited_by_profile?: {
    name: string | null;
    email: string;
  };
}

export default function TeamSettingsPage() {
  const supabase = createClient();
  const { success: toastSuccess, error: toastError } = useToast();

  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentProfile, setCurrentProfile] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);

  // Lists
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [auditLogs, setAuditLogs] = useState<
    {
      id: string;
      action: string;
      details: Record<string, unknown>;
      created_at: string;
      profiles?: { name: string | null; email: string } | null;
    }[]
  >([]);

  // Invite Form State
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'recruiter' | 'interviewer'>('recruiter');
  const [submittingInvite, setSubmittingInvite] = useState(false);

  // Invite Success Modal State
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Mutation Loading States
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  const fetchMembers = async () => {
    try {
      const res = await fetch('/api/team/members');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch team members');
      setMembers(data);
    } catch (err: any) {
      console.error('Error fetching members:', err);
      toastError(err.message || 'Failed to load team members.');
    }
  };

  const fetchInvites = async () => {
    try {
      const res = await fetch('/api/team/invites');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch invitations');
      setInvites(data);
    } catch (err: any) {
      console.error('Error fetching invites:', err);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/team/audit-logs');
      const data = await res.json();
      if (!res.ok) return;
      setAuditLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    }
  };

  useEffect(() => {
    async function loadInitialData() {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        setCurrentUser(session.user);

        // Fetch own profile
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('*, companies(*)')
          .eq('id', session.user.id)
          .single();

        if (profileErr) throw profileErr;
        setCurrentProfile(profile);
        setCompany(profile.companies);

        if (profile.company_id) {
          await Promise.all([
            fetchMembers(),
            profile.role === 'admin' ? fetchInvites() : Promise.resolve(),
            profile.role === 'admin' ? fetchAuditLogs() : Promise.resolve(),
          ]);
        }
      } catch (err: any) {
        console.error('Failed to load initial data:', err);
        toastError(err.message || 'Failed to load team data.');
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, [supabase]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setSubmittingInvite(true);
    try {
      const res = await fetch('/api/team/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to send invite');

      toastSuccess(`Invitation generated for ${inviteEmail}`);
      setGeneratedInviteUrl(data.inviteUrl);
      setInviteEmail('');
      setInviteRole('recruiter');
      await fetchInvites();
    } catch (err: any) {
      toastError(err.message || 'Failed to invite team member.');
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleCopyInviteUrl = async () => {
    if (!generatedInviteUrl) return;
    try {
      await navigator.clipboard.writeText(generatedInviteUrl);
      setCopiedInvite(true);
      toastSuccess('Invitation link copied to clipboard!');
      setTimeout(() => setCopiedInvite(false), 2000);
    } catch (err) {
      toastError('Failed to copy invitation link.');
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'recruiter' | 'interviewer') => {
    setActionUserId(userId);
    try {
      const res = await fetch(`/api/team/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to update role');

      toastSuccess('Team member role updated successfully.');
      setMembers((prev) =>
        prev.map((m) => (m.id === userId ? { ...m, role: newRole } : m))
      );
    } catch (err: any) {
      toastError(err.message || 'Failed to update member role.');
    } finally {
      setActionUserId(null);
    }
  };

  const handleRemoveMember = async (userId: string, userEmail: string) => {
    if (!window.confirm(`Are you sure you want to remove ${userEmail} from the company?`)) {
      return;
    }

    setActionUserId(userId);
    try {
      const res = await fetch(`/api/team/members/${userId}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to remove member');

      toastSuccess(`${userEmail} removed from company.`);
      setMembers((prev) => prev.filter((m) => m.id !== userId));
    } catch (err: any) {
      toastError(err.message || 'Failed to remove member.');
    } finally {
      setActionUserId(null);
    }
  };

  const handleResendInvite = async (inviteId: string) => {
    try {
      const res = await fetch(`/api/team/invites/${inviteId}/resend`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend invite');
      setGeneratedInviteUrl(data.inviteUrl);
      toastSuccess('Invite refreshed. Copy the new link.');
      await fetchInvites();
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to resend invite.');
    }
  };

  const handleRevokeInvite = async (inviteId: string, inviteEmail: string) => {
    if (!window.confirm(`Are you sure you want to revoke the invitation for ${inviteEmail}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/team/invites/${inviteId}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to revoke invite');

      toastSuccess(`Invitation for ${inviteEmail} revoked.`);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (err: any) {
      toastError(err.message || 'Failed to revoke invite.');
    }
  };

  const isAdmin = currentProfile?.role === 'admin';

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
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />

      {/* Navbar */}
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

      {/* Main Layout */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10 relative z-10">
        <div className="pb-6 border-b border-slate-900 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-extrabold text-white tracking-tight">Team Management</h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage your hiring team and role permissions for <strong className="text-slate-200">{company?.name || 'your company'}</strong>.
            </p>
          </div>
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-500 font-semibold uppercase tracking-wider">Your Role:</span>
            <span className="px-2.5 py-1 rounded bg-violet-950/40 border border-violet-900/40 text-violet-400 font-bold uppercase tracking-wider text-[10px]">
              {currentProfile?.role}
            </span>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Members List */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-900 rounded-2xl shadow-xl overflow-hidden">
              <div className="p-6 border-b border-slate-900">
                <h2 className="text-lg font-bold text-white">Active Members</h2>
                <p className="text-xs text-slate-400 mt-0.5">Teammates who currently have access to this portal.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900 text-slate-500 text-[10px] uppercase font-bold tracking-widest bg-slate-900/10">
                      <th className="px-6 py-3.5">Name</th>
                      <th className="px-6 py-3.5">Role</th>
                      <th className="px-6 py-3.5">Calendar Status</th>
                      {isAdmin && <th className="px-6 py-3.5 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900 text-sm">
                    {members.map((member) => (
                      <tr key={member.id} className="hover:bg-slate-900/10 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-white">{member.name || 'Invited User'}</span>
                            <span className="text-xs text-slate-500 mt-0.5">{member.email}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {isAdmin && member.id !== currentUser?.id ? (
                            <select
                              value={member.role}
                              disabled={actionUserId === member.id}
                              onChange={(e) => handleRoleChange(member.id, e.target.value as any)}
                              className="rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-violet-500 transition-all"
                            >
                              <option value="admin">Admin</option>
                              <option value="recruiter">Recruiter</option>
                              <option value="interviewer">Interviewer</option>
                            </select>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-850 text-slate-400 font-semibold capitalize text-xs">
                              {member.role}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${member.calendar_connected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                            <span className={`text-xs ${member.calendar_connected ? 'text-emerald-400 font-medium' : 'text-slate-500'}`}>
                              {member.calendar_connected ? 'Connected' : 'Not Connected'}
                            </span>
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="px-6 py-4 text-right">
                            {member.id !== currentUser?.id && (
                              <button
                                disabled={actionUserId === member.id}
                                onClick={() => handleRemoveMember(member.id, member.email)}
                                className="px-3 py-1.5 rounded-xl border border-red-950/20 text-xs font-semibold text-red-400 bg-red-950/5 hover:bg-red-950/20 transition-all cursor-pointer disabled:opacity-50"
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pending Invites List */}
            {isAdmin && (
              <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-900 rounded-2xl shadow-xl overflow-hidden">
                <div className="p-6 border-b border-slate-900">
                  <h2 className="text-lg font-bold text-white">Pending Invitations</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Invited users who haven't accepted their invite yet.</p>
                </div>

                {invites.length === 0 ? (
                  <div className="p-10 text-center text-slate-500 text-sm">
                    No pending invitations.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-900 text-slate-500 text-[10px] uppercase font-bold tracking-widest bg-slate-900/10">
                          <th className="px-6 py-3.5">Email</th>
                          <th className="px-6 py-3.5">Assigned Role</th>
                          <th className="px-6 py-3.5">Expires</th>
                          <th className="px-6 py-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900 text-sm">
                        {invites.map((invite) => (
                          <tr key={invite.id} className="hover:bg-slate-900/10 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-white">{invite.email}</span>
                                <span className="text-xs text-slate-500 mt-0.5">Invited by: {invite.invited_by_profile?.email || 'Admin'}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="px-2.5 py-1 rounded bg-slate-950 border border-slate-850 text-slate-400 font-semibold capitalize text-xs">
                                {invite.role}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500">
                              {new Date(invite.expires_at).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 text-right space-x-2">
                              <button
                                onClick={() => {
                                  const origin = window.location.origin;
                                  setGeneratedInviteUrl(`${origin}/invite/${invite.token}`);
                                }}
                                className="px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-semibold text-slate-400 hover:bg-slate-900 hover:text-white transition-all cursor-pointer"
                              >
                                Show Link
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResendInvite(invite.id)}
                                className="px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-semibold text-slate-400 hover:bg-slate-900 hover:text-white transition-all cursor-pointer"
                              >
                                Resend
                              </button>
                              <button
                                onClick={() => handleRevokeInvite(invite.id, invite.email)}
                                className="px-3 py-1.5 rounded-xl border border-red-950/20 text-xs font-semibold text-red-400 bg-red-950/5 hover:bg-red-950/20 transition-all cursor-pointer"
                              >
                                Revoke
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar Invite Panel */}
          <div>
            {isAdmin ? (
              <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-900 p-6 rounded-2xl shadow-xl">
                <h3 className="text-lg font-bold text-white">Invite Team Member</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Generate an invitation link to invite users to collaborate. Invited members will join with the role and email specified.
                </p>

                <form onSubmit={handleSendInvite} className="mt-5 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Email Address</label>
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@company.com"
                      className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Hiring Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as any)}
                      className="mt-2 block w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500 transition-all"
                    >
                      <option value="recruiter">Recruiter (Post jobs, view board, shortlist)</option>
                      <option value="interviewer">Interviewer (Sync calendar, complete evaluations)</option>
                      <option value="admin">Admin (All rights, invite/revoke, settings)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={submittingInvite}
                    className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-violet-500 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {submittingInvite ? 'Generating...' : 'Generate Invite Link'}
                  </button>
                </form>
              </div>
            ) : (
              <div className="bg-slate-900/20 backdrop-blur-xl border border-slate-900/80 p-6 rounded-2xl shadow-inner text-center">
                <svg className="w-8 h-8 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <h3 className="text-sm font-bold text-slate-400">Invite Panel Locked</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Only Admins can invite team members, adjust roles, or remove accounts. Contact your organization's admin for permission updates.
                </p>
              </div>
            )}
          </div>
        </div>

        {isAdmin && auditLogs.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Recent activity</h2>
            <div className="bg-slate-900/30 border border-slate-900 rounded-2xl divide-y divide-slate-900">
              {auditLogs.slice(0, 20).map((log) => (
                <div key={log.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <div>
                    <p className="text-xs font-semibold text-slate-200">{log.action.replace(/_/g, ' ')}</p>
                    <p className="text-[11px] text-slate-500">
                      {log.profiles?.email || 'System'}
                      {log.details && Object.keys(log.details).length > 0
                        ? ` · ${JSON.stringify(log.details).slice(0, 120)}`
                        : ''}
                    </p>
                  </div>
                  <span className="text-[11px] text-slate-600 shrink-0">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* INVITE SUCCESS MODAL */}
      {generatedInviteUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 p-6 sm:p-8 rounded-2xl shadow-2xl relative">
            <h3 className="text-xl font-bold text-white flex items-center">
              <span className="h-2 w-2 rounded-full bg-emerald-400 mr-2 animate-ping" />
              Invitation Link Generated!
            </h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Copy and share the invitation link below with your teammate. This secure link expires in 7 days, and allows them to sign up and automatically join your hiring dashboard.
            </p>

            <div className="mt-5 p-3 rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-between gap-3 overflow-hidden">
              <span className="text-xs text-slate-300 truncate select-all">{generatedInviteUrl}</span>
              <button
                onClick={handleCopyInviteUrl}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs font-semibold text-white transition-all cursor-pointer"
              >
                {copiedInvite ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="flex justify-end pt-5 mt-3 border-t border-slate-800/80">
              <button
                onClick={() => setGeneratedInviteUrl(null)}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-slate-850 hover:bg-slate-800 border border-slate-800 transition-all cursor-pointer"
              >
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

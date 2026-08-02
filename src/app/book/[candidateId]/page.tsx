'use client';

import React, { use, useState, useEffect } from 'react';

interface BookPageProps {
  params: Promise<{
    candidateId: string;
  }>;
}

export default function BookingPage({ params }: BookPageProps) {
  const { candidateId } = use(params);

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [data, setData] = useState<any>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [timezone, setTimezone] = useState('UTC');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [confirmedInterview, setConfirmedInterview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Available Timezones
  const timezones = [
    { name: 'Eastern Time (US & Canada)', value: 'America/New_York' },
    { name: 'Pacific Time (US & Canada)', value: 'America/Los_Angeles' },
    { name: 'London (GMT/BST)', value: 'Europe/London' },
    { name: 'Tokyo (JST)', value: 'Asia/Tokyo' },
    { name: 'Sydney (AEDT/AEST)', value: 'Australia/Sydney' },
    { name: 'Coordinated Universal Time (UTC)', value: 'UTC' },
  ];

  useEffect(() => {
    // Detect candidate local timezone on mount
    try {
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (localTz) {
        setTimezone(localTz);
      }
    } catch (err) {
      console.warn('Failed to detect browser timezone, fallback to UTC');
    }
  }, []);

  // Fetch candidate metadata and interviewer slots
  useEffect(() => {
    async function loadDetails() {
      setLoading(true);
      setError(null);
      try {
        // 1. Fetch metadata
        const metaRes = await fetch(`/api/book/${candidateId}`);
        const metaData = await metaRes.json();
        if (!metaRes.ok) throw new Error(metaData.error || 'Failed to load details');

        setData(metaData);

        if (!metaData.interviewers || metaData.interviewers.length === 0) {
          throw new Error('No available interviewers have calendar integrations linked yet.');
        }

        // 2. Fetch Availability slots
        const availRes = await fetch('/api/interviews/availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidate_id: candidateId,
            interviewer_ids: metaData.interviewers.map((i: any) => i.id),
            timezone,
          }),
        });

        const availData = await availRes.json();
        if (!availRes.ok) throw new Error(availData.error || 'Failed to load slots');

        setSlots(availData.availableSlots || []);
      } catch (err: any) {
        setError(err.message || 'An error occurred loading the schedule.');
      } finally {
        setLoading(false);
      }
    }

    loadDetails();
  }, [candidateId, timezone]);

  const handleBookSlot = async () => {
    if (!selectedSlot || !data) return;
    setBooking(true);
    setError(null);

    try {
      const res = await fetch('/api/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: candidateId,
          scheduled_time: selectedSlot,
          interviewer_ids: data.interviewers.map((i: any) => i.id),
        }),
      });

      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData.error || 'Failed to book slot');

      setConfirmedInterview(responseData);
      setSelectedSlot(null);
    } catch (err: any) {
      setError(err.message || 'Failed to schedule interview.');
    } finally {
      setBooking(false);
    }
  };

  // Group slots by Date
  const groupedSlots = slots.reduce((acc: any, slot: string) => {
    const dateObj = new Date(slot);
    // Format date string as header: e.g. "Monday, August 3"
    const dateHeader = dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: timezone,
    });

    if (!acc[dateHeader]) {
      acc[dateHeader] = [];
    }
    acc[dateHeader].push(slot);
    return acc;
  }, {});

  // Format slot time for buttons: e.g., "10:30 AM"
  const formatSlotTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
    });
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-slate-950">
        <div className="text-center space-y-4">
          <svg className="animate-spin h-8 w-8 text-violet-500 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-slate-400 text-xs font-medium">Checking calendar availability...</p>
        </div>
      </div>
    );
  }

  // Success Confirmation Screen
  if (confirmedInterview) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />
        
        <div className="max-w-md w-full bg-slate-900/40 backdrop-blur-xl border border-slate-900 rounded-3xl p-8 shadow-2xl text-center space-y-6">
          <div className="h-16 w-16 bg-emerald-950/60 border border-emerald-950 rounded-full flex items-center justify-center mx-auto text-emerald-400 shadow-lg">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-display font-extrabold text-white">Interview Scheduled!</h1>
            <p className="text-xs text-slate-400">
              An invitation has been sent to your email with the calendar details.
            </p>
          </div>

          <div className="bg-slate-950/60 rounded-2xl p-5 text-left border border-slate-900 space-y-3.5">
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Company</span>
              <p className="text-sm font-semibold text-white">{data?.company?.name}</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Job Role</span>
              <p className="text-sm font-semibold text-white">{data?.job?.title}</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Date & Time</span>
              <p className="text-sm font-semibold text-violet-400">
                {new Date(confirmedInterview.scheduled_time).toLocaleString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                  timeZone: timezone,
                })}
              </p>
              <span className="text-[10px] text-slate-500">Timezone: {timezone}</span>
            </div>
            {confirmedInterview.meeting_link && (
              <div className="pt-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Video Meeting Link</span>
                <a
                  href={confirmedInterview.meeting_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs font-semibold text-cyan-400 hover:underline truncate mt-1"
                >
                  {confirmedInterview.meeting_link}
                </a>
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-500">You may close this tab now.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden flex flex-col">
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />

      {/* Main Grid Layout */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-6xl mx-auto w-full p-6 sm:p-10 gap-10">
        
        {/* Left pane: Interview metadata */}
        <div className="lg:w-1/3 flex flex-col justify-between py-6">
          <div className="space-y-6">
            <div className="inline-flex items-center space-x-2">
              <span className="h-6 w-6 rounded-lg bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center font-display font-bold text-white text-xs">H</span>
              <span className="font-display font-bold text-sm text-white tracking-wide">HireFlow</span>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] bg-violet-950/60 border border-violet-900/60 text-violet-400 font-bold tracking-widest uppercase px-2.5 py-1 rounded-full">Booking portal</span>
              <h1 className="text-3xl font-display font-extrabold text-white tracking-tight pt-1">
                Schedule Your Interview
              </h1>
              <p className="text-sm text-slate-400">
                Hi {data?.candidate?.name || 'there'}, pick a convenient time to meet with the hiring team at <strong>{data?.company?.name}</strong>.
              </p>
            </div>

            <div className="space-y-3.5 bg-slate-900/30 border border-slate-900 rounded-2xl p-5">
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Role description</span>
                <p className="text-xs font-semibold text-slate-300 mt-0.5">{data?.job?.title}</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Duration</span>
                <p className="text-xs font-semibold text-slate-300 mt-0.5">45 Minutes</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Interviewers</span>
                <p className="text-xs font-semibold text-slate-300 mt-0.5">
                  {data?.interviewers?.map((i: any) => i.name).join(', ')}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 lg:mt-0">
            {/* Timezone picker */}
            <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">
              Select Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-violet-500 transition-colors"
            >
              {timezones.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.name}
                </option>
              ))}
              {/* If browser timezone is not in common list, render it */}
              {!timezones.some((tz) => tz.value === timezone) && (
                <option value={timezone}>{timezone}</option>
              )}
            </select>
          </div>
        </div>

        {/* Right pane: Slot list calendar */}
        <div className="flex-1 bg-slate-900/40 backdrop-blur-xl border border-slate-900 rounded-3xl p-6 sm:p-8 flex flex-col justify-between min-h-[500px]">
          {error && (
            <div className="rounded-xl bg-red-950/40 border border-red-900/40 p-4 text-xs font-medium text-red-400 mb-6">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <svg className="animate-spin h-6 w-6 text-violet-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : slots.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-2">
              <svg className="w-10 h-10 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h3 className="text-sm font-semibold text-slate-300">No slots available</h3>
              <p className="text-xs text-slate-500 max-w-xs">
                We couldn't find any available overlapping times for the interviewers. Please try changing your timezone or contact the recruiter.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto max-h-[600px] pr-2 space-y-6">
              {Object.keys(groupedSlots).map((dayHeader) => (
                <div key={dayHeader} className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 border-b border-slate-900 pb-2">{dayHeader}</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {groupedSlots[dayHeader].map((slot: string) => (
                      <button
                        key={slot}
                        onClick={() => setSelectedSlot(slot)}
                        className={`text-xs font-medium py-2.5 px-4 rounded-xl border transition-all text-center cursor-pointer ${
                          selectedSlot === slot
                            ? 'bg-violet-600 border-violet-600 text-white shadow-lg shadow-violet-600/20'
                            : 'bg-slate-950/40 border-slate-900 hover:border-slate-800 text-slate-300'
                        }`}
                      >
                        {formatSlotTime(slot)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer scheduling trigger */}
          {selectedSlot && (
            <div className="mt-6 pt-6 border-t border-slate-900 flex justify-between items-center bg-slate-950/40 -mx-6 -mb-6 p-6 rounded-b-3xl">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Selected Slot</span>
                <p className="text-xs font-semibold text-violet-400">
                  {new Date(selectedSlot).toLocaleString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: timezone,
                  })}
                </p>
              </div>

              <button
                onClick={handleBookSlot}
                disabled={booking}
                className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-xs font-semibold text-white rounded-xl shadow-lg shadow-violet-600/10 cursor-pointer disabled:opacity-50 flex items-center space-x-2"
              >
                {booking ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Booking...</span>
                  </>
                ) : (
                  <span>Confirm Booking</span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { decryptToken, refreshGoogleAccessToken, getGoogleFreeBusy, refreshOutlookAccessToken, getOutlookFreeBusy } from '@/lib/calendar';
import { assertBookingAccess } from '@/lib/booking';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

interface CalendarProfile {
  id: string;
  email: string;
  calendar_connected: boolean;
  calendar_provider: string | null;
  calendar_refresh_token: string | null;
}

async function getFreeBusyForProfile(
  profile: CalendarProfile,
  timeMin: string,
  timeMax: string
): Promise<{ start: string; end: string }[]> {
  const decryptedToken = decryptToken(profile.calendar_refresh_token!);

  if (profile.calendar_provider === 'outlook') {
    const accessToken = await refreshOutlookAccessToken(decryptedToken);
    return getOutlookFreeBusy(accessToken, profile.email, timeMin, timeMax);
  }

  const accessToken = await refreshGoogleAccessToken(decryptedToken);
  return getGoogleFreeBusy(accessToken, profile.email, timeMin, timeMax);
}

export async function POST(request: Request) {
  try {
    const limited = checkRateLimit(`availability:${clientIp(request)}`, 40);
    if (!limited.ok) {
      return NextResponse.json(
        { error: 'Too many requests. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } }
      );
    }

    const body = await request.json();
    const {
      candidate_id,
      interviewer_ids,
      timezone = 'UTC',
      durationMinutes = 45,
      token,
    } = body;

    if (!candidate_id || !interviewer_ids || !Array.isArray(interviewer_ids) || interviewer_ids.length === 0) {
      return NextResponse.json({ error: 'candidate_id and interviewer_ids are required' }, { status: 400 });
    }

    const tokenError = assertBookingAccess(candidate_id, token);
    if (tokenError) {
      return NextResponse.json({ error: tokenError }, { status: 403 });
    }

    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, calendar_connected, calendar_provider, calendar_refresh_token')
      .in('id', interviewer_ids);

    if (profilesError || !profiles || profiles.length === 0) {
      return NextResponse.json({ error: 'Could not fetch interviewer calendar details' }, { status: 400 });
    }

    const connectedProfiles = profiles.filter(p => p.calendar_connected && p.calendar_refresh_token);
    if (connectedProfiles.length === 0) {
      return NextResponse.json({ error: 'No interviewers have connected calendars' }, { status: 400 });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(9, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 5);
    endDate.setHours(17, 0, 0, 0);

    const timeMin = startDate.toISOString();
    const timeMax = endDate.toISOString();

    const busyIntervalsList: { start: string; end: string }[][] = [];

    for (const profile of connectedProfiles) {
      try {
        const busy = await getFreeBusyForProfile(profile, timeMin, timeMax);
        busyIntervalsList.push(busy);
      } catch (tokenErr) {
        console.error(`Failed to fetch calendar data for interviewer ${profile.email}:`, tokenErr);
        return NextResponse.json({ error: `Interviewer ${profile.email} calendar could not be queried` }, { status: 502 });
      }
    }

    const possibleSlots: Date[] = [];
    let currentSlot = new Date(startDate);

    while (currentSlot < endDate) {
      if (isBusinessHours(currentSlot, timezone)) {
        possibleSlots.push(new Date(currentSlot));
      }
      currentSlot.setMinutes(currentSlot.getMinutes() + 30);
    }

    const availableSlots: string[] = [];

    for (const slotStart of possibleSlots) {
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + durationMinutes);

      let isOverlap = false;

      for (const busyList of busyIntervalsList) {
        for (const busy of busyList) {
          const busyStart = new Date(busy.start);
          const busyEnd = new Date(busy.end);

          if (slotStart < busyEnd && slotEnd > busyStart) {
            isOverlap = true;
            break;
          }
        }
        if (isOverlap) break;
      }

      if (!isOverlap) {
        availableSlots.push(slotStart.toISOString());
      }
    }

    return NextResponse.json({ availableSlots });
  } catch (error: any) {
    console.error('Availability API error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

function getHourInTimezone(date: Date, tz: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  });
  return Number(formatter.format(date));
}

function isBusinessHours(date: Date, tz: string): boolean {
  try {
    const formatterDay = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
    const day = formatterDay.format(date);

    if (day === 'Sat' || day === 'Sun') return false;

    const hour = getHourInTimezone(date, tz);
    return hour >= 9 && hour < 17;
  } catch (err) {
    const hour = date.getUTCHours();
    const day = date.getUTCDay();
    if (day === 0 || day === 6) return false;
    return hour >= 9 && hour < 17;
  }
}
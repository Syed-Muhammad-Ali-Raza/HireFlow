import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { decryptToken, refreshGoogleAccessToken, createGoogleEvent } from '@/lib/calendar';
import { assertBookingAccess } from '@/lib/booking';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit';

// GET: Fetch all interviews for current user's company
export async function GET() {
  try {
    const supabase = await createClient();

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch interviews (RLS policy will verify automatically)
    const { data: interviews, error: fetchError } = await supabase
      .from('interviews')
      .select(`
        *,
        candidates (
          name,
          email,
          job_id,
          job_postings (
            title
          )
        )
      `)
      .order('scheduled_time', { ascending: true });

    if (fetchError) {
      console.error('Fetch interviews error:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    return NextResponse.json(interviews);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a booked interview event (adds to Google Calendar)
export async function POST(request: Request) {
  try {
    const limited = checkRateLimit(`book-post:${clientIp(request)}`, 15);
    if (!limited.ok) {
      return NextResponse.json(
        { error: 'Too many requests. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } }
      );
    }

    const body = await request.json();
    const {
      candidate_id,
      scheduled_time,
      interviewer_ids,
      durationMinutes = 45,
      token,
    } = body;

    if (!candidate_id || !scheduled_time || !interviewer_ids || !Array.isArray(interviewer_ids) || interviewer_ids.length === 0) {
      return NextResponse.json({ error: 'candidate_id, scheduled_time, and interviewer_ids are required' }, { status: 400 });
    }

    const tokenError = assertBookingAccess(candidate_id, token);
    if (tokenError) {
      return NextResponse.json({ error: tokenError }, { status: 403 });
    }

    // 1. Initialize Supabase Admin for system cross-joins & auth updates
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Fetch Candidate details
    const { data: candidate, error: candidateError } = await supabaseAdmin
      .from('candidates')
      .select('name, email, job_id')
      .eq('id', candidate_id)
      .single();

    if (candidateError || !candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // 3. Fetch Job title & company_id
    const { data: job } = await supabaseAdmin
      .from('job_postings')
      .select('title, company_id')
      .eq('id', candidate.job_id)
      .single();

    const jobTitle = job?.title || 'Role';

    // 4. Fetch Interviewers profile details (emails, refresh tokens)
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, name, calendar_connected, calendar_refresh_token')
      .in('id', interviewer_ids);

    if (profilesError || !profiles || profiles.length === 0) {
      return NextResponse.json({ error: 'Failed to fetch interviewer data' }, { status: 400 });
    }

    // Identify primary interviewer to host the calendar event
    const hostProfile = profiles.find(p => p.calendar_connected && p.calendar_refresh_token);
    if (!hostProfile) {
      return NextResponse.json({ error: 'No interviewer has connected a Google Calendar profile' }, { status: 400 });
    }

    // Collect attendee emails (other interviewers + candidate)
    const attendeeEmails = profiles.map(p => p.email);
    if (candidate.email) {
      attendeeEmails.push(candidate.email);
    }

    // 5. Exchange host token and create Google Calendar event
    let eventData;
    try {
      const decryptedToken = decryptToken(hostProfile.calendar_refresh_token!);
      const accessToken = await refreshGoogleAccessToken(decryptedToken);

      const eventStart = new Date(scheduled_time);
      const eventEnd = new Date(eventStart);
      eventEnd.setMinutes(eventEnd.getMinutes() + durationMinutes);

      eventData = await createGoogleEvent(accessToken, {
        summary: `Interview: ${candidate.name} <> ${jobTitle}`,
        description: `Scheduled via HireFlow.\nPosition: ${jobTitle}\nCandidate: ${candidate.name}\nInterviewers: ${profiles.map(p => p.name || p.email).join(', ')}`,
        start: eventStart.toISOString(),
        end: eventEnd.toISOString(),
        attendeeEmails,
      });
    } catch (calError: any) {
      console.error('Calendar meeting creation error:', calError);
      return NextResponse.json({ error: `Google Calendar creation failed: ${calError.message}` }, { status: 502 });
    }

    // 6. Save interview details in Postgres database
    const { data: interview, error: interviewError } = await supabaseAdmin
      .from('interviews')
      .insert({
        candidate_id,
        scheduled_time,
        interviewer_ids,
        calendar_event_id: eventData.eventId,
        meeting_link: eventData.meetingLink,
        status: 'confirmed',
      })
      .select()
      .single();

    if (interviewError) {
      console.error('Failed to create DB interview record:', interviewError);
      return NextResponse.json({ error: interviewError.message }, { status: 500 });
    }

    // 7. Update candidate status to 'interview_scheduled'
    await supabaseAdmin
      .from('candidates')
      .update({ status: 'interview_scheduled' })
      .eq('id', candidate_id);

    // Write audit log entry for the interview booking
    if (job?.company_id) {
      await createAuditLog(
        job.company_id,
        null, // Public candidate booking, no logged-in recruiter/admin profile ID
        'candidate_status_changed',
        {
          candidate_id,
          candidate_name: candidate.name,
          status: 'interview_scheduled',
          trigger: 'public_booking',
        }
      );
    }

    return NextResponse.json(interview, { status: 201 });
  } catch (error: any) {
    console.error('Interviews route error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

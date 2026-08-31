import crypto from 'crypto';

// Secret key used for local encryption of oauth refresh tokens
const ENCRYPTION_KEY = process.env.CALENDAR_ENCRYPTION_KEY || 'default_sec_key_32_characters_!!';
const IV_LENGTH = 16;

/**
 * Encrypts a string (e.g. refresh token) using AES-256-CBC
 */
export function encryptToken(text: string): string {
  try {
    // Pad/truncate key to exactly 32 bytes
    const key = Buffer.concat([Buffer.from(ENCRYPTION_KEY)], 32);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (error) {
    console.error('Encryption failed:', error);
    return text;
  }
}

/**
 * Decrypts an encrypted token
 */
export function decryptToken(encryptedText: string): string {
  try {
    const key = Buffer.concat([Buffer.from(ENCRYPTION_KEY)], 32);
    const parts = encryptedText.split(':');
    if (parts.length !== 2) return encryptedText; // Fallback to raw text if not encrypted

    const iv = Buffer.from(parts.shift()!, 'hex');
    const encrypted = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.warn('Decryption failed, using fallback raw text');
    return encryptedText;
  }
}

/**
 * Generates the redirect URL for Google OAuth Concent screen
 */
export function getGoogleOAuthUrl(stateUserId: string): string {
  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  const options = {
    redirect_uri: `${appUrl}/api/calendar/callback`,
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    access_type: 'offline',
    response_type: 'code',
    prompt: 'consent', // Forces Google to yield a refresh token every time
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly userinfo.email',
    state: stateUserId,
  };
  
  const qs = new URLSearchParams(options);
  return `${rootUrl}?${qs.toString()}`;
}

/**
 * Exchange Auth code for access_token and refresh_token
 */
export async function exchangeGoogleCode(code: string) {
  const url = 'https://oauth2.googleapis.com/token';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const values = {
    code,
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirect_uri: `${appUrl}/api/calendar/callback`,
    grant_type: 'authorization_code',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || 'Failed to exchange auth code.');
  }

  return data; // contains access_token, refresh_token, expires_in, scope
}

/**
 * Refreshes an expired access token using the refresh token
 */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const url = 'https://oauth2.googleapis.com/token';

  const values = {
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || 'Failed to refresh access token.');
  }

  return data.access_token;
}

/**
 * Queries Free/Busy availability intervals for an email calendar
 */
export async function getGoogleFreeBusy(
  accessToken: string,
  email: string,
  timeMin: string, // ISO string
  timeMax: string  // ISO string
): Promise<{ start: string; end: string }[]> {
  const url = 'https://www.googleapis.com/calendar/v3/freeBusy';
  
  const body = {
    timeMin,
    timeMax,
    items: [{ id: email }],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to fetch freebusy data.');
  }

  return data.calendars?.[email]?.busy || [];
}

/**
 * Creates a Calendar Event with Google Meet conference data
 */
export async function createGoogleEvent(
  accessToken: string,
  eventDetails: {
    summary: string;
    description: string;
    start: string; // ISO String
    end: string;   // ISO String
    attendeeEmails: string[];
  }
): Promise<{ eventId: string; meetingLink: string }> {
  // conferenceDataVersion=1 is required to enable generating Meet URLs
  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1';
  
  const body = {
    summary: eventDetails.summary,
    description: eventDetails.description,
    start: {
      dateTime: eventDetails.start,
    },
    end: {
      dateTime: eventDetails.end,
    },
    attendees: eventDetails.attendeeEmails.map(email => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: `meet-${Date.now()}`,
        conferenceSolutionKey: {
          type: 'hangoutsMeet',
        },
      },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to create calendar event.');
  }

  const meetingLink = data.conferenceData?.entryPoints?.find(
    (ep: any) => ep.entryPointType === 'video'
  )?.uri || '';

  return {
    eventId: data.id || '',
    meetingLink,
  };
}

// =============================================================================
// OUTLOOK / MICROSOFT GRAPH API
// =============================================================================

/**
 * Generates the redirect URL for Microsoft OAuth consent screen
 */
export function getOutlookOAuthUrl(stateUserId: string): string {
  const rootUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const options = {
    client_id: process.env.OUTLOOK_CLIENT_ID || '',
    redirect_uri: `${appUrl}/api/calendar/outlook/callback`,
    response_type: 'code',
    scope: 'Calendars.ReadWrite offline_access User.Read',
    state: stateUserId,
  };

  const qs = new URLSearchParams(options);
  return `${rootUrl}?${qs.toString()}`;
}

/**
 * Exchange Outlook auth code for tokens
 */
export async function exchangeOutlookCode(code: string) {
  const url = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const params = new URLSearchParams();
  params.set('code', code);
  params.set('client_id', process.env.OUTLOOK_CLIENT_ID || '');
  params.set('client_secret', process.env.OUTLOOK_CLIENT_SECRET || '');
  params.set('redirect_uri', `${appUrl}/api/calendar/outlook/callback`);
  params.set('grant_type', 'authorization_code');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Failed to exchange Outlook auth code.');
  }

  return data;
}

/**
 * Refresh an expired Outlook access token
 */
export async function refreshOutlookAccessToken(refreshToken: string): Promise<string> {
  const url = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

  const params = new URLSearchParams();
  params.set('client_id', process.env.OUTLOOK_CLIENT_ID || '');
  params.set('client_secret', process.env.OUTLOOK_CLIENT_SECRET || '');
  params.set('refresh_token', refreshToken);
  params.set('grant_type', 'refresh_token');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || 'Failed to refresh Outlook access token.');
  }

  return data.access_token;
}

/**
 * Queries Free/Busy availability for an Outlook calendar via Microsoft Graph
 */
export async function getOutlookFreeBusy(
  accessToken: string,
  email: string,
  timeMin: string,
  timeMax: string
): Promise<{ start: string; end: string }[]> {
  const url = 'https://graph.microsoft.com/v1.0/me/freeBusy';

  const body = {
    schedules: [email],
    startDateTime: timeMin,
    endDateTime: timeMax,
    scheduleViewOptions: { segmentsPerInterval: 6 },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to fetch Outlook freebusy data.');
  }

  const schedule = data.value?.[0]?.schedule;
  if (!schedule) return [];

  return schedule.map((entry: any) => ({
    start: entry.start.dateTime,
    end: entry.end.dateTime,
  }));
}

/**
 * Creates a Calendar Event with an Outlook Meet link via Microsoft Graph
 */
export async function createOutlookEvent(
  accessToken: string,
  eventDetails: {
    summary: string;
    description: string;
    start: string;
    end: string;
    attendeeEmails: string[];
  }
): Promise<{ eventId: string; meetingLink: string }> {
  const url = 'https://graph.microsoft.com/v1.0/me/events';

  const attendeeArray = eventDetails.attendeeEmails.map((email) => ({
    emailAddress: { address: email },
    type: 'required',
  }));

  const body = {
    subject: eventDetails.summary,
    body: {
      contentType: 'text',
      content: eventDetails.description,
    },
    start: {
      dateTime: eventDetails.start,
      timeZone: 'UTC',
    },
    end: {
      dateTime: eventDetails.end,
      timeZone: 'UTC',
    },
    attendees: attendeeArray,
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to create Outlook calendar event.');
  }

  const meetingLink = data.onlineMeeting?.joinUrl || '';

  return {
    eventId: data.id || '',
    meetingLink,
  };
}

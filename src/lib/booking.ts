import crypto from 'crypto';

const BOOKING_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret(): string {
  return (
    process.env.BOOKING_LINK_SECRET ||
    process.env.CALENDAR_ENCRYPTION_KEY ||
    'default_booking_secret_change_me!!'
  );
}

/**
 * Create an HMAC-signed, time-limited booking token for a candidate.
 * Format: base64url(payload).base64url(signature)
 * payload = { candidateId, exp }
 */
export function createBookingToken(candidateId: string, ttlMs: number = BOOKING_TTL_MS): string {
  const exp = Date.now() + ttlMs;
  const payload = Buffer.from(JSON.stringify({ candidateId, exp })).toString('base64url');
  const signature = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export interface BookingTokenPayload {
  candidateId: string;
  exp: number;
}

/**
 * Verify a booking token. Returns payload if valid, null otherwise.
 */
export function verifyBookingToken(token: string | null | undefined): BookingTokenPayload | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');

  try {
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as BookingTokenPayload;
    if (!data.candidateId || typeof data.exp !== 'number') return null;
    if (Date.now() > data.exp) return null;

    return data;
  } catch {
    return null;
  }
}

/**
 * Require a valid token for the given candidateId. Returns an error message or null if OK.
 */
export function assertBookingAccess(
  candidateId: string,
  token: string | null | undefined
): string | null {
  const payload = verifyBookingToken(token);
  if (!payload) {
    return 'Invalid or expired booking link. Ask the recruiter for a new invite.';
  }
  if (payload.candidateId !== candidateId) {
    return 'Booking link does not match this candidate.';
  }
  return null;
}

export function buildBookingUrl(origin: string, candidateId: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/book/${candidateId}?token=${encodeURIComponent(token)}`;
}

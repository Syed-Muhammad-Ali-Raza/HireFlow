/**
 * Extract likely email and name from raw resume text (regex / heuristics).
 * Used when the recruiter does not supply name/email on upload.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

const SKIP_NAME_LINES = /^(resume|curriculum|vitae|cv|objective|summary|profile|experience|education|skills|phone|email|address|linkedin|github|www\.|http)/i;

export interface ExtractedContact {
  name: string | null;
  email: string | null;
}

export function extractContactFromResume(resumeText: string): ExtractedContact {
  const emailMatch = resumeText.match(EMAIL_RE);
  const email = emailMatch ? emailMatch[0].toLowerCase() : null;

  const name = extractName(resumeText, email);

  return { name, email };
}

function extractName(resumeText: string, email: string | null): string | null {
  const lines = resumeText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 12)) {
    if (SKIP_NAME_LINES.test(line)) continue;
    if (EMAIL_RE.test(line)) continue;
    if (/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(line)) continue;
    if (line.length < 2 || line.length > 60) continue;
    if (/[|]/.test(line)) continue;

    // Prefer 2–4 capitalized words (typical full name)
    const words = line.replace(/[,•·]/g, ' ').split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 4) {
      const looksLikeName = words.every(
        (w) => /^[A-Z][a-zA-Z'-]+$/.test(w) || /^[A-Z]\.?$/.test(w)
      );
      if (looksLikeName) {
        return words.join(' ');
      }
    }

    // Single all-caps name line (e.g. "JOHN SMITH")
    if (words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Z][A-Z'-]+$/.test(w))) {
      return words.map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
    }
  }

  // Fallback: derive from email local-part
  if (email) {
    const local = email.split('@')[0];
    const parts = local.split(/[._+-]/).filter((p) => p.length > 1);
    if (parts.length >= 1) {
      return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
    }
  }

  return null;
}

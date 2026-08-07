import { buildBookingUrl } from './booking';

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
}

/**
 * Core email sender that supports Resend, SendGrid, or Console fallback.
 */
export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<boolean> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || 'HireFlow <onboarding@resend.dev>';
  
  const toArray = Array.isArray(to) ? to : [to];

  if (resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: toArray,
          subject,
          html,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Resend API Error:', errorData);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Failed to send email via Resend:', err);
      return false;
    }
  }

  if (sendgridApiKey) {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sendgridApiKey}`,
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: toArray.map(email => ({ email })),
            },
          ],
          from: {
            email: fromEmail.replace(/.*<|>/g, '').trim(),
            name: fromEmail.split('<')[0]?.trim() || 'HireFlow',
          },
          subject,
          content: [
            {
              type: 'text/html',
              value: html,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('SendGrid API Error:', errorText);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Failed to send email via SendGrid:', err);
      return false;
    }
  }

  // Fallback: Simulation/Console log
  console.log('\n=================== EMAIL SIMULATION ===================');
  console.log(`FROM:    ${fromEmail}`);
  console.log(`TO:      ${toArray.join(', ')}`);
  console.log(`SUBJECT: ${subject}`);
  console.log('--------------------- HTML CONTENT ---------------------');
  console.log(html);
  console.log('========================================================\n');
  return true;
}

/**
 * Email wrapper to style emails with a premium dark/violet look.
 */
function wrapHtmlTemplate(title: string, bodyContent: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #020617;
            color: #f1f5f9;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #0f172a;
            border: 1px solid #1e293b;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
          }
          .header {
            background: linear-gradient(135deg, #7c3aed, #4f46e5);
            padding: 32px;
            text-align: center;
          }
          .header h1 {
            color: #ffffff;
            margin: 0;
            font-size: 24px;
            font-weight: 800;
            letter-spacing: -0.025em;
          }
          .content {
            padding: 32px;
            line-height: 1.6;
            color: #cbd5e1;
            font-size: 15px;
          }
          .content p {
            margin-top: 0;
            margin-bottom: 20px;
          }
          .card {
            background-color: #020617;
            border: 1px solid #1e293b;
            border-radius: 12px;
            padding: 20px;
            margin: 24px 0;
          }
          .card-title {
            color: #ffffff;
            font-weight: 700;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-top: 0;
            margin-bottom: 12px;
          }
          .card-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 14px;
          }
          .card-row:last-child {
            margin-bottom: 0;
          }
          .card-label {
            color: #64748b;
            font-weight: 600;
          }
          .card-value {
            color: #f8fafc;
            text-align: right;
          }
          .btn-container {
            text-align: center;
            margin: 32px 0 16px 0;
          }
          .btn {
            display: inline-block;
            background: linear-gradient(to right, #7c3aed, #6366f1);
            color: #ffffff !important;
            text-decoration: none;
            padding: 12px 32px;
            border-radius: 8px;
            font-weight: 700;
            font-size: 14px;
            transition: all 0.2s ease;
            box-shadow: 0 4px 6px -1px rgba(124, 58, 237, 0.3);
          }
          .footer {
            padding: 24px 32px;
            background-color: #090d16;
            border-top: 1px solid #1e293b;
            text-align: center;
            font-size: 12px;
            color: #64748b;
          }
          .footer a {
            color: #7c3aed;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${title}</h1>
          </div>
          <div class="content">
            ${bodyContent}
          </div>
          <div class="footer">
            Sent via <a href="https://hireflow.com">HireFlow</a> · AI-powered hiring platform
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Send teammate invite email.
 */
export async function sendInviteEmail(
  toEmail: string,
  inviteUrl: string,
  inviterName: string,
  companyName: string,
  role: string
): Promise<boolean> {
  const subject = `Join ${companyName} on HireFlow`;
  const html = wrapHtmlTemplate(
    'You are invited to join HireFlow',
    `
      <p>Hi there,</p>
      <p><strong>${inviterName}</strong> has invited you to join the team at <strong>${companyName}</strong> on HireFlow as an <strong>${role}</strong>.</p>
      <p>HireFlow is an AI-powered recruiting platform that streamlines candidate resume parsing, ranking, and calendar bookings.</p>
      <div class="btn-container">
        <a class="btn" href="${inviteUrl}" target="_blank">Accept Invitation</a>
      </div>
      <p style="font-size: 13px; color: #64748b; text-align: center;">This invitation link will expire in 7 days.</p>
    `
  );

  return sendEmail({ to: toEmail, subject, html });
}

/**
 * Send candidate shortlisted email with signed booking link.
 */
export async function sendShortlistEmail(
  toEmail: string,
  candidateName: string,
  jobTitle: string,
  companyName: string,
  bookingUrl: string
): Promise<boolean> {
  const subject = `Interview Schedule: ${jobTitle} at ${companyName}`;
  const html = wrapHtmlTemplate(
    'Congratulations!',
    `
      <p>Hi ${candidateName},</p>
      <p>We have reviewed your application for the <strong>${jobTitle}</strong> position at <strong>${companyName}</strong>, and we are excited to invite you to the next stage of our interview process!</p>
      <p>Please use the link below to select a time slot that works best for you. The calendar will automatically check our interviewers' availabilities and schedule a Google Meet session.</p>
      <div class="btn-container">
        <a class="btn" href="${bookingUrl}" target="_blank">Select an Interview Slot</a>
      </div>
      <p style="font-size: 13px; color: #64748b; text-align: center;">Note: This booking link will expire in 7 days.</p>
      <p>We look forward to speaking with you!</p>
      <p>Best regards,<br>The Recruitment Team at ${companyName}</p>
    `
  );

  return sendEmail({ to: toEmail, subject, html });
}

/**
 * Send interview booked confirmation email.
 */
export async function sendInterviewConfirmationEmail(
  toEmail: string,
  recipientName: string,
  jobTitle: string,
  companyName: string,
  scheduledTime: string,
  meetingLink: string,
  interviewerNames: string[],
  candidateName?: string // Only supplied when sending to an interviewer
): Promise<boolean> {
  const dateObj = new Date(scheduledTime);
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = dateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const isInterviewer = !!candidateName;
  const subject = isInterviewer
    ? `Confirmed: Interview with ${candidateName} for ${jobTitle}`
    : `Confirmed: Interview with ${companyName} for ${jobTitle}`;

  const greeting = `Hi ${recipientName},`;
  const bodyIntro = isInterviewer
    ? `An interview has been booked with candidate <strong>${candidateName}</strong> for the <strong>${jobTitle}</strong> position.`
    : `Your interview with <strong>${companyName}</strong> for the <strong>${jobTitle}</strong> position has been scheduled.`;

  const detailsHtml = `
    <div class="card">
      <div class="card-title">Interview Details</div>
      <div class="card-row">
        <span class="card-label">Position</span>
        <span class="card-value">${jobTitle}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Date</span>
        <span class="card-value">${formattedDate}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Time</span>
        <span class="card-value">${formattedTime}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Interviewers</span>
        <span class="card-value">${interviewerNames.join(', ')}</span>
      </div>
      ${!isInterviewer ? '' : `
      <div class="card-row">
        <span class="card-label">Candidate</span>
        <span class="card-value">${candidateName} (${toEmail})</span>
      </div>
      `}
    </div>
  `;

  const buttonHtml = meetingLink
    ? `
      <div class="btn-container">
        <a class="btn" href="${meetingLink}" target="_blank">Join Google Meet</a>
      </div>
    `
    : '';

  const html = wrapHtmlTemplate(
    'Interview Confirmed',
    `
      <p>${greeting}</p>
      <p>${bodyIntro}</p>
      ${detailsHtml}
      ${buttonHtml}
      <p>If you need to reschedule or have any questions, please contact the recruitment team.</p>
      <p>Best regards,<br>HireFlow Automations</p>
    `
  );

  return sendEmail({ to: toEmail, subject, html });
}

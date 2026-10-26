// Branded transactional email, sent through Resend (https://resend.com).
// Set RESEND_API_KEY and MAIL_FROM (e.g. "Mad Focus <hello@yourdomain.com>").
// When RESEND_API_KEY is missing, callers fall back to Supabase's own mailer.

export const emailConfigured = () => !!process.env.RESEND_API_KEY

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export async function sendEmail({ to, subject, html, text }) {
  const from = process.env.MAIL_FROM || 'Mad Focus <onboarding@resend.dev>'
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text, reply_to: process.env.MAIL_REPLY_TO || undefined }),
  })
  if (!r.ok) {
    const detail = await r.text().catch(() => '')
    throw new Error(`Email provider rejected the message (${r.status}) ${detail.slice(0, 200)}`)
  }
}

function layout({ preheader, heading, body, cta, link, footnote }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#EEF0F3;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF0F3;padding:40px 16px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
    <tr><td style="padding:0 8px 20px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:20px;font-weight:600;color:#171A21;">Mad Focus</td></tr>
    <tr><td style="background:#FFFFFF;border-radius:20px;padding:40px 36px;">
      <h1 style="margin:0 0 14px;font-family:Literata,Georgia,'Times New Roman',serif;font-weight:500;font-size:28px;line-height:1.2;color:#171A21;">${esc(heading)}</h1>
      <div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#586072;">${body}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 24px;"><tr><td style="background:#2B45E0;border-radius:12px;">
        <a href="${esc(link)}" style="display:inline-block;padding:14px 26px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;">${esc(cta)}</a>
      </td></tr></table>
      <p style="margin:0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#7C8496;">
        Button not working? Paste this link into your browser:<br><a href="${esc(link)}" style="color:#2B45E0;word-break:break-all;">${esc(link)}</a>
      </p>
    </td></tr>
    <tr><td style="padding:20px 8px 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#7C8496;">${footnote}</td></tr>
  </table>
</td></tr></table></body></html>`
}

export function inviteEmail({ name, inviter, link }) {
  const hi = name ? `Hi ${esc(name.split(' ')[0])},` : 'Hi,'
  return {
    subject: `${inviter ? inviter.split(' ')[0] + ' invited you' : 'You’re invited'} to Mad Focus`,
    html: layout({
      preheader: 'Your workspace is ready. Set a password to get started.',
      heading: 'Your workspace is ready',
      body: `<p style="margin:0 0 12px;">${hi}</p><p style="margin:0;">${inviter ? esc(inviter) + ' has invited you' : 'You’ve been invited'} to Mad Focus: tasks, habits, goals, a journal and your reading in one calm place. Set a password to get started.</p>`,
      cta: 'Set your password',
      link,
      footnote: 'This link works once and expires in 24 hours. If you weren’t expecting this invitation, you can ignore this email.',
    }),
    text: `${hi.replace(/<[^>]+>/g, '')}\n\nYou've been invited to Mad Focus. Set your password to get started:\n${link}\n\nThis link works once and expires in 24 hours.`,
  }
}

export function resetEmail({ link }) {
  return {
    subject: 'Reset your Mad Focus password',
    html: layout({
      preheader: 'Choose a new password for your account.',
      heading: 'Reset your password',
      body: '<p style="margin:0;">Someone asked to reset the password for this account. If it was you, choose a new one below.</p>',
      cta: 'Choose a new password',
      link,
      footnote: 'This link works once and expires in 1 hour. If you didn’t ask for this, ignore this email; your password won’t change.',
    }),
    text: `Reset your Mad Focus password:\n${link}\n\nThis link works once and expires in 1 hour. If you didn't ask for this, ignore this email.`,
  }
}

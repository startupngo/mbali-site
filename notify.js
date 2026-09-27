// Email notifications for new submissions. Works without any config (logs to the console);
// sends real email once SMTP_* variables are set (any provider: Resend, Postmark, Brevo, Gmail app password...).
'use strict';

let transporter = null;
function getTransporter() {
  if (transporter !== null) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) { transporter = false; return transporter; }
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: Number(SMTP_PORT) === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  } catch (e) {
    console.warn('[notify] nodemailer not available:', e.message);
    transporter = false;
  }
  return transporter;
}

async function notify(subject, lines) {
  // Subject becomes an email header; strip any embedded CR/LF so a crafted form field
  // (business name, message, etc.) can't inject extra headers.
  subject = String(subject || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
  const body = lines.join('\n');
  const t = getTransporter();
  if (!t) {
    console.log(`[notify] ${subject}\n${body}\n`);
    return { sent: false };
  }
  const to = process.env.NOTIFY_TO;
  if (!to) return { sent: false };
  try {
    await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text: body });
    return { sent: true };
  } catch (e) {
    console.warn('[notify] send failed:', e.message);
    return { sent: false, error: e.message };
  }
}

module.exports = { notify };

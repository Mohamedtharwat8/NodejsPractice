const nodemailer = require('nodemailer');
const { smtpUrl, mailFrom } = require('../../config/env');

// Without SMTP_URL nothing leaves the process: nodemailer's json transport only builds the message,
// which is logged. Set SMTP_URL to send real mail.
let transport = smtpUrl ? nodemailer.createTransport(smtpUrl) : nodemailer.createTransport({ jsonTransport: true });

// Tests replace the transport to capture messages.
const setTransport = (t) => { transport = t; };

async function send({ to, subject, text }) {
  const info = await transport.sendMail({ from: mailFrom, to, subject, text });
  if (!smtpUrl && process.env.NODE_ENV !== 'test') console.info(`[mail] to=${to} subject="${subject}"`);
  return info;
}

module.exports = { send, setTransport };

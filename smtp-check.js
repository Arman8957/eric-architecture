// Standalone SMTP check — run from the project root:  node smtp-check.js
// Verifies both mailboxes and prints the raw Microsoft 365 response.
require('dotenv').config();
const nodemailer = require('nodemailer');

const port = Number(process.env.SMTP_PORT || 587);

// Mirrors buildMailbox() in src/utils/email/email.service.ts: per-mailbox
// credentials if set, otherwise the shared SMTP_USER / SMTP_PASS.
const mailboxes = [
  {
    label: 'contact',
    user: process.env.CONTACT_SMTP_USER || process.env.SMTP_USER,
    pass: process.env.CONTACT_SMTP_PASS || process.env.SMTP_PASS,
    from: process.env.CONTACT_MAIL_FROM,
  },
  {
    label: 'project',
    user: process.env.PROJECT_SMTP_USER || process.env.SMTP_USER,
    pass: process.env.PROJECT_SMTP_PASS || process.env.SMTP_PASS,
    from: process.env.PROJECT_MAIL_FROM,
  },
];

// Pass an address as argv[2] to also attempt a real send after verifying.
const sendTo = process.argv[2];

(async () => {
  for (const mb of mailboxes) {
    console.log(`\n=== ${mb.label}: auth as ${mb.user}, from ${mb.from} ===`);

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user: mb.user, pass: mb.pass },
      tls: { minVersion: 'TLSv1.2' },
    });

    try {
      await transporter.verify();
      console.log('  AUTH OK');
    } catch (err) {
      console.log(`  AUTH FAILED [${err.code}]`);
      console.log(`  ${err.response || err.message}`);
      continue;
    }

    if (!sendTo) continue;

    try {
      const info = await transporter.sendMail({
        from: `"${mb.label} test" <${mb.from}>`,
        to: sendTo,
        subject: `SMTP test — ${mb.label} mailbox`,
        text: `Sent from ${mb.from}, authenticated as ${mb.user}.`,
      });
      console.log(`  SEND OK → ${info.messageId}`);
    } catch (err) {
      console.log(`  SEND FAILED [${err.code}]`);
      console.log(`  ${err.response || err.message}`);
      // 5.7.60 SendAsDenied here means auth works but the From address isn't permitted.
    }
  }
})();

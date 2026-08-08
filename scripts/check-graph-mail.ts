/**
 * Verifies the Microsoft Graph mail credentials in .env.
 *
 *   npm run check:mail              → auth + permission check only, sends nothing
 *   npm run check:mail you@you.com  → also sends one real test mail from each mailbox
 *
 * Catches the usual setup mistakes in order: wrong value pasted, admin consent
 * never granted, delegated permission instead of application, mailbox not
 * reachable by the app.
 */
import * as dotenv from 'dotenv';

dotenv.config();

const TENANT = process.env.GRAPH_TENANT_ID;
const CLIENT = process.env.GRAPH_CLIENT_ID;
const SECRET = process.env.GRAPH_CLIENT_SECRET;

const MAILBOXES = [
  process.env.PROJECT_MAIL_FROM || 'studio@architecturesimple.com',
  process.env.CONTACT_MAIL_FROM || 'contactus@architecturesimple.com',
];

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const bad = (m: string) => console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`);
const info = (m: string) => console.log(`        ${m}`);

async function main() {
  const recipient = process.argv[2];

  console.log('\nMicrosoft Graph mail check\n' + '─'.repeat(52));

  // ── 1. Are the three values present and plausible? ────────────────
  console.log('\n1. Credentials');

  if (!TENANT || !CLIENT || !SECRET) {
    bad('GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET must all be set in .env');
    info(`tenant=${TENANT ? 'set' : 'MISSING'}  client=${CLIENT ? 'set' : 'MISSING'}  secret=${SECRET ? 'set' : 'MISSING'}`);
    process.exit(1);
  }

  GUID.test(TENANT) ? ok('tenant id looks like a GUID') : bad(`GRAPH_TENANT_ID is not a GUID — is this the Directory (tenant) ID?`);
  GUID.test(CLIENT) ? ok('client id looks like a GUID') : bad(`GRAPH_CLIENT_ID is not a GUID — is this the Application (client) ID?`);

  if (GUID.test(SECRET)) {
    bad('GRAPH_CLIENT_SECRET is a GUID — that is the Secret ID, not the Value.');
    info('Azure → Certificates & secrets → copy the "Value" column instead.');
    process.exit(1);
  }
  ok(`secret looks like a secret value (${SECRET.length} chars)`);

  // ── 2. Can we get a token? ────────────────────────────────────────
  console.log('\n2. Authentication');

  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT,
        client_secret: SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
  );

  const payload = (await res.json()) as any;

  if (!res.ok || !payload.access_token) {
    bad(`token request failed (${res.status})`);
    info(payload.error_description?.split('\n')[0] ?? payload.error ?? 'unknown');
    if (payload.error === 'invalid_client') {
      info('→ Wrong secret Value, or the secret has expired.');
    }
    if (payload.error === 'unauthorized_client') {
      info('→ Client ID does not exist in this tenant.');
    }
    process.exit(1);
  }
  ok('acquired an app-only access token');

  // ── 3. Was Mail.Send actually granted (and consented)? ────────────
  console.log('\n3. Permissions');

  const claims = JSON.parse(
    Buffer.from(payload.access_token.split('.')[1], 'base64').toString(),
  );
  const roles: string[] = claims.roles ?? [];

  if (roles.length === 0) {
    bad('token carries no application roles');
    info('→ Either no APPLICATION permission was added, or admin consent was never granted.');
    info('  Azure → API permissions → Microsoft Graph → Application permissions → Mail.Send,');
    info('  then click "Grant admin consent for <tenant>".');
    process.exit(1);
  }

  info(`roles: ${roles.join(', ')}`);
  if (roles.includes('Mail.Send')) {
    ok('Mail.Send is present and admin-consented');
  } else {
    bad('Mail.Send is NOT in the token');
    info('→ Add it as an Application permission and grant admin consent.');
    process.exit(1);
  }

  // ── 4. Optional: send one real mail from each mailbox ─────────────
  if (!recipient) {
    console.log('\n' + '─'.repeat(52));
    console.log('Credentials are good. Nothing was sent.');
    console.log('To send a real test:  npm run check:mail you@example.com\n');
    return;
  }

  console.log(`\n4. Test send → ${recipient}`);

  for (const mailbox of MAILBOXES) {
    const send = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/sendMail`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${payload.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject: `Graph test from ${mailbox}`,
            body: {
              contentType: 'HTML',
              content: `<p>If you can read this, ${mailbox} can send via Graph.</p>
                        <p>A copy should now be in that mailbox's <b>Sent Items</b>.</p>`,
            },
            toRecipients: [{ emailAddress: { address: recipient } }],
          },
          saveToSentItems: true,
        }),
      },
    );

    if (send.ok) {
      // 202 Accepted means Exchange queued it. Delivery happens afterwards and
      // can still fail — a tenant-level block shows up as a bounce, not here.
      ok(`${mailbox} — accepted by Exchange (202). NOT proof of delivery.`);
    } else {
      const detail = await send.text();
      bad(`${mailbox} — ${send.status}`);
      info(detail.slice(0, 300));
      if (send.status === 403) {
        info('→ ApplicationAccessPolicy may be excluding this mailbox, or the mailbox does not exist.');
      }
    }
  }

  console.log('\n' + '─'.repeat(52));
  console.log('NOW GO AND LOOK:');
  console.log(`  1. Did ${recipient} actually receive 2 emails?`);
  console.log('  2. If not, a bounce is waiting in the sending mailbox inbox.');
  console.log('The 202 above only means Exchange took the message.\n');
}

main().catch((e) => {
  console.error('\nUnexpected error:', e.message, '\n');
  process.exit(1);
});

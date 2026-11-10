// Read-only check of every integration. Sends nothing. Usage: npm run verify:services
import { loadConfig, loadEnvFile } from '../config.js';
import { createPool, migrate } from '../db.js';
import { createBrevo, createWhatsApp } from '../providers.js';
import { WHATSAPP_TEMPLATES } from '../templates.js';

loadEnvFile();
const config = loadConfig();
const ok = (m) => console.log(`  ✔ ${m}`);
const warn = (m) => console.log(`  ⚠ ${m}`);
const bad = (m) => console.log(`  ✖ ${m}`);
let problems = 0;
const fail = (m) => {
  problems++;
  bad(m);
};

console.log('\nDatabase (PostgreSQL)');
if (!config.databaseUrl) fail('DATABASE_URL is not set');
else {
  const pool = createPool(config);
  try {
    await migrate(pool);
    const { rows } = await pool.query(
      `SELECT version(), (SELECT count(*) FROM enquiries WHERE source = 'custom_bottle') AS orders,
              (SELECT count(*) FROM enquiries WHERE source = 'contact') AS enquiries,
              (SELECT count(*) FROM enquiries WHERE order_status = 'PENDING') AS pending,
              (SELECT count(*) FROM admin_users WHERE active) AS admins`,
    );
    const r = rows[0];
    ok(`connected — ${r.version.split(',')[0]}; schema up to date; ${r.orders} orders (${r.pending} pending approval), ${r.enquiries} enquiries`);
    if (Number(r.admins)) ok(`${r.admins} administrator account(s) can sign in at /admin`);
    else fail('no administrator account — run: npm run admin:create -- you@example.com "Your Name"');
  } catch (err) {
    fail(`cannot connect: ${err.message}`);
  } finally {
    await pool.end();
  }
}

console.log('\nAdmin access');
if (config.admin.jwtSecret) ok('JWT_SECRET_KEY set — POST /api/admin/login also returns a Bearer token for API clients');
else warn(config.admin.jwtSecretTooShort ? 'JWT_SECRET_KEY is shorter than 32 characters and is ignored' : 'JWT_SECRET_KEY not set — the dashboard works, API Bearer tokens are disabled');
if (config.admin.bootstrapEmail && config.admin.bootstrapPasswordHash) ok(`ADMIN_EMAIL ${config.admin.bootstrapEmail} is created/updated when the server starts`);
console.log(`  environment: ${config.appEnv}; cross-origin access allowed for: ${config.allowedOrigins.join(', ') || 'none (same origin only)'}`);

console.log('\nEmail (Brevo)');
if (!config.brevo.apiKey) fail('BREVO_API_KEY is not set');
else {
  const brevo = createBrevo(config.brevo);
  try {
    const acct = await brevo.account();
    const plan = (acct.plan ?? []).map((p) => `${p.type}${p.credits != null ? ` (${p.credits} ${p.creditsType ?? 'credits'})` : ''}`).join(', ');
    ok(`API key valid — account ${acct.email}, plan: ${plan || 'unknown'}`);
    const { senders = [] } = await brevo.senders();
    const sender = senders.find((s) => s.email.toLowerCase() === config.brevo.senderEmail.toLowerCase());
    if (!config.brevo.senderEmail) fail('BREVO_SENDER_EMAIL is not set');
    else if (!sender) fail(`sender ${config.brevo.senderEmail} is not added in Brevo (Senders, Domains & Dedicated IPs → Senders)`);
    else if (!sender.active) fail(`sender ${config.brevo.senderEmail} exists but is not verified/active yet`);
    else ok(`sender ${config.brevo.senderEmail} is verified and active (shown to customers as "${config.brevo.senderName}")`);
    for (const s of senders) if (s !== sender) console.log(`    other sender: ${s.email} — ${s.active ? 'active' : 'NOT verified'}`);
    const { domains = [] } = await brevo.domains();
    const senderDomain = config.brevo.senderEmail.split('@')[1]?.toLowerCase();
    const dom = domains.find((d) => d.domain_name?.toLowerCase() === senderDomain);
    if (/^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|rediffmail)\./.test(senderDomain ?? '')) {
      warn(`sender uses a free mailbox domain (${senderDomain}); it cannot be DKIM/DMARC-authenticated in Brevo, so emails are more likely to land in spam. Authenticate your own domain for production.`);
    } else if (!dom) warn(`domain ${senderDomain} is not added under Brevo → Domains (no DKIM/DMARC authentication)`);
    else if (!dom.authenticated) warn(`domain ${senderDomain} is added but not authenticated yet`);
    else ok(`domain ${senderDomain} is authenticated (DKIM/DMARC)`);
    if (config.brevo.sandbox) warn('BREVO_SANDBOX=true — Brevo validates every email but DROPS it. Set BREVO_SANDBOX=false to go live.');
    else ok('live mode — emails will really be delivered');
  } catch (err) {
    fail(err.message);
  }
}
console.log(`  business notification address: ${config.business.email}`);
console.log(`  delivery webhook: ${config.brevo.webhookToken ? 'token set — configure https://<your-domain>/api/webhooks/brevo?token=… in Brevo' : 'BREVO_WEBHOOK_TOKEN not set (status polling still works)'}`);

console.log('\nWhatsApp (Meta WhatsApp Business Cloud API)');
const templateNames = Object.keys(WHATSAPP_TEMPLATES);
if (!config.whatsapp.configured) {
  fail(`not configured — missing ${config.whatsapp.missing.join(', ')}. Every WhatsApp notification is recorded as "skipped" with this reason.`);
  if (!config.whatsapp.businessAccountId) console.log('    also needed: WHATSAPP_BUSINESS_ACCOUNT_ID');
  if (!config.whatsapp.appSecret) console.log('    also needed: META_APP_SECRET');
  console.log(`    ${templateNames.length} templates must be approved by Meta (${config.whatsapp.templateLanguage}, UTILITY): ${templateNames.join(', ')}`);
  console.log('    see them with: npm run whatsapp:templates -- --print');
} else {
  const wa = createWhatsApp(config.whatsapp);
  try {
    const num = await wa.phoneNumber();
    ok(`sender number ${num.display_phone_number} (${num.verified_name}), quality ${num.quality_rating ?? 'n/a'}`);
    if (num.display_phone_number?.replace(/\D/g, '') === config.whatsapp.notifyTo) {
      fail(`WHATSAPP_OWNER_NUMBER (${config.whatsapp.notifyTo}) is the same number as the sender — a number cannot message itself`);
    }
  } catch (err) {
    fail(`phone number check failed: ${err.message}`);
  }
  if (!config.whatsapp.businessAccountId) fail('WHATSAPP_BUSINESS_ACCOUNT_ID not set — cannot check template approval');
  else {
    try {
      const existing = await wa.templates();
      for (const name of templateNames) {
        const t = existing.find((x) => x.name === name && x.language === config.whatsapp.templateLanguage);
        if (!t) fail(`template "${name}" not created — run: npm run whatsapp:templates -- --create`);
        else if (t.status !== 'APPROVED') fail(`template "${name}" is ${t.status}${t.rejected_reason && t.rejected_reason !== 'NONE' ? ` — ${t.rejected_reason}` : ''}`);
        else ok(`template "${name}" approved`);
      }
    } catch (err) {
      fail(`template check failed: ${err.message}`);
    }
  }
  if (!config.whatsapp.appSecret || !config.whatsapp.webhookVerifyToken) warn('webhook not fully configured (META_APP_SECRET / WHATSAPP_WEBHOOK_VERIFY_TOKEN) — delivery statuses and STOP replies will not be received');
}
console.log(`    owner notifications go to +${config.whatsapp.notifyTo}`);
console.log(`    admin dashboard link in owner emails: ${config.publicSiteUrl ? `${config.publicSiteUrl}/admin` : 'FRONTEND_URL not set (emails say "the /admin page")'}`);

console.log(`\n${problems ? `${problems} problem(s) found.` : 'All checks passed.'}\n`);
process.exit(problems ? 1 : 0);

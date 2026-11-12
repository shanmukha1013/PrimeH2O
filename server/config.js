// Server configuration. Secrets come only from environment variables
// (optionally loaded from server/.env) and are never sent to the browser or logged.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadEnvFile() {
  try {
    process.loadEnvFile(path.join(here, '.env'));
  } catch {
    /* no server/.env — rely on the real environment (production hosts) */
  }
}

const str = (v, d = '') => (typeof v === 'string' && v.trim() ? v.trim() : d);
const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));

export function loadConfig(env = process.env) {
  const brevo = {
    apiKey: str(env.BREVO_API_KEY),
    senderEmail: str(env.BREVO_SENDER_EMAIL),
    senderName: str(env.BREVO_SENDER_NAME, 'PRIME H₂O'),
    // Sandbox: Brevo validates each request but drops the email (X-Sib-Sandbox: drop).
    sandbox: bool(env.BREVO_SANDBOX),
    webhookToken: str(env.BREVO_WEBHOOK_TOKEN),
  };
  brevo.missing = [
    !brevo.apiKey && 'BREVO_API_KEY',
    !brevo.senderEmail && 'BREVO_SENDER_EMAIL',
  ].filter(Boolean);
  brevo.configured = brevo.missing.length === 0;

  const whatsapp = {
    accessToken: str(env.WHATSAPP_ACCESS_TOKEN),
    phoneNumberId: str(env.WHATSAPP_PHONE_NUMBER_ID),
    businessAccountId: str(env.WHATSAPP_BUSINESS_ACCOUNT_ID),
    templateLanguage: str(env.WHATSAPP_TEMPLATE_LANGUAGE, 'en'),
    // the company's WhatsApp number that receives new-order alerts
    // (PRIME_H2O_BUSINESS_WHATSAPP; WHATSAPP_OWNER_NUMBER and WHATSAPP_NOTIFY_TO are older names)
    notifyTo: str(env.PRIME_H2O_BUSINESS_WHATSAPP || env.WHATSAPP_OWNER_NUMBER || env.WHATSAPP_NOTIFY_TO, '918143489222').replace(/\D/g, ''),
    // Graph API version (WHATSAPP_API_VERSION; WHATSAPP_GRAPH_VERSION is the older name)
    graphVersion: str(env.WHATSAPP_API_VERSION || env.WHATSAPP_GRAPH_VERSION, 'v23.0'),
    // Meta app secret, verifies webhook signatures (META_APP_SECRET; WHATSAPP_APP_SECRET is the older name)
    appSecret: str(env.META_APP_SECRET || env.WHATSAPP_APP_SECRET),
    webhookVerifyToken: str(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
  };
  whatsapp.missing = [
    !whatsapp.accessToken && 'WHATSAPP_ACCESS_TOKEN',
    !whatsapp.phoneNumberId && 'WHATSAPP_PHONE_NUMBER_ID',
  ].filter(Boolean);
  whatsapp.configured = whatsapp.missing.length === 0;

  const appEnv = str(env.APP_ENV || env.NODE_ENV, 'development').toLowerCase();
  const jwtSecret = str(env.JWT_SECRET_KEY);
  const frontendUrl = str(env.FRONTEND_URL).replace(/\/+$/, '');

  return {
    appEnv,
    isProduction: appEnv === 'production',
    port: Number(env.PORT) || 8787,
    databaseUrl: str(env.DATABASE_URL),
    // DATABASE_SSL: "true" = verified TLS, "no-verify" = TLS without certificate check
    databaseSsl: str(env.DATABASE_SSL).toLowerCase(),
    trustProxy: bool(env.TRUST_PROXY),
    // browser origins allowed to call the public API cross-origin (same-origin needs none)
    allowedOrigins: [...new Set([frontendUrl, ...str(env.ALLOWED_ORIGINS).split(',')].map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean))],
    frontendUrl,
    // public address of the website, used for the admin dashboard link in owner emails
    publicSiteUrl: str(env.PUBLIC_SITE_URL || env.FRONTEND_URL).replace(/\/+$/, ''),
    adminSessionHours: Number(env.ADMIN_SESSION_HOURS) || 12,
    admin: {
      // JWT for API clients (Authorization: Bearer). At least 32 characters; unset = cookie sign-in only.
      jwtSecret: jwtSecret.length >= 32 ? jwtSecret : '',
      jwtSecretTooShort: jwtSecret.length > 0 && jwtSecret.length < 32,
      // optional administrator created/updated at startup (hash from: npm run admin:hash)
      bootstrapEmail: str(env.ADMIN_EMAIL).toLowerCase(),
      bootstrapPasswordHash: str(env.ADMIN_PASSWORD_HASH),
      bootstrapName: str(env.ADMIN_NAME, 'PRIME H₂O Owner'),
    },
    // how long a submission waits for its first send attempt before answering the browser
    immediateSendTimeoutMs: Number(env.IMMEDIATE_SEND_TIMEOUT_MS) || 12_000,
    // max enquiries per IP address per 10 minutes
    enquiryRateLimit: Number(env.ENQUIRY_RATE_LIMIT) || 8,
    business: {
      email: str(env.BUSINESS_EMAIL, 'prime2417@gmail.com'),
      whatsappDisplay: '+91 81434 89222',
    },
    brevo,
    whatsapp,
    worker: {
      enabled: !bool(env.DISABLE_WORKER),
      intervalMs: Number(env.WORKER_INTERVAL_MS) || 15_000,
      statusPollMs: Number(env.STATUS_POLL_MS) || 5 * 60_000,
      maxAttempts: Number(env.NOTIFY_MAX_ATTEMPTS) || 6,
    },
  };
}

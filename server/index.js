import { createAdminAuth } from './adminAuth.js';
import { createApp } from './app.js';
import { loadConfig, loadEnvFile } from './config.js';
import { createPool, migrate } from './db.js';
import { createEnquiryStore } from './enquiries.js';
import { createNotifier } from './notifications.js';
import { createBrevo, createWhatsApp } from './providers.js';
import { log } from './log.js';

loadEnvFile();
const config = loadConfig();

const pool = createPool(config);
await migrate(pool);

const email = createBrevo(config.brevo);
const whatsapp = createWhatsApp(config.whatsapp);
const notifier = createNotifier({ pool, config, email, whatsapp, log });
const store = createEnquiryStore({ pool, notifier, log });
const auth = createAdminAuth({ pool, config, log });
await auth.bootstrapFromEnv();
if (config.admin.jwtSecretTooShort) log.warn('JWT_SECRET_KEY is shorter than 32 characters and was ignored; API Bearer tokens are disabled');
else if (!config.admin.jwtSecret) log.warn('JWT_SECRET_KEY not set: the dashboard works (cookie sign-in) but API Bearer tokens are disabled');
const app = createApp({ config, store, notifier, log, pool, auth });

const server = app.listen(config.port, () => {
  log.info('PRIME H2O server listening', {
    port: config.port,
    env: config.appEnv,
    email: config.brevo.configured ? (config.brevo.sandbox ? 'sandbox (not delivered)' : 'live') : `missing ${config.brevo.missing.join(', ')}`,
    whatsapp: config.whatsapp.configured ? 'configured' : `missing ${config.whatsapp.missing.join(', ')} (WhatsApp notifications are recorded as skipped)`,
  });
  pool
    .query('SELECT count(*)::int AS n FROM admin_users WHERE active')
    .then(({ rows }) => {
      if (!rows[0].n) log.warn('no administrator account yet: run "npm run admin:create -- you@example.com \"Your Name\"" to use /admin');
    })
    .catch(() => {});
});
if (config.worker.enabled) notifier.start();

const shutdown = () => {
  notifier.stop();
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

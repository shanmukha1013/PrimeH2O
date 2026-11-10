// Vercel serverless entry for the PRIME H₂O API. vercel.json rewrites every /api/* request here.
// It wires up the same modules as server/index.js and hands each request to the unchanged Express
// app (server/app.js). Differences from the long-running server:
//   - no app.listen(): Vercel calls the exported handler for each request;
//   - no interval-based background worker (notifier.start()), because timers do not run between
//     requests on serverless. First send attempts still happen during each request, and the admin
//     "retry" action still sends immediately. The worker's retry sweep and email-status poll run
//     from a Vercel Cron job that calls /api/cron/notifications (see vercel.json).
import crypto from 'node:crypto';
import { createAdminAuth } from '../server/adminAuth.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createPool, migrate } from '../server/db.js';
import { createEnquiryStore } from '../server/enquiries.js';
import { createNotifier } from '../server/notifications.js';
import { createBrevo, createWhatsApp } from '../server/providers.js';
import { log } from '../server/log.js';

let ready; // one initialisation per function instance, reused across requests

async function init() {
  const config = loadConfig();
  const pool = createPool(config);
  await migrate(pool);
  const notifier = createNotifier({
    pool,
    config,
    email: createBrevo(config.brevo),
    whatsapp: createWhatsApp(config.whatsapp),
    log,
  });
  const store = createEnquiryStore({ pool, notifier, log });
  const auth = createAdminAuth({ pool, config, log });
  await auth.bootstrapFromEnv();
  return { notifier, app: createApp({ config, store, notifier, log, pool, auth }) };
}

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

export default async function handler(req, res) {
  let api;
  try {
    api = await (ready ??= init().catch((err) => {
      ready = undefined; // try again on the next request
      throw err;
    }));
  } catch (err) {
    log.error('API start-up failed', { error: err.message });
    return json(res, 503, {
      error: 'Our server is not available right now. Please try again shortly, or contact us on WhatsApp at +91 81434 89222.',
    });
  }

  // Vercel Cron: sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set on the project.
  if ((req.url ?? '').split('?')[0] === '/api/cron/notifications') {
    const secret = process.env.CRON_SECRET;
    if (!secret || !safeEqual(req.headers.authorization, `Bearer ${secret}`)) return json(res, 401, { error: 'Unauthorized' });
    try {
      await api.notifier.tick();
      await api.notifier.pollEmailStatuses();
      return json(res, 200, { ok: true });
    } catch (err) {
      log.error('cron notification run failed', { error: err.message });
      return json(res, 500, { error: 'Notification run failed' });
    }
  }

  return api.app(req, res);
}

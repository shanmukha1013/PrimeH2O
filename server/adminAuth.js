// Administrator accounts, sessions and roles for the order dashboard and admin API.
// Passwords: scrypt with a per-user salt. Every sign-in creates a server-side session that can
// be used two ways:
//   - browser dashboard: random 256-bit token in an HttpOnly, SameSite=Strict cookie (only its
//     SHA-256 hash is stored); state-changing requests must also carry the X-Prime-Admin header,
//     which a cross-site form or image cannot send (CSRF).
//   - API clients: a JWT (HS256, JWT_SECRET_KEY) sent as "Authorization: Bearer". The token names
//     its session, so signing out or disabling the account revokes it immediately.
// Roles: "admin" may change orders; "viewer" is read-only.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64;
export const SESSION_COOKIE = 'prime_admin';
export const CSRF_HEADER = 'x-prime-admin';
export const MIN_PASSWORD_LENGTH = 12;
export const ROLES = ['admin', 'viewer'];
const JWT_OPTIONS = { issuer: 'prime-h2o', audience: 'prime-h2o-admin' };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password).normalize('NFKC'), salt, KEY_LEN, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored ?? '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(String(password).normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Sliding-window counter kept in memory (per server process). */
function limiter(windowMs, max) {
  const hits = new Map();
  return {
    blocked(key) {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      hits.set(key, recent);
      return recent.length >= max;
    },
    hit(key) {
      const list = hits.get(key) ?? [];
      list.push(Date.now());
      hits.set(key, list);
      if (hits.size > 10_000) hits.clear();
    },
    reset: (key) => hits.delete(key),
  };
}

export function createAdminAuth({ pool, config, log = null }) {
  const ttlHours = config.adminSessionHours;
  const jwtSecret = config.admin?.jwtSecret ?? '';
  const ipLimit = limiter(15 * 60_000, 20); // login attempts per IP
  const emailLimit = limiter(15 * 60_000, 8); // failed logins per account
  let dummyHash = null; // compared against for unknown emails, so timing doesn't reveal which accounts exist

  const publicAdmin = (a) => ({ name: a.name, email: a.email, role: a.role });

  async function login(emailRaw, password, { ip, userAgent }) {
    const email = String(emailRaw ?? '').trim().toLowerCase();
    if (ipLimit.blocked(ip) || emailLimit.blocked(email)) return { error: 'locked' };
    ipLimit.hit(ip);
    if (!email || typeof password !== 'string' || !password) return { error: 'invalid' };
    const { rows: [admin] } = await pool.query('SELECT * FROM admin_users WHERE email = $1 AND active', [email]);
    dummyHash ??= await hashPassword(crypto.randomBytes(16).toString('hex'));
    const ok = await verifyPassword(password, admin?.password_hash ?? dummyHash);
    if (!admin || !ok) {
      emailLimit.hit(email);
      return { error: 'invalid' };
    }
    emailLimit.reset(email);
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query('DELETE FROM admin_sessions WHERE expires_at < now()');
    const { rows: [session] } = await pool.query(
      `INSERT INTO admin_sessions (admin_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, now() + make_interval(hours => $3), $4, $5) RETURNING id, expires_at`,
      [admin.id, sha256(token), ttlHours, ip ?? null, userAgent ? String(userAgent).slice(0, 300) : null],
    );
    await pool.query('UPDATE admin_users SET last_login_at = now() WHERE id = $1', [admin.id]);
    const accessToken = jwtSecret
      ? jwt.sign({ sid: String(session.id), role: admin.role }, jwtSecret, {
          ...JWT_OPTIONS,
          algorithm: 'HS256',
          subject: String(admin.id),
          expiresIn: ttlHours * 3600,
        })
      : null;
    return { token, accessToken, expiresAt: session.expires_at, admin };
  }

  const ACTIVE_SESSION = 's.expires_at > now() AND a.id = s.admin_id AND a.active';

  async function sessionAdmin(token) {
    if (!token || token.length > 100) return null;
    const { rows: [row] } = await pool.query(
      `UPDATE admin_sessions s SET last_seen_at = now() FROM admin_users a
        WHERE s.token_hash = $1 AND ${ACTIVE_SESSION}
        RETURNING a.id, a.name, a.email, a.role, s.id AS session_id`,
      [sha256(token)],
    );
    return row ?? null;
  }

  async function bearerAdmin(token) {
    if (!jwtSecret) return null;
    let claims;
    try {
      claims = jwt.verify(token, jwtSecret, { ...JWT_OPTIONS, algorithms: ['HS256'] });
    } catch {
      return null; // bad signature, wrong issuer/audience, expired, or not a JWT
    }
    if (!/^\d+$/.test(claims.sid ?? '') || !/^\d+$/.test(claims.sub ?? '')) return null;
    const { rows: [row] } = await pool.query(
      `UPDATE admin_sessions s SET last_seen_at = now() FROM admin_users a
        WHERE s.id = $1 AND s.admin_id = $2 AND ${ACTIVE_SESSION}
        RETURNING a.id, a.name, a.email, a.role, s.id AS session_id`,
      [claims.sid, claims.sub],
    );
    return row ?? null; // the role always comes from the database, never from the token
  }

  /**
   * Creates or updates the administrator named by ADMIN_EMAIL / ADMIN_PASSWORD_HASH (optional).
   * A changed hash signs that account out everywhere.
   */
  async function bootstrapFromEnv() {
    const { bootstrapEmail: email, bootstrapPasswordHash: hash, bootstrapName: name } = config.admin ?? {};
    if (!email && !hash) return null;
    if (!email || !hash) {
      log?.warn('ADMIN_EMAIL and ADMIN_PASSWORD_HASH must be set together; no administrator was created from the environment');
      return null;
    }
    if (!/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(hash)) {
      log?.warn('ADMIN_PASSWORD_HASH is not a hash from "npm run admin:hash"; no administrator was created from the environment');
      return null;
    }
    const { rows: [before] } = await pool.query('SELECT id, password_hash FROM admin_users WHERE email = $1', [email]);
    const { rows: [row] } = await pool.query(
      `INSERT INTO admin_users (email, name, password_hash, role) VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, active = true, role = 'admin'
       RETURNING id`,
      [email, name, hash],
    );
    if (before && before.password_hash !== hash) await pool.query('DELETE FROM admin_sessions WHERE admin_id = $1', [row.id]);
    log?.info(before ? 'administrator from ADMIN_EMAIL is up to date' : 'administrator created from ADMIN_EMAIL', { email });
    return row.id;
  }

  const cookie = (req, value, maxAgeSeconds) =>
    [
      `${SESSION_COOKIE}=${value}`,
      'Path=/api/admin',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${maxAgeSeconds}`,
      ...(req.secure || config.isProduction ? ['Secure'] : []),
    ].join('; ');

  const tokenOf = (req) => parseCookies(req.get('cookie'))[SESSION_COOKIE] ?? null;
  const bearerOf = (req) => /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '')?.[1] ?? null;

  return {
    login,
    bootstrapFromEnv,
    jwtEnabled: !!jwtSecret,
    publicAdmin,
    /** Express handlers */
    async loginRoute(req, res) {
      if (req.get(CSRF_HEADER) !== '1') return res.status(403).json({ error: 'Missing request header.' });
      const result = await login(req.body?.email, req.body?.password, { ip: req.ip, userAgent: req.get('user-agent') });
      if (result.error === 'locked') return res.status(429).json({ error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' });
      if (result.error) return res.status(401).json({ error: 'Incorrect email or password.' });
      res.set('Cache-Control', 'no-store');
      res.set('Set-Cookie', cookie(req, result.token, ttlHours * 3600));
      res.json({
        admin: publicAdmin(result.admin),
        expiresAt: result.expiresAt,
        ...(result.accessToken ? { token: result.accessToken, tokenType: 'Bearer' } : {}),
      });
    },
    async logoutRoute(req, res) {
      const bearer = bearerOf(req);
      const admin = bearer ? await bearerAdmin(bearer) : null;
      if (admin) await pool.query('DELETE FROM admin_sessions WHERE id = $1', [admin.session_id]);
      const token = tokenOf(req);
      if (token) await pool.query('DELETE FROM admin_sessions WHERE token_hash = $1', [sha256(token)]);
      res.set('Set-Cookie', cookie(req, '', 0));
      res.json({ ok: true });
    },
    /** Requires a signed-in administrator: Bearer JWT, or the session cookie (+ CSRF header for changes). */
    async requireAdmin(req, res, next) {
      res.set('Cache-Control', 'no-store');
      const bearer = bearerOf(req);
      let admin;
      if (bearer) {
        admin = await bearerAdmin(bearer); // no ambient credentials, so no CSRF check needed
      } else {
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.get(CSRF_HEADER) !== '1') {
          return res.status(403).json({ error: 'Missing request header.' });
        }
        admin = await sessionAdmin(tokenOf(req));
      }
      if (!admin) return res.status(401).json({ error: 'Please sign in.' });
      req.admin = admin;
      next();
    },
    /** Only administrators with this role may continue. */
    requireRole: (role) => (req, res, next) =>
      req.admin?.role === role ? next() : res.status(403).json({ error: 'Your account can view orders but not change them.' }),
  };
}

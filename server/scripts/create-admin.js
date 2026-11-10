// Creates an administrator for the order dashboard (/admin), or resets their password.
//   npm run admin:create -- owner@example.com "Owner Name"               (asks for the password, hidden)
//   npm run admin:create -- --role viewer staff@example.com "Staff Name"  (read-only account)
//   npm run admin:create -- --disable owner@example.com                  (blocks the account, signs it out)
//   npm run admin:hash                                                    (prints a hash for ADMIN_PASSWORD_HASH)
// The password can also be piped on stdin (first line) for automated setups.
import { MIN_PASSWORD_LENGTH, ROLES, hashPassword } from '../adminAuth.js';
import { loadConfig, loadEnvFile } from '../config.js';
import { createPool, migrate } from '../db.js';
import { normalizeEmail } from '../validation.js';

loadEnvFile();
const args = process.argv.slice(2);
const hashOnly = args[0] === '--hash';
const disable = args[0] === '--disable';
let role = 'admin';
if (args[0] === '--role') {
  role = args[1];
  args.splice(0, 2);
  if (!ROLES.includes(role)) {
    console.error(`--role must be one of: ${ROLES.join(', ')}`);
    process.exit(1);
  }
}
const [emailArg, ...nameParts] = disable ? args.slice(1) : args;
const email = normalizeEmail(emailArg ?? '')?.toLowerCase();
const name = nameParts.join(' ').trim();

if (!hashOnly && (!email || (!disable && !name))) {
  console.error(
    'Usage: npm run admin:create -- owner@example.com "Owner Name"\n' +
      '       npm run admin:create -- --role viewer staff@example.com "Staff Name"\n' +
      '       npm run admin:create -- --disable owner@example.com\n' +
      '       npm run admin:hash',
  );
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const done = (fn) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stdout.write('\n');
      fn();
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return done(() => resolve(value));
        if (ch === '\u0003') return done(() => reject(new Error('Cancelled')));
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function readPassword() {
  if (!process.stdin.isTTY) {
    let data = '';
    for await (const chunk of process.stdin) data += chunk;
    return data.split(/\r?\n/)[0];
  }
  const first = await askHidden(`New password${email ? ` for ${email}` : ''} (min ${MIN_PASSWORD_LENGTH} characters): `);
  const second = await askHidden('Repeat the password: ');
  if (first !== second) throw new Error('The passwords do not match.');
  return first;
}

if (hashOnly) {
  // prints only the scrypt hash (never the password) for ADMIN_EMAIL / ADMIN_PASSWORD_HASH
  try {
    const password = await readPassword();
    if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    console.log(`ADMIN_PASSWORD_HASH=${await hashPassword(password)}`);
    process.exit(0);
  } catch (err) {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  }
}

const pool = createPool(loadConfig());
try {
  await migrate(pool);
  if (disable) {
    const r = await pool.query('UPDATE admin_users SET active = false, updated_at = now() WHERE email = $1 RETURNING id', [email]);
    if (!r.rowCount) throw new Error(`No administrator ${email}.`);
    await pool.query('DELETE FROM admin_sessions WHERE admin_id = $1', [r.rows[0].id]);
    console.log(`Administrator ${email} disabled and signed out.`);
  } else {
    const password = await readPassword();
    if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    const hash = await hashPassword(password);
    const r = await pool.query(
      `INSERT INTO admin_users (email, name, password_hash, role) VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role,
                                         active = true, updated_at = now()
       RETURNING id, (xmax = 0) AS created`,
      [email, name, hash, role],
    );
    // a password reset signs out every existing session of that account
    if (!r.rows[0].created) await pool.query('DELETE FROM admin_sessions WHERE admin_id = $1', [r.rows[0].id]);
    console.log(`${r.rows[0].created ? 'Created' : 'Updated'} ${role} ${name} <${email}>. Sign in at /admin.`);
  }
} catch (err) {
  console.error(`✖ ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

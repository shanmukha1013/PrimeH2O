// Structured one-line logs. Callers pass only non-secret metadata (ids, statuses, messages).
const write = (level, msg, meta = {}) => {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...meta });
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
};

export const log = {
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
};

// WhatsApp message templates used by the order notifications.
//   npm run whatsapp:templates              list each required template and its approval status in Meta
//   npm run whatsapp:templates -- --print   print every template body (for entering them by hand)
//   npm run whatsapp:templates -- --create  submit the missing ones to Meta for approval (category UTILITY)
// Needs WHATSAPP_ACCESS_TOKEN (with whatsapp_business_management) and WHATSAPP_BUSINESS_ACCOUNT_ID.
import { loadConfig, loadEnvFile } from '../config.js';
import { createWhatsApp } from '../providers.js';
import { WHATSAPP_TEMPLATES, whatsappTemplateExample } from '../templates.js';

loadEnvFile();
const config = loadConfig();
const mode = process.argv.includes('--create') ? 'create' : process.argv.includes('--print') ? 'print' : 'list';
const lang = config.whatsapp.templateLanguage;

if (mode === 'print') {
  for (const [name, t] of Object.entries(WHATSAPP_TEMPLATES)) {
    console.log(`\n━━ ${name}  (${lang}, UTILITY) — ${t.purpose}`);
    console.log(t.body);
    console.log(`   variables: ${t.params.map((p, i) => `{{${i + 1}}}=${p}`).join(', ')}`);
    console.log(`   example:   ${JSON.stringify(whatsappTemplateExample(name))}`);
  }
  process.exit(0);
}

const missing = [!config.whatsapp.accessToken && 'WHATSAPP_ACCESS_TOKEN', !config.whatsapp.businessAccountId && 'WHATSAPP_BUSINESS_ACCOUNT_ID'].filter(Boolean);
if (missing.length) {
  console.error(`✖ Cannot reach Meta: missing ${missing.join(', ')} in server/.env. Use --print to see the template bodies.`);
  process.exit(1);
}

const wa = createWhatsApp(config.whatsapp);
let existing;
try {
  existing = await wa.templates();
} catch (err) {
  console.error(`✖ Could not list templates: ${err.message}`);
  process.exit(1);
}

let problems = 0;
for (const [name, t] of Object.entries(WHATSAPP_TEMPLATES)) {
  const found = existing.find((x) => x.name === name && x.language === lang);
  if (found) {
    const ok = found.status === 'APPROVED';
    if (!ok) problems++;
    console.log(`${ok ? '✔' : '✖'} ${name} (${lang}): ${found.status}${found.rejected_reason && found.rejected_reason !== 'NONE' ? ` — ${found.rejected_reason}` : ''}`);
    continue;
  }
  if (mode !== 'create') {
    problems++;
    console.log(`✖ ${name} (${lang}): not created yet — ${t.purpose}`);
    continue;
  }
  try {
    const r = await wa.createTemplate({ name, language: lang, body: t.body, example: whatsappTemplateExample(name) });
    problems++;
    console.log(`→ ${name} (${lang}): submitted for review (status ${r.status ?? 'PENDING'}, id ${r.id})`);
  } catch (err) {
    problems++;
    console.log(`✖ ${name} (${lang}): submission failed — ${err.message}`);
  }
}
console.log(problems ? `\n${problems} template(s) are not approved yet. WhatsApp messages using them will fail (and be recorded as failed) until Meta approves them.` : '\nAll templates are approved.');
process.exitCode = problems ? 1 : 0; // let pending network handles close (process.exit here crashes libuv on Windows)

// HTTP clients for Brevo (email) and Meta WhatsApp Business Cloud API.
// Errors carry `retryable` so the notification worker knows whether to try again.

export class ProviderError extends Error {
  constructor(message, { retryable = false, status = null, body = null } = {}) {
    super(message);
    this.retryable = retryable;
    this.status = status;
    this.body = body;
  }
}

async function request(fetchImpl, url, { method = 'GET', headers = {}, body, timeoutMs = 20_000, label }) {
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new ProviderError(`${label} request failed: ${err?.name === 'TimeoutError' ? 'timed out' : err?.message || 'network error'}`, {
      retryable: true,
    });
  }
  const raw = await res.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw: raw.slice(0, 500) };
  }
  return { res, data };
}

// ---------------------------------------------------------------- Brevo

export function createBrevo(cfg, fetchImpl = fetch) {
  const base = 'https://api.brevo.com/v3';
  const call = async (method, path, body) => {
    const { res, data } = await request(fetchImpl, base + path, { method, body, headers: { 'api-key': cfg.apiKey }, label: 'Brevo' });
    if (!res.ok) {
      throw new ProviderError(`Brevo ${res.status}: ${data.message || data.code || res.statusText}`, {
        retryable: res.status === 429 || res.status >= 500,
        status: res.status,
        body: data,
      });
    }
    return data;
  };

  return {
    name: 'brevo',
    configured: cfg.configured,
    missing: cfg.missing,
    sandbox: cfg.sandbox,
    /** Returns { messageId } once Brevo has accepted the email for sending (not delivery). */
    async sendEmail({ to, subject, html, text, replyTo, attachments = [], tags = [] }) {
      const payload = {
        sender: { name: cfg.senderName, email: cfg.senderEmail },
        to: [to],
        subject,
        htmlContent: html,
        textContent: text,
        ...(replyTo ? { replyTo } : {}),
        ...(tags.length ? { tags } : {}),
        ...(attachments.length ? { attachment: attachments.map((a) => ({ name: a.name, content: a.content.toString('base64') })) } : {}),
        ...(cfg.sandbox ? { headers: { 'X-Sib-Sandbox': 'drop' } } : {}),
      };
      const data = await call('POST', '/smtp/email', payload);
      if (!data.messageId) throw new ProviderError('Brevo returned no messageId', { retryable: false, body: data });
      return { messageId: data.messageId, response: { messageId: data.messageId, sandbox: !!cfg.sandbox } };
    },
    account: () => call('GET', '/account'),
    senders: () => call('GET', '/senders'),
    domains: () => call('GET', '/senders/domains'),
    events: (messageId) => call('GET', `/smtp/statistics/events?limit=50&sort=desc&messageId=${encodeURIComponent(messageId)}`),
  };
}

// ------------------------------------------------------ Meta WhatsApp Cloud API

// Graph error codes that are worth retrying (throttling / temporary unavailability).
const META_RETRYABLE = new Set([1, 2, 4, 17, 341, 80007, 130429, 131000, 131016, 133004]);

export function createWhatsApp(cfg, fetchImpl = fetch) {
  const base = `https://graph.facebook.com/${cfg.graphVersion}`;
  const call = async (method, path, body) => {
    const { res, data } = await request(fetchImpl, base + path, {
      method,
      body,
      headers: { authorization: `Bearer ${cfg.accessToken}` },
      label: 'WhatsApp Cloud API',
    });
    if (!res.ok || data.error) {
      const e = data.error || {};
      throw new ProviderError(`WhatsApp ${res.status}: ${e.message || res.statusText}${e.code ? ` (code ${e.code})` : ''}`, {
        retryable: res.status === 429 || res.status >= 500 || META_RETRYABLE.has(e.code),
        status: res.status,
        body: { code: e.code, type: e.type, message: e.message, error_data: e.error_data },
      });
    }
    return data;
  };

  return {
    name: 'meta_whatsapp',
    configured: cfg.configured,
    missing: cfg.missing,
    /** Returns { messageId } once Meta has accepted the message (delivery comes via webhook). */
    async sendTemplate({ to, template, language = cfg.templateLanguage, params }) {
      const data = await call('POST', `/${cfg.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: language },
          components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
        },
      });
      const id = data.messages?.[0]?.id;
      if (!id) throw new ProviderError('WhatsApp returned no message id', { retryable: false, body: data });
      return { messageId: id, response: { id, message_status: data.messages[0].message_status ?? null } };
    },
    phoneNumber: () => call('GET', `/${cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,name_status`),
    /** All message templates in the WhatsApp Business Account (name, status, language…). */
    async templates() {
      const out = [];
      let path = `/${cfg.businessAccountId}/message_templates?fields=name,status,language,category,rejected_reason&limit=100`;
      for (let page = 0; path && page < 20; page++) {
        const data = await call('GET', path);
        out.push(...(data.data ?? []));
        const next = data.paging?.next;
        path = next ? next.slice(next.indexOf(`/${cfg.businessAccountId}/`)) : null;
      }
      return out;
    },
    /** Submits a UTILITY template for Meta's review. */
    createTemplate: ({ name, language = cfg.templateLanguage, body, example }) =>
      call('POST', `/${cfg.businessAccountId}/message_templates`, {
        name,
        language,
        category: 'UTILITY',
        components: [{ type: 'BODY', text: body, example: { body_text: [example] } }],
      }),
  };
}

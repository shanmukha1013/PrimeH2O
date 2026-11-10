-- 001: website enquiries, uploaded files and notification tracking (original schema).

CREATE TABLE IF NOT EXISTS enquiries (
  id                    BIGSERIAL PRIMARY KEY,
  public_id             TEXT NOT NULL UNIQUE,              -- e.g. PRM-261107-7KQ3XA
  source                TEXT NOT NULL CHECK (source IN ('contact', 'custom_bottle')),
  client_request_id     UUID UNIQUE,                       -- browser idempotency key
  content_hash          TEXT NOT NULL,                     -- duplicate-content guard
  customer_name         TEXT NOT NULL,
  customer_phone        TEXT NOT NULL,                     -- E.164
  customer_email        TEXT,
  company_name          TEXT,
  bottle_size           TEXT,
  quantity              INTEGER CHECK (quantity IS NULL OR quantity > 0),
  delivery_date         DATE,
  customization         JSONB,
  customer_message      TEXT,
  ip_address            TEXT,
  user_agent            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS enquiries_content_hash_idx ON enquiries (content_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS enquiries_created_at_idx ON enquiries (created_at DESC);

CREATE TABLE IF NOT EXISTS enquiry_files (
  id            BIGSERIAL PRIMARY KEY,
  enquiry_id    BIGINT NOT NULL REFERENCES enquiries (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('logo', 'preview')),
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  data          BYTEA NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enquiry_id, kind)
);

CREATE TABLE IF NOT EXISTS notifications (
  id                   BIGSERIAL PRIMARY KEY,
  enquiry_id           BIGINT NOT NULL REFERENCES enquiries (id) ON DELETE CASCADE,
  kind                 TEXT NOT NULL CHECK (kind IN ('customer_email', 'business_email', 'business_whatsapp')),
  channel              TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  provider             TEXT NOT NULL CHECK (provider IN ('brevo', 'meta_whatsapp')),
  recipient            TEXT NOT NULL,
  -- pending -> sending -> accepted (provider took it) -> sent / delivered / read
  --                    -> retrying (temporary failure) -> ... ; failed / bounced / skipped are final
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
                         ('pending', 'sending', 'retrying', 'accepted', 'sent', 'delivered', 'read',
                          'failed', 'bounced', 'skipped')),
  test_mode            BOOLEAN NOT NULL DEFAULT false,     -- provider sandbox: validated but not delivered
  attempts             INTEGER NOT NULL DEFAULT 0,
  next_attempt_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until         TIMESTAMPTZ,
  provider_message_id  TEXT,
  last_error           TEXT,
  provider_response    JSONB,
  accepted_at          TIMESTAMPTZ,
  delivered_at         TIMESTAMPTZ,
  last_status_check_at TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enquiry_id, kind)                                 -- one notification of each kind per enquiry
);
CREATE INDEX IF NOT EXISTS notifications_due_idx ON notifications (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS notifications_provider_msg_idx ON notifications (provider_message_id);

CREATE TABLE IF NOT EXISTS notification_events (
  id                   BIGSERIAL PRIMARY KEY,
  notification_id      BIGINT REFERENCES notifications (id) ON DELETE CASCADE,
  provider             TEXT NOT NULL,
  event                TEXT NOT NULL,
  provider_message_id  TEXT,
  occurred_at          TIMESTAMPTZ,
  detail               TEXT,
  payload              JSONB,
  received_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_events_dedupe_idx
  ON notification_events (provider, provider_message_id, event, occurred_at);

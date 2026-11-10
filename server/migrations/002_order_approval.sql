-- 002: owner approval workflow.
-- Custom-bottle submissions become orders with a status lifecycle and a complete status
-- history; administrators sign in with their own accounts; and notifications are tracked
-- per (event, audience, channel) so every status change notifies owner and customer by
-- email and WhatsApp independently, exactly once.

-- ------------------------------------------------------------------ administrators
CREATE TABLE admin_users (
  id             BIGSERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  name           TEXT NOT NULL,
  password_hash  TEXT NOT NULL,                              -- scrypt; the password itself is never stored
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at  TIMESTAMPTZ
);

CREATE TABLE admin_sessions (
  id            BIGSERIAL PRIMARY KEY,
  admin_id      BIGINT NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,                        -- sha256 of the cookie value
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address    TEXT,
  user_agent    TEXT
);
CREATE INDEX admin_sessions_expires_idx ON admin_sessions (expires_at);

-- ------------------------------------------------------------------ orders
ALTER TABLE enquiries
  ADD COLUMN order_status TEXT CHECK (order_status IN
    ('PENDING', 'ACCEPTED', 'REJECTED', 'PROCESSING', 'READY_FOR_DISPATCH', 'DISPATCHED', 'DELIVERED', 'CANCELLED')),
  ADD COLUMN status_changed_at    TIMESTAMPTZ,
  ADD COLUMN accepted_at          TIMESTAMPTZ,
  ADD COLUMN rejected_at          TIMESTAMPTZ,
  ADD COLUMN rejection_reason     TEXT,
  ADD COLUMN cancelled_at         TIMESTAMPTZ,
  ADD COLUMN cancellation_reason  TEXT,
  ADD COLUMN customer_whatsapp    TEXT,                       -- E.164 number for WhatsApp updates
  ADD COLUMN whatsapp_opt_in      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN whatsapp_opt_in_at   TIMESTAMPTZ,
  ADD COLUMN whatsapp_opt_in_text TEXT,                       -- exact consent wording the customer agreed to
  ADD COLUMN whatsapp_opt_out_at  TIMESTAMPTZ;

UPDATE enquiries SET order_status = 'PENDING', status_changed_at = created_at WHERE source = 'custom_bottle';

ALTER TABLE enquiries
  ADD CONSTRAINT enquiries_order_status_chk CHECK ((source = 'custom_bottle') = (order_status IS NOT NULL)),
  -- no order can be in an accepted-or-later state without an acceptance timestamp
  ADD CONSTRAINT enquiries_accepted_chk CHECK (
    order_status IS NULL OR order_status NOT IN ('ACCEPTED', 'PROCESSING', 'READY_FOR_DISPATCH', 'DISPATCHED', 'DELIVERED')
    OR accepted_at IS NOT NULL),
  ADD CONSTRAINT enquiries_rejected_chk CHECK (
    order_status IS DISTINCT FROM 'REJECTED' OR (rejected_at IS NOT NULL AND rejection_reason IS NOT NULL)),
  ADD CONSTRAINT enquiries_cancelled_chk CHECK (
    order_status IS DISTINCT FROM 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)),
  ADD CONSTRAINT enquiries_whatsapp_opt_in_chk CHECK (
    NOT whatsapp_opt_in OR (customer_whatsapp IS NOT NULL AND whatsapp_opt_in_at IS NOT NULL));

CREATE INDEX enquiries_order_status_idx ON enquiries (order_status, created_at DESC) WHERE order_status IS NOT NULL;
CREATE INDEX enquiries_customer_whatsapp_idx ON enquiries (customer_whatsapp) WHERE customer_whatsapp IS NOT NULL;

CREATE TABLE order_status_history (
  id              BIGSERIAL PRIMARY KEY,
  enquiry_id      BIGINT NOT NULL REFERENCES enquiries (id) ON DELETE CASCADE,
  from_status     TEXT,                                       -- NULL when the order was created
  to_status       TEXT NOT NULL,
  note            TEXT,                                       -- reason (reject / cancel) or note to the customer
  actor_admin_id  BIGINT REFERENCES admin_users (id) ON DELETE SET NULL,
  actor_label     TEXT NOT NULL,                              -- kept even if the admin account is removed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (to_status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'PROCESSING', 'READY_FOR_DISPATCH', 'DISPATCHED', 'DELIVERED', 'CANCELLED')),
  UNIQUE (enquiry_id, to_status)                              -- each status at most once: no duplicate approvals
);

INSERT INTO order_status_history (enquiry_id, from_status, to_status, actor_label, created_at)
  SELECT id, NULL, 'PENDING', 'Customer (website)', created_at FROM enquiries WHERE source = 'custom_bottle';

-- ------------------------------------------------------------------ notifications
ALTER TABLE notifications
  ADD COLUMN event         TEXT,
  ADD COLUMN audience      TEXT,
  ADD COLUMN history_id    BIGINT REFERENCES order_status_history (id) ON DELETE SET NULL,
  ADD COLUMN template_name TEXT;                              -- WhatsApp template used

UPDATE notifications n
   SET event    = CASE WHEN e.source = 'custom_bottle' THEN 'order_received' ELSE 'enquiry_received' END,
       audience = CASE WHEN n.kind = 'customer_email' THEN 'customer' ELSE 'owner' END
  FROM enquiries e
 WHERE e.id = n.enquiry_id;

UPDATE notifications n SET history_id = h.id
  FROM order_status_history h
 WHERE h.enquiry_id = n.enquiry_id AND h.to_status = 'PENDING' AND n.event = 'order_received';

ALTER TABLE notifications DROP COLUMN kind;                   -- also drops UNIQUE (enquiry_id, kind)

ALTER TABLE notifications
  ALTER COLUMN event SET NOT NULL,
  ALTER COLUMN audience SET NOT NULL,
  ADD CONSTRAINT notifications_event_check CHECK (event IN
    ('enquiry_received', 'order_received', 'order_accepted', 'order_rejected', 'order_processing',
     'order_ready_for_dispatch', 'order_dispatched', 'order_delivered', 'order_cancelled')),
  ADD CONSTRAINT notifications_audience_check CHECK (audience IN ('owner', 'customer')),
  -- exactly one message per order, event, audience and channel: duplicates are impossible
  ADD CONSTRAINT notifications_one_per_channel UNIQUE (enquiry_id, event, audience, channel);

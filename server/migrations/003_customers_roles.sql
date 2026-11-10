-- 003: customers directory, order updated_at, administrator roles.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------ customers
-- One row per person (identified by email + phone). Each order keeps its own snapshot of the
-- details as submitted, so later changes to the customer never rewrite past orders.
CREATE TABLE customers (
  id            BIGSERIAL PRIMARY KEY,
  full_name     TEXT NOT NULL,
  company_name  TEXT,
  phone         TEXT NOT NULL,                                -- E.164
  email         TEXT,
  email_key     TEXT GENERATED ALWAYS AS (COALESCE(lower(email), '')) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customers_identity_key UNIQUE (email_key, phone)
);
CREATE INDEX customers_phone_idx ON customers (phone);
CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- existing enquiries / orders: create their customers (latest details win) and link them
INSERT INTO customers (full_name, company_name, phone, email, created_at)
SELECT DISTINCT ON (COALESCE(lower(customer_email), ''), customer_phone)
       customer_name, company_name, customer_phone, customer_email, created_at
  FROM enquiries
 ORDER BY COALESCE(lower(customer_email), ''), customer_phone, created_at DESC;

ALTER TABLE enquiries ADD COLUMN customer_id BIGINT REFERENCES customers (id) ON DELETE RESTRICT;
UPDATE enquiries e SET customer_id = c.id
  FROM customers c
 WHERE c.email_key = COALESCE(lower(e.customer_email), '') AND c.phone = e.customer_phone;
ALTER TABLE enquiries ALTER COLUMN customer_id SET NOT NULL;
CREATE INDEX enquiries_customer_idx ON enquiries (customer_id, created_at DESC);

-- ------------------------------------------------------------------ orders: updated_at
ALTER TABLE enquiries ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE enquiries SET updated_at = COALESCE(status_changed_at, created_at);
CREATE TRIGGER enquiries_set_updated_at BEFORE UPDATE ON enquiries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------ administrator roles
-- admin: full access (approve, reject, change status, retry notifications); viewer: read-only.
ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'viewer'));
CREATE TRIGGER admin_users_set_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

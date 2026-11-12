-- 004: online product orders. Customers order one or more PRIME H₂O sizes in a single order,
-- with a delivery address. Prices are configured by the owner in the admin dashboard (none are
-- set here); each order line keeps the price that applied when the order was placed.

-- ------------------------------------------------------------------ products & prices
CREATE TABLE products (
  code              TEXT PRIMARY KEY CHECK (code ~ '^[a-z0-9-]+$'),
  name              TEXT NOT NULL,
  bottle_size       TEXT NOT NULL UNIQUE,
  unit_price_paise  BIGINT CHECK (unit_price_paise IS NULL OR unit_price_paise > 0),  -- per bottle; NULL = not configured
  active            BOOLEAN NOT NULL DEFAULT true,
  sort_order        SMALLINT NOT NULL DEFAULT 0,
  price_updated_at  TIMESTAMPTZ,
  price_updated_by  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO products (code, name, bottle_size, sort_order) VALUES
  ('prime-250', 'PRIME H₂O 250 mL', '250 mL', 1),
  ('prime-500', 'PRIME H₂O 500 mL', '500 mL', 2),
  ('prime-1000', 'PRIME H₂O 1000 mL', '1000 mL', 3);

-- ------------------------------------------------------------------ orders: new type, delivery address, total
ALTER TABLE enquiries DROP CONSTRAINT enquiries_source_check;
ALTER TABLE enquiries ADD CONSTRAINT enquiries_source_check CHECK (source IN ('contact', 'custom_bottle', 'product_order'));

ALTER TABLE enquiries DROP CONSTRAINT enquiries_order_status_chk;
ALTER TABLE enquiries ADD CONSTRAINT enquiries_order_status_chk
  CHECK ((source IN ('custom_bottle', 'product_order')) = (order_status IS NOT NULL));

ALTER TABLE enquiries
  ADD COLUMN delivery_address   TEXT,
  ADD COLUMN delivery_city      TEXT,
  ADD COLUMN delivery_state     TEXT,
  ADD COLUMN delivery_pin_code  TEXT CHECK (delivery_pin_code IS NULL OR delivery_pin_code ~ '^[1-9][0-9]{5}$'),
  ADD COLUMN total_paise        BIGINT CHECK (total_paise IS NULL OR total_paise > 0);  -- NULL = a price was not configured

ALTER TABLE enquiries ADD CONSTRAINT enquiries_delivery_chk CHECK (
  source <> 'product_order'
  OR (delivery_address IS NOT NULL AND delivery_city IS NOT NULL AND delivery_state IS NOT NULL AND delivery_pin_code IS NOT NULL));

-- ------------------------------------------------------------------ order lines
CREATE TABLE order_items (
  id                BIGSERIAL PRIMARY KEY,
  enquiry_id        BIGINT NOT NULL REFERENCES enquiries (id) ON DELETE CASCADE,
  position          SMALLINT NOT NULL,
  product_code      TEXT NOT NULL REFERENCES products (code) ON UPDATE CASCADE,
  product_name      TEXT NOT NULL,                              -- as it was when ordered
  bottle_size       TEXT NOT NULL,
  quantity          INTEGER NOT NULL CHECK (quantity > 0),      -- bottles
  unit_price_paise  BIGINT CHECK (unit_price_paise IS NULL OR unit_price_paise > 0),
  line_total_paise  BIGINT,
  CHECK ((unit_price_paise IS NULL) = (line_total_paise IS NULL)),
  CHECK (line_total_paise IS NULL OR line_total_paise = unit_price_paise * quantity),
  UNIQUE (enquiry_id, product_code),
  UNIQUE (enquiry_id, position)
);
CREATE INDEX order_items_enquiry_idx ON order_items (enquiry_id);

-- ------------------------------------------------------------------ customers: latest contact + address
-- Each order keeps its own snapshot of the delivery address; these hold the customer's latest details.
ALTER TABLE customers
  ADD COLUMN whatsapp  TEXT,                                    -- E.164
  ADD COLUMN address   TEXT,
  ADD COLUMN city      TEXT,
  ADD COLUMN state     TEXT,
  ADD COLUMN pin_code  TEXT;

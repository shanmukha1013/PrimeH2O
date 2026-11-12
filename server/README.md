# PRIME H₂O backend

Node.js (Express 5) + PostgreSQL backend for the PRIME H₂O website. It handles:

- **online orders**: one or more PRIME H₂O sizes (250 / 500 / 1000 mL) with a delivery address, priced from owner-configured prices, with owner approval
- customer **orders** (custom-label bottles), with owner approval
- **enquiries** from the Contact form
- the owner's **admin dashboard** at `/admin`, plus an admin API
- **notifications** by email (Brevo) and WhatsApp (Meta WhatsApp Business Cloud API)

No external service is needed to develop or run the tests. Without credentials, notifications are recorded as **not sent** together with the reason. They are never reported as sent.

## How an order flows

1. **Website.** The custom bottle form posts to `POST /api/orders`. The server validates the order, then saves the customer and the order in one transaction. The order gets an ID like `PRM-261107-7KQ3XA` and status **PENDING**.
2. **Notifications are queued in the same transaction.** Four messages are queued: the owner by email and WhatsApp (full order details), and the customer by email and WhatsApp (an acknowledgement that the request is *pending approval*). Customer WhatsApp is only sent with explicit opt-in.
3. **Delivery.** The server tries to send right away, and a background worker retries temporary failures (30 s → 2 h, up to 6 attempts). A failing, slow or crashing provider can never undo a saved order. If queuing itself fails, a sweep queues the missing notifications on the next worker run.
4. **Owner decision.** The owner **accepts** or **rejects** (a reason is required) in `/admin` or through the API. Only signed-in administrators with the `admin` role can do this, and nothing in the code accepts an order automatically.
5. **Every later status notifies owner and customer on both channels:** Accepted (the official confirmation), Rejected (with the reason), Processing, Ready for dispatch, Dispatched, Delivered, and Cancelled (with the reason).

```
PENDING ──► ACCEPTED ──► PROCESSING ──► READY_FOR_DISPATCH ──► DISPATCHED ──► DELIVERED
   │            │              │                  │
   ├─► REJECTED └──────────────┴──────────────────┴─► CANCELLED
   └─► CANCELLED
```

**Guarantees, enforced in the database as well as the code:**
- A status can be reached only once per order.
- There is one notification per (order, event, audience, channel), so nothing is ever sent twice.
- An accepted-or-later status always has an acceptance timestamp.
- A rejected or cancelled order always has a reason.

Delivery status only moves forward and comes from the provider: Brevo events and webhook, Meta status webhook. "Accepted by provider" is not shown as "delivered".

## Run it locally (₹0)

Requires Node 20+ (tested on Node 24) and PostgreSQL 14+ (tested on 16).

```bash
npm install
# PostgreSQL in Docker (once):
docker run -d --name primeh2o-postgres -e POSTGRES_USER=prime -e POSTGRES_PASSWORD=<choose one> \
  -e POSTGRES_DB=primeh2o -p 127.0.0.1:5433:5432 -v primeh2o-pgdata:/var/lib/postgresql/data postgres:16
cp server/.env.example server/.env        # then fill DATABASE_URL, BREVO_*, JWT_SECRET_KEY…
npm run admin:create -- you@example.com "Your Name"   # asks for a password (min 12 characters)

npm run server        # API on http://127.0.0.1:8787 (applies database migrations at start)
npm run dev           # website on http://localhost:3000, /api is proxied to the server
                      # dashboard: http://localhost:3000/admin
```

Single process, as in production: `npm run build && npm start`. This serves the website, `/admin` and the API on `PORT`.

Useful commands:

| Command | What it does |
| --- | --- |
| `npm run verify:services` | Read-only check of the database, admin setup, Brevo account/sender and WhatsApp number/templates. Sends nothing. |
| `npm run test:server` | All backend tests. They use a separate test database and fake providers, so no message is ever sent. |
| `npm run admin:create -- email "Name"` | Create an administrator or reset a password. Add `--role viewer` for read-only, or `--disable email` to block an account. |
| `npm run admin:hash` | Print a password hash for `ADMIN_PASSWORD_HASH`. |
| `npm run whatsapp:templates` | Show the approval status of the 11 WhatsApp templates. `-- --print` shows their text; `-- --create` submits them to Meta. |

## Configuration

All settings come from environment variables (or `server/.env`, which is git-ignored). See [`.env.example`](.env.example).

- **Required:** `DATABASE_URL`.
- **For sending:** `BREVO_*` for email, and `WHATSAPP_*` plus `META_APP_SECRET` for WhatsApp.
- **Older names still work:** `WHATSAPP_NOTIFY_TO` (now `WHATSAPP_OWNER_NUMBER`) and `WHATSAPP_APP_SECRET` (now `META_APP_SECRET`).
- **Secrets are never logged and never sent to the browser.**

## API

Public (rate-limited per IP; CORS only for `FRONTEND_URL` / `ALLOWED_ORIGINS`):

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | Database and provider configuration status. |
| GET | `/api/products` | The sizes on sale: `{ products: [{ code, name, size, unitPricePaise }] }`. `unitPricePaise` is `null` until the owner sets a price. Not cached. |
| POST | `/api/product-orders` | Online order (see below). Returns `201 { orderId, orderStatus: "PENDING", customerEmail, customerWhatsApp, teamNotified, order }`, where `order` is the saved order with server-side prices. Duplicates behave as for `/api/orders`. |
| POST | `/api/orders` | Custom bottle order. Returns `201 { orderId, orderStatus: "PENDING", customerEmail, customerWhatsApp, teamNotified }`. Same `clientRequestId` or identical content within 15 minutes → `200` with the same order (`duplicate: true`). |
| POST | `/api/enquiries` | Contact-form enquiry (`source: "contact"`). Still accepts `source: "custom_bottle"` for compatibility. |
| GET/POST | `/api/webhooks/whatsapp` | Meta verification handshake; delivery statuses and STOP/START replies. Signature-checked with `META_APP_SECRET`. |
| POST | `/api/webhooks/brevo?token=…` | Brevo delivery events (token-checked). |

Order body (`POST /api/orders`):

```json
{
  "clientRequestId": "uuid (idempotency key, optional)",
  "name": "Anita Rao", "phone": "+91 90000 11111", "email": "anita@example.com", "company": "optional",
  "bottleSize": "250 mL | 500 mL | 1000 mL", "quantity": 300, "deliveryDate": "2026-12-01 (optional)",
  "message": "delivery requirements (optional)",
  "whatsappOptIn": true, "whatsapp": "optional, defaults to phone",
  "customization": { "labelName": "required", "template": "", "colour": "", "tagline": "", "layout": "", "font": "", "textSize": "", "position": "", "details": "" },
  "logo": { "filename": "logo.png", "contentType": "image/png", "data": "<base64, ≤ 8 MB>" },
  "preview": { "filename": "preview.png", "contentType": "image/png", "data": "<base64, ≤ 6 MB>" }
}
```

Online order body (`POST /api/product-orders`). Prices and totals are never accepted from the browser:

```json
{
  "clientRequestId": "uuid (idempotency key, optional)",
  "name": "Lakshmi Devi", "phone": "98765 43210 (a mobile number)", "whatsapp": "optional, blank = same as phone",
  "email": "optional",
  "address": "Flat 12, Sai Residency, Road No. 3, Nagole", "city": "Hyderabad", "state": "Telangana", "pinCode": "500068",
  "items": [{ "product": "prime-500", "quantity": 24 }, { "product": "prime-1000", "quantity": 12 }],
  "instructions": "optional, ≤ 1000 characters",
  "whatsappOptIn": true
}
```

Products are `prime-250`, `prime-500` and `prime-1000`; each size at most once, 1 to 100,000 bottles. `state` must be an Indian state or union territory. The total is set only when every ordered size has a price.

Validation errors return `422 { error, fields: { field: message } }`.

Admin. Use **either** the dashboard's HttpOnly session cookie (state changes also need the header `X-Prime-Admin: 1`) **or** `Authorization: Bearer <token>`:

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| POST | `/api/admin/login` | — | `{ email, password }` + header `X-Prime-Admin: 1` → sets the cookie and returns `{ admin, token, tokenType: "Bearer", expiresAt }`. Throttled. |
| POST | `/api/admin/logout` | any | Revokes the session (the cookie and its JWT). |
| GET | `/api/admin/me` | any | `{ admin: { name, email, role } }` |
| GET | `/api/admin/orders?status=&q=&limit=&before=` | any | Orders plus counts per status. |
| GET | `/api/admin/orders/{orderId}` | any | Customer, order, label, files, status history, every notification and its delivery events. |
| POST | `/api/admin/orders/{orderId}/accept` | admin | `{ note? }`: next steps for the customer. |
| POST | `/api/admin/orders/{orderId}/reject` | admin | `{ reason }`: required, sent to the customer. |
| PATCH | `/api/admin/orders/{orderId}/status` | admin | `{ status, note? \| reason?, expectedFrom? }`. A reason is required for `CANCELLED`. |
| POST | `/api/admin/notifications/{id}/retry` | admin | Retry a failed or skipped message. Messages the provider already accepted are never re-sent. |
| GET | `/api/admin/enquiries?type=&status=&q=` | any | Dashboard list. `type`: `order` (both kinds), `product_order`, `custom_bottle`, `enquiry` or `all`. `q` matches the order ID, name, email, company, and phone or WhatsApp number however it is typed. |
| GET | `/api/admin/products` | any | Products with their price and who last changed it. |
| PUT | `/api/admin/products/{code}/price` | admin | `{ unitPrice: "12.50" \| 12.5 \| null }`: rupees per bottle (₹0.01 to ₹1,00,000), or `null` to remove the price. Applies to new orders only. |

Repeating a decision (for example accepting twice) returns `409` and sends nothing. Invalid jumps (for example PENDING → DISPATCHED) also return `409`.

JWTs are HS256 with issuer `prime-h2o` and audience `prime-h2o-admin`, signed with `JWT_SECRET_KEY`. Each one is tied to a server-side session, so signing out or disabling an account revokes it immediately. The role is always read from the database.

## Frontend integration (already wired)

| Website piece | Calls |
| --- | --- |
| Online order form (`src/components/ProductOrder.tsx`, section `#order`) | `fetchProducts()` → `GET /api/products`, then `submitProductOrder()` → `POST /api/product-orders`. Shows the confirmation from the saved order. If the API cannot be reached it offers WhatsApp and phone ordering instead of a broken form. |
| Custom bottle form (`src/components/LabelStudio.tsx`) | `submitOrder()` → `POST /api/orders`. Sends name, company, phone, email, bottle size, quantity, delivery date, instructions, label design, logo, preview and the WhatsApp opt-in checkbox (unticked by default) with an optional WhatsApp number. |
| Contact form (`src/components/ContactSection.tsx`) | `submitEnquiry()` → `POST /api/enquiries` |
| Admin dashboard (`admin.html`, `src/admin/`) | `/api/admin/*` with the session cookie |

Same origin by default. If the website is hosted on a different domain from the API, set `VITE_API_BASE` when building the website and `FRONTEND_URL` on the server.

## Data model

Migrations live in [`migrations/`](migrations/) and are applied automatically at start, in order, once each.

| Table | Purpose |
| --- | --- |
| `customers` | One per email + phone: name, company, phone, email, WhatsApp number, latest address / city / state / PIN code, timestamps. |
| `enquiries` | Online orders (`source = product_order`), custom bottle orders (`custom_bottle`) and Contact enquiries (`contact`). Holds the order ID, `customer_id`, size, quantity, delivery date, customization (JSON), the delivery address of online orders, `total_paise` (null until every size had a price), WhatsApp number, opt-in and its consent text, `order_status`, accepted/rejected/cancelled timestamps and reasons, `created_at` and `updated_at`. |
| `order_items` | The lines of an online order: product, size, quantity, and the price per bottle and line total when it was placed (null when no price was set). |
| `products` | The three sizes, whether they can be ordered, the price per bottle in paise (null = not set) and who last changed it. |
| `enquiry_files` | Uploaded logo and label preview (validated by type and content, size-limited). |
| `order_status_history` | Previous status, new status, who changed it, when, and the note or reason. |
| `notifications` | One row per order + event + owner/customer + email/WhatsApp. Holds status, test mode, attempts, provider message ID, last error and timestamps. |
| `notification_events` | Raw provider delivery events (delivered, read, bounced…) and manual retries. |
| `admin_users`, `admin_sessions` | scrypt password hashes, role (`admin` / `viewer`), active flag, revocable sessions. |

## WhatsApp messages for online orders

Business-initiated WhatsApp messages must use templates approved by Meta (category UTILITY). Online orders use two templates of their own, and status updates use the shared ones:

| Template | Sent to | When | Content |
| --- | --- | --- | --- |
| `prime_product_order_new` | the company (`PRIME_H2O_BUSINESS_WHATSAPP`) | order placed | Order ID, date and time, status, customer name, mobile, WhatsApp (and whether they agreed to updates), email, every size × bottles with price and amount when set, total, full delivery address, instructions |
| `prime_product_order_received` | the customer, only with consent | order placed | Order ID, name, every size × bottles with prices when set, total, delivery address, "Received — Awaiting Confirmation", contact number |
| `prime_order_accepted`, `prime_order_processing`, `prime_order_ready`, `prime_order_dispatched`, `prime_order_delivered`, `prime_order_cancelled`, `prime_order_rejected` | the customer, only with consent | the owner changes the status | as for custom bottle orders; the confirmation lists the ordered sizes |
| `prime_order_update_owner` | the company | every status change | order ID, customer, new status, who changed it, note |

Every message is also sent by email when the customer gave an address, and the owner always gets an email with the full order. A filled-in WhatsApp message is kept within Meta's 1,024-character limit by shortening only the longest free-text values (address, instructions), never the order ID. The owner email always carries the full text.

To switch WhatsApp on:

1. A permanent **System User access token** (`WHATSAPP_ACCESS_TOKEN`) with `whatsapp_business_messaging` and `whatsapp_business_management`. Temporary tokens from the developer dashboard expire after about a day.
2. `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_BUSINESS_ACCOUNT_ID` of the registered **sender** number, and `PRIME_H2O_BUSINESS_WHATSAPP`, the company number that receives order alerts. The two numbers must be different.
3. `npm run whatsapp:templates` lists which templates exist and are approved. `npm run whatsapp:templates -- --create` submits the missing ones for Meta's review. Until a template is approved, its messages are recorded as **failed** with Meta's reason, and can be retried from the dashboard afterwards.
4. For delivery receipts (sent / delivered / read) and STOP replies: `META_APP_SECRET` and `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, with the Meta webhook pointed at `https://<your-domain>/api/webhooks/whatsapp` and subscribed to `messages`. Without it, messages stay at "Accepted by provider" and are never shown as delivered.

`npm run verify:services` checks all of this without sending anything.

## Privacy and data retention

- **What is stored.** For online orders: name, mobile number, WhatsApp number, email (optional), delivery address, the order lines, instructions, WhatsApp consent with its exact wording and time, and the submitting IP address and browser (kept for abuse investigation). The customer directory keeps the latest contact details and address.
- **Who can see it.** Only signed-in administrators, through `/api/admin/*` (viewers read-only). Public endpoints return only the product list, and the order just submitted back to the browser that submitted it.
- **Sharing.** Order messages pass through Brevo (email) and Meta (WhatsApp) to reach the customer and the company. Nothing else is shared.
- **Logs.** Server logs identify orders by their order ID and administrators by their email (for the audit trail). Customer names, phone numbers, emails and addresses are not written to the logs; error messages from Brevo and Meta are logged as they are returned.
- **Consent.** WhatsApp messages go to the customer only when they ticked the opt-in. Replying STOP opts them out; START opts them back in.
- **Retention.** Nothing is deleted automatically. Decide how long the business keeps order records (accounting and tax rules may require a minimum), then remove older ones in the database. Deleting an order also deletes its lines, files, status history and notifications. For example, completed orders and enquiries older than three years:

  ```sql
  DELETE FROM enquiries
   WHERE created_at < now() - interval '3 years'
     AND (order_status IN ('DELIVERED', 'REJECTED', 'CANCELLED') OR source = 'contact');
  DELETE FROM customers c WHERE NOT EXISTS (SELECT 1 FROM enquiries e WHERE e.customer_id = c.id);
  ```

## Going live later (not done; costs nothing until you choose to)

- **Hosting.** [`render.yaml`](../render.yaml) describes a Render web service on the free plan, and Neon's free plan can host PostgreSQL. Use Neon's **direct** connection string with `DATABASE_SSL=true`, and set `TRUST_PROXY=true` and `APP_ENV=production` on Render.
- **Render free plan caveat.** Free Render services sleep when idle, so retries pause until the next request wakes the server.
- **Email.** Set `BREVO_SANDBOX=false` only after sending a test to an address you control. Authenticate your own domain in Brevo, because emails sent from a Gmail address often land in spam.
- **WhatsApp.**
  1. Register a sender number (it must not be the owner's number).
  2. Add the `WHATSAPP_*` values.
  3. Run `npm run whatsapp:templates -- --create` and wait for Meta's approval.
  4. Point the Meta webhook at `/api/webhooks/whatsapp`, subscribed to `messages`.

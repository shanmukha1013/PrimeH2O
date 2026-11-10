# PRIME H₂O backend

Node.js (Express 5) + PostgreSQL backend for the PRIME H₂O website. It handles:

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

Repeating a decision (for example accepting twice) returns `409` and sends nothing. Invalid jumps (for example PENDING → DISPATCHED) also return `409`.

JWTs are HS256 with issuer `prime-h2o` and audience `prime-h2o-admin`, signed with `JWT_SECRET_KEY`. Each one is tied to a server-side session, so signing out or disabling an account revokes it immediately. The role is always read from the database.

## Frontend integration (already wired)

| Website piece | Calls |
| --- | --- |
| Custom bottle form (`src/components/LabelStudio.tsx`) | `submitOrder()` → `POST /api/orders`. Sends name, company, phone, email, bottle size, quantity, delivery date, instructions, label design, logo, preview and the WhatsApp opt-in checkbox (unticked by default) with an optional WhatsApp number. |
| Contact form (`src/components/ContactSection.tsx`) | `submitEnquiry()` → `POST /api/enquiries` |
| Admin dashboard (`admin.html`, `src/admin/`) | `/api/admin/*` with the session cookie |

Same origin by default. If the website is hosted on a different domain from the API, set `VITE_API_BASE` when building the website and `FRONTEND_URL` on the server.

## Data model

Migrations live in [`migrations/`](migrations/) and are applied automatically at start, in order, once each.

| Table | Purpose |
| --- | --- |
| `customers` | One per email + phone: name, company, phone, email, timestamps. |
| `enquiries` | Orders (`source = custom_bottle`) and Contact enquiries. Holds the order ID, `customer_id`, size, quantity, delivery date, customization (JSON), WhatsApp opt-in and its consent text, `order_status`, accepted/rejected/cancelled timestamps and reasons, `created_at` and `updated_at`. |
| `enquiry_files` | Uploaded logo and label preview (validated by type and content, size-limited). |
| `order_status_history` | Previous status, new status, who changed it, when, and the note or reason. |
| `notifications` | One row per order + event + owner/customer + email/WhatsApp. Holds status, test mode, attempts, provider message ID, last error and timestamps. |
| `notification_events` | Raw provider delivery events (delivered, read, bounced…) and manual retries. |
| `admin_users`, `admin_sessions` | scrypt password hashes, role (`admin` / `viewer`), active flag, revocable sessions. |

## Going live later (not done; costs nothing until you choose to)

- **Hosting.** [`render.yaml`](../render.yaml) describes a Render web service on the free plan, and Neon's free plan can host PostgreSQL. Use Neon's **direct** connection string with `DATABASE_SSL=true`, and set `TRUST_PROXY=true` and `APP_ENV=production` on Render.
- **Render free plan caveat.** Free Render services sleep when idle, so retries pause until the next request wakes the server.
- **Email.** Set `BREVO_SANDBOX=false` only after sending a test to an address you control. Authenticate your own domain in Brevo, because emails sent from a Gmail address often land in spam.
- **WhatsApp.**
  1. Register a sender number (it must not be the owner's number).
  2. Add the `WHATSAPP_*` values.
  3. Run `npm run whatsapp:templates -- --create` and wait for Meta's approval.
  4. Point the Meta webhook at `/api/webhooks/whatsapp`, subscribed to `messages`.

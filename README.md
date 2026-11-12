# PrimeH2O

Website for **PRIME H₂O** packaged drinking water ("I Trust PRIME"). It has a product showcase, **online ordering** (any mix of 250 / 500 / 1000 mL bottles with a delivery address, WhatsApp and email confirmations), a custom-label bottle studio with order requests, a contact form, and an admin dashboard where the owner confirms orders, updates their status and sets prices.

## Tech stack

| Part | Technology |
| --- | --- |
| Website | React 18, TypeScript, Vite 6, Tailwind CSS 3, Framer Motion, lucide-react |
| Admin dashboard | Separate Vite entry (`admin.html` → `src/admin/`), served at `/admin` |
| Backend API | Node.js, Express 5, PostgreSQL (`pg`), JWT and session-cookie admin auth |
| Notifications | Brevo (email) and Meta WhatsApp Business Cloud API |

## Project structure

```
index.html, admin.html     Vite entry pages (website, admin dashboard)
src/                       React app
  components/              Hero, BrandIntro, ProductCollection, LabelStudio, WhyPrime,
                           OurPromise, ContactSection, LocationOrder, Footer, modals
  admin/                   Order dashboard (AdminApp, API client)
  lib/                     Business data, label renderer, enquiry/order API client
public/                    Static assets: product images, hero ads, logos, favicons, catalogue PDF
server/                    Express API, migrations, notification worker, tests (see server/README.md)
api/                       Vercel serverless entry that wraps the Express API
extracted_images/          Source images extracted from the catalogue
shots/, *.png (root)       Design / QA screenshots
capture_all.js             Screenshot helper (puppeteer-core + local Chrome)
generate_favicons.py       Favicon generator (Pillow)
render.yaml                Optional Render blueprint (single Node service)
vercel.json                Vercel build, routing and function settings
```

## Local development

Requirements: Node.js 20.12+ (22 recommended) and PostgreSQL for the API.

```bash
npm install
cp server/.env.example server/.env   # fill in DATABASE_URL and the other values you need
npm run server:dev                   # API on http://127.0.0.1:8787
npm run dev                          # website on http://localhost:3000 (proxies /api to the server)
```

The admin dashboard runs at `http://localhost:3000/admin`. Create the first administrator with `npm run admin:create -- you@example.com "Your Name"`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check and build the website and admin dashboard into `dist/` |
| `npm run preview` | Preview the production build |
| `npm start` | Run the API and serve `dist/` from one Node process |
| `npm run test:server` | Backend tests (Node test runner) |
| `npm run verify:services` | Check the configured database, email and WhatsApp |
| `npm run admin:create` / `admin:hash` | Create an administrator / print a password hash |
| `npm run whatsapp:templates` | List or submit WhatsApp message templates |

## Environment variables

Every server setting is documented in [`server/.env.example`](server/.env.example). Real values belong in `server/.env` locally (git-ignored) or in your hosting provider's environment settings. Never commit them.

The website itself needs no secrets. `VITE_API_BASE` is optional and only needed if the API is hosted on a different domain from the website.

## Deployment (Vercel)

`vercel.json` builds the site with the Vite preset (`npm run build` → `dist/`). It routes `/api/*` to the Express API, which runs as a serverless function (`api/index.js`), and serves the dashboard at `/admin`.

Production environment variables to set in Vercel (Project → Settings → Environment Variables):

- **Required for the API:** `DATABASE_URL` (hosted PostgreSQL, such as Neon), `DATABASE_SSL=true`, `APP_ENV=production`, `TRUST_PROXY=true`, `JWT_SECRET_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`
- **Email:** `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_SANDBOX`, `BREVO_WEBHOOK_TOKEN`, `BUSINESS_EMAIL`
- **WhatsApp:** `WHATSAPP_ACCESS_TOKEN` (permanent System User token), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `PRIME_H2O_BUSINESS_WHATSAPP` (company number for order alerts), `WHATSAPP_API_VERSION`, `META_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. See [server/README.md](server/README.md#whatsapp-messages-for-online-orders) for the templates Meta must approve.
- **Links:** `FRONTEND_URL` / `PUBLIC_SITE_URL` set to the live site address

Serverless limits to be aware of:

- Requests are limited to 4.5 MB, so orders with a very large logo upload may be rejected on Vercel.
- The background retry worker does not run between requests. First send attempts happen during each request.

`render.yaml` remains available if you prefer to run the API as a single long-running Node service with the worker.

See [`server/README.md`](server/README.md) for the order flow, API reference, data model and notification details.

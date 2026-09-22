# 🛍 Telegram Marketplace Bot

A complete merchant marketplace that runs **inside Telegram** — buyers browse
products, shop from multiple sellers in one cart, place orders, and sellers
manage their own shop. An admin approves sellers and products.

Built with:

- **Node.js** + [Telegraf](https://telegraf.js.org/) (Telegram Bot framework)
- **Prisma ORM** + **SQLite** (simple, zero-setup database — no server to install)
- **Express** (tiny HTTP health endpoint / webhook server)

---

## ✨ What it does

| Role | What they can do |
|------|------------------|
| 👤 Buyer | Browse / search products, filter by category & shop, add to cart, checkout (multi-seller orders split automatically), track orders, cancel own pending orders |
| 🏪 Seller | Register a shop (admin approves), publish products with photos & prices, set stock, edit/deactivate products, update order status (confirmed → processing → ready → delivered) |
| ⚙️ Admin | Approve/reject seller applications & products, hide/activate products, cancel orders, manage categories, suspend/activate sellers, view stats |
| 🛡️ System | RBAC (buyer/seller/admin), approval workflow, stock guard in a DB transaction, price snapshots, full order history, audit log, low-stock alerts, structured logging |

Product states: `PENDING → APPROVED | REJECTED`, plus `SOLD_OUT` (auto) and
`INACTIVE`. Order states: `PENDING → CONFIRMED → PROCESSING → READY → DELIVERED`
(or `CANCELLED`).

---

## 🚀 Getting started (first run)

> Total time: ~10 minutes. You only need a Telegram account and a computer.

### 1. Install Node.js

Download and install Node.js **v20 or newer** (LTS recommended) from
<https://nodejs.org>. Verify it works:

```bash
node --version   # v20.x or higher
npm --version
```

### 2. Create a bot with @BotFather

1. Open Telegram, search for **@BotFather** (the blue checkmark).
2. Send `/newbot`, pick a name (e.g. `My Marketplace`) and a username
   (must end in `bot`, e.g. `my_marketplace_bot`).
3. BotFather replies with an **HTTP API token** that looks like:
   `123456789:AAEb...`. Copy it — this is your `BOT_TOKEN`.

### 3. Get your Telegram user id (for admin)

Open Telegram, search for **@userinfobot**, press **Start**. It replies with
your numeric **id** (e.g. `123456789`). This becomes `ADMIN_TELEGRAM_ID`.

### 4. Install and configure the project

Open a terminal in this folder and install dependencies:

```bash
npm install
```

> No postinstall scripts are used by Prisma in this repo, but if npm ever
> asks you to approve scripts, run: `npm approve-scripts prisma @prisma/client @prisma/engines`

Create your personal config file from the template:

```bash
cp .env.example .env
```

Then edit `.env` and fill in only these two lines:

```env
BOT_TOKEN=123456789:AAEb...          # your BotFather token
ADMIN_TELEGRAM_ID=123456789          # your id from @userinfobot
```

Leave everything else as-is for a first run.

### 5. Create the database and seed demo data

```bash
npx prisma db push        # creates SQLite db + tables from the schema
npx prisma generate       # generates the Prisma client
npm run db:seed           # inserts categories + two demo shops/products
```

`npm run db:seed` can be run again any time — it never duplicates data.

### 6. Run the bot

```bash
npm start
```

You should now see logs like `Polling updates...`. Open Telegram, find your
bot by its username, press **Start** (or send `/start`) and use the menu.

- The **two demo sellers** (`Gadget Shop`, `Hair & Beauty`) have approved
  products so you can buy immediately.
- Your Telegram id is the **admin**, so you'll also see an **⚙️ Admin Panel**
  button in the main menu. Play with approve/reject in a second chat if you
  register another seller there.

> ⚠️ The bot talks to Telegram over the internet. If it can't connect
> (offline / strict firewall), it will log a network error — that's normal,
> nothing is broken.

---

## 🌐 Optional: Webhooks vs polling

By default (`WEBHOOK_DOMAIN=` empty) the bot uses **long polling** — it asks
Telegram "any new messages?" on a loop. Polling is easiest and works
everywhere with no extra setup.

A **webhook** is when Telegram pushes updates to a public URL. This is
recommended for production. Using [ngrok](https://ngrok.com) makes your
localhost reachable:

```bash
npx ngrok http 3000          # or: ngrok http 3000
```

ngrok prints a public URL, e.g. `https://abc123.ngrok-free.app`. Then:

```bash
# stop the bot (Ctrl+C), set the domain in .env
WEBHOOK_DOMAIN=https://abc123.ngrok-free.app
```

```bash
npm run webhook:set          # one-time: tells Telegram where to send updates
npm start
```

The bot now runs in webhook mode. The Express server also serves a
`/health` endpoint you can open in a browser to confirm it's alive.

> Note: ngrok free URLs change on every restart — re-run `npm run webhook:set`
> each time the URL changes.

---

## 🧪 Testing

The project ships with two automated test suites (they use a throwaway
database and never touch your real data):

```bash
npm run smoke     # 36 backend/service tests (stock guard, checkout splits, RBAC, …)
npm run e2e       # 23 full bot tests that click real buttons end-to-end
```

Both create a temp DB, run, then delete it. Zero config needed.

---

## 🗂 Project structure

```
prisma/schema.prisma      # database schema/models
src/
  bot.js                  # creates the Telegraf bot + global safety net
  server.js               # starts polling or webhook server
  config/env.js           # all environment settings in one place
  database/prisma.js      # Prisma client singleton
  database/seed.js        # demo categories, sellers, products
  states/session.js       # in-memory conversation state (30 min TTL)
  middleware/auth.js      # attachUser / requireUser / requireSeller / requireAdmin
  keyboards/              # every button the bot can render
  handlers/               # Telegram update handlers (start, buyer, seller, admin…)
    router.js             # ALL callback actions + dead-button fallback
    text.js               # multi-step flows (checkout, add product, register…)
  services/               # business logic ONLY (no Telegram code)
  utils/                  # formatters, validation, errors, logger
scripts/set-webhook.js    # manual webhook setter
tests/                    # smoke + e2e test suites
```

**Design rule:** the `handlers/` folder is a thin Telegram UI layer. All
business rules live in `services/` so they can be tested without Telegram.

---

## ⚙️ Configuration reference (`.env`)

| Variable | Default | Meaning |
|----------|---------|---------|
| `BOT_TOKEN` | — | BotFather token (required) |
| `ADMIN_TELEGRAM_ID` | — | One or more user ids, comma-separated |
| `PORT` | `3000` | Webhook/health HTTP port |
| `WEBHOOK_DOMAIN` | *(empty)* | Empty = polling, set = webhook mode |
| `DATABASE_URL` | `file:./dev.db` | SQLite file |
| `CURRENCY` | `ETB` | Default currency label |
| `LOW_STOCK_THRESHOLD` | `3` | Low-stock warning level |
| `PAGE_SIZE` | `5` | Paginated list size |

---

## 🔧 Troubleshooting

**`BOT_TOKEN is not configured` at startup** — `.env` still has the template
value, or `.env` is missing. Fill in your real token (step 4).

**`401: Unauthorized` on start** — the token is wrong or copied with spaces.
Regenerate a token with @BotFather and retry.

**Buttons show nothing / "Not modified" noise in logs** — you pressed a button
twice; that's expected and harmless.

**"You are not an approved seller yet"** — sellers must be approved by an
admin (role assigned in the DB). Register via "Become a Seller", then approve
from the Admin Panel → Applications.

**I want to start over** — delete `prisma/dev.db` and re-run
`npx prisma db push && npm run db:seed`.

---

Made with ❤️ for Telegram commerce.
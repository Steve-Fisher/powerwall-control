# Powerwall Control

A personal Android app for choosing the **half-hour slots in which a Tesla Powerwall charges from the grid**, for example tomorrow's cheapest Octopus Agile slots.

You pick the slots for a date and tap **Apply**. The app calls the Tesla Fleet API directly from the phone. There is **no backend, no cloud functions and no always-on scheduler**. After the settings are applied, the Powerwall runs the schedule on its own, and the phone can be off.

> Not affiliated with or endorsed by Tesla. It uses the official Tesla Fleet API under your own developer account.

---

## How it works

The Tesla API has no "charge between 01:00 and 01:30" command. The app gets that behaviour by **uploading a custom time-of-use (TOU) tariff** to the Powerwall:

| Slot type | Buy price in the uploaded tariff | Sell price | Effect |
|---|---|---|---|
| Slots you selected | Very low (`SUPER_OFF_PEAK`) | 0 | Powerwall charges from the grid |
| All other slots | Very high (`ON_PEAK`) | 0 | Powerwall avoids importing and powers the home from the battery |

It then makes sure the site is set up to act on that tariff:

- **Operation mode:** `autonomous` (called *Time-Based Control* in the Tesla app).
- **Grid charging:** allowed.

The Powerwall's own optimiser then charges during the cheap slots and discharges during the expensive ones.

**Important caveat:** the Powerwall decides *how much* to charge in the cheap slots, based on its forecast of your usage and solar. It usually charges hard in the cheap window, but reaching 100% is not guaranteed. This is a deliberate trade-off to avoid needing a scheduler or cloud component (see [Design decisions](#design-decisions)).

### Per-date schedules on a weekly tariff

Tesla tariffs repeat weekly (their periods are keyed by day of week). Slots are entered **per date**, so each time you tap Apply the app builds a tariff where:

- **today's weekday** gets the slots you saved for today (so applying tomorrow's plan doesn't disturb tonight);
- **tomorrow's weekday** gets the slots you have just chosen;
- **every other weekday** has **no cheap slots**.

So if you forget to plan a day, the Powerwall **does not grid-charge** that day. Stale slots are never repeated a week later.

### What the app calls

Region base URL (UK/EU): `https://fleet-api.prd.eu.vn.cloud.tesla.com`

| Purpose | Call |
|---|---|
| Find the energy site | `GET /api/1/products` → `energy_site_id` |
| Read current config and tariff (backed up before the first change) | `GET /api/1/energy_sites/{id}/site_info` |
| Live battery % and power flows | `GET /api/1/energy_sites/{id}/live_status` |
| Upload the tariff | `POST /api/1/energy_sites/{id}/time_of_use_settings` with `{ "tou_settings": { "tariff_content_v2": … } }` |
| Time-Based Control | `POST /api/1/energy_sites/{id}/operation` with `{ "default_real_mode": "autonomous" }` |
| Allow grid charging | `POST /api/1/energy_sites/{id}/grid_import_export` with `{ "disallow_charge_from_grid_with_solar_installed": false }` |
| Backup reserve (optional) | `POST /api/1/energy_sites/{id}/backup` with `{ "backup_reserve_percent": n }` |

> The exact `tariff_content_v2` shape (period names, day-of-week numbering, season date format) is not fully documented. The app's first step is to read your site's existing tariff, which serves as the reference format and as the **Restore original tariff** backup.

---

## Architecture

```
┌───────────────────────── Android phone ──────────────────────────┐
│  Nuxt 3 SPA (Vue, TypeScript) inside a Capacitor native shell     │
│                                                                   │
│  Slot picker ─► Tariff builder ─► Tesla API client ──────────────►│──► Tesla Fleet API (EU)
│       │                                 │  (CapacitorHttp: native │
│  Local store (per-date slots,           │   HTTP, avoids CORS)    │
│  original tariff backup)           Token store (Android Keystore) │
│                                         │                         │
│  Sign in ─► Custom Tab ─► auth.tesla.com ─► redirect ─► App Link ─┘
└───────────────────────────────────────────────────────────────────┘

┌──── powerwall.versible.co.uk (GitHub Pages, static only) ────┐
│ /.well-known/appspecific/com.tesla.3p.public-key.pem         │  ← required by Tesla partner registration
│ /.well-known/assetlinks.json                                 │  ← lets the OAuth redirect open the app
│ /auth/callback/index.html                                    │  ← fallback: bounces ?code= into the app
└──────────────────────────────────────────────────────────────┘
```

The static site runs no code on a server. It exists because Tesla requires a domain you control, and the OAuth redirect must be an HTTPS URL.

### Tech stack

| Part | Choice | Why |
|---|---|---|
| UI | **Nuxt 3** (`ssr: false`, `nuxt generate`) + Vue 3 + TypeScript | Existing skill set |
| Android packaging | **Capacitor** | Wraps the static build as a native APK |
| HTTP | `CapacitorHttp` | Native requests, so no browser CORS limits |
| OAuth browser | `@capacitor/browser` (Chrome Custom Tab) | Tesla login page |
| Deep link | `@capacitor/app` (`appUrlOpen`) | Receives the redirect with the auth code |
| Secrets | Secure-storage plugin backed by the Android Keystore | Stores the refresh token |
| App data | `@capacitor/preferences` | Stores slots per date and the tariff backup |
| One-off scripts | **Python** (`scripts/`) | Partner registration, key generation helpers |
| Static hosting | GitHub Pages on `powerwall.versible.co.uk` | Free, and already used for versible.co.uk |

---

## One-time setup

### 1. Host the static site

1. Create a new **public** repo, e.g. `powerwall-site`. It only holds public files. Copy in the contents of `site/` from this repo.
2. Enable GitHub Pages and set the custom domain to `powerwall.versible.co.uk`. Enforce HTTPS.
3. At your DNS provider, add `CNAME powerwall → <github-username>.github.io`.
4. Add an empty `.nojekyll` file so GitHub Pages serves the `.well-known/` folder.

### 2. Generate the key pair

```bash
openssl ecparam -name prime256v1 -genkey -noout -out private-key.pem
openssl ec -in private-key.pem -pubout -out public-key.pem
```

Or, without openssl: `python scripts/generate_keys.py`, which writes the public key into `site/` and the private key to `~/.powerwall-control/`.

Publish `public-key.pem` at `site/.well-known/appspecific/com.tesla.3p.public-key.pem`. Keep `private-key.pem` **offline and out of git**. It is only needed for signed *vehicle* commands; Powerwall commands don't use it.

### 3. Register the Tesla developer application

At [developer.tesla.com](https://developer.tesla.com), create an application with:

- **Allowed origin:** `https://powerwall.versible.co.uk`
- **Redirect URI:** `https://powerwall.versible.co.uk/auth/callback`
- **Scopes:** `openid`, `offline_access`, `energy_device_data`, `energy_cmds`

Note the **Client ID** and **Client Secret**. Tesla Fleet API usage is billed per request with a monthly free credit, and you need a payment method on file. Occasional personal use should stay inside the credit, but check the current pricing on the portal.

### 4. Register as a partner (once per region)

```bash
cd scripts
python -m venv .venv && .venv/Scripts/activate      # Windows
pip install -r requirements.txt
python register_partner.py --domain powerwall.versible.co.uk --region eu
```

The script gets a `client_credentials` partner token and calls `POST /api/1/partner_accounts`. Tesla then fetches your public key from the domain to verify it.

### 5. Configure the app

Create `.env` in the project root (it is git-ignored):

```dotenv
NUXT_PUBLIC_TESLA_CLIENT_ID=...
NUXT_PUBLIC_TESLA_CLIENT_SECRET=...
NUXT_PUBLIC_TESLA_REDIRECT_URI=https://powerwall.versible.co.uk/auth/callback
NUXT_PUBLIC_TESLA_API_BASE=https://fleet-api.prd.eu.vn.cloud.tesla.com
```

> **About the client secret:** Tesla's token exchange requires the client secret, and with no backend it has to be built into the APK. That is acceptable for a personal app that is never published. Don't distribute the APK.

### 6. Link the OAuth redirect to the app

Put the SHA-256 fingerprint of your app signing certificate into `site/.well-known/assetlinks.json`. Get it with `./gradlew signingReport` from `android/`. Tapping the redirect link then opens the app directly.

If App Links misbehave, `site/auth/callback/index.html` forwards `?code=…&state=…` to the custom scheme `uk.co.versible.powerwall://callback`, which the app also handles.

---

## Build and install

Requires Node 20+, Android Studio (for the SDK and JDK), and a phone with USB debugging enabled.

```bash
npm install
npm run generate            # nuxt generate → .output/public
npx cap sync android        # copy the web build + plugins into android/
npx cap run android         # build and install on the connected phone
# or: cd android && ./gradlew assembleRelease
```

During UI development, `npm run dev` runs the app in a desktop browser with a mocked Tesla client (the real API rejects browser CORS requests).

---

## Using the app

1. **Sign in with Tesla.** Log in on Tesla's page and approve the energy scopes. The app finds your energy site and backs up the current tariff.
2. **Pick a date.** It defaults to tomorrow.
3. **Tap slots** on the 48-slot grid (00:00–23:30). Tap-and-drag selects a range.
4. **Apply.** The app uploads the tariff and confirms Time-Based Control and grid charging. Each step shows a ✓ or an error.
5. **Status** shows battery %, the current mode and the slots now active on the Powerwall.
6. **Restore original tariff** puts back the backup from your first sign-in.

Tokens: access tokens last for hours, and the app refreshes them silently. Each refresh returns a **new** refresh token, which the app stores straight away (the old one stops working). If you're asked to sign in again, the refresh token has expired from disuse.

---

## Project structure (planned)

```
powerwall-control/
├── app/                      # Nuxt source
│   ├── pages/                # index (plan a date), status, settings, auth/callback
│   ├── components/           # SlotGrid, DatePicker, ApplyProgress
│   ├── composables/          # useTeslaAuth, useEnergySite, useSchedule
│   └── lib/
│       ├── tesla/            # API client, OAuth (PKCE + code exchange), token store
│       └── tariff/           # slots → tariff_content_v2 builder (+ unit tests)
├── android/                  # Capacitor-generated native project
├── site/                     # static files for the GitHub Pages repo
├── scripts/                  # Python: register_partner.py, check_site.py
├── capacitor.config.ts
└── nuxt.config.ts
```

---

## Implementation plan

1. **Tesla onboarding.** Static site live, keys published, developer app registered, partner registration done (steps 1–4 above).
2. **API exploration (Python).** Use `scripts/check_site.py` to authenticate and dump `site_info`, and save the real `tariff_content_v2` as a test fixture.
3. **App skeleton.** Nuxt SPA + Capacitor, native HTTP, secure storage, sign-in round trip working on the phone.
4. **Tariff builder.** A pure TypeScript function from per-date slots to a tariff, unit-tested against the fixture. Covers the today/tomorrow weekday logic and midnight edges.
5. **Plan and apply UI.** Slot grid, date picker, apply sequence, restore.
6. **Real-world check.** Apply a single slot, watch the Tesla app and `live_status`, and tune tariff prices if the Powerwall doesn't charge hard enough.
7. **Polish.** Status screen, error messages, reminder notification if tomorrow isn't planned (optional).

---

## Design decisions

| Decision | Choice | Alternatives considered |
|---|---|---|
| How to force charging | Custom TOU tariff | Toggling the backup reserve to 100% at slot boundaries: charging is predictable, but the phone must fire exact alarms and be online at every boundary, and a missed call leaves the reserve at 100% |
| Slot entry | Per date, re-applied daily | Repeating weekly template |
| App technology | Nuxt + Capacitor | Kotlin/Compose (new language), .NET MAUI, Flutter |
| Hosting | GitHub Pages subdomain, static only | Azure Static Web Apps; putting the files on the main versible.co.uk site |
| Backend | None | Azure Functions (not needed, since nothing runs on a timer) |

---

## Security notes

- The refresh token gives control of your Powerwall settings. It lives only in the Android Keystore-backed secure storage.
- The client secret is in the APK. Never publish the APK or commit `.env`.
- `private-key.pem` never enters any repo.
- The `site/` repo contains only public material.

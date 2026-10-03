# Powerwall Control

A personal Android app for choosing the **half-hour slots in which a Tesla Powerwall charges from the grid**, for example the cheapest Octopus Agile slots.

You choose **Self Powered** or **Timed Charge**. For Timed Charge you tap the half-hour slots to charge in and tap **Set**. The app calls the Tesla Fleet API directly from the phone. There is **no backend, no cloud functions and no always-on scheduler**. After the settings are applied, the Powerwall runs the schedule on its own, and the phone can be off.

> Not affiliated with or endorsed by Tesla. It uses the official Tesla Fleet API under your own developer account.

---

## How it works

The Tesla API has no "charge between 01:00 and 01:30" command. The app gets that behaviour by **uploading a custom time-of-use (TOU) tariff** to the Powerwall:

| Slot type | Buy price in the uploaded tariff | Sell price | Effect |
|---|---|---|---|
| Slots you selected | 0p (`SUPER_OFF_PEAK`) | 12p | Powerwall charges from the grid |
| All other slots | 99p (`ON_PEAK`) | 12p | Powerwall avoids importing and powers the home from the battery |

(In the tariff these are £ per kWh: 0, 0.99 and 0.12. The prices are constants in `app/lib/tariff/builder.ts`.)

It then makes sure the site is set up to act on that tariff:

- **Operation mode:** `autonomous` (called *Time-Based Control* in the Tesla app).
- **Grid charging:** allowed.

Choosing **Self Powered** instead only sets the operation mode to `self_consumption`. It doesn't touch the tariff.

The Powerwall's own optimiser then charges during the cheap slots and discharges during the expensive ones.

**Important caveat:** the Powerwall decides *how much* to charge in the cheap slots, based on its forecast of your usage and solar. It usually charges hard in the cheap window, but reaching 100% is not guaranteed. This is a deliberate trade-off to avoid needing a scheduler or cloud component (see [Design decisions](#design-decisions)).

### One daily pattern

Tesla tariffs repeat weekly (their periods are keyed by day of week). The app keeps it simple: you choose **one set of half-hour slots**, and the tariff applies the same pattern to **every day of the week**. There are no dates and no per-day plans.

The pattern stays in force until you change it, so if you forget to update it the Powerwall keeps charging in the same slots each day.

### What the app calls

Region base URL (UK/EU): `https://fleet-api.prd.eu.vn.cloud.tesla.com`

| Purpose | Call |
|---|---|
| Find the energy site | `GET /api/1/products` → `energy_site_id` |
| Read current config and tariff (backed up before the first change) | `GET /api/1/energy_sites/{id}/site_info` |
| Live battery % and power flows | `GET /api/1/energy_sites/{id}/live_status` |
| Upload the tariff | `POST /api/1/energy_sites/{id}/time_of_use_settings` with `{ "tou_settings": { "tariff_content_v2": … } }` |
| Time-Based Control (Timed Charge) | `POST /api/1/energy_sites/{id}/operation` with `{ "default_real_mode": "autonomous" }` |
| Self-Powered (Self Powered) | `POST /api/1/energy_sites/{id}/operation` with `{ "default_real_mode": "self_consumption" }` |
| Allow grid charging | `POST /api/1/energy_sites/{id}/grid_import_export` with `{ "disallow_charge_from_grid_with_solar_installed": false }` |
| Backup reserve (optional, not used by v1) | `POST /api/1/energy_sites/{id}/backup` with `{ "backup_reserve_percent": n }` |

> The exact `tariff_content_v2` shape (period names, day-of-week numbering, season date format) is not fully documented. The app reads your site's existing tariff and keeps its name, utility, charges and version, replacing only the seasons and rates. The original is backed up on the phone the first time you sign in. The real tariff is saved as a test fixture in `app/lib/tariff/__fixtures__/`.
>
> Two details are not confirmed by that fixture and are checked by the first real upload: that `fromMinute`/`toMinute` are honoured for half-hour boundaries, and that a period ending at midnight is written as `toHour: 0, toMinute: 0`.

---

## Architecture

```
┌───────────────────────── Android phone ──────────────────────────┐
│  Nuxt 4 SPA (Vue, TypeScript) inside a Capacitor native shell     │
│                                                                   │
│  Slot picker ─► Tariff builder ─► Tesla API client ──────────────►│──► Tesla Fleet API (EU)
│       │                                 │  (CapacitorHttp: native │
│  Local store (selected slots,           │   HTTP, avoids CORS)    │
│  original tariff backup)           Token store (Android Keystore) │
│                                         │                         │
│  Sign in ─► Custom Tab ─► auth.tesla.com ─► redirect ─► App Link ─┘
└───────────────────────────────────────────────────────────────────┘

┌─ powerwall.versible.co.uk (GitHub Pages, repo root) ─────────┐
│ /.well-known/appspecific/com.tesla.3p.public-key.pem         │  ← required by Tesla partner registration
│ /.well-known/assetlinks.json                                 │  ← lets the OAuth redirect open the app
│ /auth/callback/index.html                                    │  ← fallback: bounces ?code= into the app
└──────────────────────────────────────────────────────────────┘
```

The static site runs no code on a server. It exists because Tesla requires a domain you control, and the OAuth redirect must be an HTTPS URL.

### Tech stack

| Part | Choice | Why |
|---|---|---|
| UI | **Nuxt 4** (`ssr: false`, `nuxt generate`) + Vue 3 + TypeScript | Existing skill set |
| Android packaging | **Capacitor** | Wraps the static build as a native APK |
| HTTP | `CapacitorHttp` | Native requests, so no browser CORS limits |
| OAuth browser | `@capacitor/browser` (Chrome Custom Tab) | Tesla login page |
| Deep link | `@capacitor/app` (`appUrlOpen`) | Receives the redirect with the auth code |
| Secrets | Secure-storage plugin backed by the Android Keystore | Stores the refresh token |
| App data | `@capacitor/preferences` | Stores the selected slots and the tariff backup |
| One-off scripts | **Python** (`scripts/`) | Partner registration, key generation helpers |
| Static hosting | GitHub Pages on `powerwall.versible.co.uk` | Free, and already used for versible.co.uk |

---

## One-time setup

### 1. Host the static site

The static files live at the **root of this repo** (`CNAME`, `.nojekyll`, `index.html`, `auth/`, `.well-known/`), so GitHub Pages serves them straight from here. The repo is public, so keep secrets out of it.

1. Enable GitHub Pages: Settings → Pages → Deploy from a branch → `main` / `(root)`. Set the custom domain to `powerwall.versible.co.uk` (this creates the `CNAME` file) and tick Enforce HTTPS once the certificate is ready.
2. At your DNS provider, add `CNAME powerwall → <github-username>.github.io`. Use your personal account's address, not an organisation's.
3. Keep the empty `.nojekyll` file so GitHub Pages serves the `.well-known/` folder.
4. Check that `https://powerwall.versible.co.uk/.well-known/assetlinks.json` loads.

### 2. Generate the key pair

```bash
openssl ecparam -name prime256v1 -genkey -noout -out private-key.pem
openssl ec -in private-key.pem -pubout -out public-key.pem
```

Or, without openssl: `python scripts/generate_keys.py`, which writes the public key into `.well-known/` and the private key to `~/.powerwall-control/`.

Publish `public-key.pem` at `.well-known/appspecific/com.tesla.3p.public-key.pem`. Keep `private-key.pem` **offline and out of git**. It is only needed for signed *vehicle* commands; Powerwall commands don't use it.

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

Put the SHA-256 fingerprint of your app signing certificate into `.well-known/assetlinks.json`. Get it with `./gradlew signingReport` from `android/`. Tapping the redirect link then opens the app directly. The file already holds this machine's **debug** key fingerprint. If you build a release APK with its own key, add that fingerprint to the list as well.

If App Links misbehave, `auth/callback/index.html` forwards `?code=…&state=…` to the custom scheme `uk.co.versible.powerwall://callback`, which the app also handles.

---

## Build and install

Requires Node 22.19+ or 24.11+, Android Studio (for the SDK and JDK), and a phone with USB debugging enabled. Gradle needs two environment variables. Set them once for your user account (then open a new terminal):

```
setx JAVA_HOME "C:\Program Files\Android\Android Studio\jbr"
setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"
```

(`JAVA_HOME` is Android Studio's bundled JDK; `ANDROID_HOME` is the SDK folder Android Studio installed. Adjust both if yours are elsewhere.)

```bash
npm install
npm run android             # nuxt generate → cap sync → build and install on the connected phone
# or step by step:
npm run generate            # nuxt generate → .output/public
npx cap sync android        # copy the web build + plugins into android/
npx cap run android
# or: cd android && ./gradlew assembleDebug
```

During UI development, `npm run dev` runs the app in a desktop browser with a mocked Tesla client (the real API rejects browser CORS requests). A "mock" badge shows when it is active.

Tests and type checks: `npm test`, `npm run typecheck`.

---

## Using the app

1. **Sign in with Tesla.** Log in on Tesla's page and approve the energy scopes. The app finds your energy site and backs up the current tariff. The top card shows battery %, mode, grid charging and backup reserve.
2. **Choose Self Powered or Timed Charge.** The page starts on the mode the Powerwall is already in.
3. **Self Powered:** tap **Set** to put the Powerwall in Self-Powered mode.
4. **Timed Charge:** tap the half-hour boxes (00:00–23:30) to charge from the grid, then tap **Set**. The app uploads the tariff, sets Time-Based Control and allows grid charging. Each step shows a ✓ or an error and stops at the first failure.
5. Your selection is saved on the phone and the same pattern applies every day until you change it.

There is no "restore" button yet. The original tariff is backed up on the phone, and the Tesla app can change it back.

Tokens: access tokens last for hours, and the app refreshes them silently. Each refresh returns a **new** refresh token, which the app stores straight away (the old one stops working). If you're asked to sign in again, the refresh token has expired from disuse.

---

## Project structure

```
powerwall-control/
├── app/                      # Nuxt source
│   ├── pages/                # index (status, mode choice, slot grid)
│   ├── composables/          # useTeslaAuth, useEnergySite, usePlan
│   └── lib/
│       ├── tesla/            # API client, OAuth (PKCE + code exchange), token store
│       └── tariff/           # slots → tariff_content_v2 builder, real-tariff fixture (+ unit tests)
├── android/                  # Capacitor-generated native project
├── .well-known/, auth/,      # static files served by GitHub Pages
│   index.html, CNAME,
│   .nojekyll
├── scripts/                  # Python: register_partner.py, check_site.py
├── capacitor.config.ts
└── nuxt.config.ts
```

---

## Implementation plan

1. **Tesla onboarding.** Static site live, keys published, developer app registered, partner registration done (steps 1–4 above).
2. **API exploration (Python).** Use `scripts/check_site.py` to authenticate and dump `site_info`, and save the real `tariff_content_v2` as a test fixture.
3. **App skeleton.** Nuxt SPA + Capacitor, native HTTP, secure storage, sign-in round trip working on the phone.
4. **Tariff builder.** A pure TypeScript function from a set of half-hour slots to a tariff, unit-tested against the fixture. Covers the midnight edges.
5. **Plan and apply UI.** Self Powered / Timed Charge choice, 48-slot grid, Set with per-step progress.
6. **Real-world check.** Apply a single slot, watch the Tesla app and `live_status`, confirm the tariff format is accepted, and tune the prices if the Powerwall doesn't charge hard enough.
7. **Polish.** Restore original tariff, drag to select a range, error messages, and possibly a separate status page.

Steps 1–5 are built; step 5 is untested against the real Powerwall until step 6.

---

## Design decisions

| Decision | Choice | Alternatives considered |
|---|---|---|
| How to force charging | Custom TOU tariff | Toggling the backup reserve to 100% at slot boundaries: charging is predictable, but the phone must fire exact alarms and be online at every boundary, and a missed call leaves the reserve at 100% |
| Slot entry | One daily pattern, repeated every day until changed | Per-date plans (tomorrow only, other days off): safer if you forget to plan, but more to operate |
| App technology | Nuxt + Capacitor | Kotlin/Compose (new language), .NET MAUI, Flutter |
| Hosting | GitHub Pages subdomain, static only | Azure Static Web Apps; putting the files on the main versible.co.uk site |
| Backend | None | Azure Functions (not needed, since nothing runs on a timer) |

---

## Security notes

- The refresh token gives control of your Powerwall settings. It lives only in the Android Keystore-backed secure storage.
- The client secret is in the APK. Never publish the APK or commit `.env`.
- `private-key.pem` never enters any repo.
- This repo is public and is also what GitHub Pages serves, so it must contain only public material. `.env` and the real site dumps in `scripts/out/` are git-ignored.

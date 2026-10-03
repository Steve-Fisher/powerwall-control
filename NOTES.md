# Where I left off (3 Oct 2026)

Working notes for picking the build back up. The plan itself is in the README ("Implementation plan").

## Status

| Plan step | State |
|---|---|
| 1. Tesla onboarding | **Done.** Site is live over HTTPS, Tesla developer app created, domain registered in the EU region. |
| 2. API exploration | **Done.** `check_site.py` ran; real tariff fixture committed (`86b70de`). |
| 3. App skeleton | **Done.** Real sign-in tested on the phone (3 Oct 2026): signed in, shows battery and mode. |
| 4. Tariff builder | **Written and tested** (`app/lib/tariff/builder.ts`, tests against the real fixture). |
| 5. Plan and apply UI | **Done and pushed** (`8f68c57`, fix `c27a43d`). |
| 6. Real-world check | **Done** (3 Oct 2026). Timed Charge Set worked on the real Powerwall from the phone: tariff upload, Time-Based Control and grid charging all succeeded, and the Tesla app reflects the changes. Not measured: how hard it charges over a longer run. Revisit the prices only if it under-charges in daily use. |
| 7. Polish | Not started. |

## v1 design (supersedes the per-date plan in the README)

Decided 3 Oct 2026. Keep it very simple:

- Top choice: **Self Powered** or **Timed Charge**.
- Self Powered + Set: sets operation mode `self_consumption`. Nothing else is touched.
- Timed Charge shows 48 half-hour boxes. Tap to select, then **Set** runs three steps in order, stopping at the first failure: upload tariff, set `autonomous` (Time-Based Control), allow grid charging.
- One daily pattern repeats all 7 days; there are no dates, no today/tomorrow. It stays in force until changed.
- Prices (£/kWh): selected slot buy 0, other slots buy 0.99, sell 0.12 everywhere.
- Selected slots are saved on the phone (`plan.slots`) after a successful Set.
- There is no "Restore original tariff" button in v1. The original is backed up on the phone, but the only way back is the Tesla app for now.
- The README was updated on 3 Oct 2026 to describe this design and the repo-root hosting.

Code: `app/lib/tariff/builder.ts`, write calls in `app/lib/tesla/client.ts`, `app/composables/usePlan.ts`, UI in `app/pages/index.vue`.

Git: everything is committed and pushed. The fine-grained token is saved in Git Credential Manager, so pushes from this repo work without a prompt.

## How the site is hosted

- The static site lives at the **root of this repo** (`powerwall-control`), not in a separate repo. `site/` was moved to the root, so `CNAME`, `.nojekyll`, `index.html`, `auth/` and `.well-known/` sit beside the app code. Pages deploys from `main` / root.
- DNS: `CNAME powerwall → steve-fisher.github.io`. Enforce HTTPS is on.
- `www.versible.co.uk` is a different thing: it belongs to the `versible` organisation's Pages.
- A leftover empty `site/` folder may still exist locally. It can be deleted.
- `.env.example` was deleted in `9b047e3`. Restore it if you want the template back.

## Tesla developer app

- Name `powerwall-control`, pay-as-you-go tier, EU region.
- Scopes requested: `openid offline_access energy_device_data energy_cmds`. Only the two energy options are ticked in the portal.
- Client ID and secret are in `.env` (git-ignored). Never paste them, or a live sign-in callback URL, into chat.
- `register_partner.py` registers the domain fine. Its last step, the read-back `GET partner_accounts/public_key`, returns 403 "missing scopes". It is only a check and can be ignored (or fixed in the script).

## What the real API returned

- Site: mode `self_consumption`, backup reserve 6%, battery about 98%.
- **Grid charging is unconfirmed.** `disallow_charge_from_grid_with_solar_installed` is not in the response, so the script prints `None`. `edit_setting_grid_charging: true` is only a permission flag. Check in the Tesla app (Powerwall > Customize > Grid Charging) that it is on before relying on the planner.
- Current tariff (fixture `app/lib/tariff/__fixtures__/tariff_content_v2.json`): one all-year season, `SUPER_OFF_PEAK` 02:00-05:00 priced 0, `ON_PEAK` 05:00-02:00 priced 1, sell tariff flat 0.12, empty `Winter`. Periods use `toDayOfWeek: 6` with no `fromDayOfWeek`. No personal data in it.
- Raw dumps are in `scripts/out/` (git-ignored).

## Running the app on the phone

```
npm run android
```

`JAVA_HOME` (`C:\Program Files\Android\Android Studio\jbr`) and `ANDROID_HOME` (`C:\Users\steve\AppData\Local\Android\Sdk`) are now set permanently as user environment variables (via `setx`). Open a new terminal after changing them. The phone needs USB debugging on.

Tap Sign in with Tesla. The app comes back signed in and shows battery % and mode. If the redirect lands on the web page instead of the app, tap "Open Powerwall Control" on it (the custom-scheme fallback).

Result of the first real test (3 Oct 2026): sign-in worked, battery and mode shown, "Tariff backup: Saved" appeared, and the redirect opened the app directly (App Links verified, fallback not needed).

## Tariff builder: Tesla format assumptions

Tesla **accepted** the first real upload (3 Oct 2026) and the Tesla app showed the schedule as set, so these formats are confirmed to work. The fixture only has one all-week period pair, so these were assumptions, each isolated in `builder.ts`:

- (Day-of-week numbering no longer matters: every day gets the same pattern, written as days 0 to 6.)
- `fromMinute` / `toMinute` are honoured for the half-hour boundaries (the fixture has no minute fields).
- A period ending at midnight is written `toHour: 0, toMinute: 0`; a whole day is `0:00 → 0:00` (`slotToClock`).
- With nothing selected the tariff is a single all-day `ON_PEAK` period. If `SUPER_OFF_PEAK` is unused, its key is omitted.

Apply a single slot and compare with the Tesla app and `live_status`. If Tesla rejects the upload, fix the format in `builder.ts`, not the callers.

## Using the app day to day

- The debug build installed over USB runs on its own; the phone doesn't need to be connected. Its data (signed-in session, saved slots, tariff backup) survives until the app is uninstalled, so don't uninstall it.
- To install a new version, plug in, enable USB debugging and run `npm run android`. USB debugging can stay off the rest of the time.
- Bug fixed on 3 Oct 2026: `structuredClone` can't copy Vue reactive proxies, so the builder clones through JSON (regression test added).

## Next build work

**Status (3 Oct 2026): v1 is finished.** Step 7 was deliberately skipped; the plan is to use the app for a week or two and see how it behaves. Come back only if something needs fixing (for example under-charging). The ideas below are optional.

- **Step 7, polish** (skipped for now): Restore original tariff button, drag to select a range of slots, clearer error messages, a separate status page.
- Small fix: make `check_site.py` print "not reported" instead of `None` for grid charging.
- Status and the planner currently share `pages/index.vue`.

## Useful facts

- Run `check_site.py` and any script that prompts in a real PowerShell window. The `!` prompt in Claude Code can't pass input to it (EOFError).
- Private key: `C:\Users\steve\.powerwall-control\private-key.pem` (outside the repo, don't lose it; it isn't needed for Powerwall commands).
- Python venv: `scripts\.venv` (already set up).
- Desktop dev: `npm run dev` runs with a mocked Tesla API ("mock" badge). `npm test` and `npm run typecheck` both pass.
- The `assetlinks.json` fingerprint is this PC's **debug** key. A release build with its own key needs its fingerprint added too.
- Nuxt 4 is used rather than Nuxt 3 (Nuxt 3 is at or near end of life), and it needs Node 22.19+ or 24.11+.

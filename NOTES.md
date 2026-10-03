# Where I left off (3 Oct 2026)

Working notes for picking the build back up. The plan itself is in the README ("Implementation plan").

## Status

| Plan step | State |
|---|---|
| 1. Tesla onboarding | **Done.** Site is live over HTTPS, Tesla developer app created, domain registered in the EU region. |
| 2. API exploration | **Done.** `check_site.py` ran; real tariff fixture committed (`86b70de`). |
| 3. App skeleton | Built and pushed. **Real sign-in on the phone is being tested** (see below). |
| 4–7 | Not started. Step 4 is unblocked. |

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

## In progress: test the app on the phone (step 3)

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
npm run android
```

Tap Sign in with Tesla. The app should come back signed in and show battery %, mode and "Tariff backup: Saved". If the redirect lands on the web page instead of the app, tap "Open Powerwall Control" on it (the custom-scheme fallback). App Links only verify once `assetlinks.json` is live, and it now is.

Record the result here once known (works / what broke).

## Next build work

- **Step 4, tariff builder.** Per-date slots go to `tariff_content_v2`, built as a pure TypeScript function in `app/lib/tariff/`. Unit-test it against the real fixture above.
- The status UI currently lives on `pages/index.vue`. Step 5 replaces it with the planner and moves status to its own page.
- Small fix: make `check_site.py` print "not reported" instead of `None` for grid charging.

## Useful facts

- Run `check_site.py` and any script that prompts in a real PowerShell window. The `!` prompt in Claude Code can't pass input to it (EOFError).
- Private key: `C:\Users\steve\.powerwall-control\private-key.pem` (outside the repo, don't lose it; it isn't needed for Powerwall commands).
- Python venv: `scripts\.venv` (already set up).
- Desktop dev: `npm run dev` runs with a mocked Tesla API ("mock" badge). `npm test` and `npm run typecheck` both pass.
- The `assetlinks.json` fingerprint is this PC's **debug** key. A release build with its own key needs its fingerprint added too.
- Nuxt 4 is used rather than Nuxt 3 (Nuxt 3 is at or near end of life), and it needs Node 22.19+ or 24.11+.

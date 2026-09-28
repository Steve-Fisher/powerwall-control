# Where I left off (28 Sep 2026)

Working notes for picking the build back up. The plan itself is in the README ("Implementation plan").

## Status

| Plan step | State |
|---|---|
| 1. Tesla onboarding | Repo side done (`site/`, `scripts/`, keys generated). **Account/DNS work still to do**, see below. |
| 2. API exploration | `scripts/check_site.py` written, **not yet run** (needs step 1 done). |
| 3. App skeleton | Built, compiling and pushed. Real sign-in untested (needs steps 1–2). |
| 4–7 | Not started. |

Git: everything is committed and pushed (onboarding tooling `c1b099f`, app skeleton `47a49ba`). The fine-grained token is saved in Git Credential Manager, so pushes work without a prompt.

## To do by hand (step 1)

1. **Static site repo.** Create a public `powerwall-site` repo on github.com (the token only covers `powerwall-control`, so use the web UI). Copy in the **contents** of `site/`, including `.nojekyll`, `CNAME` and `.well-known/`.
2. **GitHub Pages.** Deploy from the main branch, set the custom domain to `powerwall.versible.co.uk`, and tick Enforce HTTPS.
3. **DNS.** Add `CNAME powerwall → steve-fisher.github.io`.
4. **Check it's live** in a browser:
   - `https://powerwall.versible.co.uk/.well-known/appspecific/com.tesla.3p.public-key.pem`
   - `https://powerwall.versible.co.uk/.well-known/assetlinks.json`
5. **Tesla developer app** at developer.tesla.com:
   - Allowed origin `https://powerwall.versible.co.uk`
   - Redirect URI `https://powerwall.versible.co.uk/auth/callback`
   - Scopes `openid offline_access energy_device_data energy_cmds`
   - A payment method has to be on file.
6. **`.env`.** Copy `.env.example` to `.env` and fill in the Client ID and secret.

## Then run (steps 1–2)

```powershell
scripts\.venv\Scripts\python scripts\register_partner.py --domain powerwall.versible.co.uk --region eu
scripts\.venv\Scripts\python scripts\check_site.py
```

- `check_site.py` opens the Tesla login. After approving, copy the URL from the callback page (under "Signing in from a desktop script?") and paste it into the prompt.
- It saves the real tariff to `app/lib/tariff/__fixtures__/tariff_content_v2.json`. **Review it before committing** (the repo is public). Raw dumps go to `scripts/out/`, which is git-ignored.
- Check the printed mode, grid-charging and battery values look right.

## Then test the app on the phone (step 3)

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
npm run android
```

Tap Sign in with Tesla. The app should come back signed in and show battery %, mode and "Tariff backup: Saved". If the redirect lands on the web page instead of the app, tap "Open Powerwall Control" on it (the custom-scheme fallback). App Links only verify once `assetlinks.json` is live.

## Next build work

- **Step 4, tariff builder.** Per-date slots go to `tariff_content_v2`, built as a pure TypeScript function in `app/lib/tariff/`. It's unit-tested against the real fixture, so it waits for `check_site.py` output.
- The status UI currently lives on `pages/index.vue`. Step 5 replaces it with the planner and moves status to its own page.

## Useful facts

- Private key: `C:\Users\steve\.powerwall-control\private-key.pem` (outside the repo, don't lose it; it isn't needed for Powerwall commands).
- Python venv: `scripts\.venv` (already set up).
- Desktop dev: `npm run dev` runs with a mocked Tesla API ("mock" badge). `npm test` and `npm run typecheck` both pass.
- The `assetlinks.json` fingerprint is this PC's **debug** key. A release build with its own key needs its fingerprint added too.
- Nuxt 4 is used rather than Nuxt 3 (Nuxt 3 is at or near end of life), and it needs Node 22.19+ or 24.11+.

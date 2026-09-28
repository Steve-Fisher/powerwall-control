"""Sign in as the Powerwall owner, then dump the energy site's config and tariff.

First run: opens Tesla's login page; after approving, paste the URL you land on
(the /auth/callback page shows it). Tokens are cached in scripts/.tokens.json
(git-ignored) and refreshed on later runs.

Writes raw responses to scripts/out/ (git-ignored) and the site's current
tariff_content_v2 to the tariff builder's test fixture path.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import secrets
import sys
import time
import webbrowser
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

import requests

from common import (AUTHORIZE_URL, OUT_DIR, REPO_ROOT, SCRIPTS_DIR, TOKEN_URL, USER_SCOPES, Config, check,
                    load_config, post_token)

TOKENS_PATH = SCRIPTS_DIR / ".tokens.json"
FIXTURE_PATH = REPO_ROOT / "app" / "lib" / "tariff" / "__fixtures__" / "tariff_content_v2.json"


def save_tokens(tokens: dict) -> dict:
    tokens["expires_at"] = int(time.time()) + int(tokens.get("expires_in", 0))
    TOKENS_PATH.write_text(json.dumps(tokens, indent=2))
    return tokens


def sign_in(config: Config) -> dict:
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)

    url = AUTHORIZE_URL + "?" + urlencode({
        "response_type": "code",
        "client_id": config.client_id,
        "redirect_uri": config.redirect_uri,
        "scope": USER_SCOPES,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "prompt_missing_scopes": "true",
    })
    print("Opening Tesla sign-in. If no browser opens, visit:\n" + url + "\n")
    webbrowser.open(url)

    pasted = input("After approving, paste the full URL you were redirected to:\n> ").strip()
    params = parse_qs(urlparse(pasted).query)
    if "error" in params:
        sys.exit(f"Sign-in failed: {params['error'][0]} {params.get('error_description', [''])[0]}")
    if params.get("state", [None])[0] != state:
        sys.exit("State mismatch: that URL isn't from this sign-in attempt.")
    code = params.get("code", [None])[0]
    if not code:
        sys.exit("No ?code= in that URL.")

    return save_tokens(post_token({
        "grant_type": "authorization_code",
        "client_id": config.client_id,
        "client_secret": config.client_secret,
        "code": code,
        "code_verifier": verifier,
        "redirect_uri": config.redirect_uri,
        "audience": config.api_base,
    }))


def get_access_token(config: Config, force_login: bool) -> str:
    tokens = None if force_login or not TOKENS_PATH.exists() else json.loads(TOKENS_PATH.read_text())

    if tokens and tokens.get("expires_at", 0) > time.time() + 60:
        return tokens["access_token"]

    if tokens and tokens.get("refresh_token"):
        resp = requests.post(TOKEN_URL, data={
            "grant_type": "refresh_token",
            "client_id": config.client_id,
            "refresh_token": tokens["refresh_token"],
        }, timeout=30)
        if resp.ok:
            # Tesla rotates refresh tokens: persist the new one immediately.
            return save_tokens(resp.json())["access_token"]
        print(f"Refresh failed (HTTP {resp.status_code}); signing in again.")

    return sign_in(config)["access_token"]


def find_key(obj, key: str):
    """Depth-first search for a key, since the tariff's location in site_info isn't documented."""
    if isinstance(obj, dict):
        if key in obj:
            return obj[key]
        children = obj.values()
    elif isinstance(obj, list):
        children = obj
    else:
        return None
    for child in children:
        found = find_key(child, key)
        if found is not None:
            return found
    return None


def dump(name: str, data) -> Path:
    OUT_DIR.mkdir(exist_ok=True)
    path = OUT_DIR / f"{name}.json"
    path.write_text(json.dumps(data, indent=2))
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--site-id", type=int, help="energy_site_id, if you have more than one")
    parser.add_argument("--login", action="store_true", help="ignore cached tokens and sign in again")
    args = parser.parse_args()

    config = load_config()
    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {get_access_token(config, args.login)}"

    def api_get(path: str) -> dict:
        return check(session.get(config.api_base + path, timeout=30))["response"]

    products = api_get("/api/1/products")
    dump("products", products)
    sites = [p for p in products if "energy_site_id" in p]
    if not sites:
        sys.exit("No energy sites on this account (see scripts/out/products.json).")
    if args.site_id:
        sites = [s for s in sites if s["energy_site_id"] == args.site_id]
        if not sites:
            sys.exit(f"No energy site {args.site_id} on this account.")
    elif len(sites) > 1:
        for s in sites:
            print(f"  {s['energy_site_id']}  {s.get('site_name', '')}")
        sys.exit("Several energy sites found; pick one with --site-id.")
    site_id = sites[0]["energy_site_id"]

    site_info = api_get(f"/api/1/energy_sites/{site_id}/site_info")
    live_status = api_get(f"/api/1/energy_sites/{site_id}/live_status")
    print(f"Saved {dump('site_info', site_info)}")
    print(f"Saved {dump('live_status', live_status)}")

    print()
    print(f"Site:                 {site_info.get('site_name')} ({site_id})")
    print(f"Operation mode:       {site_info.get('default_real_mode')}")
    print(f"Backup reserve:       {site_info.get('backup_reserve_percent')}%")
    print(f"Grid charging off:    {find_key(site_info, 'disallow_charge_from_grid_with_solar_installed')}")
    print(f"Battery:              {live_status.get('percentage_charged')}%")

    tariff = find_key(site_info, "tariff_content_v2")
    if tariff is None:
        print("\nNo tariff_content_v2 in site_info; check scripts/out/site_info.json by hand.")
        return
    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE_PATH.write_text(json.dumps(tariff, indent=2) + "\n")
    print(f"\nSaved tariff fixture to {FIXTURE_PATH.relative_to(REPO_ROOT)}")
    print("Review it before committing: this repo is public.")


if __name__ == "__main__":
    main()

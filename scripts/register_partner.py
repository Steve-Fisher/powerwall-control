"""Register this developer app as a Tesla Fleet API partner for one region.

Checks the public key is live on the domain first, then gets a client_credentials
partner token and calls POST /api/1/partner_accounts. Safe to re-run.
"""

from __future__ import annotations

import argparse
import sys

import requests

from common import PARTNER_SCOPES, PUBLIC_KEY_PATH, REGION_BASE_URLS, check, load_config, post_token

KEY_PATH_ON_DOMAIN = "/.well-known/appspecific/com.tesla.3p.public-key.pem"


def check_public_key_is_live(domain: str) -> None:
    url = f"https://{domain}{KEY_PATH_ON_DOMAIN}"
    try:
        resp = requests.get(url, timeout=15)
    except requests.RequestException as exc:
        sys.exit(f"Could not fetch {url}: {exc}")
    if resp.status_code != 200:
        sys.exit(f"{url} returned HTTP {resp.status_code}. Is the site deployed with .nojekyll?")

    if PUBLIC_KEY_PATH.exists() and resp.text.strip() != PUBLIC_KEY_PATH.read_text().strip():
        sys.exit(f"The key at {url} doesn't match {PUBLIC_KEY_PATH}. Re-deploy the site.")
    print(f"OK  Public key is live at {url}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--domain", required=True, help="e.g. powerwall.versible.co.uk")
    parser.add_argument("--region", choices=REGION_BASE_URLS, default="eu")
    args = parser.parse_args()

    base = REGION_BASE_URLS[args.region]
    config = load_config(api_base=base)

    check_public_key_is_live(args.domain)

    token = post_token({
        "grant_type": "client_credentials",
        "client_id": config.client_id,
        "client_secret": config.client_secret,
        "scope": PARTNER_SCOPES,
        "audience": base,
    })["access_token"]
    print("OK  Got partner token")

    headers = {"Authorization": f"Bearer {token}"}
    result = check(requests.post(f"{base}/api/1/partner_accounts",
                                 json={"domain": args.domain}, headers=headers, timeout=30))
    print(f"OK  Registered {args.domain} in region {args.region}")
    print(result)

    registered = check(requests.get(f"{base}/api/1/partner_accounts/public_key",
                                    params={"domain": args.domain}, headers=headers, timeout=30))
    print("OK  Tesla has this public key on record:")
    print(registered)


if __name__ == "__main__":
    main()

"""Shared config and HTTP helpers for the one-off Tesla scripts."""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

import requests
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = REPO_ROOT / "scripts"
OUT_DIR = SCRIPTS_DIR / "out"
SITE_DIR = REPO_ROOT  # GitHub Pages serves the repo root
PUBLIC_KEY_PATH = SITE_DIR / ".well-known" / "appspecific" / "com.tesla.3p.public-key.pem"

AUTHORIZE_URL = "https://auth.tesla.com/oauth2/v3/authorize"
TOKEN_URL = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token"
REGION_BASE_URLS = {
    "eu": "https://fleet-api.prd.eu.vn.cloud.tesla.com",
    "na": "https://fleet-api.prd.na.vn.cloud.tesla.com",
}

USER_SCOPES = "openid offline_access energy_device_data energy_cmds"
PARTNER_SCOPES = "openid energy_device_data energy_cmds"


@dataclass(frozen=True)
class Config:
    client_id: str
    client_secret: str
    redirect_uri: str
    api_base: str


def load_config(api_base: str | None = None) -> Config:
    """Read the app's .env from the repo root so scripts and app share one config."""
    load_dotenv(REPO_ROOT / ".env")

    def required(name: str) -> str:
        value = os.environ.get(name, "").strip()
        if not value:
            sys.exit(f"Missing {name}. Copy .env.example to .env in the repo root and fill it in.")
        return value

    return Config(
        client_id=required("NUXT_PUBLIC_TESLA_CLIENT_ID"),
        client_secret=required("NUXT_PUBLIC_TESLA_CLIENT_SECRET"),
        redirect_uri=required("NUXT_PUBLIC_TESLA_REDIRECT_URI"),
        api_base=(api_base or os.environ.get("NUXT_PUBLIC_TESLA_API_BASE") or REGION_BASE_URLS["eu"]).rstrip("/"),
    )


def check(resp: requests.Response) -> dict:
    """Raise with the response body included, since Tesla's error details live there."""
    if not resp.ok:
        sys.exit(f"{resp.request.method} {resp.url} failed: HTTP {resp.status_code}\n{resp.text}")
    return resp.json()


def post_token(data: dict) -> dict:
    return check(requests.post(TOKEN_URL, data=data, timeout=30))

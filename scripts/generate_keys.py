"""Generate the prime256v1 key pair Tesla needs for partner registration.

Equivalent to the openssl commands in the README, for machines without openssl.
The public key goes into .well-known/ at the repo root (published by GitHub Pages); the private key goes OUTSIDE the repo.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from common import PUBLIC_KEY_PATH, REPO_ROOT

DEFAULT_PRIVATE_KEY = Path.home() / ".powerwall-control" / "private-key.pem"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--private-key", type=Path, default=DEFAULT_PRIVATE_KEY,
                        help=f"where to write the private key (default: {DEFAULT_PRIVATE_KEY})")
    parser.add_argument("--force", action="store_true", help="overwrite existing keys")
    args = parser.parse_args()

    private_path: Path = args.private_key.resolve()
    if private_path.is_relative_to(REPO_ROOT):
        sys.exit("Refusing to write the private key inside the repo. Choose a path outside it.")

    for path in (private_path, PUBLIC_KEY_PATH):
        if path.exists() and not args.force:
            sys.exit(f"{path} already exists. Use --force to replace it (Tesla must then re-verify the new key).")

    key = ec.generate_private_key(ec.SECP256R1())

    private_path.parent.mkdir(parents=True, exist_ok=True)
    private_path.write_bytes(key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ))

    PUBLIC_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_KEY_PATH.write_bytes(key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ))

    print(f"Private key: {private_path}  (keep offline, never commit)")
    print(f"Public key:  {PUBLIC_KEY_PATH}  (publish via the site repo)")


if __name__ == "__main__":
    main()

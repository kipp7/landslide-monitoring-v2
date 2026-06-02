---
title: Secrets Backup Manifest
type: guide
permalink: landslide-monitoring-v2-mainline/secrets/readme
---

# Secrets Backup Manifest

This directory is for encrypted secret backups and recovery notes only.

Plaintext credentials must not be committed to Git, even when the repository is private.

Current plaintext secrets kept outside Git:

- `key/1.pem`: Tencent cloud server SSH key for `134.175.187.208`.

Allowed committed files in this directory:

- `README.md`
- `*.age`
- `*.gpg`
- `*.7z`
- `*.zip.enc`

Recommended recovery workflow:

1. Keep plaintext keys in `key/` locally.
2. Encrypt key material before committing it.
3. Store the decryption password outside this repository.
4. If plaintext keys are ever committed accidentally, rotate the affected server keys immediately.

Pending action:

- Create an encrypted backup for `key/1.pem` after selecting the encryption method and passphrase.

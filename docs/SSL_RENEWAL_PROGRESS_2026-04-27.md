# SSL Renewal Progress — 2026-04-27

## Domains in scope
- `persiantoolbox.ir`
- `alirezasafaeisystems.ir`
- `audit.alirezasafaeisystems.ir`

## Attempt status
- Installed lego: `/usr/local/bin/lego` v4.35.1
- LE account created for `asdevelooper@gamil.com` in `/home/deploy/.lego/accounts/...`
- `lego --dns arvancloud` failed due DNS permission errors:
  - `status code: 403, message: "Your access to this section is restricted."` for `persiantoolbox.ir` and `alirezasafaeisystems.ir`
  - `could not find zone for domain "audit.alirezasafaeisystems.ir"` for `audit` wildcard
- `lego --dns manual` reached interactive TXT challenge stage, but flow not completed (EOF), so issuance did not finalize.
- Existing certificate files currently still valid for these domains under `/etc/letsencrypt/live/*`.

## Action taken on VPS
- Created saved automation script:
  - `/var/www/devatlas/shared/scripts/renew-brand-wildcards.sh`
- Script uses:
  - proxy `https://test:12345678@le.devneeds.ir`
  - NS `o.ns.arvancdn.ir:53`, `g.ns.arvancdn.ir:53`
  - domains: `persiantoolbox.ir`, `*.persiantoolbox.ir`, `alirezasafaeisystems.ir`, `*.alirezasafaeisystems.ir`, `*.audit.alirezasafaeisystems.ir`
  - modes via `LEGO_MODE` (`run`/`renew`)

## What remains
- Fix DNS API access in Arvan panel for machine user on the target zone(s):
  - grant DNS Manager role for the three domains (or parent zone for each).
- Re-run issuance script after permission fix:
  - `sudo ARVANCLOUD_API_KEY='Apikey ...' DNS_PROVIDER=arvancloud LEGO_MODE=run /var/www/devatlas/shared/scripts/renew-brand-wildcards.sh`
- If run succeeds, reload nginx and add cron for renewal.

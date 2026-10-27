# Backup & restore
- D1 Time Travel (production): `npx wrangler d1 time-travel info webapp-production`, restore with `npx wrangler d1 time-travel restore webapp-production --timestamp=<ISO>`.
- Logical export: `npx wrangler d1 export webapp-production --remote --output=backup_YYYY-MM-DD.sql`; restore into a new DB with `wrangler d1 execute <db> --remote --file=backup.sql`.
- R2: replicate bucket with rclone/S3-compatible tooling.
- Study versions are immutable; reports regenerate deterministically from them (checksum-verified), so no report binaries need backup.

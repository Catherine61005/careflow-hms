# Local verification — 30 October 2026

Environment: macOS arm64, Node 26.7.0, npm 11.19.0, Docker 29.8.1,
PostgreSQL 16.15 with pgvector; new Docker volume and npm dependencies.

- `docker compose up -d`: pulled pgvector and created the development volume.
  Mounted shell init failed with `/bin/bash: bad interpreter: Permission denied`.
  Confirmed no HMS schema existed, then recovered with
  `docker exec careflow-db bash /hms-db/docker-init.sh`.
- Created ignored `web/.env.local` from `.env.example` with a random JWT secret.
- `npm install`: 81 packages installed, 0 vulnerabilities reported.
- `npm run embed`: 12 department profiles and 234 admissions embedded (90 unique texts).
- `npm run dev`: app served on http://localhost:3000.
- `npm run build`: production compilation and TypeScript passed.
- Database suite: 38 passed, 0 failed; rolled back.
- Original API suite: 29 passed, 0 failed.
- Added API cases API30–API32: 3 passed, 0 failed (run separately using
  `node --test --test-name-pattern='API3[0-2]' tests/api.test.mjs`).
- Chrome: receptionist login, Rooms occupancy cards, availability filter and Billing export link checked.
- Q14 EXPLAIN ANALYZE: 12 department rows; plan saved in `q14-explain.txt`.

API tests write demo records. SQL tests roll back data but advance sequences.
The Docker startup recovery is an environment limitation; the untouched one-command
Docker initialization did not pass on this machine.

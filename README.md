# CareFlow HMS — Hospital Operations Management with Semantic Triage

DBMS Experiential Learning – Level 3 Project · Department of CSE, PES University

Repository: https://github.com/Catherine61005/careflow-hms

| Team member | SRN | Module ownership |
|---|---|---|
| Bhavesh Velluru | PES1UG24CS115 | Inpatient & finance: admissions, rooms, billing, payments, reports |
| Catherine D | PES1UG24CS120 | Outpatient & clinical: patients, appointments, labs, prescriptions, semantic triage, auth |

See [`CONTRIBUTIONS.md`](CONTRIBUTIONS.md) for the file-level split.

## Problem statement

A multispeciality hospital (without pharmacy / supply chain) has to register patients, route each patient to the right
department and doctor, book appointments without double-booking, admit and move inpatients between rooms, bill them
correctly on discharge, and track lab results and prescriptions — with every rule holding even when two receptionists
act at the same moment.

The hard part is not storing the records; it is **routing**. Patients describe complaints in their own words
("my chest feels heavy and the pain goes into my arm"). A keyword search over past cases finds nothing for that text,
because no record contains those exact words. CareFlow uses a **vector store** for this unstructured text and a
**relational database** for everything that must be consistent.

## Why these databases

| Data | Database | Why |
|---|---|---|
| Patients, doctors, appointments, admissions, rooms, bills, payments, prescriptions, tests | **PostgreSQL (relational)** | Highly structured and interlinked; money and bed allocation need ACID transactions, foreign keys, CHECK and EXCLUDE constraints, row locks. |
| Free-text admission reasons and department profiles | **pgvector (vector database)** | Meaning-based retrieval: semantically similar complaints must match even with zero shared words. Stored as `vector(384)`, searched by cosine distance with an HNSW index. |
| Short structured text (reasons, names) | PostgreSQL full-text (GIN) + trigram | Exact-term and typo-tolerant search where keywords *are* enough. |

pgvector lives in the same PostgreSQL server, so an embedding and the admission it describes can be joined in one
query (for example "similar past cases → their length of stay and bill"). No second database has to be kept in sync.

## Features

- **Smart Triage (vector search)** — complaint text → embedding → 20 nearest past cases → similarity-weighted department
  vote → least-loaded doctor in that department with their next free 30-minute slot → one-click booking. Keyword
  results are shown side by side to make the difference visible.
- **Similar past cases** for any admission — typical length of stay and bill of the nearest neighbours.
- **Appointments** — 30-minute slot double-booking blocked by a GiST `EXCLUDE` constraint; past bookings blocked by trigger.
- **Admissions** — admit (row-locked room + admission + allocation in one transaction), transfer, discharge
  (stored procedure closes the stay, frees the room, generates the bill).
- **Live ward board** — room availability derived by triggers, never edited by hand.
- **Billing** — partial / full payments; status maintained by trigger; overpayment rejected by the database.
- **Labs & prescriptions** — results auto-complete tests and abnormal values are flagged; multi-medicine prescriptions
  are all-or-nothing.
- **Dashboards & reports** — KPIs, GROUP BY/HAVING, window functions, receivables ageing, materialized view.
- **Auth & RBAC** — bcrypt + JWT (httpOnly cookie); roles **admin / receptionist / doctor** checked in every API route;
  disabled users lose access immediately; database role `hms_app` has no DDL rights.
- **Audit trail** — trigger writes old/new JSONB for every change with the acting username.

## Tech stack

Next.js 16 (App Router, Route Handlers) · React 19 · TypeScript · PostgreSQL 16 · pgvector 0.8 · pg_trgm · btree_gist ·
transformers.js (all-MiniLM-L6-v2, runs locally, no API key) · zod · jose · bcryptjs · node:test

## Repository layout

```
db/
  01_schema.sql              DDL: tables, keys, domains, CHECK/EXCLUDE constraints, indexes (B-tree, partial, GIN, trigram, HNSW)
  02_functions_triggers.sql  functions, stored procedure, 7 triggers
  03_views.sql               5 views + 1 materialized view
  04_roles.sql               database roles hms_app / hms_readonly (least privilege)
  05_alter_migration.sql     ALTER / DROP schema evolution
  06_seed.sql                generated demo data (dates relative to CURRENT_DATE)
  07_queries.sql             15 important queries (JOIN, GROUP BY/HAVING, subqueries, CTE, window, FTS, EXPLAIN)
  seed/generate_seed.py      deterministic seed generator
  tests/integrity_tests.sql  38 database test cases (self-rolling-back)
  docker-init.sh             first-start initialisation for docker compose
web/
  app/(app)/...              UI pages        app/api/...   backend API (Route Handlers)
  lib/                       db, auth, http errors, validators, embeddings, vector store
  scripts/setup-db.mjs       cross-platform DB setup      scripts/embed-backfill.mjs  vector backfill
  tests/api.test.mjs         33 end-to-end API tests
docs/                        ER diagram, relational schema, architecture, screenshots, test outputs
```

## Setup

Prerequisites: **Node.js 20+** and either **Docker Desktop** (easiest) or a local **PostgreSQL 16 with pgvector**.

### Option A — Docker (recommended, works on Windows/macOS/Linux)

```bash
git clone https://github.com/Catherine61005/careflow-hms.git && cd careflow-hms
docker compose up -d                 # PostgreSQL + pgvector, schema and seed loaded automatically
cd web
cp .env.example .env.local           # Windows: copy .env.example .env.local
# edit .env.local: keep HMS_APP_PASSWORD=change_me (matches docker-compose) and set JWT_SECRET
npm install
npm run embed                        # downloads the embedding model once (~90 MB) and fills the vector store
npm run dev                          # http://localhost:3000
```

If Docker reports `/bin/bash: bad interpreter: Permission denied` while running the
initialization script, and the new database has no `hms` schema, initialize it explicitly:

```bash
docker exec careflow-db bash /hms-db/docker-init.sh
```

This script drops and recreates the HMS schema. Use this recovery only for a new,
empty development database; do not run it against data you want to keep.

### Option B — Local PostgreSQL

1. Install PostgreSQL 16 and the pgvector extension (Windows: use the pgvector installer or build per the pgvector README).
2. `createdb hms`
3. In `web/.env.local` set `DATABASE_ADMIN_URL` (a superuser connection), `HMS_APP_PASSWORD`, `DATABASE_URL`
   (`postgres://hms_app:<HMS_APP_PASSWORD>@localhost:5432/hms`) and `JWT_SECRET`.
4. ```bash
   cd web && npm install
   npm run db:setup    # runs db/01..06 (drops and recreates schema hms)
   npm run embed
   npm run dev
   ```

### Demo accounts

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin@123` |
| Receptionist | `reception` | `Reception@123` |
| Doctor | `dr.arjun1` (others listed under Admin → Users) | `Doctor@123` |

These are demo credentials created by the seed; change them before any real use.

## Tests

```bash
psql "$DATABASE_ADMIN_URL" -f db/tests/integrity_tests.sql   # 38 DB tests, rolled back after running
cd web && npm run build && npm start &                        # or npm run dev
npm test                                                      # 33 API tests (writes demo rows)
```

Latest results are in `docs/test-results/` (see the dated run notes for the latest counts).

## Requirement coverage

| Requirement | Where |
|---|---|
| SQL (PostgreSQL) + vector DB (pgvector) | `db/01_schema.sql`, `clinical_embedding` |
| ER diagram → relational schema | `docs/ER_Diagram.png`, `docs/Relational_Schema.png` |
| CREATE / ALTER / DROP, PK/FK, constraints, indexes, views | `db/01`, `db/05`, `db/03` |
| INSERT / UPDATE / DELETE / SELECT from the app | `web/app/api/**` |
| JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries | `db/07_queries.sql`, dashboard / reports / doctors APIs |
| ≥4 advanced SQL features | transactions + row locks, views + materialized view, functions + procedure, 7 triggers, B-tree/partial/GIN/HNSW indexes, full-text search, exclusion constraints, window functions |
| ≥1 advanced vector feature | cosine k-NN with HNSW (`/api/triage`, `/api/admissions/[id]/similar`) |
| Next.js UI with forms, tables, search, filters, dashboards | `web/app/(app)/**` |
| API layer, no hard-coded credentials, env vars | `web/app/api`, `web/lib/db.ts`, `.env.example` |
| Backend authentication, ≥2 roles | `web/lib/auth.ts` — admin, receptionist, doctor |
| Database-level validation and integrity | domains, CHECK, FK, EXCLUDE, partial unique index, triggers |
| Test cases | `db/tests/integrity_tests.sql`, `web/tests/api.test.mjs` |

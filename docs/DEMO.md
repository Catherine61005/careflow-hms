# CareFlow HMS demo and submission

**Title to register:** careflow-hms

**Repository:** https://github.com/Catherine61005/careflow-hms

**Team:** Catherine D (PES1UG24CS120) and Bhavesh Velluru (PES1UG24CS115)

**Database option:** PostgreSQL plus pgvector (Option 2)

## Rehearse on both laptops

1. Check out the same final Git revision on each laptop. Follow the [README](../README.md) for Docker or local PostgreSQL. On the Docker path, run `docker compose up -d --build` and wait for `CareFlow database ready` in the database logs on first startup.
2. In `web/`, install dependencies with `npm ci`, copy `.env.example` to `.env.local`, set an independent `JWT_SECRET`, and keep the database connection credentials consistent with the database setup. Run `npm run embed` while online so both systems cache the model. Run `npm run dev` and open the printed localhost URL.
3. Sign in as the seeded receptionist and try the cardiac complaint below. Verify the recommendation, keyword comparison, and Similar Past Cases on **each** machine. Then test the SQL workflow with disposable demo data. Keep the seeded database and cached model on both laptops.
4. If an earlier Compose startup left a **disposable, empty** development volume, recreate it using `docker compose down -v` and `docker compose up -d --build`. Removing a volume deletes its data. The first-start scripts run only for a fresh database.

## 30-minute demo

| Time | Presenter | Show and explain |
|---|---|---|
| 00:00–03:00 | Catherine | Problem, ER diagram and relational schema. Identify PKs, FKs, the composite medication key and the optional bill/admission relationship. |
| 03:00–09:00 | Catherine | Book an appointment, then attempt an overlapping slot for the same doctor. Admit, transfer and discharge a demo patient. Show room availability and the generated bill. Trace the app actions to the API, transaction, procedure and constraints. |
| 09:00–12:00 | Catherine | Show Q14 or Q15, one SQL integrity test, and the schema and patient-search commits. Demonstrate DML including admin-only DELETE using a disposable patient with no dependent records if asked. |
| 12:00–15:00 | Bhavesh | Explain why the project uses pgvector for clinical text. Show the MiniLM model, 384-dimensional vectors, model metadata and cosine HNSW index. |
| 15:00–21:00 | Bhavesh | In Smart Triage enter “my chest feels heavy and the pain goes into my left arm”. Compare semantic matches with the keyword results and show the suggested slot. Open Similar Past Cases on an admission and explain the relational joins for stay length and billing. |
| 21:00–24:00 | Bhavesh | Show API25–API27 and the vector retrieval, post-response indexing, and test diffs linked from [CONTRIBUTIONS.md](../CONTRIBUTIONS.md). Explain why mixed-model vectors are filtered. |
| 24:00–30:00 | Both | Reserve three minutes each for individual questions. |

## Before and after the lab

- Confirm the allotted session and verify with the instructor that the title and scope are unique within the section. Enter **careflow-hms** in the official title sheet once available. Check the initial lab topic reference when shared.
- Bring one **A4 landscape** ER print and one **A4 portrait** relational schema print. Use the [print PDFs](../output/pdf/) at actual size. Both list the project title and team names.
- Complete the live demo with the app working on both laptops. **Only after the demo**, submit the final report PDF and the GitHub repository URL in the official Google Form.

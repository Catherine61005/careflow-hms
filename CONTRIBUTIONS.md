# Team responsibilities

The Level 3 brief asks both members to contribute to database and application development. The table assigns equal presentation time and gives each member a database walkthrough, an application demo, and a test to explain.

| Time | Catherine D (PES1UG24CS120) | Bhavesh V (PES1UG24CS115) |
|---|---|---|
| 3 minutes each | **Relational design.** Introduce the hospital workflow, ER diagram, relational schema, keys, and integrity constraints. | **Vector design.** Explain why admission reasons and department profiles are embedded, how MiniLM produces 384-dimensional vectors, and which metadata the vector table stores. |
| 6 minutes each | **SQL and Next.js.** Book a visit and show the overlap constraint. Show how discharge frees a room and creates a bill. Trace the app actions to the route handlers and SQL. | **pgvector and Next.js.** Use Smart Triage to compare semantic and keyword results and show the suggested doctor and slot. Open Similar Past Cases and show how cosine neighbours link to stays and bills. |
| 3 minutes each | **SQL verification.** Run an overlap or billing integrity test and explain the constraint or trigger that enforces it. | **Vector verification.** Show the embedding inventory and one retrieval test. Explain same-model filtering and how the similar-cases test waits for a new embedding. |

The remaining six minutes are for individual questions, with three minutes reserved for each member. See the [demo runbook](docs/DEMO.md).

## GitHub evidence

The presentation assignments above describe current ownership. These links show which changes each member's account committed.

- **Catherine.** [Initial schema, triggers, views, and roles](https://github.com/Catherine61005/careflow-hms/commit/0cef2f6), [missed follow-ups SQL report](https://github.com/Catherine61005/careflow-hms/commit/28ad2f8), [patient email search in SQL and the app](https://github.com/Catherine61005/careflow-hms/commit/d37a5bb), and [initial app libraries including vector support](https://github.com/Catherine61005/careflow-hms/commit/4132e63).
- **Bhavesh.** [Length-of-stay SQL report](https://github.com/Catherine61005/careflow-hms/commit/a3b7f50), [SQL integrity tests](https://github.com/Catherine61005/careflow-hms/commit/0915220), and [ward and billing UI/API work](https://github.com/Catherine61005/careflow-hms/pull/1). The vector changes cover [same-model retrieval and backfill](https://github.com/Catherine61005/careflow-hms/commit/9cc3446), [the similar-cases API test](https://github.com/Catherine61005/careflow-hms/commit/269df9e), [model-load retry](https://github.com/Catherine61005/careflow-hms/commit/3d1b59d), and [post-response admission indexing](https://github.com/Catherine61005/careflow-hms/commit/996573b).

## Vector demo checklist

1. Use a seeded development database and run `npm run embed` from `web/` before starting the app. After changing to a compatible 384-dimensional model, rerun backfill to refresh admission vectors from the old model.
2. In PostgreSQL, check the model and dimensions present in the vector store. Explain how cosine distance (`<=>`) orders neighbours and how the HNSW index supports that search.

   ```sql
   SELECT source_type, model, hms.vector_dims(embedding) AS dimensions, count(*) AS rows
   FROM hms.clinical_embedding
   GROUP BY source_type, model, hms.vector_dims(embedding)
   ORDER BY source_type, model, dimensions;
   ```

3. Sign in as receptionist and try “my chest feels heavy and the pain goes into my left arm” in Smart Triage. Compare the recommendation and similar cases with the keyword results. Then open a seeded admission's Similar Past Cases view.
4. Run the full API suite against the development app and check API25–API27. API27 uses the admission created earlier in the suite. The suite writes demo records.

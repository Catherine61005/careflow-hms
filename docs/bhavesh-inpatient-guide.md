# Inpatient and finance improvements — review guide

These changes were implemented with Codex assistance for Bhavesh Velluru. Review
and run them yourself before your viva; commit authorship does not demonstrate understanding.

## Q14: department length of stay

Run `docker exec careflow-db psql -U postgres -d hms -f /hms-db/07_queries.sql`.
Q14 joins admission → doctor → department, excludes unfinished stays, and groups by
department ID. Date subtraction returns elapsed days, so same-day stays are zero.
`DENSE_RANK` ranks department averages without gaps for ties. `AVG(...) OVER ()`
adds an unweighted mean of department averages without collapsing the rows.
That mean is different from a patient-weighted hospital average.
Departments without completed admissions do not appear.

The measured plan is in `test-results/q14-explain.txt`. Reproduce it by putting
`EXPLAIN (ANALYZE, BUFFERS)` before Q14's `WITH`. The small seeded tables use
sequential scans, hash joins, aggregation, sorting and two WindowAgg nodes.
Sequential scans on small tables are normal; this is evidence, not an index claim.

## TC36–TC38: transfer and billing

Run `docker exec careflow-db psql -U postgres -d hms -v ON_ERROR_STOP=1 -f /hms-db/tests/integrity_tests.sql`.
TC36 checks that transfer frees the old room, occupies the destination, and leaves
one active allocation. TC37 checks 2 × 1500 + 1 × 5500 + 3 × 500 = ₹10,000 after
discharge. TC38 checks that payment cannot predate its bill. Dedicated temporary
fixture rooms avoid depending on seed room history. The suite rolls back its rows
(sequence numbers can still advance in PostgreSQL).

## Ward occupancy

`/api/rooms` returns occupancy grouped by room type, calculated separately from
the availability filter. Occupancy = occupied / total × 100, rounded to one decimal.
Maintenance rooms count in total, matching Q8; the page states this explicitly.
Click Available or Occupied: the board changes, the ward percentages stay stable.

## Billing CSV

Sign in as receptionist, open Billing, select a status or search, and click
“Export matching bills (CSV)”. The export keeps those filters and includes all
matching bills, while the screen remains limited to 200. Only admin and receptionist
can export. Fields are quoted, quotes are doubled, lines use CRLF, and a UTF-8 BOM
helps Excel display names. Formula-like values get an apostrophe prefix to stop
spreadsheet evaluation. INR amounts are exported as plain decimal values.

## Local startup and verification

Follow README's Docker → `.env.local` → `npm install` → `npm run embed` →
`npm run dev` workflow. Keep `.env.local` private. On this Mac, Docker could not
execute the mounted initialization script directly; the README documents explicit
Bash recovery for a new empty development database.

Demo login: reception / Reception@123; admin / Admin@123.
API tests create demo data: use only a development database.
Run `cd web && npm test`; run `npm run build` to check TypeScript and production compilation.

## Viva questions to practise

- Why exclude open admissions, and why is a same-day elapsed stay zero?
- Why group by department ID rather than name alone?
- How does a window function preserve rows while GROUP BY collapses them?
- Why can changing the board filter not change true occupancy?
- How do row locks, exclusion constraints and triggers protect transfers/payments?
- Why must CSV export check roles on the server, and why quote and neutralise cells?

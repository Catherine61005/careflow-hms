# Individual contributions

Both members work on the database **and** the application, as the project brief requires.
Each member commits their own files from their own GitHub account so the commit history shows the split.

## Member 1 — Bhavesh Velluru — PES1UG24CS115 — Inpatient & finance

**Database**
- Tables: `room`, `room_allocation`, `admission`, `bill`, `payment` (+ their constraints: `ex_room_overlap`, `uq_one_open_admission`, `ck_discharge_after_admit`, `money_inr` domain)
- `fn_calculate_bill`, `fn_bill_outstanding`, `fn_admit_patient`, `fn_transfer_room`, `sp_discharge_patient`
- Triggers: room availability (T3), payment validation (T4), bill status (T5)
- Views: `v_current_occupancy`, `v_bill_status`, `mv_monthly_department_revenue`; `fn_refresh_revenue`
- Queries Q1, Q2, Q6, Q8, Q9, Q14 in `07_queries.sql`; integrity tests TC17–TC30, TC36–TC38

**Application**
- APIs: `/api/admissions/**`, `/api/rooms/**`, `/api/bills/**`, `/api/reports/revenue`, `/api/dashboard`
- Pages: Admissions, Rooms, Billing, Reports, Dashboard
- API tests API16–API21, API30–API32

## Member 2 — Catherine D — PES1UG24CS120 — Outpatient, clinical & triage

**Database**
- Tables: `hospital`, `department`, `doctor`, `patient`, `appointment`, `prescription`, `medication`, `test`, `test_result`, `app_user`, `audit_log`, `clinical_embedding`
- `phone_no` domain, `ex_doctor_slot` exclusion constraint, FTS / trigram / HNSW indexes
- Triggers: DOB (T1), appointment-in-past (T2), result-completes-test (T6), audit (T7); `fn_is_abnormal`, `fn_patient_age`
- Views: `v_patient_summary`, `v_doctor_schedule`, `v_test_results`; roles in `04_roles.sql`; `05_alter_migration.sql`
- Vector store design and embedding pipeline (`embed-backfill.mjs`, `lib/embeddings.ts`, `lib/vectorstore.ts`)
- Queries Q3, Q4, Q5, Q7, Q10–Q13; integrity tests TC01–TC16, TC31–TC35

**Application**
- Auth & RBAC (`lib/auth.ts`, `proxy.ts`, login, `/api/admin/**`)
- APIs: `/api/patients/**`, `/api/appointments/**`, `/api/prescriptions`, `/api/tests/**`, `/api/triage`, `/api/doctors`, `/api/departments`
- Pages: Smart Triage, Patients, Patient detail, Appointments, Prescriptions & Labs, Users & Audit
- API tests API01–API15, API22–API29

## Shared
ER diagram and relational schema, seed generator, README, project report.

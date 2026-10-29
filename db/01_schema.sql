-- =====================================================================
-- CareFlow HMS - 01_schema.sql
-- DDL: tables, primary/foreign keys, constraints, indexes
-- Target: PostgreSQL 16 + pgvector
-- Maps 1:1 to the submitted relational schema (14 tables), plus:
--   app_user        (authentication / RBAC)
--   audit_log       (trigger-maintained change history)
--   clinical_embedding (vector store for semantic triage)
-- =====================================================================

-- Re-runnable: drop everything first (DROP demonstration)
DROP SCHEMA IF EXISTS hms CASCADE;
CREATE SCHEMA hms;
SET search_path TO hms, public;

CREATE EXTENSION IF NOT EXISTS vector;      -- vector type + HNSW index
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- exclusion constraints mixing = and &&
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- trigram index for fuzzy name search

-- ---------------------------------------------------------------------
-- Domains: reusable, database-level validation
-- ---------------------------------------------------------------------
CREATE DOMAIN phone_no AS VARCHAR(15)
    CHECK (VALUE ~ '^\+?[0-9]{10,13}$');

CREATE DOMAIN money_inr AS NUMERIC(12,2)
    CHECK (VALUE >= 0);

-- ---------------------------------------------------------------------
-- HOSPITAL
-- ---------------------------------------------------------------------
CREATE TABLE hospital (
    hospital_id     SERIAL PRIMARY KEY,
    hospital_name   VARCHAR(120) NOT NULL,
    location        VARCHAR(120) NOT NULL,
    contact_number  phone_no     NOT NULL,
    CONSTRAINT uq_hospital_name_loc UNIQUE (hospital_name, location)
);

-- ---------------------------------------------------------------------
-- DEPARTMENT  (Hospital 1 : N Department)
-- ---------------------------------------------------------------------
CREATE TABLE department (
    department_id   SERIAL PRIMARY KEY,
    department_name VARCHAR(80)  NOT NULL,
    location        VARCHAR(80)  NOT NULL,          -- e.g. "Block A, Floor 2"
    hospital_id     INT          NOT NULL
        REFERENCES hospital(hospital_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT uq_dept_per_hospital UNIQUE (hospital_id, department_name)
);

-- ---------------------------------------------------------------------
-- DOCTOR  (Department 1 : N Doctor)
-- ---------------------------------------------------------------------
CREATE TABLE doctor (
    doctor_id       SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL CHECK (length(trim(name)) >= 3),
    specialization  VARCHAR(80)  NOT NULL,
    phone_number    phone_no     NOT NULL UNIQUE,
    department_id   INT          NOT NULL
        REFERENCES department(department_id) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------
-- PATIENT  (Hospital 1 : N Patient)
-- ---------------------------------------------------------------------
CREATE TABLE patient (
    patient_id      SERIAL PRIMARY KEY,
    first_name      VARCHAR(60)  NOT NULL CHECK (first_name ~ '^[A-Za-z .''-]+$'),
    last_name       VARCHAR(60)  NOT NULL CHECK (last_name  ~ '^[A-Za-z .''-]+$'),
    gender          VARCHAR(10)  NOT NULL CHECK (gender IN ('Male','Female','Other')),
    date_of_birth   DATE         NOT NULL CHECK (date_of_birth >= DATE '1900-01-01'),
    phone_number    phone_no     NOT NULL,
    hospital_id     INT          NOT NULL
        REFERENCES hospital(hospital_id) ON UPDATE CASCADE ON DELETE RESTRICT
);
-- (future-DOB check needs CURRENT_DATE, which is not immutable -> enforced by trigger)

-- ---------------------------------------------------------------------
-- APPOINTMENT  (Patient 1:N, Doctor 1:N)
-- ---------------------------------------------------------------------
CREATE TABLE appointment (
    appointment_id   SERIAL PRIMARY KEY,
    patient_id       INT       NOT NULL
        REFERENCES patient(patient_id) ON DELETE CASCADE,
    doctor_id        INT       NOT NULL
        REFERENCES doctor(doctor_id) ON DELETE RESTRICT,
    appointment_date TIMESTAMP NOT NULL,
    status           VARCHAR(12) NOT NULL DEFAULT 'Scheduled'
        CHECK (status IN ('Scheduled','Completed','Cancelled','No-Show')),
    -- A doctor cannot have two *scheduled* appointments within the same 30-min slot
    CONSTRAINT ex_doctor_slot EXCLUDE USING gist (
        doctor_id WITH =,
        tsrange(appointment_date, appointment_date + INTERVAL '30 minutes', '[)') WITH &&
    ) WHERE (status = 'Scheduled')
);

-- ---------------------------------------------------------------------
-- ADMISSION  (Patient 1:N, Doctor 1:N)
-- ---------------------------------------------------------------------
CREATE TABLE admission (
    admission_id    SERIAL PRIMARY KEY,
    patient_id      INT   NOT NULL REFERENCES patient(patient_id) ON DELETE RESTRICT,
    doctor_id       INT   NOT NULL REFERENCES doctor(doctor_id)  ON DELETE RESTRICT,
    admission_date  DATE  NOT NULL DEFAULT CURRENT_DATE,
    discharge_date  DATE,
    reason          TEXT  NOT NULL CHECK (length(trim(reason)) >= 5),
    CONSTRAINT ck_discharge_after_admit
        CHECK (discharge_date IS NULL OR discharge_date >= admission_date)
);

-- ---------------------------------------------------------------------
-- ROOM
-- ---------------------------------------------------------------------
CREATE TABLE room (
    room_id         SERIAL PRIMARY KEY,
    room_number     VARCHAR(10)  NOT NULL UNIQUE,
    room_type       VARCHAR(15)  NOT NULL
        CHECK (room_type IN ('General','Semi-Private','Private','ICU')),
    charge_per_day  money_inr    NOT NULL CHECK (charge_per_day > 0),
    availability    VARCHAR(12)  NOT NULL DEFAULT 'Available'
        CHECK (availability IN ('Available','Occupied','Maintenance'))
);

-- ---------------------------------------------------------------------
-- ROOM_ALLOCATION  (Admission 1:N, Room 1:N)
-- ---------------------------------------------------------------------
CREATE TABLE room_allocation (
    allocation_id   SERIAL PRIMARY KEY,
    admission_id    INT  NOT NULL REFERENCES admission(admission_id) ON DELETE CASCADE,
    room_id         INT  NOT NULL REFERENCES room(room_id) ON DELETE RESTRICT,
    from_date       DATE NOT NULL,
    to_date         DATE,
    CONSTRAINT ck_alloc_dates CHECK (to_date IS NULL OR to_date >= from_date),
    -- The same room can never be allocated to two admissions over overlapping dates
    CONSTRAINT ex_room_overlap EXCLUDE USING gist (
        room_id WITH =,
        daterange(from_date, COALESCE(to_date, 'infinity'::date), '[)') WITH &&
    )
);

-- ---------------------------------------------------------------------
-- BILL  (Patient 1:N, Admission 1:1)
-- ---------------------------------------------------------------------
CREATE TABLE bill (
    bill_id         SERIAL PRIMARY KEY,
    patient_id      INT        NOT NULL REFERENCES patient(patient_id) ON DELETE RESTRICT,
    admission_id    INT        UNIQUE REFERENCES admission(admission_id) ON DELETE RESTRICT,
    bill_date       DATE       NOT NULL DEFAULT CURRENT_DATE,
    total_amount    money_inr  NOT NULL,
    status          VARCHAR(15) NOT NULL DEFAULT 'Unpaid'
        CHECK (status IN ('Unpaid','Partially Paid','Paid','Cancelled'))
);

-- ---------------------------------------------------------------------
-- PAYMENT  (Bill 1:N)
-- ---------------------------------------------------------------------
CREATE TABLE payment (
    payment_id      SERIAL PRIMARY KEY,
    bill_id         INT        NOT NULL REFERENCES bill(bill_id) ON DELETE RESTRICT,
    payment_date    DATE       NOT NULL DEFAULT CURRENT_DATE,
    amount          money_inr  NOT NULL CHECK (amount > 0),
    payment_method  VARCHAR(12) NOT NULL
        CHECK (payment_method IN ('Cash','Card','UPI','NetBanking','Insurance'))
);

-- ---------------------------------------------------------------------
-- PRESCRIPTION  (Patient 1:N, Doctor 1:N)
-- ---------------------------------------------------------------------
CREATE TABLE prescription (
    prescription_id   SERIAL PRIMARY KEY,
    patient_id        INT  NOT NULL REFERENCES patient(patient_id) ON DELETE CASCADE,
    doctor_id         INT  NOT NULL REFERENCES doctor(doctor_id)  ON DELETE RESTRICT,
    prescription_date DATE NOT NULL DEFAULT CURRENT_DATE
);

-- ---------------------------------------------------------------------
-- MEDICATION  (weak entity of PRESCRIPTION; partial key = medicine_name)
-- ---------------------------------------------------------------------
CREATE TABLE medication (
    prescription_id INT          NOT NULL
        REFERENCES prescription(prescription_id) ON DELETE CASCADE,
    medicine_name   VARCHAR(100) NOT NULL,
    dosage          VARCHAR(30)  NOT NULL,          -- e.g. "500 mg"
    frequency       VARCHAR(30)  NOT NULL,          -- e.g. "1-0-1"
    duration        VARCHAR(30)  NOT NULL,          -- e.g. "5 days"
    PRIMARY KEY (prescription_id, medicine_name)
);

-- ---------------------------------------------------------------------
-- TEST  (Patient 1:N, Doctor 1:N)
-- ---------------------------------------------------------------------
CREATE TABLE test (
    test_id     SERIAL PRIMARY KEY,
    patient_id  INT          NOT NULL REFERENCES patient(patient_id) ON DELETE CASCADE,
    doctor_id   INT          NOT NULL REFERENCES doctor(doctor_id)  ON DELETE RESTRICT,
    test_name   VARCHAR(100) NOT NULL,
    test_date   DATE         NOT NULL DEFAULT CURRENT_DATE,
    status      VARCHAR(12)  NOT NULL DEFAULT 'Ordered'
        CHECK (status IN ('Ordered','In Progress','Completed','Cancelled'))
);

-- ---------------------------------------------------------------------
-- TEST_RESULT  (Test 1:N - one row per measured parameter)
-- ---------------------------------------------------------------------
CREATE TABLE test_result (
    result_id       SERIAL PRIMARY KEY,
    test_id         INT          NOT NULL REFERENCES test(test_id) ON DELETE CASCADE,
    result_value    VARCHAR(40)  NOT NULL,
    units           VARCHAR(20),
    reference_range VARCHAR(40)                       -- "70-110" or "Negative"
);

-- =====================================================================
-- Application-support tables (not part of the clinical ER)
-- =====================================================================
CREATE TABLE app_user (
    user_id       SERIAL PRIMARY KEY,
    username      VARCHAR(40)  NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_.]{3,40}$'),
    password_hash TEXT         NOT NULL,
    full_name     VARCHAR(100) NOT NULL,
    role          VARCHAR(15)  NOT NULL CHECK (role IN ('admin','receptionist','doctor')),
    doctor_id     INT UNIQUE REFERENCES doctor(doctor_id) ON DELETE SET NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- doctor accounts must be linked to a DOCTOR row; others must not be
    CONSTRAINT ck_doctor_link CHECK ((role = 'doctor') = (doctor_id IS NOT NULL))
);

CREATE TABLE audit_log (
    audit_id    BIGSERIAL PRIMARY KEY,
    table_name  TEXT        NOT NULL,
    operation   TEXT        NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
    row_pk      TEXT,
    old_data    JSONB,
    new_data    JSONB,
    changed_by  TEXT        NOT NULL DEFAULT current_setting('hms.app_user', true),
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vector store: embeddings of free-text clinical data for semantic triage
CREATE TABLE clinical_embedding (
    embedding_id  SERIAL PRIMARY KEY,
    source_type   VARCHAR(12) NOT NULL CHECK (source_type IN ('admission','department')),
    source_id     INT         NOT NULL,
    department_id INT         NOT NULL REFERENCES department(department_id) ON DELETE CASCADE,
    content       TEXT        NOT NULL,
    embedding     vector(384) NOT NULL,          -- all-MiniLM-L6-v2 output size
    model         VARCHAR(60) NOT NULL DEFAULT 'Xenova/all-MiniLM-L6-v2',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_embedding_source UNIQUE (source_type, source_id)
);

-- =====================================================================
-- INDEXES
-- =====================================================================
-- FK indexes (Postgres does not create these automatically)
CREATE INDEX ix_department_hospital  ON department(hospital_id);
CREATE INDEX ix_doctor_department    ON doctor(department_id);
CREATE INDEX ix_patient_hospital     ON patient(hospital_id);
CREATE INDEX ix_appt_patient         ON appointment(patient_id);
CREATE INDEX ix_admission_patient    ON admission(patient_id);
CREATE INDEX ix_admission_doctor     ON admission(doctor_id);
CREATE INDEX ix_alloc_admission      ON room_allocation(admission_id);
CREATE INDEX ix_bill_patient         ON bill(patient_id);
CREATE INDEX ix_payment_bill         ON payment(bill_id);
CREATE INDEX ix_prescription_patient ON prescription(patient_id);
CREATE INDEX ix_test_patient         ON test(patient_id);
CREATE INDEX ix_result_test          ON test_result(test_id);

-- Composite index: "doctor's schedule for a day" is the hottest query
CREATE INDEX ix_appt_doctor_date ON appointment(doctor_id, appointment_date);

-- Partial unique index: a patient can have at most ONE open admission
CREATE UNIQUE INDEX uq_one_open_admission ON admission(patient_id)
    WHERE discharge_date IS NULL;

-- Partial index: dashboards only ever scan unsettled bills
CREATE INDEX ix_bill_unsettled ON bill(bill_date) WHERE status IN ('Unpaid','Partially Paid');

-- Full-text search over admission reasons (GIN on expression)
CREATE INDEX ix_admission_reason_fts ON admission
    USING gin (to_tsvector('english', reason));

-- Trigram index for fuzzy patient-name search (typos, partial names)
CREATE INDEX ix_patient_name_trgm ON patient
    USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

-- HNSW approximate-nearest-neighbour index for cosine similarity
CREATE INDEX ix_embedding_hnsw ON clinical_embedding
    USING hnsw (embedding vector_cosine_ops);

-- =====================================================================
-- CareFlow HMS - 05_alter_migration.sql
-- Schema evolution after the initial design (ALTER / DROP demonstration).
-- Each change is justified by a requirement discovered during development.
-- =====================================================================
SET search_path TO hms, public;

-- 1) Patients asked for e-mailed lab reports -> optional, validated e-mail
ALTER TABLE patient
    ADD COLUMN email VARCHAR(120)
    CONSTRAINT ck_patient_email CHECK (email IS NULL OR email ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$');

-- 2) Front desk records the presenting complaint at booking time
--    (free text -> also searchable with full-text search)
ALTER TABLE appointment ADD COLUMN symptoms TEXT;
CREATE INDEX ix_appt_symptoms_fts ON appointment USING gin (to_tsvector('english', COALESCE(symptoms, '')));

-- 3) Tariff guard rail: ICU must be the most expensive room class
ALTER TABLE room
    ADD CONSTRAINT ck_icu_min_charge CHECK (room_type <> 'ICU' OR charge_per_day >= 5000);

-- 4) Make test_date default explicit and tighten a column length
ALTER TABLE test ALTER COLUMN test_date SET DEFAULT CURRENT_DATE;
-- (hospital.hospital_name cannot be retyped in place: v_patient_summary depends on it,
--  Postgres refuses with "cannot alter type of a column used by a view". A column no view uses:)
ALTER TABLE department ALTER COLUMN location TYPE VARCHAR(100);

-- 5) DROP demonstration: a staging table used for a one-time bulk import
CREATE TABLE tmp_patient_import (LIKE patient INCLUDING DEFAULTS);
-- ... COPY tmp_patient_import FROM ...; INSERT INTO patient SELECT ... ;
DROP TABLE tmp_patient_import;

-- 6) Drop an index made redundant by the composite (doctor_id, appointment_date) index
CREATE INDEX ix_appt_doctor ON appointment(doctor_id);
DROP INDEX ix_appt_doctor;   -- leading column of ix_appt_doctor_date already serves doctor_id lookups

-- Views selecting p.* are not affected; re-grant for new objects
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA hms TO hms_app;

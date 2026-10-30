-- =====================================================================
-- CareFlow HMS - integrity_tests.sql
-- Database-level test cases. Each test runs a statement that MUST be
-- rejected (or must succeed) and records PASS/FAIL. Everything is rolled
-- back at the end, so the test suite never changes the data.
-- Run:  psql "$DATABASE_URL" -f db/tests/integrity_tests.sql
-- =====================================================================
SET search_path TO hms, public;
\set QUIET on
BEGIN;

CREATE TEMP TABLE t_results (id SERIAL, test TEXT, expected TEXT, outcome TEXT, detail TEXT);
GRANT ALL ON t_results TO hms_app, hms_readonly;
GRANT USAGE ON SEQUENCE t_results_id_seq TO hms_app, hms_readonly;

-- expect_fail: statement must raise an error
CREATE OR REPLACE FUNCTION pg_temp.expect_fail(p_name TEXT, p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
        INSERT INTO t_results (test, expected, outcome, detail) VALUES (p_name, 'reject', 'FAIL', 'statement was accepted');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO t_results (test, expected, outcome, detail) VALUES (p_name, 'reject', 'PASS', SQLERRM);
    END;
END $$;

-- expect_true: query must return TRUE
CREATE OR REPLACE FUNCTION pg_temp.expect_true(p_name TEXT, p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE ok BOOLEAN;
BEGIN
    EXECUTE p_sql INTO ok;
    INSERT INTO t_results (test, expected, outcome, detail)
    VALUES (p_name, 'true', CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, p_sql);
EXCEPTION WHEN OTHERS THEN
    INSERT INTO t_results (test, expected, outcome, detail) VALUES (p_name, 'true', 'FAIL', SQLERRM);
END $$;

-- ---------------------------------------------------------------- domain / CHECK
SELECT pg_temp.expect_fail('TC01 invalid phone number rejected (domain phone_no)',
  $$INSERT INTO patient (first_name,last_name,gender,date_of_birth,phone_number,hospital_id)
    VALUES ('Test','User','Male','2000-01-01','12ab',1)$$);
SELECT pg_temp.expect_fail('TC02 invalid gender rejected (CHECK)',
  $$INSERT INTO patient (first_name,last_name,gender,date_of_birth,phone_number,hospital_id)
    VALUES ('Test','User','Unknown','2000-01-01','9876543210',1)$$);
SELECT pg_temp.expect_fail('TC03 future date of birth rejected (trigger)',
  $$INSERT INTO patient (first_name,last_name,gender,date_of_birth,phone_number,hospital_id)
    VALUES ('Test','User','Male',CURRENT_DATE + 10,'9876543210',1)$$);
SELECT pg_temp.expect_fail('TC04 digits in a name rejected (CHECK regex)',
  $$INSERT INTO patient (first_name,last_name,gender,date_of_birth,phone_number,hospital_id)
    VALUES ('R2D2','User','Male','2000-01-01','9876543210',1)$$);
SELECT pg_temp.expect_fail('TC05 invalid e-mail rejected (ALTER-added CHECK)',
  $$UPDATE patient SET email = 'not-an-email' WHERE patient_id = 1$$);
SELECT pg_temp.expect_fail('TC06 negative room tariff rejected (domain money_inr)',
  $$INSERT INTO room (room_number, room_type, charge_per_day) VALUES ('T01','General',-5)$$);
SELECT pg_temp.expect_fail('TC07 cheap ICU rejected (ck_icu_min_charge)',
  $$INSERT INTO room (room_number, room_type, charge_per_day) VALUES ('T02','ICU',1000)$$);
SELECT pg_temp.expect_fail('TC08 discharge before admission rejected (CHECK)',
  $$UPDATE admission SET discharge_date = admission_date - 1 WHERE admission_id = 1$$);

-- ---------------------------------------------------------------- keys
SELECT pg_temp.expect_fail('TC09 appointment for non-existent patient rejected (FK)',
  $$INSERT INTO appointment (patient_id, doctor_id, appointment_date) VALUES (999999, 1, now() + interval '2 day')$$);
SELECT pg_temp.expect_fail('TC10 deleting a department that has doctors rejected (FK RESTRICT)',
  $$DELETE FROM department WHERE department_id = 1$$);
SELECT pg_temp.expect_fail('TC11 same medicine twice on one prescription rejected (composite PK)',
  $$INSERT INTO medication SELECT prescription_id, medicine_name, dosage, frequency, duration FROM medication LIMIT 1$$);
SELECT pg_temp.expect_fail('TC12 duplicate room number rejected (UNIQUE)',
  $$INSERT INTO room (room_number, room_type, charge_per_day) VALUES ('101','General',1500)$$);
SELECT pg_temp.expect_fail('TC13 doctor account without doctor link rejected (ck_doctor_link)',
  $$INSERT INTO app_user (username,password_hash,full_name,role) VALUES ('ghost','x','Ghost','doctor')$$);

-- ---------------------------------------------------------------- scheduling
SELECT pg_temp.expect_fail('TC14 appointment in the past rejected (trigger)',
  $$INSERT INTO appointment (patient_id, doctor_id, appointment_date) VALUES (1, 1, now() - interval '1 day')$$);
INSERT INTO appointment (patient_id, doctor_id, appointment_date)
VALUES (1, 1, date_trunc('day', now()) + interval '30 day 10 hours');
SELECT pg_temp.expect_fail('TC15 overlapping slot for same doctor rejected (EXCLUDE)',
  $$INSERT INTO appointment (patient_id, doctor_id, appointment_date)
    VALUES (2, 1, date_trunc('day', now()) + interval '30 day 10 hours 15 minutes')$$);
SELECT pg_temp.expect_true('TC16 same slot allowed for a different doctor',
  $$WITH ins AS (INSERT INTO appointment (patient_id, doctor_id, appointment_date)
                 VALUES (2, 2, date_trunc('day', now()) + interval '30 day 10 hours') RETURNING 1)
    SELECT count(*) = 1 FROM ins$$);

-- ---------------------------------------------------------------- admissions / rooms
SELECT pg_temp.expect_fail('TC17 admitting into an occupied room rejected (fn_admit_patient)',
  $$SELECT fn_admit_patient(3, 1, (SELECT room_id FROM room WHERE availability='Occupied' LIMIT 1), 'Test admission reason')$$);
SELECT pg_temp.expect_fail('TC18 admitting into a maintenance room rejected',
  $$SELECT fn_admit_patient(3, 1, (SELECT room_id FROM room WHERE availability='Maintenance' LIMIT 1), 'Test admission reason')$$);
SELECT pg_temp.expect_fail('TC19 second open admission for same patient rejected (partial unique index)',
  $$SELECT fn_admit_patient((SELECT patient_id FROM admission WHERE discharge_date IS NULL LIMIT 1), 1,
        (SELECT room_id FROM room WHERE availability='Available' LIMIT 1), 'Duplicate admission')$$);
SELECT pg_temp.expect_fail('TC20 overlapping allocation of a room rejected (EXCLUDE daterange)',
  $$INSERT INTO room_allocation (admission_id, room_id, from_date)
    SELECT a.admission_id, ra.room_id, CURRENT_DATE FROM room_allocation ra, admission a
     WHERE ra.to_date IS NULL AND a.admission_id <> ra.admission_id LIMIT 1$$);

-- Full workflow: admit -> room occupied -> discharge -> room free + bill generated
DO $$
DECLARE v_pat INT; v_room INT; v_adm INT; v_bill INT;
BEGIN
    SELECT patient_id INTO v_pat FROM patient p
     WHERE NOT EXISTS (SELECT 1 FROM admission a WHERE a.patient_id = p.patient_id AND a.discharge_date IS NULL)
     LIMIT 1;
    SELECT room_id INTO v_room FROM room r WHERE availability = 'Available' AND room_type = 'Private'
       AND NOT EXISTS (SELECT 1 FROM room_allocation ra WHERE ra.room_id = r.room_id AND ra.to_date > CURRENT_DATE - 3)
     LIMIT 1;
    v_adm := fn_admit_patient(v_pat, 1, v_room, 'Workflow test admission', CURRENT_DATE - 3);
    PERFORM pg_temp.expect_true('TC21 admission marks room Occupied (trigger)',
        format('SELECT availability = ''Occupied'' FROM room WHERE room_id = %s', v_room));
    CALL sp_discharge_patient(v_adm, CURRENT_DATE, v_bill);
    PERFORM pg_temp.expect_true('TC22 discharge frees the room (trigger)',
        format('SELECT availability = ''Available'' FROM room WHERE room_id = %s', v_room));
    PERFORM pg_temp.expect_true('TC23 bill = 3 days x 5500 + 3 days x 500 visit fee = 18000',
        format('SELECT total_amount = 18000 FROM bill WHERE bill_id = %s', v_bill));
    PERFORM pg_temp.expect_fail('TC24 discharging twice rejected (procedure)',
        format('CALL sp_discharge_patient(%s, CURRENT_DATE)', v_adm));

    -- payments
    PERFORM pg_temp.expect_fail('TC25 overpayment rejected (trigger)',
        format('INSERT INTO payment (bill_id, amount, payment_method) VALUES (%s, 18000.01, ''UPI'')', v_bill));
    INSERT INTO payment (bill_id, amount, payment_method) VALUES (v_bill, 8000, 'Card');
    PERFORM pg_temp.expect_true('TC26 partial payment sets status Partially Paid (trigger)',
        format('SELECT status = ''Partially Paid'' FROM bill WHERE bill_id = %s', v_bill));
    INSERT INTO payment (bill_id, amount, payment_method) VALUES (v_bill, 10000, 'UPI');
    PERFORM pg_temp.expect_true('TC27 full payment sets status Paid (trigger)',
        format('SELECT status = ''Paid'' FROM bill WHERE bill_id = %s', v_bill));
    PERFORM pg_temp.expect_fail('TC28 payment on a Paid bill rejected (trigger)',
        format('INSERT INTO payment (bill_id, amount, payment_method) VALUES (%s, 1, ''Cash'')', v_bill));
    PERFORM pg_temp.expect_true('TC29 audit log captured the discharge (audit trigger)',
        format('SELECT count(*) >= 1 FROM audit_log WHERE table_name = ''admission'' AND operation = ''UPDATE'' AND row_pk = ''%s''', v_adm));
END $$;

-- ---------------------------------------------------------------- transactions
-- Atomicity: if the allocation fails, the admission row must not survive
SELECT pg_temp.expect_true('TC30 failed admit leaves no orphan admission (atomicity)',
  $$SELECT NOT EXISTS (SELECT 1 FROM admission WHERE reason = 'Duplicate admission')$$);

-- ---------------------------------------------------------------- lab
SELECT pg_temp.expect_true('TC31 fn_is_abnormal flags 250 against 70-110',
  $$SELECT fn_is_abnormal('250','70-110') AND NOT fn_is_abnormal('90','70-110')$$);
DO $$
DECLARE v_test INT;
BEGIN
    INSERT INTO test (patient_id, doctor_id, test_name) VALUES (1, 1, 'Fasting Blood Sugar') RETURNING test_id INTO v_test;
    INSERT INTO test_result (test_id, result_value, units, reference_range) VALUES (v_test, '95', 'mg/dL', '70-110');
    PERFORM pg_temp.expect_true('TC32 adding a result completes the test (trigger)',
        format('SELECT status = ''Completed'' FROM test WHERE test_id = %s', v_test));
END $$;

-- ---------------------------------------------------------------- privileges
SET LOCAL ROLE hms_app;
SELECT pg_temp.expect_fail('TC33 app role cannot DROP tables (least privilege)', $$DROP TABLE hms.room CASCADE$$);
SELECT pg_temp.expect_fail('TC34 app role cannot tamper with audit log',          $$DELETE FROM hms.audit_log$$);
RESET ROLE;
SET LOCAL ROLE hms_readonly;
SELECT pg_temp.expect_fail('TC35 read-only role cannot read password hashes', $$SELECT password_hash FROM hms.app_user$$);
RESET ROLE;

-- ---------------------------------------------------------------- transfer / billing edge cases
-- Dedicated rooms avoid depending on the generated seed's allocation history.
DO $$
DECLARE v_pat INT; v_from INT; v_to INT; v_adm INT; v_bill INT;
BEGIN
    SELECT patient_id INTO STRICT v_pat FROM patient p
     WHERE NOT EXISTS (SELECT 1 FROM admission a WHERE a.patient_id = p.patient_id AND a.discharge_date IS NULL)
     ORDER BY patient_id LIMIT 1;
    INSERT INTO room (room_number, room_type, charge_per_day) VALUES ('TC36-A', 'General', 1500) RETURNING room_id INTO v_from;
    INSERT INTO room (room_number, room_type, charge_per_day) VALUES ('TC36-B', 'Private', 5500) RETURNING room_id INTO v_to;
    v_adm := fn_admit_patient(v_pat, 1, v_from, 'Transfer edge case', CURRENT_DATE - 3);
    PERFORM fn_transfer_room(v_adm, v_to, CURRENT_DATE - 1);
    PERFORM pg_temp.expect_true('TC36 transfer frees old room and opens exactly one allocation in new room',
      format('SELECT (SELECT availability = ''Available'' FROM room WHERE room_id = %s)
        AND (SELECT availability = ''Occupied'' FROM room WHERE room_id = %s)
        AND (SELECT count(*) = 1 AND min(room_id) = %s FROM room_allocation WHERE admission_id = %s AND to_date IS NULL)',
        v_from, v_to, v_to, v_adm));
    CALL sp_discharge_patient(v_adm, CURRENT_DATE, v_bill);
    PERFORM pg_temp.expect_true('TC37 transferred stay bills both tariffs plus one visit fee per stay day',
      format('SELECT total_amount = 10000 FROM bill WHERE bill_id = %s', v_bill));
    -- The bill is unpaid with a positive balance, so rejection must be about its date.
    PERFORM pg_temp.expect_fail('TC38 payment dated before bill rejected',
      format('INSERT INTO payment (bill_id, amount, payment_method, payment_date) VALUES (%s, 1, ''Cash'', CURRENT_DATE - 1)', v_bill));
END $$;

\set QUIET off
SELECT id, outcome, test, left(detail, 90) AS detail FROM t_results ORDER BY id;
SELECT COUNT(*) FILTER (WHERE outcome = 'PASS') AS passed,
       COUNT(*) FILTER (WHERE outcome = 'FAIL') AS failed,
       COUNT(*) AS total FROM t_results;
ROLLBACK;

-- =====================================================================
-- CareFlow HMS - 02_functions_triggers.sql
-- Stored functions, a stored procedure, and triggers.
-- Business rules that must hold no matter which client writes the data
-- live HERE, not in the web app.
-- =====================================================================
SET search_path TO hms, public;

-- Business constants (single place to change tariffs)
CREATE OR REPLACE FUNCTION fn_doctor_visit_fee() RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$ SELECT 500.00::numeric $$;

-- ---------------------------------------------------------------------
-- Utility functions
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_patient_age(p_dob DATE) RETURNS INT
LANGUAGE sql STABLE AS $$
    SELECT date_part('year', age(CURRENT_DATE, p_dob))::int
$$;

-- Is a lab value outside its reference range? "70-110" style ranges only;
-- qualitative ranges ("Negative") compare case-insensitively.
CREATE OR REPLACE FUNCTION fn_is_abnormal(p_value TEXT, p_range TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE lo NUMERIC; hi NUMERIC; v NUMERIC;
BEGIN
    IF p_range IS NULL THEN RETURN NULL; END IF;
    IF p_range ~ '^\s*[0-9.]+\s*-\s*[0-9.]+\s*$' AND p_value ~ '^\s*[0-9.]+\s*$' THEN
        lo := split_part(p_range, '-', 1)::numeric;
        hi := split_part(p_range, '-', 2)::numeric;
        v  := p_value::numeric;
        RETURN v < lo OR v > hi;
    END IF;
    RETURN lower(trim(p_value)) <> lower(trim(p_range));
END $$;

-- Bill = room charges (days x tariff, min 1 day per allocation)
--      + doctor visit fee per day of stay
CREATE OR REPLACE FUNCTION fn_calculate_bill(p_admission_id INT) RETURNS NUMERIC
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_room   NUMERIC;
    v_days   INT;
    v_adm    admission%ROWTYPE;
BEGIN
    SELECT * INTO v_adm FROM admission WHERE admission_id = p_admission_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admission % does not exist', p_admission_id USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(SUM(GREATEST(1, COALESCE(ra.to_date, CURRENT_DATE) - ra.from_date)
                        * r.charge_per_day), 0)
      INTO v_room
      FROM room_allocation ra JOIN room r ON r.room_id = ra.room_id
     WHERE ra.admission_id = p_admission_id;

    v_days := GREATEST(1, COALESCE(v_adm.discharge_date, CURRENT_DATE) - v_adm.admission_date);
    RETURN ROUND(v_room + v_days * fn_doctor_visit_fee(), 2);
END $$;

CREATE OR REPLACE FUNCTION fn_bill_outstanding(p_bill_id INT) RETURNS NUMERIC
LANGUAGE sql STABLE AS $$
    SELECT b.total_amount - COALESCE((SELECT SUM(p.amount) FROM payment p
                                      WHERE p.bill_id = b.bill_id), 0)
      FROM bill b WHERE b.bill_id = p_bill_id
$$;

-- ---------------------------------------------------------------------
-- fn_admit_patient: admission + room allocation as ONE unit of work.
-- SELECT ... FOR UPDATE locks the room row so two receptionists cannot
-- both grab the last ICU bed (prevents a lost-update race).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_admit_patient(
    p_patient_id INT, p_doctor_id INT, p_room_id INT, p_reason TEXT,
    p_date DATE DEFAULT CURRENT_DATE
) RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
    v_avail TEXT;
    v_adm   INT;
BEGIN
    SELECT availability INTO v_avail FROM room WHERE room_id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room % does not exist', p_room_id USING ERRCODE = 'P0002';
    END IF;
    IF v_avail <> 'Available' THEN
        RAISE EXCEPTION 'Room % is %', p_room_id, v_avail USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO admission (patient_id, doctor_id, admission_date, reason)
    VALUES (p_patient_id, p_doctor_id, p_date, p_reason)
    RETURNING admission_id INTO v_adm;          -- uq_one_open_admission may fire here

    INSERT INTO room_allocation (admission_id, room_id, from_date)
    VALUES (v_adm, p_room_id, p_date);          -- trigger marks room Occupied
    RETURN v_adm;
END $$;

-- Move an admitted patient to another room (closes one allocation, opens another)
CREATE OR REPLACE FUNCTION fn_transfer_room(
    p_admission_id INT, p_new_room_id INT, p_date DATE DEFAULT CURRENT_DATE
) RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE v_new INT; v_avail TEXT;
BEGIN
    PERFORM 1 FROM admission WHERE admission_id = p_admission_id AND discharge_date IS NULL FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admission % is not active', p_admission_id USING ERRCODE = 'P0001';
    END IF;
    SELECT availability INTO v_avail FROM room WHERE room_id = p_new_room_id FOR UPDATE;
    IF v_avail IS DISTINCT FROM 'Available' THEN
        RAISE EXCEPTION 'Room % is not available', p_new_room_id USING ERRCODE = 'P0001';
    END IF;
    UPDATE room_allocation SET to_date = p_date
     WHERE admission_id = p_admission_id AND to_date IS NULL;
    INSERT INTO room_allocation (admission_id, room_id, from_date)
    VALUES (p_admission_id, p_new_room_id, p_date) RETURNING allocation_id INTO v_new;
    RETURN v_new;
END $$;

-- ---------------------------------------------------------------------
-- sp_discharge_patient: STORED PROCEDURE (CALL ...).
-- Closes admission + allocations, frees room(s), generates the bill.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_discharge_patient(
    p_admission_id INT, p_date DATE, INOUT p_bill_id INT DEFAULT NULL
)
LANGUAGE plpgsql AS $$
DECLARE v_adm admission%ROWTYPE;
BEGIN
    SELECT * INTO v_adm FROM admission WHERE admission_id = p_admission_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admission % does not exist', p_admission_id USING ERRCODE = 'P0002';
    END IF;
    IF v_adm.discharge_date IS NOT NULL THEN
        RAISE EXCEPTION 'Admission % already discharged on %', p_admission_id, v_adm.discharge_date
            USING ERRCODE = 'P0001';
    END IF;

    UPDATE admission SET discharge_date = p_date WHERE admission_id = p_admission_id;
    UPDATE room_allocation SET to_date = p_date
     WHERE admission_id = p_admission_id AND to_date IS NULL;   -- trigger frees room

    INSERT INTO bill (patient_id, admission_id, bill_date, total_amount)
    VALUES (v_adm.patient_id, p_admission_id, p_date, fn_calculate_bill(p_admission_id))
    RETURNING bill_id INTO p_bill_id;
END $$;

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- T1: date of birth cannot be in the future
CREATE OR REPLACE FUNCTION trg_fn_patient_dob() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.date_of_birth > CURRENT_DATE THEN
        RAISE EXCEPTION 'date_of_birth % is in the future', NEW.date_of_birth
            USING ERRCODE = '23514';
    END IF;
    NEW.first_name := initcap(trim(NEW.first_name));    -- normalise names
    NEW.last_name  := initcap(trim(NEW.last_name));
    RETURN NEW;
END $$;
CREATE TRIGGER trg_patient_dob BEFORE INSERT OR UPDATE ON patient
FOR EACH ROW EXECUTE FUNCTION trg_fn_patient_dob();

-- T2: new scheduled appointments must be in the future
CREATE OR REPLACE FUNCTION trg_fn_appointment_future() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'Scheduled' AND NEW.appointment_date < now() THEN
        RAISE EXCEPTION 'Cannot schedule an appointment in the past (%)', NEW.appointment_date
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_appointment_future BEFORE INSERT ON appointment
FOR EACH ROW EXECUTE FUNCTION trg_fn_appointment_future();

-- T3: room availability is DERIVED from allocations, never set by hand
CREATE OR REPLACE FUNCTION trg_fn_alloc_before() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE v_avail TEXT;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.to_date IS NULL THEN
        SELECT availability INTO v_avail FROM room WHERE room_id = NEW.room_id;
        IF v_avail = 'Maintenance' THEN
            RAISE EXCEPTION 'Room % is under maintenance', NEW.room_id USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_alloc_before BEFORE INSERT ON room_allocation
FOR EACH ROW EXECUTE FUNCTION trg_fn_alloc_before();

CREATE OR REPLACE FUNCTION trg_fn_alloc_after() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE v_room INT := COALESCE(NEW.room_id, OLD.room_id);
BEGIN
    UPDATE room r SET availability =
        CASE WHEN EXISTS (SELECT 1 FROM room_allocation ra
                          WHERE ra.room_id = v_room AND ra.to_date IS NULL)
             THEN 'Occupied' ELSE 'Available' END
     WHERE r.room_id = v_room AND r.availability <> 'Maintenance';
    RETURN NULL;
END $$;
CREATE TRIGGER trg_alloc_after AFTER INSERT OR UPDATE OF to_date OR DELETE ON room_allocation
FOR EACH ROW EXECUTE FUNCTION trg_fn_alloc_after();

-- T4: payments cannot exceed what is owed; bill must be payable
CREATE OR REPLACE FUNCTION trg_fn_payment_validate() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE v_bill bill%ROWTYPE; v_out NUMERIC;
BEGIN
    SELECT * INTO v_bill FROM bill WHERE bill_id = NEW.bill_id FOR UPDATE;  -- serialise payers
    IF v_bill.status IN ('Paid','Cancelled') THEN
        RAISE EXCEPTION 'Bill % is % and cannot accept payments', NEW.bill_id, v_bill.status
            USING ERRCODE = 'P0001';
    END IF;
    v_out := fn_bill_outstanding(NEW.bill_id);
    IF NEW.amount > v_out THEN
        RAISE EXCEPTION 'Payment % exceeds outstanding amount % on bill %', NEW.amount, v_out, NEW.bill_id
            USING ERRCODE = '23514';
    END IF;
    IF NEW.payment_date < v_bill.bill_date THEN
        RAISE EXCEPTION 'Payment date precedes bill date' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_payment_validate BEFORE INSERT ON payment
FOR EACH ROW EXECUTE FUNCTION trg_fn_payment_validate();

-- T5: bill status follows the money
CREATE OR REPLACE FUNCTION trg_fn_payment_status() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE v_bill INT := COALESCE(NEW.bill_id, OLD.bill_id); v_out NUMERIC; v_total NUMERIC;
BEGIN
    SELECT total_amount INTO v_total FROM bill WHERE bill_id = v_bill;
    v_out := fn_bill_outstanding(v_bill);
    UPDATE bill SET status = CASE WHEN v_out <= 0 THEN 'Paid'
                                  WHEN v_out < v_total THEN 'Partially Paid'
                                  ELSE 'Unpaid' END
     WHERE bill_id = v_bill AND status <> 'Cancelled';
    RETURN NULL;
END $$;
CREATE TRIGGER trg_payment_status AFTER INSERT OR DELETE ON payment
FOR EACH ROW EXECUTE FUNCTION trg_fn_payment_status();

-- T6: recording a result completes the test
CREATE OR REPLACE FUNCTION trg_fn_result_complete() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT status FROM test WHERE test_id = NEW.test_id) = 'Cancelled' THEN
        RAISE EXCEPTION 'Cannot record results for a cancelled test' USING ERRCODE = 'P0001';
    END IF;
    UPDATE test SET status = 'Completed' WHERE test_id = NEW.test_id AND status <> 'Completed';
    RETURN NEW;
END $$;
CREATE TRIGGER trg_result_complete AFTER INSERT ON test_result
FOR EACH ROW EXECUTE FUNCTION trg_fn_result_complete();

-- T7: generic audit trail (JSONB snapshot of old/new row)
CREATE OR REPLACE FUNCTION trg_fn_audit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE v_old JSONB; v_new JSONB;
BEGIN
    IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
    IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
    INSERT INTO audit_log (table_name, operation, row_pk, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, TG_OP,
            COALESCE(v_new, v_old) ->> TG_ARGV[0],
            v_old, v_new,
            COALESCE(NULLIF(current_setting('hms.app_user', true), ''), session_user));
    RETURN NULL;
END $$;

CREATE TRIGGER trg_audit_patient     AFTER INSERT OR UPDATE OR DELETE ON patient
FOR EACH ROW EXECUTE FUNCTION trg_fn_audit('patient_id');
CREATE TRIGGER trg_audit_admission   AFTER INSERT OR UPDATE OR DELETE ON admission
FOR EACH ROW EXECUTE FUNCTION trg_fn_audit('admission_id');
CREATE TRIGGER trg_audit_appointment AFTER INSERT OR UPDATE OR DELETE ON appointment
FOR EACH ROW EXECUTE FUNCTION trg_fn_audit('appointment_id');
CREATE TRIGGER trg_audit_bill        AFTER INSERT OR UPDATE OR DELETE ON bill
FOR EACH ROW EXECUTE FUNCTION trg_fn_audit('bill_id');
CREATE TRIGGER trg_audit_payment     AFTER INSERT OR UPDATE OR DELETE ON payment
FOR EACH ROW EXECUTE FUNCTION trg_fn_audit('payment_id');

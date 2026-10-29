-- =====================================================================
-- CareFlow HMS - 03_views.sql
-- Views hide join complexity from the app and give stable read models.
-- =====================================================================
SET search_path TO hms, public;

-- Patient master with derived age and current status
CREATE OR REPLACE VIEW v_patient_summary AS
SELECT p.patient_id,
       p.first_name || ' ' || p.last_name AS full_name,
       p.first_name, p.last_name, p.gender, p.date_of_birth,
       fn_patient_age(p.date_of_birth)    AS age,
       p.phone_number, h.hospital_name,
       EXISTS (SELECT 1 FROM admission a
               WHERE a.patient_id = p.patient_id AND a.discharge_date IS NULL) AS is_admitted,
       (SELECT max(ap.appointment_date) FROM appointment ap
         WHERE ap.patient_id = p.patient_id AND ap.status = 'Completed')        AS last_visit,
       (SELECT COALESCE(sum(fn_bill_outstanding(b.bill_id)),0) FROM bill b
         WHERE b.patient_id = p.patient_id AND b.status <> 'Cancelled')         AS outstanding_due
  FROM patient p JOIN hospital h ON h.hospital_id = p.hospital_id;

-- Live ward board: who is in which room right now
CREATE OR REPLACE VIEW v_current_occupancy AS
SELECT r.room_id, r.room_number, r.room_type, r.charge_per_day, r.availability,
       a.admission_id, a.admission_date, a.reason,
       p.patient_id, p.first_name || ' ' || p.last_name AS patient_name,
       d.name AS doctor_name, ra.from_date,
       CURRENT_DATE - ra.from_date AS days_in_room
  FROM room r
  LEFT JOIN room_allocation ra ON ra.room_id = r.room_id AND ra.to_date IS NULL
  LEFT JOIN admission a        ON a.admission_id = ra.admission_id
  LEFT JOIN patient p          ON p.patient_id = a.patient_id
  LEFT JOIN doctor d           ON d.doctor_id = a.doctor_id;

-- Doctor schedule (used by doctors' "My day" page and receptionists)
CREATE OR REPLACE VIEW v_doctor_schedule AS
SELECT ap.appointment_id, ap.appointment_date, ap.status,
       d.doctor_id, d.name AS doctor_name, d.specialization,
       dep.department_id, dep.department_name,
       p.patient_id, p.first_name || ' ' || p.last_name AS patient_name, p.phone_number
  FROM appointment ap
  JOIN doctor d       ON d.doctor_id = ap.doctor_id
  JOIN department dep ON dep.department_id = d.department_id
  JOIN patient p      ON p.patient_id = ap.patient_id;

-- Billing view with paid / outstanding amounts
CREATE OR REPLACE VIEW v_bill_status AS
SELECT b.bill_id, b.bill_date, b.total_amount, b.status, b.admission_id,
       p.patient_id, p.first_name || ' ' || p.last_name AS patient_name,
       COALESCE(pay.paid, 0)                AS amount_paid,
       b.total_amount - COALESCE(pay.paid,0) AS outstanding,
       CURRENT_DATE - b.bill_date           AS age_days
  FROM bill b
  JOIN patient p ON p.patient_id = b.patient_id
  LEFT JOIN (SELECT bill_id, SUM(amount) AS paid FROM payment GROUP BY bill_id) pay
         ON pay.bill_id = b.bill_id;

-- Lab results with abnormal flag
CREATE OR REPLACE VIEW v_test_results AS
SELECT t.test_id, t.test_name, t.test_date, t.status,
       t.patient_id, p.first_name || ' ' || p.last_name AS patient_name,
       d.doctor_id, d.name AS doctor_name,
       tr.result_id, tr.result_value, tr.units, tr.reference_range,
       fn_is_abnormal(tr.result_value, tr.reference_range) AS is_abnormal
  FROM test t
  JOIN patient p ON p.patient_id = t.patient_id
  JOIN doctor  d ON d.doctor_id  = t.doctor_id
  LEFT JOIN test_result tr ON tr.test_id = t.test_id;

-- Materialized view: monthly revenue per department (expensive, refreshed on demand)
DROP MATERIALIZED VIEW IF EXISTS mv_monthly_department_revenue;
CREATE MATERIALIZED VIEW mv_monthly_department_revenue AS
SELECT date_trunc('month', pay.payment_date)::date AS month,
       dep.department_id, dep.department_name,
       SUM(pay.amount)              AS revenue,
       COUNT(DISTINCT b.bill_id)    AS bills
  FROM payment pay
  JOIN bill b         ON b.bill_id = pay.bill_id
  JOIN admission a    ON a.admission_id = b.admission_id
  JOIN doctor d       ON d.doctor_id = a.doctor_id
  JOIN department dep ON dep.department_id = d.department_id
 GROUP BY 1, 2, 3;
CREATE UNIQUE INDEX ux_mv_revenue ON mv_monthly_department_revenue(month, department_id);
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_department_revenue;

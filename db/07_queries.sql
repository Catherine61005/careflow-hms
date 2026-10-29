-- =====================================================================
-- CareFlow HMS - 07_queries.sql
-- Important queries (each one is used by a screen or report in the app).
-- =====================================================================
SET search_path TO hms, public;

-- Q1 (JOIN, 5 tables) Full admission history for one patient
SELECT a.admission_id, a.admission_date, a.discharge_date, a.reason,
       d.name AS doctor, dep.department_name, r.room_number, ra.from_date, ra.to_date
  FROM admission a
  JOIN doctor d          ON d.doctor_id = a.doctor_id
  JOIN department dep    ON dep.department_id = d.department_id
  LEFT JOIN room_allocation ra ON ra.admission_id = a.admission_id
  LEFT JOIN room r       ON r.room_id = ra.room_id
 WHERE a.patient_id = 5
 ORDER BY a.admission_date DESC, ra.from_date;

-- Q2 (GROUP BY + HAVING + aggregates) Departments with > 15 admissions and their average stay
SELECT dep.department_name,
       COUNT(*)                                             AS admissions,
       ROUND(AVG(a.discharge_date - a.admission_date), 1)   AS avg_stay_days,
       MAX(a.discharge_date - a.admission_date)             AS longest_stay
  FROM admission a
  JOIN doctor d       ON d.doctor_id = a.doctor_id
  JOIN department dep ON dep.department_id = d.department_id
 WHERE a.discharge_date IS NOT NULL
 GROUP BY dep.department_name
HAVING COUNT(*) > 15
 ORDER BY admissions DESC;

-- Q3 (correlated subquery) Doctors who completed more appointments than their department's average
SELECT d.name, dep.department_name,
       (SELECT COUNT(*) FROM appointment ap WHERE ap.doctor_id = d.doctor_id AND ap.status = 'Completed') AS completed
  FROM doctor d JOIN department dep ON dep.department_id = d.department_id
 WHERE (SELECT COUNT(*) FROM appointment ap WHERE ap.doctor_id = d.doctor_id AND ap.status = 'Completed')
     > (SELECT AVG(cnt) FROM (SELECT COUNT(*) AS cnt FROM appointment ap
                               JOIN doctor d2 ON d2.doctor_id = ap.doctor_id
                              WHERE d2.department_id = d.department_id AND ap.status = 'Completed'
                              GROUP BY ap.doctor_id) x)
 ORDER BY completed DESC;

-- Q4 (NOT EXISTS anti-join) Patients registered but never seen (no appointment, no admission)
SELECT p.patient_id, p.first_name, p.last_name, p.phone_number
  FROM patient p
 WHERE NOT EXISTS (SELECT 1 FROM appointment ap WHERE ap.patient_id = p.patient_id)
   AND NOT EXISTS (SELECT 1 FROM admission a   WHERE a.patient_id  = p.patient_id);

-- Q5 (IN subquery) Patients with at least one abnormal lab value in the last 30 days
SELECT patient_id, first_name || ' ' || last_name AS name
  FROM patient
 WHERE patient_id IN (SELECT t.patient_id FROM test t JOIN test_result tr ON tr.test_id = t.test_id
                       WHERE fn_is_abnormal(tr.result_value, tr.reference_range)
                         AND t.test_date >= CURRENT_DATE - 30);

-- Q6 (CTE + window function) Monthly revenue with running total and month-over-month change
WITH monthly AS (
    SELECT date_trunc('month', payment_date)::date AS month, SUM(amount) AS revenue
      FROM payment GROUP BY 1
)
SELECT month, revenue,
       SUM(revenue) OVER (ORDER BY month)                       AS running_total,
       revenue - LAG(revenue) OVER (ORDER BY month)              AS change_vs_prev
  FROM monthly ORDER BY month;

-- Q7 (window RANK) Top 3 most prescribed medicines per department
SELECT * FROM (
    SELECT dep.department_name, m.medicine_name, COUNT(*) AS times_prescribed,
           RANK() OVER (PARTITION BY dep.department_name ORDER BY COUNT(*) DESC) AS rnk
      FROM medication m
      JOIN prescription pr ON pr.prescription_id = m.prescription_id
      JOIN doctor d        ON d.doctor_id = pr.doctor_id
      JOIN department dep  ON dep.department_id = d.department_id
     GROUP BY dep.department_name, m.medicine_name
) ranked WHERE rnk <= 3 ORDER BY department_name, rnk;

-- Q8 Room occupancy rate by room type (ORDER BY on computed column)
SELECT room_type,
       COUNT(*) FILTER (WHERE availability = 'Occupied')    AS occupied,
       COUNT(*) FILTER (WHERE availability = 'Available')   AS available,
       COUNT(*) FILTER (WHERE availability = 'Maintenance') AS maintenance,
       ROUND(100.0 * COUNT(*) FILTER (WHERE availability = 'Occupied') / COUNT(*), 1) AS occupancy_pct
  FROM room GROUP BY room_type ORDER BY occupancy_pct DESC;

-- Q9 Accounts receivable ageing buckets
SELECT CASE WHEN age_days <= 30 THEN '0-30 days'
            WHEN age_days <= 60 THEN '31-60 days'
            WHEN age_days <= 90 THEN '61-90 days' ELSE '90+ days' END AS bucket,
       COUNT(*) AS bills, SUM(outstanding) AS outstanding
  FROM v_bill_status WHERE status IN ('Unpaid','Partially Paid')
 GROUP BY 1 ORDER BY MIN(age_days);

-- Q10 Full-text search over admission reasons (ranked)
SELECT admission_id, reason,
       ts_rank(to_tsvector('english', reason), q) AS rank
  FROM admission, websearch_to_tsquery('english', 'fracture') q
 WHERE to_tsvector('english', reason) @@ q
 ORDER BY rank DESC LIMIT 10;

-- Q11 Fuzzy name search with trigram similarity (handles typos: "Ananyaa Iyr")
SELECT patient_id, first_name || ' ' || last_name AS name,
       similarity(first_name || ' ' || last_name, 'Ananyaa Iyr') AS score
  FROM patient
 WHERE (first_name || ' ' || last_name) % 'Ananyaa Iyr'
 ORDER BY score DESC LIMIT 5;

-- Q12 Vector similarity search (query vector supplied by the app as $1)
-- SELECT ce.source_type, ce.content, dep.department_name, 1 - (ce.embedding <=> $1) AS similarity
--   FROM clinical_embedding ce JOIN department dep USING (department_id)
--  ORDER BY ce.embedding <=> $1 LIMIT 10;

-- Q13 Index proof: the composite index serves a doctor's daily schedule
EXPLAIN SELECT * FROM appointment
 WHERE doctor_id = 3 AND appointment_date >= CURRENT_DATE AND appointment_date < CURRENT_DATE + 1;

import { api } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export const GET = api(async () => {
  const s = await requireRole();
  const doctorFilter = s.role === "doctor" ? s.doctorId : null;

  const [kpi, deptLoad, revenue, upcoming, abnormal, roomTypes] = await Promise.all([
    queryOne(`
      SELECT (SELECT COUNT(*) FROM patient)                                         AS patients,
             (SELECT COUNT(*) FROM admission WHERE discharge_date IS NULL)          AS admitted,
             (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE availability='Occupied')
                     / NULLIF(COUNT(*) FILTER (WHERE availability<>'Maintenance'),0), 1) FROM room) AS occupancy_pct,
             (SELECT COUNT(*) FROM appointment WHERE appointment_date::date = CURRENT_DATE
                 AND status <> 'Cancelled' AND ($1::int IS NULL OR doctor_id = $1))   AS appointments_today,
             (SELECT COALESCE(SUM(outstanding),0) FROM v_bill_status
                 WHERE status IN ('Unpaid','Partially Paid'))                       AS outstanding,
             (SELECT COALESCE(SUM(amount),0) FROM payment
                 WHERE date_trunc('month', payment_date) = date_trunc('month', CURRENT_DATE)) AS revenue_month`,
      [doctorFilter]),
    // GROUP BY + HAVING: departments with at least one admission in the last 90 days
    query(`
      SELECT dep.department_name, COUNT(*)::int AS admissions,
             ROUND(AVG(COALESCE(a.discharge_date, CURRENT_DATE) - a.admission_date), 1) AS avg_stay
        FROM admission a JOIN doctor d ON d.doctor_id = a.doctor_id
        JOIN department dep ON dep.department_id = d.department_id
       WHERE a.admission_date >= CURRENT_DATE - 90
       GROUP BY dep.department_name HAVING COUNT(*) >= 1
       ORDER BY admissions DESC`),
    query(`
      SELECT to_char(month, 'Mon YY') AS label, SUM(revenue)::float AS revenue
        FROM mv_monthly_department_revenue
       WHERE month >= date_trunc('month', CURRENT_DATE) - INTERVAL '8 months'
       GROUP BY month ORDER BY month`),
    query(`
      SELECT appointment_id, appointment_date, status, doctor_name, department_name, patient_id, patient_name
        FROM v_doctor_schedule
       WHERE appointment_date >= now() AND status = 'Scheduled' AND ($1::int IS NULL OR doctor_id = $1)
       ORDER BY appointment_date LIMIT 8`, [doctorFilter]),
    query(`
      SELECT test_id, test_name, test_date, patient_id, patient_name, result_value, units, reference_range
        FROM v_test_results
       WHERE is_abnormal AND ($1::int IS NULL OR doctor_id = $1)
       ORDER BY test_date DESC LIMIT 8`, [doctorFilter]),
    query(`
      SELECT room_type,
             COUNT(*) FILTER (WHERE availability='Occupied')::int    AS occupied,
             COUNT(*) FILTER (WHERE availability='Available')::int   AS available,
             COUNT(*) FILTER (WHERE availability='Maintenance')::int AS maintenance
        FROM room GROUP BY room_type ORDER BY MIN(charge_per_day)`),
  ]);
  return { kpi, deptLoad, revenue, upcoming, abnormal, roomTypes, role: s.role };
});

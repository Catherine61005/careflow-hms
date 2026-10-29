-- =====================================================================
-- CareFlow HMS - 04_roles.sql
-- Database-level least privilege (defence in depth beneath app RBAC).
--   hms_app      : the role the Next.js backend connects as (DML only, no DDL)
--   hms_readonly : reporting / analytics (views only)
-- Passwords are set from the environment by scripts/setup-db, never here.
-- =====================================================================
SET search_path TO hms, public;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hms_app') THEN
        CREATE ROLE hms_app LOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hms_readonly') THEN
        CREATE ROLE hms_readonly LOGIN;
    END IF;
END $$;

GRANT USAGE ON SCHEMA hms TO hms_app, hms_readonly;

-- App: full DML on business tables, cannot ALTER/DROP anything
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA hms TO hms_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA hms TO hms_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA hms TO hms_app;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA hms TO hms_app;

-- Audit log is append-only even for the app
REVOKE UPDATE, DELETE ON hms.audit_log FROM hms_app;

-- Read-only: views only, no base tables, no password hashes
GRANT SELECT ON hms.v_patient_summary, hms.v_current_occupancy, hms.v_doctor_schedule,
                hms.v_bill_status, hms.v_test_results, hms.mv_monthly_department_revenue
      TO hms_readonly;

-- Materialized view refresh requires ownership; expose it through a SECURITY DEFINER function
CREATE OR REPLACE FUNCTION fn_refresh_revenue() RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = hms, public AS $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY hms.mv_monthly_department_revenue;
$$;
REVOKE ALL ON FUNCTION fn_refresh_revenue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_refresh_revenue() TO hms_app;

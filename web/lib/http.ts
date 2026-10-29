import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Translate PostgreSQL SQLSTATE codes into HTTP responses, so database-level
// validation (CHECK, FK, EXCLUDE, triggers) surfaces cleanly in the UI.
const PG_STATUS: Record<string, number> = {
  "23505": 409, // unique_violation
  "23P01": 409, // exclusion_violation (double booking / overlapping room)
  "23503": 409, // foreign_key_violation
  "23514": 400, // check_violation (+ our validation triggers)
  "23502": 400, // not_null_violation
  "22P02": 400, // invalid_text_representation
  "22007": 400, // invalid_datetime_format
  "22008": 400, // datetime_field_overflow
  "P0001": 409, // business-rule exception raised in PL/pgSQL
  "P0002": 404, // no_data_found raised in PL/pgSQL
  "42501": 403, // insufficient_privilege
  "40001": 409, // serialization_failure
};

function friendlyPg(err: { code: string; message: string; constraint?: string }): string {
  const c = err.constraint ?? "";
  if (c === "ex_doctor_slot") return "The doctor already has an appointment in this 30-minute slot.";
  if (c === "ex_room_overlap") return "This room is already allocated for those dates.";
  if (c === "uq_one_open_admission") return "This patient is already admitted.";
  if (c === "phone_no_check") return "Phone number must have 10-13 digits.";
  if (err.code === "23503") return "This record is referenced by other records (or refers to one that does not exist).";
  return err.message;
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response | unknown>;

/** Wrap a route handler: JSON responses + uniform error mapping. */
export function api<C = unknown>(fn: Handler<C>) {
  return async (req: Request, ctx: C) => {
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        const msg = err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      const pg = err as { code?: string; message: string; constraint?: string };
      if (pg?.code && PG_STATUS[pg.code]) {
        return NextResponse.json(
          { error: friendlyPg(pg as { code: string; message: string; constraint?: string }), code: pg.code },
          { status: PG_STATUS[pg.code] });
      }
      console.error(err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export function intParam(v: string | null | undefined, name = "id"): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Invalid ${name}`);
  return n;
}

export function optInt(v: string | null): number | null {
  if (v === null || v === "") return null;
  return intParam(v);
}

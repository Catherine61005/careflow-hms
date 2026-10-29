import { z } from "zod";

// First line of validation (fast feedback). The database enforces the same
// rules again with CHECK constraints, domains and triggers.
const name = z.string().trim().min(1).max(60).regex(/^[A-Za-z .'-]+$/, "letters only");
const phone = z.string().trim().regex(/^\+?[0-9]{10,13}$/, "10-13 digits");
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const patientSchema = z.object({
  first_name: name,
  last_name: name,
  gender: z.enum(["Male", "Female", "Other"]),
  date_of_birth: dateStr,
  phone_number: phone,
  email: z.string().trim().email().max(120).optional().or(z.literal("")).transform((v) => v || null),
});
export const patientUpdateSchema = patientSchema.partial();

export const appointmentSchema = z.object({
  patient_id: z.number().int().positive(),
  doctor_id: z.number().int().positive(),
  appointment_date: z.string().min(16), // "YYYY-MM-DDTHH:MM"
  symptoms: z.string().trim().max(500).optional(),
});
export const appointmentStatusSchema = z.object({
  status: z.enum(["Scheduled", "Completed", "Cancelled", "No-Show"]),
});

export const admitSchema = z.object({
  patient_id: z.number().int().positive(),
  doctor_id: z.number().int().positive(),
  room_id: z.number().int().positive(),
  reason: z.string().trim().min(5).max(1000),
});
export const dischargeSchema = z.object({ discharge_date: dateStr.optional() });
export const transferSchema = z.object({ room_id: z.number().int().positive() });

export const paymentSchema = z.object({
  amount: z.number().positive().max(10_000_000),
  payment_method: z.enum(["Cash", "Card", "UPI", "NetBanking", "Insurance"]),
});

export const prescriptionSchema = z.object({
  patient_id: z.number().int().positive(),
  medications: z.array(z.object({
    medicine_name: z.string().trim().min(2).max(100),
    dosage: z.string().trim().min(1).max(30),
    frequency: z.string().trim().min(1).max(30),
    duration: z.string().trim().min(1).max(30),
  })).min(1, "add at least one medicine"),
});

export const testSchema = z.object({
  patient_id: z.number().int().positive(),
  test_name: z.string().trim().min(2).max(100),
});
export const resultSchema = z.object({
  results: z.array(z.object({
    result_value: z.string().trim().min(1).max(40),
    units: z.string().trim().max(20).optional(),
    reference_range: z.string().trim().max(40).optional(),
  })).min(1),
});

export const userSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_.]{3,40}$/),
  full_name: z.string().trim().min(3).max(100),
  role: z.enum(["admin", "receptionist", "doctor"]),
  password: z.string().min(8).max(72),
  doctor_id: z.number().int().positive().nullable().optional(),
});

export const triageSchema = z.object({ text: z.string().trim().min(3).max(1000) });

import { api } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query } from "@/lib/db";
import { triageSchema } from "@/lib/validators";
import { embed } from "@/lib/embeddings";
import { semanticSearch } from "@/lib/vectorstore";

/**
 * Semantic triage: free-text complaint -> recommended department(s) + least-loaded
 * doctor with the next free slot. Also runs a keyword (full-text) search on the
 * same text so the two retrieval strategies can be compared side by side.
 */
export const POST = api(async (req) => {
  await requireRole();
  const { text } = triageSchema.parse(await req.json());

  const t0 = Date.now();
  const vector = await embed(text);
  const embedMs = Date.now() - t0;
  const hits = await semanticSearch(vector, 20);

  // Similarity-weighted vote per department. Squaring favours close matches;
  // the curated department profile counts 1.5x an individual past case.
  const score = new Map<number, { department_id: number; department_name: string; score: number; evidence: number }>();
  for (const h of hits) {
    const w = h.similarity > 0 ? h.similarity ** 2 * (h.source_type === "department" ? 1.5 : 1) : 0;
    const cur = score.get(h.department_id) ?? { department_id: h.department_id, department_name: h.department_name, score: 0, evidence: 0 };
    cur.score += w; cur.evidence += 1;
    score.set(h.department_id, cur);
  }
  const total = [...score.values()].reduce((s, d) => s + d.score, 0) || 1;
  const ranked = [...score.values()].sort((a, b) => b.score - a.score).slice(0, 3)
    .map((d) => ({ ...d, confidence: Math.round((100 * d.score) / total) }));

  // Relational follow-up: doctors in the recommended departments, least loaded first,
  // with the next free 30-minute slot in clinic hours (generate_series + NOT EXISTS).
  const doctors = ranked.length ? await query(`
    SELECT d.doctor_id, d.name, d.specialization, d.department_id,
           (SELECT COUNT(*) FROM appointment a WHERE a.doctor_id = d.doctor_id AND a.status='Scheduled'
               AND a.appointment_date BETWEEN now() AND now() + INTERVAL '7 days')::int AS load_7d,
           (SELECT MIN(slot) FROM generate_series(date_trunc('hour', LOCALTIMESTAMP) + INTERVAL '1 hour',
                                                  LOCALTIMESTAMP + INTERVAL '7 days', INTERVAL '30 minutes') slot
             WHERE EXTRACT(hour FROM slot) BETWEEN 9 AND 16 AND EXTRACT(isodow FROM slot) < 7
               AND NOT EXISTS (SELECT 1 FROM appointment a WHERE a.doctor_id = d.doctor_id AND a.status = 'Scheduled'
                                  AND tsrange(a.appointment_date, a.appointment_date + INTERVAL '30 minutes')
                                   && tsrange(slot, slot + INTERVAL '30 minutes'))) AS next_slot
      FROM doctor d WHERE d.department_id = ANY($1::int[])
     ORDER BY load_7d, d.name`, [ranked.map((r) => r.department_id)]) : [];

  const keyword = await query(`
    SELECT 'admission' AS source, a.reason AS content, dep.department_name,
           ts_rank(to_tsvector('english', a.reason), q)::float AS rank
      FROM admission a JOIN doctor d USING (doctor_id) JOIN department dep USING (department_id),
           plainto_tsquery('english', $1) q
     WHERE to_tsvector('english', a.reason) @@ q
     ORDER BY rank DESC LIMIT 8`, [text]);

  return {
    recommendations: ranked.map((r) => ({ ...r, doctors: doctors.filter((d) => d.department_id === r.department_id) })),
    // many admissions share the same wording - show each distinct text once
    semantic: hits.filter((h, i) => h.source_type === "admission" &&
                       hits.findIndex((x) => x.content === h.content) === i).slice(0, 8),
    keyword,
    meta: { embedMs, model: process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2", metric: "cosine" },
  };
});

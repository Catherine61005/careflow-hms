// Backfill the vector store:
//   1) one embedding per department profile (curated description of what it treats)
//   2) one embedding per admission reason
// Usage: npm run embed      (reads DATABASE_URL etc. from .env.local)
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { pipeline, env } from "@huggingface/transformers";

const here = path.dirname(fileURLToPath(import.meta.url));
for (const f of [".env.local", ".env"]) {             // tiny .env loader (no extra dependency)
  const p = path.join(here, "..", f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const MODEL = process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
if (process.env.MODEL_PATH) { env.localModelPath = process.env.MODEL_PATH; env.allowRemoteModels = false; }
if (process.env.HF_ENDPOINT) env.remoteHost = process.env.HF_ENDPOINT;
env.cacheDir = process.env.MODEL_CACHE_DIR || ".cache/models";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("SET search_path TO hms, public");

console.log(`Loading ${MODEL} ...`);
const extractor = await pipeline("feature-extraction", MODEL, { dtype: "fp32" });
const cache = new Map();                              // many admissions share a reason text
async function embed(text) {
  if (!cache.has(text)) {
    const out = await extractor(text, { pooling: "mean", normalize: true });
    cache.set(text, `[${Array.from(out.data).map((x) => x.toFixed(6)).join(",")}]`);
  }
  return cache.get(text);
}
const upsert = `INSERT INTO clinical_embedding (source_type, source_id, department_id, content, embedding, model)
                VALUES ($1, $2, $3, $4, $5::vector, $6)
                ON CONFLICT (source_type, source_id) DO UPDATE
                SET content = EXCLUDED.content, embedding = EXCLUDED.embedding, model = EXCLUDED.model, created_at = now()`;

const profiles = JSON.parse(readFileSync(path.join(here, "../../db/seed/department_profiles.json"), "utf8"));
const depts = (await client.query("SELECT department_id, department_name FROM department")).rows;
for (const d of depts) {
  const text = profiles[d.department_name] ?? `${d.department_name} department`;
  await client.query(upsert, ["department", d.department_id, d.department_id, `${d.department_name}: ${text}`,
                              await embed(`${d.department_name}: ${text}`), MODEL]);
}
console.log(`Embedded ${depts.length} department profiles`);

const adms = (await client.query(`
  SELECT a.admission_id, a.reason, d.department_id FROM admission a JOIN doctor d USING (doctor_id)
   WHERE NOT EXISTS (SELECT 1 FROM clinical_embedding ce WHERE ce.source_type = 'admission' AND ce.source_id = a.admission_id)
   ORDER BY a.admission_id`)).rows;
let n = 0;
await client.query("BEGIN");
for (const a of adms) {
  await client.query(upsert, ["admission", a.admission_id, a.department_id, a.reason, await embed(a.reason), MODEL]);
  if (++n % 50 === 0) console.log(`  ${n}/${adms.length}`);
}
await client.query("COMMIT");
console.log(`Embedded ${n} admissions (${cache.size} unique texts). Done.`);
await client.end();

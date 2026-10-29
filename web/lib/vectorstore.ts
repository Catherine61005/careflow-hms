import { query, queryOne } from "./db";
import { embed, toVectorLiteral, MODEL_NAME } from "./embeddings";

/** Embed an admission's reason and upsert it into the vector store. */
export async function indexAdmission(admissionId: number): Promise<void> {
  const a = await queryOne<{ reason: string; department_id: number }>(
    `SELECT a.reason, d.department_id FROM admission a JOIN doctor d USING (doctor_id) WHERE a.admission_id = $1`,
    [admissionId]);
  if (!a) return;
  const v = await embed(a.reason);
  await query(
    `INSERT INTO clinical_embedding (source_type, source_id, department_id, content, embedding, model)
     VALUES ('admission', $1, $2, $3, $4::vector, $5)
     ON CONFLICT (source_type, source_id)
     DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding, created_at = now()`,
    [admissionId, a.department_id, a.reason, toVectorLiteral(v), MODEL_NAME]);
}

export interface SemanticHit {
  source_type: string; source_id: number; content: string;
  department_id: number; department_name: string; similarity: number;
}

/** k-nearest neighbours by cosine distance (<=>), served by the HNSW index. */
export async function semanticSearch(vector: number[], k = 15, excludeAdmission?: number): Promise<SemanticHit[]> {
  return query<SemanticHit>(`
    SELECT ce.source_type, ce.source_id, ce.content, ce.department_id, dep.department_name,
           ROUND((1 - (ce.embedding <=> $1::vector))::numeric, 4)::float AS similarity
      FROM clinical_embedding ce JOIN department dep ON dep.department_id = ce.department_id
     WHERE ($3::int IS NULL OR NOT (ce.source_type = 'admission' AND ce.source_id = $3))
     ORDER BY ce.embedding <=> $1::vector
     LIMIT $2`, [toVectorLiteral(vector), k, excludeAdmission ?? null]);
}

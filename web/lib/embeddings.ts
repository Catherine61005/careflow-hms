// Text -> 384-dim sentence embedding, computed locally (no external API key).
// Model: sentence-transformers all-MiniLM-L6-v2 (ONNX build), mean-pooled and
// L2-normalised, so cosine similarity == dot product.
import type { FeatureExtractionPipeline } from "@huggingface/transformers";

const MODEL = process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIM = 384;

const g = globalThis as unknown as { embedder?: Promise<FeatureExtractionPipeline> };

async function load(): Promise<FeatureExtractionPipeline> {
  const { pipeline, env } = await import("@huggingface/transformers");
  if (process.env.MODEL_PATH) {           // offline mode: use pre-downloaded files
    env.localModelPath = process.env.MODEL_PATH;
    env.allowRemoteModels = false;
  } 
  if (process.env.HF_ENDPOINT) env.remoteHost = process.env.HF_ENDPOINT;
  env.cacheDir = process.env.MODEL_CACHE_DIR || ".cache/models";
  return (await pipeline("feature-extraction", MODEL, { dtype: "fp32" })) as FeatureExtractionPipeline;
}

export async function embed(text: string): Promise<number[]> {
  g.embedder ??= load();
  const extractor = await g.embedder;
  const out = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(out.data as Float32Array);
}

/** pgvector literal: '[0.1,0.2,...]' (sent as a bound parameter, cast with ::vector) */
export function toVectorLiteral(v: number[]): string {
  return `[${v.map((x) => x.toFixed(6)).join(",")}]`;
}

export const MODEL_NAME = MODEL;

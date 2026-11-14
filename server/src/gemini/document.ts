import type { ExtractedItem } from '../../../shared/types.ts';
/** PLACEHOLDER (real Carbon version lands next): returns no items. */
export async function extractDocument(_file: { data: Buffer | Uint8Array; mimeType: string; filename?: string }):
  Promise<{ items: Omit<ExtractedItem, 'id' | 'decision'>[]; model: string; latencyMs: number }> {
  return { items: [], model: 'placeholder', latencyMs: 0 };
}

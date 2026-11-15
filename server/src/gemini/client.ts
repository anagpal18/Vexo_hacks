// Gemini clients + model ids (Shresth). Key from GEMINI_API_KEY; never logged.
import { GoogleGenAI } from '@google/genai';

export const MODELS = {
  fast: process.env.GEMINI_FAST || 'gemini-4-hydrogen',       // always on: every utterance
  deep: process.env.GEMINI_DEEP || 'gemini-4-carbon',         // rare and deep: documents, ask, digest
  deepFallback: 'gemini-4-argon',
  decision: 'gemini-decision-1',                              // calibrated yes/no checks (verification)
};

let v1: GoogleGenAI | null = null, beta: GoogleGenAI | null = null;
export function ai(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  return (v1 ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
}
/** v1beta client: the Decisions API lives there. */
export function aiBeta(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  return (beta ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, apiVersion: 'v1beta' }));
}
export const hasKey = () => !!process.env.GEMINI_API_KEY;

export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms))]);
}

/** Run a deep-model call, falling back to Argon if Carbon is refused or slow. Returns the model used. */
export async function deepCall<T>(run: (model: string) => Promise<T>, timeoutMs = 25000): Promise<{ value: T; model: string }> {
  try {
    return { value: await withTimeout(run(MODELS.deep), timeoutMs, MODELS.deep), model: MODELS.deep };
  } catch (e: any) {
    console.warn(`[gemini] ${MODELS.deep} failed (${e?.status ?? e?.message ?? 'error'}), trying ${MODELS.deepFallback}`);
    return { value: await withTimeout(run(MODELS.deepFallback), timeoutMs, MODELS.deepFallback), model: MODELS.deepFallback };
  }
}

export const errMsg = (e: any) => `${e?.status ?? e?.code ?? ''} ${String(e?.message ?? e).slice(0, 160)}`.trim();

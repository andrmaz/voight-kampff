/**
 * Deterministic extractors: each returns a 0–1 signal + rationale.
 * These are behavioral heuristics, not evidence of consciousness.
 */

export interface RawFeatureSignal {
  id: string;
  label: string;
  /** 0 (absent) … 1 (strong). */
  value: number;
  rationale: string;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function extractLengthBand(text: string): RawFeatureSignal {
  const t = text.trim();
  const n = t.length;
  let value: number;
  let rationale: string;
  if (n < 8) {
    value = 0;
    rationale = 'Very short reply; little room for affect or detail.';
  } else if (n < 40) {
    value = 0.35;
    rationale = 'Brief reply; some content but limited elaboration.';
  } else if (n < 120) {
    value = 0.7;
    rationale = 'Moderate length; room for stance and detail.';
  } else {
    value = 1;
    rationale = 'Substantial length; supports richer markers.';
  }
  return { id: 'length-band', label: 'Response length', value: clamp01(value), rationale };
}

export function extractAffectiveLexicon(text: string): RawFeatureSignal {
  const lower = text.toLowerCase();
  const affectWords =
    /\b(feel|feeling|afraid|fear|angry|anger|happy|sad|scared|uncomfortable|sorry|help|pain|love|hate|worry|worried|nervous|anxious|grateful|ashamed|guilty|compassion|empathy|hurt)\b/g;
  const matches = lower.match(affectWords);
  const count = matches?.length ?? 0;
  let value: number;
  let rationale: string;
  if (count === 0) {
    value = 0.15;
    rationale = 'Little explicit affective or moral vocabulary.';
  } else if (count === 1) {
    value = 0.55;
    rationale = 'Some affective or moral language present.';
  } else {
    value = 1;
    rationale = 'Multiple affective or moral terms; richer affective signal.';
  }
  return { id: 'affective-lexicon', label: 'Affective / moral language', value: clamp01(value), rationale };
}

export function extractSyntacticElaboration(text: string): RawFeatureSignal {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean);
  const wc = words.length;
  const hasSentenceEnd = /[.!?]/.test(t);
  let value: number;
  let rationale: string;
  if (wc < 8) {
    value = 0.2;
    rationale = 'Few words; limited sentence-like structure.';
  } else if (wc >= 15 && hasSentenceEnd) {
    value = 1;
    rationale = 'Multiple words with sentence boundaries; structured elaboration.';
  } else if (wc >= 10) {
    value = 0.65;
    rationale = 'Moderate elaboration.';
  } else {
    value = 0.4;
    rationale = 'Some content but thin structure.';
  }
  return { id: 'syntactic-elaboration', label: 'Elaboration & structure', value: clamp01(value), rationale };
}

/** Low value when reply is a bare acknowledgement (evasion / minimal engagement). */
export function extractDeflectionResistance(text: string): RawFeatureSignal {
  const t = text.trim();
  const minimal = /^(yes|no|ok|okay|sure|fine|nothing|i don't know|idk|nope|yep)\.?$/i.test(t);
  let value: number;
  let rationale: string;
  if (minimal) {
    value = 0.1;
    rationale = 'Dominated by minimal acknowledgement; low engagement signal.';
  } else if (/^(yes|no|ok|sure)\b/i.test(t) && t.length < 25) {
    value = 0.35;
    rationale = 'Starts with minimal token; possible deflection.';
  } else {
    value = 1;
    rationale = 'Not a bare minimal acknowledgement.';
  }
  return { id: 'deflection-resistance', label: 'Deflection resistance', value: clamp01(value), rationale };
}

export function extractFirstPersonStance(text: string): RawFeatureSignal {
  const lower = text.toLowerCase();
  const fp = /\b(i|i'm|i'd|i'll|i've|me|my|myself)\b/g;
  const matches = lower.match(fp);
  const count = matches?.length ?? 0;
  let value: number;
  let rationale: string;
  if (count === 0) {
    value = 0.2;
    rationale = 'Little first-person stance.';
  } else if (count <= 2) {
    value = 0.55;
    rationale = 'Some first-person anchoring.';
  } else {
    value = 1;
    rationale = 'Sustained first-person voice.';
  }
  return { id: 'first-person-stance', label: 'First-person stance', value: clamp01(value), rationale };
}

export const DEFAULT_EXTRACTOR_ORDER = [
  extractLengthBand,
  extractAffectiveLexicon,
  extractSyntacticElaboration,
  extractDeflectionResistance,
  extractFirstPersonStance,
] as const;

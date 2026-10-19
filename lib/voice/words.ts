// Pure helpers that turn Web Speech results into words with a "low confidence" flag (spec 02).
// No browser APIs here, so everything is unit tested in Node.

/** Results below this confidence (and above 0, which means "unknown") are marked low. */
export const LOW_CONFIDENCE = 0.6;

export interface Word {
  w: string;
  /** Not sure we heard it right: low final confidence, or it looks like a hat code. */
  low: boolean;
  /** False for interim (not final) words, rendered muted. */
  confirmed: boolean;
}

/** The parts of SpeechRecognitionResultList we read. Real browser objects match this shape. */
export interface SpeechAlternativeLike {
  transcript: string;
  confidence: number;
}
export interface SpeechResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechAlternativeLike;
}
export interface SpeechResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechResultLike;
}

const PUNCT_RE = /^[\s.,;:!?¿¡"'()«»]+|[\s.,;:!?¿¡"'()«»]+$/g;

/** Spoken hat codes are the top error source: "TQ...", or a token mixing letters and digits. */
export function isLikelyCode(word: string): boolean {
  const t = word.replace(PUNCT_RE, "");
  if (t.length === 0) return false;
  if (/^tq/i.test(t)) return true;
  return /\p{L}/u.test(t) && /\d/.test(t);
}

/**
 * Rebuilds the whole transcript from the result list (with `continuous`, it holds the full session).
 * Confidence is per result, so every word of a final result gets that result's confidence.
 */
export function toWords(results: SpeechResultListLike, threshold: number = LOW_CONFIDENCE): Word[] {
  const out: Word[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const alt = r?.[0];
    if (!alt) continue;
    const confidence = Number.isFinite(alt.confidence) ? alt.confidence : 0;
    const lowResult = r.isFinal && confidence > 0 && confidence < threshold;
    for (const w of alt.transcript.split(/\s+/).filter(Boolean)) {
      out.push({ w, confirmed: r.isFinal, low: r.isFinal && (lowResult || isLikelyCode(w)) });
    }
  }
  return out;
}

export function wordsToText(words: readonly Word[]): string {
  return words
    .map((x) => x.w)
    .join(" ")
    .trim();
}

/** Unique low words, in order. */
export function lowWordsOf(words: readonly Word[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of words) {
    if (x.low && !seen.has(x.w)) {
      seen.add(x.w);
      out.push(x.w);
    }
  }
  return out;
}

/** The unsure chips list only low words that still appear in the note (spec 02 rule 10). */
export function lowWordsInNote(lowWords: readonly string[], note: string): string[] {
  return lowWords.filter((w) => note.includes(w));
}

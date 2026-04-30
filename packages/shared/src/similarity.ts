/**
 * Unicode-aware string similarity for comprehension scoring.
 *
 * Scope:
 * 1. NFC-normalize both inputs.
 * 2. Trim + casefold.
 * 3. For Latin-script langs (es/fr/it/de/pt): NFD-decompose → strip
 *    combining marks (`\p{M}`) → NFC. So "café" ≈ "cafe".
 * 4. For ja/zh: NFKC-fold (full-width ↔ half-width).
 * 5. For ru: no extra fold — Ё/Е, Й/И are real semantic distinctions.
 * 6. Compute normalized Levenshtein → 1 - dist / max(len).
 *
 * Used by:
 * - Comprehension session per-card score (Request 3.3).
 * - Pronunciation session (Phase 4 — Whisper transcript vs target).
 *
 * Out of scope:
 * - Phoneme-level scoring (DEBT-004).
 * - Token-level matching ("thanks" ≈ "thank you") — v1 prompts are
 *   short single words/phrases.
 */

const LATIN_FOLD_LANGS = new Set(['es', 'fr', 'it', 'de', 'pt']);
const NFKC_LANGS = new Set(['ja', 'zh']);

export type SimilarityOptions = {
  /** BCP-47 code. Drives per-language fold rules. Default: no fold. */
  lang?: string;
};

function langPrefix(lang: string | undefined): string | undefined {
  if (!lang) return undefined;
  return lang.toLowerCase().split('-')[0];
}

function normalize(input: string, lang: string | undefined): string {
  const langKey = langPrefix(lang);
  let s = input.trim();

  if (langKey && NFKC_LANGS.has(langKey)) {
    s = s.normalize('NFKC');
  } else {
    s = s.normalize('NFC');
  }

  // Casefold. toLocaleLowerCase honors per-language quirks (e.g. Turkish
  // dotted/dotless I) — useful even when the lang isn't in our fold sets.
  s = langKey ? s.toLocaleLowerCase(langKey) : s.toLowerCase();

  if (langKey && LATIN_FOLD_LANGS.has(langKey)) {
    // Strip combining marks: NFD → drop \p{M} → NFC.
    s = s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
  }

  return s;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Two-row dynamic programming. O(min(a,b)) memory.
  const aLen = a.length;
  const bLen = b.length;
  let prev = new Array<number>(bLen + 1);
  let curr = new Array<number>(bLen + 1);
  for (let j = 0; j <= bLen; j++) prev[j] = j;
  for (let i = 1; i <= aLen; i++) {
    curr[0] = i;
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1, // deletion
        curr[j - 1]! + 1, // insertion
        prev[j - 1]! + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[bLen]!;
}

export function similarity(
  target: string,
  response: string,
  opts?: SimilarityOptions,
): number {
  if (target.length === 0) {
    throw new Error('similarity: target must be non-empty');
  }
  const t = normalize(target, opts?.lang);
  const r = normalize(response, opts?.lang);
  if (r.length === 0) return 0;
  if (t === r) return 1;
  const dist = levenshtein(t, r);
  const maxLen = Math.max(t.length, r.length);
  return Math.max(0, Math.min(1, 1 - dist / maxLen));
}

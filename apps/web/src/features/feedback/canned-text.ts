/**
 * Canned feedback text for v1 — small, curated by hand. Phase 5 swaps the
 * useFeedback impl to call the `generate-feedback` Edge Function (Claude
 * proxy); the data shape stays.
 */

import type { ScoreBucket } from '@repeaty/shared';

export type FeedbackKey = {
  bucket: ScoreBucket;
  /** First two chars of BCP-47 — e.g. 'en', 'es', 'fr'. */
  nativeLangPrefix: string;
};

const FEEDBACK: Record<string, Record<ScoreBucket, string | null>> = {
  en: {
    perfect: null, // perfect needs no feedback
    close: 'Nearly there. Watch the spelling — small details count.',
    miss: "That's not it yet. Keep at it; the answer is shown above.",
  },
  es: {
    perfect: null,
    close: 'Casi. Cuidado con la ortografía — los detalles cuentan.',
    miss: 'Aún no. Sigue intentándolo; la respuesta se muestra arriba.',
  },
  pt: {
    perfect: null,
    close: 'Quase lá. Cuidado com a ortografia — os detalhes contam.',
    miss: 'Ainda não. Continue tentando; a resposta está acima.',
  },
  fr: {
    perfect: null,
    close: 'Presque. Attention à l’orthographe — les détails comptent.',
    miss: 'Pas tout à fait. Continue ; la réponse est affichée ci-dessus.',
  },
  de: {
    perfect: null,
    close: 'Fast richtig. Achte auf die Schreibweise — Details zählen.',
    miss: 'Noch nicht. Weiter so; die Antwort steht oben.',
  },
};

const FALLBACK_LANG = 'en';

export function lookupFeedback(key: FeedbackKey): string | null {
  const langTable = FEEDBACK[key.nativeLangPrefix.toLowerCase()] ?? FEEDBACK[FALLBACK_LANG];
  return langTable![key.bucket];
}

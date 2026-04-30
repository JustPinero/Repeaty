/**
 * @repeaty/shared — cross-cutting types, Zod schemas, and the FSRS scheduling
 * wrapper. Imported by both apps/web and supabase/functions/*.
 */

export const version = '0.1.0';

export {
  CEFR_LEVELS,
  type CefrLevel,
  type LanguageOption,
  SUPPORTED_TARGET_LANGUAGES,
  COMMON_NATIVE_LANGUAGES,
  isCefrLevel,
  isSupportedTargetLanguage,
} from './languages';

export {
  Rating,
  type FsrsState,
  initialState,
  schedule,
  dueAt,
  isDue,
} from './fsrs';

export { similarity, type SimilarityOptions } from './similarity';
export { comprehensionScore, bucket, type ScoreBucket } from './comprehension-score';

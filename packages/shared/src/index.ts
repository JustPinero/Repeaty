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
export {
  EDGE_ERROR_CODES,
  EDGE_ERROR_HTTP_STATUS,
  type EdgeErrorCode,
  type EdgeErrorBody,
  type EdgeSuccessBody,
  type EdgeResponseBody,
} from './edge-errors';
export { stripFence } from './strip-fence';
export {
  type FeedbackKind,
  type ComprehensionAttempt,
  type PronunciationAttempt,
  type FeedbackPromptInput,
  type FeedbackOutput,
  FeedbackOutputSchema,
  buildFeedbackPrompt,
} from './feedback-prompt';
export {
  type LessonCard,
  type LessonOutput,
  type LessonPromptInput,
  LessonOutputSchema,
  buildLessonPrompt,
} from './lesson-prompt';

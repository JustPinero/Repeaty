/**
 * @repeaty/shared — cross-cutting types, Zod schemas, and (later) the FSRS
 * scheduling implementation. Imported by both apps/web and supabase/functions/*.
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

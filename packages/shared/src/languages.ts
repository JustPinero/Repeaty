/**
 * Languages and CEFR levels — single source of truth, used by onboarding,
 * deck filters, and language-selector UI.
 */

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export type LanguageOption = {
  /** BCP-47 code; matches profiles.native_language_code and user_languages.language_code. */
  code: string;
  /** Display label in English (we'll render localized labels in Phase 6). */
  label: string;
};

/**
 * Target languages Repeaty supports at v1 launch. All have solid Whisper
 * coverage; ja/zh have acceptable browser TTS (DEBT-003 covers OpenAI TTS
 * upgrade for those).
 */
export const SUPPORTED_TARGET_LANGUAGES: readonly LanguageOption[] = [
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'ru', label: 'Russian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Mandarin' },
] as const;

/**
 * Native-language picker shown during onboarding. Includes the seven targets
 * (a learner of Spanish may also be a native Spanish speaker studying French)
 * plus the most common native languages of likely Repeaty users. Region
 * variants like `en-US` / `en-GB` use BCP-47 codes; bare codes are fine when
 * region is not relevant.
 */
export const COMMON_NATIVE_LANGUAGES: readonly LanguageOption[] = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'pt-PT', label: 'Portuguese (Portugal)' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'ru', label: 'Russian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Mandarin' },
  { code: 'ko', label: 'Korean' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'tr', label: 'Turkish' },
] as const;

export function isCefrLevel(value: unknown): value is CefrLevel {
  return typeof value === 'string' && (CEFR_LEVELS as readonly string[]).includes(value);
}

export function isSupportedTargetLanguage(code: string): boolean {
  return SUPPORTED_TARGET_LANGUAGES.some((l) => l.code === code);
}

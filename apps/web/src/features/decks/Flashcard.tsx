import { useEffect, useState } from 'react';
import { Button, Card, CardContent } from '@/components/ui';
import { platform } from '@/platform';

type Props = {
  targetText: string;
  nativeText: string;
  /** Phonetic anchor (kana romanization for ja, pinyin with tone marks for zh).
   * Only rendered when present; non-CJK cards leave this null. */
  ipa?: string | null;
  exampleTarget?: string;
  exampleNative?: string;
  /** BCP-47 code for TTS playback. When set + platform.canSpeak(), a Play button renders. */
  languageCode?: string;
};

export function Flashcard({
  targetText,
  nativeText,
  ipa,
  exampleTarget,
  exampleNative,
  languageCode,
}: Props) {
  const [revealed, setRevealed] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const showPlay = !!languageCode && platform.canSpeak();

  // Reset reveal state when the card changes (next card in a session).
  useEffect(() => {
    setRevealed(false);
  }, [targetText]);

  // Cancel any in-flight speech when the card changes or on unmount.
  useEffect(() => {
    return () => {
      platform.cancelSpeech();
    };
  }, [targetText]);

  async function handlePlay() {
    if (!languageCode || speaking) return;
    setSpeaking(true);
    try {
      await platform.playTargetText(targetText, { lang: languageCode });
    } catch (err) {
      // Best-effort UX (no toast / dialog) — the answer is still readable.
      // But we DO log so beta-user bug reports have a diagnostic trail
      // (esp. for DEBT-003 ja/zh degraded voices and iOS user-gesture rule).
      console.error('TTS playback failed', { lang: languageCode, error: err });
    } finally {
      setSpeaking(false);
    }
  }

  return (
    <Card data-testid="flashcard" className="w-full max-w-md">
      <CardContent className="flex flex-col items-center p-8 text-center space-y-6">
        <p className="text-3xl font-semibold tracking-tight">{targetText}</p>

        {showPlay && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void handlePlay()}
            disabled={speaking}
            aria-label="Play target audio"
          >
            🔊 {speaking ? 'Speaking…' : 'Play'}
          </Button>
        )}

        {revealed ? (
          <div className="space-y-2 animate-flip-in">
            <p className="text-xl text-stone-700">{nativeText}</p>
            {ipa && (
              <p className="text-sm italic text-stone-500">/{ipa}/</p>
            )}
            {exampleTarget && (
              <p className="text-sm italic text-stone-600">{exampleTarget}</p>
            )}
            {exampleNative && (
              <p className="text-sm text-stone-500">{exampleNative}</p>
            )}
          </div>
        ) : (
          <Button onClick={() => setRevealed(true)} variant="default">
            Reveal answer
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

import { useEffect, useState } from 'react';
import { Button, Card, CardContent } from '@/components/ui';
import { platform } from '@/platform';

type Props = {
  targetText: string;
  nativeText: string;
  exampleTarget?: string;
  exampleNative?: string;
  /** BCP-47 code for TTS playback. When set + platform.canSpeak(), a Play button renders. */
  languageCode?: string;
};

export function Flashcard({
  targetText,
  nativeText,
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
    } catch {
      // Best-effort — don't surface speech errors to the user; the answer
      // is still readable.
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

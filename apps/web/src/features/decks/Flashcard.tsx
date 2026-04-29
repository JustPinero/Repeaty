import { useEffect, useState } from 'react';
import { Button, Card, CardContent } from '@/components/ui';

type Props = {
  targetText: string;
  nativeText: string;
  exampleTarget?: string;
  exampleNative?: string;
};

export function Flashcard({ targetText, nativeText, exampleTarget, exampleNative }: Props) {
  const [revealed, setRevealed] = useState(false);

  // Reset reveal state when the card changes (next card in a session).
  useEffect(() => {
    setRevealed(false);
  }, [targetText]);

  return (
    <Card data-testid="flashcard" className="w-full max-w-md">
      <CardContent className="flex flex-col items-center p-8 text-center space-y-6">
        <p className="text-3xl font-semibold tracking-tight">{targetText}</p>

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

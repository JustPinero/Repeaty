import { useEffect } from 'react';
import { Rating } from '@repeaty/shared';
import { Button } from '@/components/ui';

type Props = {
  onRate: (rating: Rating) => void;
  disabled?: boolean;
};

const KEY_TO_RATING: Record<string, Rating> = {
  '1': Rating.Again,
  '2': Rating.Hard,
  '3': Rating.Good,
  '4': Rating.Easy,
};

function isFormControlFocused(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function RatingButtons({ onRate, disabled }: Props) {
  useEffect(() => {
    if (disabled) return undefined;
    function onKeydown(e: KeyboardEvent) {
      if (isFormControlFocused(e.target)) return;
      const rating = KEY_TO_RATING[e.key];
      if (rating !== undefined) {
        e.preventDefault();
        onRate(rating);
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => {
      window.removeEventListener('keydown', onKeydown);
    };
  }, [onRate, disabled]);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="rating-buttons">
      <Button variant="destructive" disabled={disabled} onClick={() => onRate(Rating.Again)}>
        Again
      </Button>
      <Button variant="secondary" disabled={disabled} onClick={() => onRate(Rating.Hard)}>
        Hard
      </Button>
      <Button variant="default" disabled={disabled} onClick={() => onRate(Rating.Good)}>
        Good
      </Button>
      <Button variant="outline" disabled={disabled} onClick={() => onRate(Rating.Easy)}>
        Easy
      </Button>
    </div>
  );
}

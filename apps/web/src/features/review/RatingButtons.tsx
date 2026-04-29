// RED stub — renders nothing useful.
import type { Rating } from '@repeaty/shared';

type Props = {
  onRate: (rating: Rating) => void;
  disabled?: boolean;
};

export function RatingButtons(_props: Props) {
  return <div data-testid="rating-buttons">placeholder</div>;
}

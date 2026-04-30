import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui';

type Props = {
  id: string;
  name: string;
  languageCode: string;
  cefrLevel: string;
  cardCount: number;
  source: 'bundled' | 'ai_generated' | 'imported';
};

const SOURCE_LABELS: Record<Props['source'], string> = {
  bundled: 'Starter',
  ai_generated: 'AI-generated',
  imported: 'Imported',
};

export function DeckListItem({ id, name, languageCode, cefrLevel, cardCount, source }: Props) {
  return (
    <li data-testid="deck-list-item">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-stone-900 truncate">{name}</p>
              <p className="text-sm text-stone-600">
                <span className="uppercase">{languageCode}</span> · {cardCount} card
                {cardCount === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                aria-label="CEFR level"
                className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700"
              >
                {cefrLevel}
              </span>
              <span
                aria-label="Source"
                className="rounded-full bg-peaty-green/10 px-2 py-0.5 text-xs font-medium text-peaty-green"
              >
                {SOURCE_LABELS[source]}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/app/decks/${id}/review`}
              aria-label={`Review ${name}`}
              className="flex-1 rounded bg-peaty-green px-3 py-2 text-center text-sm font-medium text-white hover:bg-peaty-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-peaty-green focus-visible:ring-offset-2"
            >
              Review
            </Link>
            <Link
              to={`/app/decks/${id}/comprehension`}
              aria-label={`Comprehension drill — ${name}`}
              className="flex-1 rounded border border-stone-300 px-3 py-2 text-center text-sm font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-peaty-green focus-visible:ring-offset-2"
            >
              Comprehension
            </Link>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

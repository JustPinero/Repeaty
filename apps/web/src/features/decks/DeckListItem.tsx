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
      <Link
        to={`/app/decks/${id}`}
        className="block hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-peaty-green focus-visible:ring-offset-2 rounded-xl"
      >
        <Card className="hover:bg-stone-50 transition-colors">
          <CardContent className="flex items-center justify-between gap-4 p-4">
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
          </CardContent>
        </Card>
      </Link>
    </li>
  );
}

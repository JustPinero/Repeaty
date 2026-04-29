// RED stub — no link, no card count, no level badge.
type Props = {
  id: string;
  name: string;
  languageCode: string;
  cefrLevel: string;
  cardCount: number;
  source: 'bundled' | 'ai_generated' | 'imported';
};

export function DeckListItem(_props: Props) {
  return <li data-testid="deck-list-item">placeholder</li>;
}

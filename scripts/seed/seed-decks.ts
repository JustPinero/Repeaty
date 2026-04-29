// RED-phase stub — throws on every call.
// GREEN replaces with the real generator: read YAML decks, derive UUIDv5 ids
// (deterministic across runs), emit `supabase/migrations/0009_seed_bundled_decks.sql`
// with idempotent ON CONFLICT upserts.

export type DeckSpec = {
  id: string;
  name: string;
  language_code: string;
  cefr_level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  cards: Array<{
    target: string;
    native: string;
    ipa?: string;
    example_target?: string;
    example_native?: string;
  }>;
};

export function generateMigrationSql(_specs: DeckSpec[]): string {
  throw new Error('seed-decks.generateMigrationSql stub — replaced in GREEN');
}

export async function loadDeckSpecs(_decksDir: string): Promise<DeckSpec[]> {
  throw new Error('seed-decks.loadDeckSpecs stub — replaced in GREEN');
}

async function main() {
  throw new Error('seed-decks.main stub — replaced in GREEN');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}

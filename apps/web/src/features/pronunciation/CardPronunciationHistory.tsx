import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthUser } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui';

type Attempt = {
  id: string;
  similarity_score: number;
  whisper_transcript: string;
  audio_storage_path: string | null;
  created_at: string;
};

type Props = {
  cardId: string;
  pageSize?: number;
};

const SIGNED_URL_TTL_SECONDS = 60;

export function CardPronunciationHistory({ cardId, pageSize = 20 }: Props) {
  const { user } = useAuthUser();
  const userId = user?.id ?? null;
  const [limit, setLimit] = useState(pageSize);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery<Attempt[], Error>({
    queryKey: ['card-pronunciation-history', cardId, userId, limit],
    enabled: !!userId && !!cardId,
    // 1-min stale window keeps the cache below TanStack Query's default
    // 5-min gcTime: when DEBT-005 lands and the retention reaper actually
    // removes file blobs, a stale cached row would otherwise still render
    // a Play button that 404s on the signed-URL GET.
    staleTime: 60_000,
    queryFn: async () => {
      const res = await supabase
        .from('pronunciation_attempts')
        .select('id, similarity_score, whisper_transcript, audio_storage_path, created_at')
        .eq('user_id', userId!)
        .eq('card_id', cardId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (res.error) throw new Error(res.error.message);
      return (res.data ?? []) as Attempt[];
    },
  });

  async function handlePlay(attempt: Attempt) {
    if (!attempt.audio_storage_path) return;
    setPlayingId(attempt.id);
    try {
      const signed = await supabase.storage
        .from('pronunciation-audio')
        .createSignedUrl(attempt.audio_storage_path, SIGNED_URL_TTL_SECONDS);
      if (signed.error || !signed.data?.signedUrl) {
        throw new Error(signed.error?.message ?? 'no signed URL');
      }
      const audio = new Audio(signed.data.signedUrl);
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('audio playback failed'));
        audio.play().catch(reject);
      });
    } catch {
      // Best-effort — surfacing failure inline isn't worth the UX cost.
    } finally {
      setPlayingId(null);
    }
  }

  if (isLoading) return <p className="text-sm text-stone-500">Loading history…</p>;

  if (isError) {
    return (
      <p role="alert" className="text-sm text-red-700">
        Couldn’t load history: {error?.message ?? 'Unknown error'}
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        No attempts yet — this card hasn’t been spoken in a pronunciation session.
      </p>
    );
  }

  return (
    <div data-testid="card-pronunciation-history" className="space-y-3">
      <ul className="space-y-2">
        {data.map((a) => {
          const score = Math.round(a.similarity_score * 100);
          const tone =
            score >= 90
              ? 'bg-peaty-green/10 text-peaty-green'
              : score >= 60
              ? 'bg-amber-100 text-amber-800'
              : 'bg-red-100 text-red-700';
          return (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 rounded border border-stone-200 bg-white px-3 py-2 text-sm"
            >
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
                {score}/100
              </span>
              <span className="flex-1 truncate text-stone-600" title={a.whisper_transcript}>
                {a.whisper_transcript || '(silent)'}
              </span>
              {a.audio_storage_path && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePlay(a)}
                  disabled={playingId === a.id}
                  aria-label={`Play attempt from ${new Date(a.created_at).toLocaleDateString()}`}
                >
                  {playingId === a.id ? '…' : '▶︎'}
                </Button>
              )}
              <time
                dateTime={a.created_at}
                className="text-xs text-stone-500"
                title={a.created_at}
              >
                {new Date(a.created_at).toLocaleDateString()}
              </time>
            </li>
          );
        })}
      </ul>
      {data.length === limit && (
        <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + pageSize)}>
          Load more
        </Button>
      )}
    </div>
  );
}

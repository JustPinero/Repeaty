import { useEffect, useState } from 'react';

type Props = {
  /** Epoch-ms timestamp at which the timer started. */
  startedAt: number;
  /** Live ticks roughly every 100ms. Pause by passing `paused`. */
  paused?: boolean;
};

/**
 * Soft timer — non-blocking display, no hard cutoff. The score formula
 * (Request 3.3) handles the speed factor; the user just sees how long
 * they've been thinking.
 */
export function Timer({ startedAt, paused }: Props) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (paused) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [paused]);

  const elapsedMs = Math.max(0, now - startedAt);
  const seconds = (elapsedMs / 1000).toFixed(1);

  return (
    <span
      role="timer"
      aria-label="Elapsed time"
      className="font-mono text-sm tabular-nums text-stone-600"
    >
      {seconds}s
    </span>
  );
}

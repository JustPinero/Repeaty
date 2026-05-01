# Fix — Catch `audio.play()` rejection in `playRecordedAudio` (web platform adapter)

**Source audit:** BugHunt Phase 4 (W-2)
**Severity:** Warning — real iOS Safari bug

## Problem

`apps/web/src/platform/web.ts:201-222`:

```ts
async playRecordedAudio(blob: Blob): Promise<void> {
  // ...
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => URL.revokeObjectURL(url);
    audio.addEventListener('ended', () => { cleanup(); resolve(); });
    audio.addEventListener('error', (event) => { cleanup(); reject(...); });
    void audio.play();   // ← play() rejection is swallowed
  });
}
```

`HTMLMediaElement.play()` returns a Promise that rejects in three real cases — iOS Safari outside a user gesture (NotAllowedError), autoplay-policy block, codec mismatch. In each, no `error` event fires (per spec — `error` is for in-flight playback failures, not start-up failures). The outer Promise never resolves → MicCapture's `playbackInFlight` stays `true` → the "Listen back" button is permanently disabled until re-record.

## Reproduction

In iOS Safari, render `MicCapture`, record + stop, click "Listen back" without a fresh user gesture (e.g. auto-trigger via `useEffect`). The button hangs at "Playing…" indefinitely.

## Proposed fix

Replace `void audio.play();` with a catch-block that drives the outer reject:

```ts
audio.play().catch((err) => {
  cleanup();
  reject(err instanceof Error ? err : new Error(String(err)));
});
```

`URL.revokeObjectURL` is idempotent (no-op on already-revoked URLs), so a later `error` event firing won't break.

## Test

Add to `apps/web/src/platform/web.test.ts`:

```ts
it('rejects when audio.play() rejects (iOS no-user-gesture)', async () => {
  // Mock the Audio constructor.
  const originalAudio = window.Audio;
  class MockAudio {
    src: string;
    onended?: () => void;
    onerror?: (e: Event) => void;
    listeners = new Map<string, ((e: Event) => void)[]>();
    constructor(src: string) { this.src = src; }
    addEventListener(type: string, fn: (e: Event) => void) {
      const list = this.listeners.get(type) ?? [];
      list.push(fn);
      this.listeners.set(type, list);
    }
    play(): Promise<void> {
      return Promise.reject(new DOMException('NotAllowedError', 'NotAllowedError'));
    }
  }
  (window as unknown as { Audio: unknown }).Audio = MockAudio;

  const blob = new Blob(['x'], { type: 'audio/webm' });
  await expect(webPlatform.playRecordedAudio(blob)).rejects.toThrow();

  (window as unknown as { Audio: typeof Audio }).Audio = originalAudio;
});
```

## Files to touch

- `apps/web/src/platform/web.ts` — add the `.catch` handler.
- `apps/web/src/platform/web.test.ts` — add the rejection test above.

## Acceptance criteria

- [ ] In iOS Safari (or any environment where `audio.play()` rejects), the Promise returned by `playRecordedAudio` rejects instead of hanging.
- [ ] `MicCapture`'s `playbackInFlight` flag is released when the inner promise rejects.
- [ ] Test passes.

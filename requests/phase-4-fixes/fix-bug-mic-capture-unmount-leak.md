# Fix — `MicCapture` leaks `MediaStream` if unmounted during `requesting` → `recording`

**Source audit:** BugHunt Phase 4 (W-3)
**Severity:** Warning — leaves the mic LED on; iOS Safari shows persistent "site is using your microphone"

## Problem

`apps/web/src/features/pronunciation/MicCapture.tsx:33-37, 39-64`:

```ts
useEffect(() => {
  return () => {
    if (handle) platform.cancelRecording(handle);
  };
}, [handle]);

async function handleStart() {
  setStatus('requesting');
  // ...
  const h = await platform.startRecording();   // ← getUserMedia opens a live MediaStream
  setHandle(h);                                  // ← if unmounted before this, h is leaked
}
```

If the user clicks Record and then navigates away (or the parent unmounts) during the `'requesting'` state, the cleanup effect captures the *previous* `handle` value (still `null`) and does nothing. The resolved-but-unrendered MediaStream is now orphaned: tracks stay live, mic LED stays on, only a manual page reload reclaims the device.

## Reproduction

1. Render `MicCapture`.
2. Click Record. While `'requesting'` is showing, navigate to another route (or unmount the parent).
3. Mic indicator stays on indefinitely.

## Proposed fix

Track an `unmountedRef` and cancel the resolved handle if we unmounted between `await` and `setHandle`:

```ts
const unmountedRef = useRef(false);
useEffect(() => {
  return () => { unmountedRef.current = true; };
}, []);

async function handleStart() {
  setStatus('requesting');
  setErrorMsg('');
  try {
    const perm = await platform.requestMicPermission();
    if (perm === 'denied') {
      if (!unmountedRef.current) setStatus('denied');
      return;
    }
    const h = await platform.startRecording();
    if (unmountedRef.current) {
      platform.cancelRecording(h);
      return;
    }
    setHandle(h);
    setStartedAt(Date.now());
    setStatus('recording');
  } catch (err) {
    if (unmountedRef.current) return;
    // ... existing error handling
  }
}
```

The `unmountedRef` check pairs with the existing `cancelRecording` cleanup effect: post-mount cancellation goes through the effect, pre-`setHandle` cancellation goes through the new ref check.

## Test

Add to `apps/web/src/features/pronunciation/MicCapture.test.tsx`:

```ts
it('cancels the in-flight recording if unmounted before setHandle resolves', async () => {
  // Slow startRecording so we have time to unmount mid-await.
  let resolveStart: (h: { __brand: 'RecordingHandle' }) => void = () => {};
  startRecordingMock.mockImplementation(
    () => new Promise<{ __brand: 'RecordingHandle' }>((r) => { resolveStart = r; }),
  );

  const { unmount } = render(<MicCapture onRecorded={vi.fn()} />);
  await userEvent.setup().click(screen.getByRole('button', { name: /start recording/i }));

  // Unmount before the recorder resolves.
  unmount();
  resolveStart({ __brand: 'RecordingHandle' as const });

  // Give microtasks a tick.
  await new Promise((r) => setTimeout(r, 0));
  expect(cancelRecordingMock).toHaveBeenCalledTimes(1);
});
```

## Files to touch

- `apps/web/src/features/pronunciation/MicCapture.tsx` — add `unmountedRef` and the unmount checks.
- `apps/web/src/features/pronunciation/MicCapture.test.tsx` — add the unmount-mid-request test above.

## Acceptance criteria

- [ ] Unmount during `'requesting'` does not leave the mic LED on.
- [ ] Unmount during `'requesting'` calls `cancelRecording` exactly once on the resolved handle.
- [ ] Existing tests still pass.

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { platform } from '@/platform';
import type { RecordingHandle } from '@/platform';
import { Timer } from '@/features/comprehension/Timer';

type Status =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'recorded'
  | 'denied'
  | 'unsupported'
  | 'error';

type Props = {
  /** Called when the user finishes a recording. */
  onRecorded: (blob: Blob) => void;
  /** Called when the user clicks "Try again" / new recording. */
  onReset?: () => void;
};

export function MicCapture({ onRecorded, onReset }: Props) {
  const [status, setStatus] = useState<Status>(() =>
    platform.canRecord() ? 'idle' : 'unsupported',
  );
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [handle, setHandle] = useState<RecordingHandle | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [startedAt, setStartedAt] = useState<number>(0);
  const [playbackInFlight, setPlaybackInFlight] = useState(false);

  useEffect(() => {
    return () => {
      if (handle) platform.cancelRecording(handle);
    };
  }, [handle]);

  async function handleStart() {
    setStatus('requesting');
    setErrorMsg('');
    try {
      const perm = await platform.requestMicPermission();
      if (perm === 'denied') {
        setStatus('denied');
        return;
      }
      const h = await platform.startRecording();
      setHandle(h);
      setStartedAt(Date.now());
      setStatus('recording');
    } catch (err) {
      // getUserMedia rejects with NotAllowedError when the user denies the
      // user-gesture-driven prompt. The Permissions API may return 'prompt'
      // even after the user has just clicked "Block".
      const msg = err instanceof Error ? err.message : 'recording failed';
      if (/NotAllowedError|denied/i.test(msg)) {
        setStatus('denied');
      } else {
        setStatus('error');
        setErrorMsg(msg);
      }
    }
  }

  async function handleStop() {
    if (!handle) return;
    try {
      const blob = await platform.stopRecording(handle);
      setHandle(null);
      setRecordedBlob(blob);
      setStatus('recorded');
      onRecorded(blob);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'stop failed';
      setStatus('error');
      setErrorMsg(msg);
    }
  }

  async function handlePlayback() {
    if (!recordedBlob || playbackInFlight) return;
    setPlaybackInFlight(true);
    try {
      await platform.playRecordedAudio(recordedBlob);
    } catch {
      // Best-effort playback — don't surface an error to the user; the
      // textual answer is still readable.
    } finally {
      setPlaybackInFlight(false);
    }
  }

  function handleReset() {
    if (handle) {
      platform.cancelRecording(handle);
      setHandle(null);
    }
    setRecordedBlob(null);
    setErrorMsg('');
    setStatus('idle');
    onReset?.();
  }

  if (status === 'unsupported') {
    return (
      <div role="status" className="rounded border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
        Recording isn’t supported in this browser. Try Chrome or Safari on
        a device with a microphone.
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div role="alert" className="space-y-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p>Microphone permission denied. You’ll need to allow access in your browser settings to record.</p>
        <Button size="sm" variant="outline" onClick={handleReset}>
          Try again
        </Button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div role="alert" className="space-y-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <p>{errorMsg || 'Something went wrong with the recording.'}</p>
        <Button size="sm" variant="outline" onClick={handleReset}>
          Try again
        </Button>
      </div>
    );
  }

  if (status === 'recorded') {
    return (
      <div className="flex flex-col items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => void handlePlayback()}
          disabled={playbackInFlight}
          aria-label="Play recorded audio"
        >
          🔉 {playbackInFlight ? 'Playing…' : 'Listen back'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
          Re-record
        </Button>
      </div>
    );
  }

  if (status === 'recording') {
    return (
      <div className="flex flex-col items-center gap-3">
        <Button
          type="button"
          variant="destructive"
          onClick={() => void handleStop()}
          aria-label="Stop recording"
        >
          ⏹️ Stop
        </Button>
        <Timer startedAt={startedAt} />
      </div>
    );
  }

  // status === 'idle' || 'requesting'
  return (
    <Button
      type="button"
      variant="default"
      onClick={() => void handleStart()}
      disabled={status === 'requesting'}
      aria-label="Start recording"
    >
      🎤 {status === 'requesting' ? 'Requesting mic…' : 'Record'}
    </Button>
  );
}

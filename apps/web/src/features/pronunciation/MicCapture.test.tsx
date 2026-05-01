import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const canRecordMock = vi.fn();
const requestMicPermissionMock = vi.fn();
const startRecordingMock = vi.fn();
const stopRecordingMock = vi.fn();
const cancelRecordingMock = vi.fn();
const playRecordedAudioMock = vi.fn();

vi.mock('@/platform', () => ({
  platform: {
    canRecord: () => canRecordMock(),
    requestMicPermission: () => requestMicPermissionMock(),
    startRecording: () => startRecordingMock(),
    stopRecording: (handle: unknown) => stopRecordingMock(handle),
    cancelRecording: (handle: unknown) => cancelRecordingMock(handle),
    playRecordedAudio: (blob: Blob) => playRecordedAudioMock(blob),
  },
}));

import { MicCapture } from './MicCapture';

const FAKE_HANDLE = { __brand: 'RecordingHandle' as const };
const FAKE_BLOB = new Blob(['audio'], { type: 'audio/webm' });

describe('MicCapture', () => {
  beforeEach(() => {
    canRecordMock.mockReset();
    requestMicPermissionMock.mockReset();
    startRecordingMock.mockReset();
    stopRecordingMock.mockReset();
    cancelRecordingMock.mockReset();
    playRecordedAudioMock.mockReset();
    canRecordMock.mockReturnValue(true);
    requestMicPermissionMock.mockResolvedValue('prompt');
    startRecordingMock.mockResolvedValue(FAKE_HANDLE);
    stopRecordingMock.mockResolvedValue(FAKE_BLOB);
    playRecordedAudioMock.mockResolvedValue(undefined);
  });

  it('renders the Record button in the idle state', () => {
    render(<MicCapture onRecorded={vi.fn()} />);
    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument();
  });

  it('renders the unsupported message when canRecord() is false', () => {
    canRecordMock.mockReturnValue(false);
    render(<MicCapture onRecorded={vi.fn()} />);
    expect(screen.getByText(/Recording isn’t supported/i)).toBeInTheDocument();
  });

  it('starts a recording on click — Stop button + timer appear', async () => {
    const user = userEvent.setup();
    render(<MicCapture onRecorded={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /start recording/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /stop recording/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('timer')).toBeInTheDocument();
    expect(startRecordingMock).toHaveBeenCalledTimes(1);
  });

  it('stop click resolves a Blob via the onRecorded prop', async () => {
    const onRecorded = vi.fn();
    const user = userEvent.setup();
    render(<MicCapture onRecorded={onRecorded} />);
    await user.click(screen.getByRole('button', { name: /start recording/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /stop recording/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /stop recording/i }));
    await waitFor(() => {
      expect(onRecorded).toHaveBeenCalledWith(FAKE_BLOB);
    });
    expect(screen.getByRole('button', { name: /play recorded audio/i })).toBeInTheDocument();
  });

  it('shows a denied message when requestMicPermission returns "denied"', async () => {
    requestMicPermissionMock.mockResolvedValue('denied');
    const user = userEvent.setup();
    render(<MicCapture onRecorded={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /start recording/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/Microphone permission denied/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('treats a getUserMedia NotAllowedError as denied (not a generic error)', async () => {
    startRecordingMock.mockRejectedValue(new Error('NotAllowedError: user denied'));
    const user = userEvent.setup();
    render(<MicCapture onRecorded={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /start recording/i }));
    await waitFor(() => {
      expect(screen.getByText(/Microphone permission denied/i)).toBeInTheDocument();
    });
  });

  it('plays the recorded blob when the user clicks Listen back', async () => {
    const user = userEvent.setup();
    render(<MicCapture onRecorded={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /start recording/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /stop recording/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /stop recording/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /play recorded audio/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /play recorded audio/i }));
    await waitFor(() => {
      expect(playRecordedAudioMock).toHaveBeenCalledWith(FAKE_BLOB);
    });
  });

  it('cancels the in-flight recording if unmounted before setHandle resolves', async () => {
    let resolveStart: (h: { __brand: 'RecordingHandle' }) => void = () => {};
    startRecordingMock.mockImplementation(
      () =>
        new Promise<{ __brand: 'RecordingHandle' }>((r) => {
          resolveStart = r;
        }),
    );

    const user = userEvent.setup();
    const { unmount } = render(<MicCapture onRecorded={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /start recording/i }));

    unmount();
    resolveStart({ __brand: 'RecordingHandle' as const });

    await new Promise((r) => setTimeout(r, 0));
    expect(cancelRecordingMock).toHaveBeenCalledTimes(1);
  });

  it('Re-record resets back to idle and clears the blob', async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();
    render(<MicCapture onRecorded={vi.fn()} onReset={onReset} />);
    await user.click(screen.getByRole('button', { name: /start recording/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /stop recording/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /stop recording/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /re-record/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /re-record/i }));
    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument();
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

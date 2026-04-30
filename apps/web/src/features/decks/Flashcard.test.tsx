import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const playTargetTextMock = vi.fn();
const canSpeakMock = vi.fn();

vi.mock('@/platform', () => ({
  platform: {
    playTargetText: (...args: unknown[]) => playTargetTextMock(...args),
    cancelSpeech: vi.fn(),
    canSpeak: () => canSpeakMock(),
  },
}));

import { Flashcard } from './Flashcard';

beforeEach(() => {
  playTargetTextMock.mockReset();
  playTargetTextMock.mockResolvedValue(undefined);
  canSpeakMock.mockReset();
  canSpeakMock.mockReturnValue(true);
});

describe('Flashcard', () => {
  it('shows the target text on the front', () => {
    render(<Flashcard targetText="hola" nativeText="hello" />);
    expect(screen.getByText('hola')).toBeInTheDocument();
  });

  it('hides the native text until the user reveals it', () => {
    render(<Flashcard targetText="hola" nativeText="hello" />);
    expect(screen.queryByText('hello')).not.toBeInTheDocument();
  });

  it('reveals the native text after the user clicks the reveal button', async () => {
    const user = userEvent.setup();
    render(<Flashcard targetText="hola" nativeText="hello" />);
    await user.click(screen.getByRole('button', { name: /reveal|show answer/i }));
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('reveals on Space / Enter key from the reveal button (a11y)', async () => {
    const user = userEvent.setup();
    render(<Flashcard targetText="hola" nativeText="hello" />);
    const button = screen.getByRole('button', { name: /reveal|show answer/i });
    button.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('shows example sentences when provided, after reveal', async () => {
    const user = userEvent.setup();
    render(
      <Flashcard
        targetText="hola"
        nativeText="hello"
        exampleTarget="¡Hola, ¿cómo estás?"
        exampleNative="Hi, how are you?"
      />,
    );
    expect(screen.queryByText('¡Hola, ¿cómo estás?')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reveal|show answer/i }));
    expect(screen.getByText('¡Hola, ¿cómo estás?')).toBeInTheDocument();
    expect(screen.getByText('Hi, how are you?')).toBeInTheDocument();
  });

  it('starts collapsed again when targetText changes (next card in session)', () => {
    const { rerender } = render(<Flashcard targetText="hola" nativeText="hello" />);
    rerender(<Flashcard targetText="adiós" nativeText="goodbye" />);
    expect(screen.queryByText('goodbye')).not.toBeInTheDocument();
    expect(screen.getByText('adiós')).toBeInTheDocument();
  });

  it('renders a Play button when languageCode is provided and platform.canSpeak() is true', () => {
    render(<Flashcard targetText="hola" nativeText="hello" languageCode="es" />);
    expect(screen.getByRole('button', { name: /play|speak|listen/i })).toBeInTheDocument();
  });

  it('does NOT render a Play button when languageCode is missing', () => {
    render(<Flashcard targetText="hola" nativeText="hello" />);
    expect(screen.queryByRole('button', { name: /play|speak|listen/i })).not.toBeInTheDocument();
  });

  it('does NOT render a Play button when platform.canSpeak() is false', () => {
    canSpeakMock.mockReturnValue(false);
    render(<Flashcard targetText="hola" nativeText="hello" languageCode="es" />);
    expect(screen.queryByRole('button', { name: /play|speak|listen/i })).not.toBeInTheDocument();
  });

  it('clicking Play calls platform.playTargetText with the target + lang', async () => {
    const user = userEvent.setup();
    render(<Flashcard targetText="hola" nativeText="hello" languageCode="es" />);
    await user.click(screen.getByRole('button', { name: /play|speak|listen/i }));
    expect(playTargetTextMock).toHaveBeenCalledTimes(1);
    expect(playTargetTextMock).toHaveBeenCalledWith('hola', { lang: 'es' });
  });

  it('logs (without surfacing) when platform.playTargetText rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    playTargetTextMock.mockRejectedValueOnce(new Error('synthesis-failed'));
    const user = userEvent.setup();
    render(<Flashcard targetText="hola" nativeText="hello" languageCode="es" />);
    await user.click(screen.getByRole('button', { name: /play|speak|listen/i }));

    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalled();
    });
    const args = errorSpy.mock.calls[0]!;
    expect(String(args[0])).toMatch(/TTS playback failed/);
    expect(args[1]).toMatchObject({ lang: 'es' });
    // No alert / dialog / toast surfaced.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    errorSpy.mockRestore();
  });
});

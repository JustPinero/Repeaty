import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Flashcard } from './Flashcard';

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
});

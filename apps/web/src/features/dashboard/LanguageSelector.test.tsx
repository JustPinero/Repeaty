import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageSelector } from './LanguageSelector';
import { useActiveLanguage } from './useActiveLanguage';

beforeEach(() => {
  // Reset persisted state between tests.
  useActiveLanguage.setState({ activeLanguageCode: null });
  localStorage.clear();
});

describe('LanguageSelector', () => {
  it('renders nothing when the user has only one target language', () => {
    const { container } = render(<LanguageSelector targetLanguageCodes={['es']} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a labeled select when the user has multiple target languages', () => {
    render(<LanguageSelector targetLanguageCodes={['es', 'fr', 'de']} />);
    expect(screen.getByLabelText(/active language|studying/i)).toBeInTheDocument();
  });

  it('only includes options for the user’s target languages', () => {
    render(<LanguageSelector targetLanguageCodes={['es', 'ja']} />);
    expect(screen.getByRole('option', { name: /\(es\)/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /\(ja\)/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /\(fr\)/ })).not.toBeInTheDocument();
  });

  it('persists the chosen language to Zustand (and therefore to localStorage)', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector targetLanguageCodes={['es', 'fr']} />);
    await user.selectOptions(screen.getByLabelText(/active language|studying/i), 'fr');
    expect(useActiveLanguage.getState().activeLanguageCode).toBe('fr');
  });
});

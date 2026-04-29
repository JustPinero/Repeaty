import { describe, expect, it, beforeEach } from 'vitest';
import { useActiveLanguage } from './useActiveLanguage';

beforeEach(() => {
  useActiveLanguage.setState({ activeLanguageCode: null });
  localStorage.clear();
});

describe('useActiveLanguage', () => {
  it('starts with no active language', () => {
    expect(useActiveLanguage.getState().activeLanguageCode).toBeNull();
  });

  it('updates the active language via setActiveLanguageCode', () => {
    useActiveLanguage.getState().setActiveLanguageCode('es');
    expect(useActiveLanguage.getState().activeLanguageCode).toBe('es');
  });

  it('persists the active language to localStorage under the repeaty:active-language key', () => {
    useActiveLanguage.getState().setActiveLanguageCode('fr');
    const persisted = localStorage.getItem('repeaty:active-language');
    expect(persisted).not.toBeNull();
    const parsed = JSON.parse(persisted!) as { state: { activeLanguageCode: string } };
    expect(parsed.state.activeLanguageCode).toBe('fr');
  });

  it('clears the active language when set to null', () => {
    useActiveLanguage.getState().setActiveLanguageCode('es');
    useActiveLanguage.getState().setActiveLanguageCode(null);
    expect(useActiveLanguage.getState().activeLanguageCode).toBeNull();
  });
});

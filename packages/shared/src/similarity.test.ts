import { describe, expect, it } from 'vitest';
import { similarity } from './similarity';

describe('similarity', () => {
  it('exact match scores 1.0', () => {
    expect(similarity('hola', 'hola')).toBe(1);
  });

  it('throws on empty target (programming error — guard the caller)', () => {
    expect(() => similarity('', 'hola')).toThrow();
  });

  it('empty response scores 0', () => {
    expect(similarity('hola', '')).toBe(0);
  });

  it('trims surrounding whitespace before comparing', () => {
    expect(similarity('hola', '  hola  ')).toBe(1);
  });

  it('is case-insensitive', () => {
    expect(similarity('Hola', 'hola')).toBe(1);
    expect(similarity('HOLA', 'hola')).toBe(1);
  });

  it('NFC-normalizes — composed and decomposed café both match', () => {
    const composed = 'café'; // single code point é
    const decomposed = 'café'; // e + combining acute
    expect(similarity(composed, decomposed, { lang: 'fr' })).toBe(1);
  });

  it('folds Latin diacritics for ES/FR/IT/DE/PT', () => {
    expect(similarity('adiós', 'adios', { lang: 'es' })).toBe(1);
    expect(similarity('café', 'cafe', { lang: 'fr' })).toBe(1);
    expect(similarity('über', 'uber', { lang: 'de' })).toBe(1);
    expect(similarity('città', 'citta', { lang: 'it' })).toBe(1);
    expect(similarity('coração', 'coracao', { lang: 'pt' })).toBe(1);
  });

  it('does NOT fold Russian Ё/Е distinction (semantic)', () => {
    expect(similarity('Ёлка', 'Елка', { lang: 'ru' })).toBeLessThan(1);
  });

  it('NFKC-normalizes full-width vs half-width for ja/zh', () => {
    // Full-width ASCII A vs half-width A
    expect(similarity('Ａ', 'A', { lang: 'ja' })).toBe(1);
    expect(similarity('Ａ', 'A', { lang: 'zh' })).toBe(1);
  });

  it('a one-character typo on a 5-char word scores ≥ 0.6', () => {
    // 1 / 5 edits → 1 - 0.2 = 0.8.
    expect(similarity('hello', 'helo')).toBeGreaterThanOrEqual(0.6);
    expect(similarity('hello', 'hellp')).toBeGreaterThanOrEqual(0.6);
  });

  it('wholly different words score low', () => {
    expect(similarity('hello', 'goodbye')).toBeLessThan(0.4);
  });

  it('is pure — same input always produces the same output', () => {
    const a = similarity('hola', 'olla', { lang: 'es' });
    const b = similarity('hola', 'olla', { lang: 'es' });
    expect(a).toBe(b);
  });
});

import { detectLanguage } from '../src/ai/locale/language-detector';

describe('detectLanguage', () => {
  it('detects English from stopwords', () => {
    const r = detectLanguage('The quick brown fox jumps over the lazy dog.');
    expect(r.language).toBe('en');
    expect(r.script).toBe('Latn');
  });

  it('detects Russian via Cyrillic block', () => {
    const r = detectLanguage('Мария — технический директор Acme.');
    expect(r.language).toBe('ru');
    expect(r.script).toBe('Cyrl');
  });

  it('detects Spanish from stopwords', () => {
    const r = detectLanguage('La empresa es importante para los clientes.');
    expect(r.language).toBe('es');
    expect(r.script).toBe('Latn');
  });

  it('detects French from stopwords', () => {
    const r = detectLanguage("Je suis content de vous voir aujourd'hui.");
    expect(r.language).toBe('fr');
    expect(r.script).toBe('Latn');
  });

  it('detects German from stopwords', () => {
    const r = detectLanguage('Ich habe ein neues Buch gekauft und es ist gut.');
    expect(r.language).toBe('de');
  });

  it('detects Japanese via Hiragana/Katakana', () => {
    const r = detectLanguage('これはテストです。');
    expect(r.language).toBe('ja');
    expect(r.script).toBe('Hira');
  });

  it('detects Chinese when no kana present', () => {
    const r = detectLanguage('这是一个测试。');
    expect(r.language).toBe('zh');
    expect(r.script).toBe('Hani');
  });

  it('detects Korean via Hangul', () => {
    const r = detectLanguage('이것은 시험이다.');
    expect(r.language).toBe('ko');
    expect(r.script).toBe('Hang');
  });

  it('detects Arabic', () => {
    const r = detectLanguage('هذا اختبار بسيط للنص العربي.');
    expect(r.language).toBe('ar');
    expect(r.script).toBe('Arab');
  });

  it('returns "und" on empty / pure-punctuation input', () => {
    expect(detectLanguage('').language).toBe('und');
    expect(detectLanguage('   !!! ???   ').language).toBe('und');
  });

  it('returns a confidence number ∈ [0, 1]', () => {
    const r = detectLanguage('The cat sat on the mat.');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it('correctly handles mixed-script cyrillic+latin (cyrillic-dominant)', () => {
    const r = detectLanguage('Acme Corp — Мария работает CTO.');
    expect(r.language).toBe('ru');
  });
});

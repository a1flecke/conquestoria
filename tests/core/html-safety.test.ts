import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SAFE_COLOR,
  escapeHtmlAttr,
  isSafeHexColor,
  sanitizeHexColor,
} from '@/core/html-safety';

describe('html-safety', () => {
  it('accepts valid 3, 4, 6, and 8-digit hex colors', () => {
    expect(isSafeHexColor('#abc')).toBe(true);
    expect(isSafeHexColor('#abcd')).toBe(true);
    expect(isSafeHexColor('#A1b2C3')).toBe(true);
    expect(isSafeHexColor('#112233ff')).toBe(true);
  });

  it('rejects XSS payloads, CSS expressions, and non-hex strings', () => {
    const payloads = [
      '"><img src=x onerror=alert(1)>',
      'red; background:url(javascript:alert(1))',
      '#12345',
      '#1234567',
      '#gggggg',
      'rgb(255,0,0)',
      ' #123456',
      '#123456 ',
      '',
      null,
      undefined,
      123,
    ];
    for (const payload of payloads) {
      expect(isSafeHexColor(payload)).toBe(false);
      expect(sanitizeHexColor(payload)).toBe(DEFAULT_SAFE_COLOR);
    }
  });

  it('returns the original string when valid and custom fallback when invalid', () => {
    expect(sanitizeHexColor('#e8c170')).toBe('#e8c170');
    expect(sanitizeHexColor('"><svg onload=alert(1)>', '#ffffff')).toBe('#ffffff');
  });

  it('escapes HTML attribute metacharacters', () => {
    const escaped = escapeHtmlAttr('a"b\'c<d>e&f`g');
    expect(escaped).toBe('a&quot;b&#39;c&lt;d&gt;e&amp;f&#96;g');
    expect(escaped).not.toContain('"');
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
  });
});

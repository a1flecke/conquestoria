import type { GeneralCrestShape, GeneralMotif } from '@/systems/great-general-presentation';

/**
 * #889: original, geometric emblem artwork for the General crest, drawn for this game (no traced or
 * sourced imagery). Every glyph is a few primitive paths on a 24x24 grid:
 *   fill   - painted in the crest's secondary colour
 *   stroke - a round-capped line in the secondary colour
 *   cut    - painted in the crest's primary colour (a hole: eye sockets, etc.)
 * Pure data; `createGeneralPortrait` turns it into SVG with `createElementNS` (never `innerHTML`).
 */
export interface GlyphPart {
  readonly kind: 'fill' | 'stroke' | 'cut';
  readonly d: string;
  readonly width?: number;
}

export const GENERAL_GLYPHS: Readonly<Record<GeneralMotif, readonly GlyphPart[]>> = {
  sun: [
    { kind: 'fill', d: 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10Z' },
    { kind: 'stroke', width: 2, d: 'M12 1.5v3 M12 19.5v3 M1.5 12h3 M19.5 12h3 M4.6 4.6l2.1 2.1 M17.3 17.3l2.1 2.1 M19.4 4.6l-2.1 2.1 M6.7 17.3l-2.1 2.1' },
  ],
  wings: [
    { kind: 'fill', d: 'M11 15L1.500 13L5 10.500L1.500 8L6 7L3 3.500L11 8.500Z' },
    { kind: 'fill', d: 'M13 15l9.500-2L19 10.500l3.500-2.500L18 7l3-3.500L13 8.500Z' },
    { kind: 'fill', d: 'M12 6l2.200 4.500L12 21l-2.200-10.500Z' },
    { kind: 'fill', d: 'M12 2.500a2.200 2.200 0 1 0 0 4.400a2.200 2.200 0 1 0 0-4.400Z' },
  ],
  swords: [
    { kind: 'stroke', width: 2.200, d: 'M4.500 4.500L19.500 19.500 M19.500 4.500L4.500 19.500' },
    { kind: 'stroke', width: 2, d: 'M6 9.500l3.500-3.500 M14.500 18l3.500-3.500 M14.500 6l3.500 3.500 M6 14.500L9.500 18' },
  ],
  bow: [
    { kind: 'stroke', width: 2.400, d: 'M8 3Q22 12 8 21' },
    { kind: 'stroke', width: 1, d: 'M8 3V21' },
    { kind: 'stroke', width: 1.600, d: 'M3 12h17' },
    { kind: 'fill', d: 'M21.500 12l-4-2.800v5.600Z' },
  ],
  tower: [
    { kind: 'fill', d: 'M6 22V10.500h12V22Z' },
    { kind: 'fill', d: 'M4.500 10.500V4.500h3v2h2v-2h5v2h2v-2h3v6Z' },
    { kind: 'cut', d: 'M10.500 22v-5a1.500 1.500 0 0 1 3 0v5Z' },
  ],
  shield: [
    { kind: 'fill', d: 'M12 2.500l8 2.800v6.700c0 5-3.500 8.500-8 10-4.500-1.500-8-5-8-10V5.300Z' },
    { kind: 'cut', d: 'M12 6.500l4.500 1.500v4c0 3-2 5-4.500 6.200-2.500-1.200-4.500-3.200-4.500-6.200V8Z' },
  ],
  crown: [
    { kind: 'fill', d: 'M3.500 18.500L2.500 7.500l5.500 4.500 4-7.500 4 7.500 5.500-4.500-1 11Z' },
    { kind: 'fill', d: 'M3.500 20h17v2.500h-17Z' },
  ],
  star: [
    { kind: 'fill', d: 'M12 1.800l3.100 6.800 7.400.8-5.500 5 1.600 7.300L12 18l-6.600 3.700L7 14.400l-5.500-5 7.400-.8Z' },
  ],
  leaf: [
    { kind: 'fill', d: 'M4.500 19.500C3.500 10.500 9.500 3.500 20 3.500c0 10.500-6.500 17-15.500 16Z' },
    { kind: 'stroke', width: 1.600, d: 'M3.500 21L14 10.500' },
  ],
  wave: [
    { kind: 'stroke', width: 2.400, d: 'M2 8Q4.500 4.500 7 8t5 0 5 0 5 0 M2 15Q4.500 11.500 7 15t5 0 5 0 5 0' },
  ],
  axe: [
    { kind: 'stroke', width: 2.200, d: 'M6.500 21.500L17 4' },
    { kind: 'fill', d: 'M12.500 5.500Q20.500 2 22 10l-6 1.500Z' },
  ],
  horseshoe: [
    { kind: 'stroke', width: 3.200, d: 'M6.500 21V12a5.500 5.500 0 0 1 11 0v9' },
    { kind: 'cut', d: 'M7.500 18.500h-2 M18.500 18.500h-2 M7.500 14.500h-2 M18.500 14.500h-2' },
  ],
  snowflake: [
    { kind: 'stroke', width: 2, d: 'M12 2v20 M3.300 7l17.400 10 M3.300 17L20.700 7' },
    { kind: 'stroke', width: 1.600, d: 'M9 3.500L12 6.500l3-3 M9 20.500l3-3 3 3' },
  ],
  gear: [
    { kind: 'stroke', width: 2.800, d: 'M12 6.500a5.500 5.500 0 1 0 0 11a5.500 5.500 0 1 0 0-11Z' },
    { kind: 'fill', d: 'M10.200 1.500h3.600v3.200h-3.600Z M10.200 19.300h3.600v3.200h-3.600Z M1.500 10.200h3.200v3.600H1.500Z M19.300 10.200h3.200v3.600h-3.200Z' },
    { kind: 'fill', d: 'M12 10.200a1.800 1.800 0 1 0 0 3.600a1.800 1.800 0 1 0 0-3.600Z' },
  ],
  skull: [
    { kind: 'fill', d: 'M12 2.500C7 2.500 3.800 6 3.800 10.500c0 3 1.500 4.700 3.200 5.700V20.500h10v-4.300c1.700-1 3.200-2.700 3.200-5.700 0-4.500-3.200-8-8.200-8Z' },
    { kind: 'cut', d: 'M8.800 9.500a2.200 2.200 0 1 0 0 4.400a2.200 2.200 0 1 0 0-4.400Z M15.200 9.500a2.200 2.200 0 1 0 0 4.400a2.200 2.200 0 1 0 0-4.400Z M12 14.500l-1.200 2.500h2.400Z' },
    { kind: 'cut', d: 'M9 20.500v-2 M12 20.500v-2 M15 20.500v-2' },
  ],
  trident: [
    { kind: 'stroke', width: 2, d: 'M12 3v19 M5.500 4v5.500a6.500 6.500 0 0 0 13 0V4' },
    { kind: 'fill', d: 'M12 1l2.400 4h-4.800Z M5.500 1.500l2.200 3.500H3.300Z M18.500 1.500l2.200 3.500h-4.400Z' },
  ],
  horn: [
    { kind: 'fill', d: 'M5.500 21.500C3.500 12 7.500 4.500 18.500 2.500c-5.500 3.500-6.500 9-4 19Z' },
  ],
  fleur: [
    { kind: 'fill', d: 'M12 2.500c3.200 4 3.200 9.500 0 14.500-3.200-5-3.200-10.500 0-14.500Z' },
    { kind: 'fill', d: 'M3 9c4.500-1.200 7.500 1.300 9 7-4.500 0-7.800-2.500-9-7Z' },
    { kind: 'fill', d: 'M21 9c-4.500-1.200-7.500 1.300-9 7 4.500 0 7.800-2.500 9-7Z' },
    { kind: 'fill', d: 'M6.500 18h11v2.200h-11Z M9 21h6v1.500H9Z' },
  ],
  serpent: [
    { kind: 'stroke', width: 3, d: 'M17 5C7.500 5 6.500 11 11 13.500S13.500 19.500 5 19.500' },
    { kind: 'fill', d: 'M17.500 2.200a2.600 2.600 0 1 0 0 5.200a2.600 2.600 0 1 0 0-5.200Z' },
    { kind: 'cut', d: 'M18 3.800a.7.7 0 1 0 0 1.400a.7.7 0 1 0 0-1.400Z' },
  ],
  torii: [
    { kind: 'fill', d: 'M1.500 5.500h21l-1 3h-19Z M4.500 9.500h15v2h-15Z M6.200 11.500h2.600V22H6.200Z M15.200 11.500h2.600V22h-2.600Z' },
  ],
  hat: [
    { kind: 'fill', d: 'M1.500 15.500C3.500 8.500 8.500 6 12 6s8.500 2.500 10.500 9.500c-4.500-2.500-6.500-3.500-10.500-3.500S6 13 1.500 15.500Z' },
    { kind: 'fill', d: 'M10.200 14.500h3.600l-.8 5h-2Z' },
  ],
  medal: [
    { kind: 'fill', d: 'M7.500 1.500h4l2 8.500h-4.200Z M16.500 1.500h-4l-2 8.500h4.200Z' },
    { kind: 'fill', d: 'M12 11a5.500 5.500 0 1 0 0 11a5.500 5.500 0 1 0 0-11Z' },
    { kind: 'cut', d: 'M12 13.800l1.200 2.300 2.500.4-1.800 1.800.4 2.500-2.300-1.200-2.300 1.200.4-2.500-1.800-1.800 2.500-.4Z' },
  ],
  crescent: [
    { kind: 'fill', d: 'M15.500 2.500a9.500 9.500 0 1 0 0 19a7.500 7.500 0 1 1 0-19Z' },
    { kind: 'fill', d: 'M19 8l.9 2 2.200.3-1.600 1.500.4 2.200-1.900-1.100-1.900 1.100.4-2.200-1.600-1.500 2.200-.3Z' },
  ],
  spear: [
    { kind: 'stroke', width: 2, d: 'M5.500 21.500L16.500 7.500' },
    { kind: 'fill', d: 'M16 8.500l1.500-6.500 4.500 3.500-2 1Z' },
    { kind: 'fill', d: 'M5.500 21.500l1.200-3.200 2 2Z' },
  ],
};

/** The crest field per shape on a 48x56 board. */
export const CREST_FIELDS: Readonly<Record<GeneralCrestShape, string>> = {
  shield: 'M24 2L44 8V28C44 40 34 50 24 54C14 50 4 40 4 28V8Z',
  round: 'M24 6a22 22 0 1 0 0 44a22 22 0 1 0 0-44Z',
  diamond: 'M24 2L46 28L24 54L2 28Z',
  banner: 'M7 2H41V51L24 42L7 51Z',
};

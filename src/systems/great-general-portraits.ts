/**
 * #889: which Generals have a portrait image, and where it comes from.
 *
 * A portrait is a small (96 px) softly stylised PNG made by `scripts/portrait-pixelate/portrait_pixelate.py` from a
 * vetted source image: a public-domain artwork (where a good one exists), or an image generated from an original
 * description with DeepAI's text-to-image tool (imaginary commanders, and historical figures whose surviving images are
 * busts, mosaics or stylised reliefs that do not read well as small portraits). Every entry has a provenance record in
 * `design/general-portraits/<id>.provenance.json` (source URL, author, licence, scan results, SHA-256 of the original,
 * which is never redistributed). `tests/systems/great-general-portraits.test.ts` pins that, the file's validity and its
 * size, and that no image carries metadata or appended data.
 *
 * A General without an entry here simply keeps the heraldic crest; nothing else changes for them.
 *
 * What these are, honestly: illustrations after historical artworks, not verified likenesses (many portraits of
 * historical figures were made centuries after their lives), and generated images of imaginary people. Nothing
 * player-facing may claim otherwise.
 */
export type GeneralPortraitOrigin = 'public-domain-artwork' | 'generated-image';

export interface GeneralPortraitArt {
  /** App-relative public asset path (no leading slash); resolve with `resolveAppAssetUrl`, never hard-code `/images/...`. */
  readonly path: string;
  readonly origin: GeneralPortraitOrigin;
}

const art = (id: string, origin: GeneralPortraitOrigin): GeneralPortraitArt => ({ path: `images/generals/${id}.png`, origin });

export const GENERAL_PORTRAIT_ART: Readonly<Record<string, GeneralPortraitArt>> = {
  gen_caesar: art('gen_caesar', 'generated-image'),
  gen_alexander: art('gen_alexander', 'generated-image'),
  gen_napoleon: art('gen_napoleon', 'public-domain-artwork'),
  gen_frederick: art('gen_frederick', 'public-domain-artwork'),
  gen_suvorov: art('gen_suvorov', 'public-domain-artwork'),
  gen_genghis: art('gen_genghis', 'public-domain-artwork'),
  gen_yuefei: art('gen_yuefei', 'public-domain-artwork'),
  gen_shaka: art('gen_shaka', 'public-domain-artwork'),
  gen_hannibal: art('gen_hannibal', 'generated-image'),
  gen_wellington: art('gen_wellington', 'public-domain-artwork'),
  gen_tokugawa: art('gen_tokugawa', 'public-domain-artwork'),
  gen_boromir: art('gen_boromir', 'generated-image'),
  gen_eomer: art('gen_eomer', 'generated-image'),
  gen_merry: art('gen_merry', 'generated-image'),
  gen_ugluk: art('gen_ugluk', 'generated-image'),
  gen_gwydion: art('gen_gwydion', 'generated-image'),
  gen_hornedking: art('gen_hornedking', 'generated-image'),
  gen_okoye: art('gen_okoye', 'generated-image'),
  gen_lancelot: art('gen_lancelot', 'generated-image'),
  gen_haldir: art('gen_haldir', 'generated-image'),
  gen_thessaly: art('gen_thessaly', 'generated-image'),
  gen_universal_marshal: art('gen_universal_marshal', 'generated-image'),
  gen_universal_warlord: art('gen_universal_warlord', 'generated-image'),
  gen_universal_field_marshal: art('gen_universal_field_marshal', 'generated-image'),
  gen_universal_commodore: art('gen_universal_commodore', 'generated-image'),
  gen_nebuchadnezzar: art('gen_nebuchadnezzar', 'generated-image'),
  gen_ramesses: art('gen_ramesses', 'generated-image'),
  gen_cyrus: art('gen_cyrus', 'generated-image'),
  gen_mehmed: art('gen_mehmed', 'generated-image'),
  gen_elcid: art('gen_elcid', 'generated-image'),
  gen_ragnar: art('gen_ragnar', 'generated-image'),
  gen_cuauhtemoc: art('gen_cuauhtemoc', 'generated-image'),
  gen_chandragupta: art('gen_chandragupta', 'generated-image'),
};

export function getGeneralPortraitArt(generalId: string): GeneralPortraitArt | undefined {
  return GENERAL_PORTRAIT_ART[generalId];
}

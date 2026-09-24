// Unicode script checks shared by the PDF typesetter (which font to embed)
// and subtitle burn-in (which fonts libass needs).

export function isHangul(cp: number): boolean {
  return (
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x3130 && cp <= 0x318f)
  );
}

export function isCjk(cp: number): boolean {
  return (
    (cp >= 0x2e80 && cp <= 0x9fff) || // radicals, CJK punctuation, kana, ideographs
    (cp >= 0xf900 && cp <= 0xfaff) || // compatibility ideographs
    (cp >= 0xff00 && cp <= 0xffef) // full-width forms
  );
}

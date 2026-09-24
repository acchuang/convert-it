#!/usr/bin/env python3
"""Builds the subset fonts PDF output embeds (public/fonts/pdf/).

jsPDF's built-in Helvetica/Courier only encode WinAnsi, so any Greek,
Cyrillic, Vietnamese, Chinese, Japanese or Korean text came out as garbage.
These Noto fonts (SIL OFL 1.1) fix that. They are cut down to the characters
real documents use and lazy-fetched only when a document needs them; jsPDF
then embeds only the glyphs actually drawn.

  pip install fonttools
  python3 scripts/build-pdf-fonts.py          # fetches the sources from npm

Sources: @expo-google-fonts/noto-sans{,-mono,-sc,-kr}, which repackage
Google Fonts' static TTFs (jsPDF needs TrueType outlines, not CFF/WOFF2).
"""

import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

OUT = Path(__file__).resolve().parent.parent / 'public' / 'fonts' / 'pdf'

PACKAGES = {
    'noto-sans': '0.4.2',
    'noto-sans-mono': '0.4.2',
    'noto-sans-sc': '0.4.3',
    'noto-sans-kr': '0.4.3',
}

# Latin (incl. Vietnamese), Greek, Cyrillic, and the punctuation, currency,
# letterlike, arrow and math symbols that turn up in ordinary text.
WESTERN = [
    (0x0020, 0x024F), (0x0250, 0x02FF), (0x0300, 0x036F), (0x0370, 0x03FF),
    (0x0400, 0x052F), (0x1E00, 0x1EFF), (0x2000, 0x206F), (0x20A0, 0x20CF),
    (0x2100, 0x214F), (0x2150, 0x218F), (0x2190, 0x21FF), (0x2200, 0x22FF),
    (0x2500, 0x257F), (0x25A0, 0x25FF), (0xFB00, 0xFB06),
]

# Han characters in the national standard sets (GB 2312, Big5 level 1, JIS X 0208),
# which covers essentially all running text in zh-CN, zh-TW and ja, plus kana,
# CJK punctuation and full-width forms. Rare ideographs outside these fall
# back to a replacement box rather than shipping all 30k glyphs.
CJK_RANGES = [
    (0x3000, 0x303F), (0x3040, 0x30FF), (0x31F0, 0x31FF), (0xFF00, 0xFFEF),
    (0x2E80, 0x2EFF), (0x3200, 0x32FF), (0x3300, 0x33FF),
]
CJK_CODECS = ['gb2312', 'euc_jp']

HANGUL = [(0x1100, 0x11FF), (0x3130, 0x318F), (0xAC00, 0xD7A3), (0x3000, 0x303F), (0xFF00, 0xFFEF)]


def codepoints(ranges):
    return {cp for start, end in ranges for cp in range(start, end + 1)}


def encodable(codec, keep=lambda encoded: True):
    out = set()
    for cp in range(0x2E80, 0x10000):
        try:
            encoded = chr(cp).encode(codec)
        except UnicodeEncodeError:
            continue
        if keep(encoded):
            out.add(cp)
    return out


# Big5 level 1 (lead bytes A4–C6): the 5,401 frequent Traditional characters.
# Level 2's 7,652 rare ones would add ~3 MB for text that almost never needs them.
def big5_level1(encoded):
    return len(encoded) == 2 and 0xA4 <= encoded[0] <= 0xC6


def fetch(workdir):
    paths = {}
    for name, version in PACKAGES.items():
        spec = f'@expo-google-fonts/{name}@{version}'
        tgz = subprocess.check_output(['npm', 'pack', spec, '--silent'], cwd=workdir, text=True).strip()
        with tarfile.open(Path(workdir) / tgz) as tar:
            tar.extractall(Path(workdir) / name, filter='data')
        paths[name] = Path(workdir) / name / 'package'
    return paths


def build(source, unicodes, dest):
    font = TTFont(source)
    available = set(font.getBestCmap())
    keep = sorted(unicodes & available)
    options = subset.Options()
    options.layout_features = ['kern', 'liga', 'ccmp', 'locl', 'mark', 'mkmk']
    options.name_IDs = ['*']  # keep copyright/licence strings (OFL requires it)
    options.notdef_outline = True
    options.hinting = False  # PDF viewers don't hint; halves the size
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=keep)
    subsetter.subset(font)
    font.save(dest)
    return len(keep), dest.stat().st_size


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as work:
        src = fetch(work)
        cjk = codepoints(CJK_RANGES)
        for codec in CJK_CODECS:
            cjk |= encodable(codec)
        cjk |= encodable('big5', big5_level1)
        jobs = {
            'noto-sans-regular.ttf': (src['noto-sans'] / '400Regular/NotoSans_400Regular.ttf', codepoints(WESTERN)),
            'noto-sans-bold.ttf': (src['noto-sans'] / '700Bold/NotoSans_700Bold.ttf', codepoints(WESTERN)),
            'noto-sans-mono-regular.ttf': (src['noto-sans-mono'] / '400Regular/NotoSansMono_400Regular.ttf', codepoints(WESTERN)),
            'noto-sans-cjk-regular.ttf': (src['noto-sans-sc'] / '400Regular/NotoSansSC_400Regular.ttf', cjk),
            'noto-sans-hangul-regular.ttf': (src['noto-sans-kr'] / '400Regular/NotoSansKR_400Regular.ttf', codepoints(HANGUL)),
        }
        for name, (source, unicodes) in jobs.items():
            count, size = build(source, unicodes, OUT / name)
            print(f'{name:32} {count:6} chars {size / 1024:8.0f} KB')

        # OFL 1.1 requires the licence to travel with the fonts: one copy of
        # the text, with every source family's copyright line on top.
        copyrights = [
            (src[pkg] / 'LICENSE_FONT').read_text().splitlines()[0]
            for pkg in ('noto-sans', 'noto-sans-mono', 'noto-sans-sc', 'noto-sans-kr')
        ]
        licence = (src['noto-sans'] / 'LICENSE_FONT').read_text().split('\n', 1)[1]
        (OUT / 'OFL.txt').write_text(
            'Subsets of Noto Sans, Noto Sans Mono, Noto Sans SC and Noto Sans KR,\n'
            'built by scripts/build-pdf-fonts.py.\n\n' + '\n'.join(dict.fromkeys(copyrights)) + '\n' + licence
        )


if __name__ == '__main__':
    sys.exit(main())

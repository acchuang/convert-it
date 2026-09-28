# TIFF fixtures

Written by Pillow 12.3 (a third-party TIFF writer), so `lib/__tests__/tiff.test.ts` checks the decoder against files it didn't make. The colour images are 24×16, split into quadrants: red and green on top, blue and white below.

| File                 | What it covers                               |
| -------------------- | -------------------------------------------- |
| `rgb-lzw.tiff`       | RGB, LZW                                     |
| `rgb-jpeg.tiff`      | RGB, JPEG compression (quality 95)           |
| `cmyk-packbits.tiff` | CMYK, PackBits (`Image.convert('CMYK')`)     |
| `rgba-deflate.tiff`  | RGBA, Deflate; top half fully transparent    |
| `bilevel-g4.tiff`    | 1-bit, CCITT Group 4: left half black        |
| `grey16.tiff`        | 16-bit grey (`I;16`), a ramp from 0 to 65535 |
| `two-pages.tiff`     | two pages, LZW: the quadrants, then 8×8 flat |

Each was saved with `Image.save(path, compression=...)`; the multi-page one with `save_all=True, append_images=[...]`.

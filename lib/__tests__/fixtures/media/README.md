# Media fixtures for the FFmpeg-only inputs

One second of `testsrc` (160×120, 25 fps) with a sine tone, or the tone alone, in
each container the app reads only through FFmpeg. They were made with the same
`@ffmpeg/core` 0.12.10 the app loads, so a pass here means the shipped core can
read the file:

| File          | Made with                                                                         |
| ------------- | --------------------------------------------------------------------------------- |
| `sample.mpg`  | `-c:v mpeg1video -c:a mp2 -f mpeg`                                                |
| `sample.vob`  | `-c:v mpeg2video -c:a ac3 -f vob`                                                 |
| `sample.m2ts` | as `.ts`, plus `-mpegts_m2ts_mode 1` (192-byte packets)                           |
| `sample.wmv`  | `-c:v wmv2 -c:a wmav2 -f asf`                                                     |
| `sample.f4v`  | `-c:v libx264 -preset ultrafast -c:a aac -f mp4`                                  |
| `sample.aiff` | `-c:a pcm_s16be -f aiff`                                                          |
| `sample.ac3`  | `-c:a ac3 -f ac3`                                                                 |
| `sample.wv`   | `-c:a wavpack -f wv`                                                              |
| `sample.caf`  | `-c:a pcm_s16le -f caf`                                                           |
| `sample.dts`  | `-ac 2 -c:a dca -strict -2 -f dts`                                                |
| `sample.amr`  | PyAV 18 (`libopencore_amrnb`, 8 kHz mono, 12.2 kb/s): the core has no AMR encoder |

There is no `sample.ts`: tooling would take it for TypeScript. `.m2ts` goes through
the same MPEG-TS demuxer (with 192-byte packets).

The core can't make an OGV (its libtheora encoder crashes), so OGV isn't offered.
`npm run fixtures` copies these into `.smoke-fixtures/` for the browser smoke suite.

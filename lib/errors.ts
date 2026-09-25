// What went wrong, as something the UI can explain and a user can act on.
//
// Converters throw whatever their engine throws: "memory access out of
// bounds", "Invalid XML (line 3): …", "FFmpeg could not convert this file
// (exit 1): …". The card used to print that verbatim. Every failure is now
// classified into a small set of codes, each with a localized, actionable
// message (locales: errors.<code>.title / .hint). The engine's own text is kept
// as `detail` for bug reports.

export type ErrorCode =
  | 'too-large' // over the per-category size limit, rejected before converting
  | 'out-of-memory' // the tab or a worker ran out of memory, or a wasm engine crashed
  | 'corrupt-input' // the file is damaged, or isn't really the format its name says
  | 'unsupported' // no converter for this pair, or a feature of the file we can't handle
  | 'engine-load' // couldn't download or verify an engine (FFmpeg core, fonts, codecs)
  | 'invalid-settings' // a setting doesn't fit this file (e.g. page 9 of a 5-page PDF)
  | 'unknown';

export interface ConversionFailure {
  code: ErrorCode;
  /** The underlying message, for the "details" disclosure and bug reports. */
  detail: string;
  /** Values interpolated into the localized message, e.g. { size, limit }. */
  params?: Record<string, string | number>;
}

/** An error thrown with a known code: classification trusts it as-is. */
export class ConversionError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly params?: Record<string, string | number>,
  ) {
    super(message);
    this.name = 'ConversionError';
  }
}

// Ordered: the first match wins. Patterns are the real messages our engines
// and our own converters produce (each one has a test).
const RULES: [ErrorCode, RegExp][] = [
  [
    'out-of-memory',
    /memory access out of bounds|out of memory|allocation failed|Array buffer allocation|Invalid (typed )?array length|Maximum call stack|worker crashed|too large to convert/i,
  ],
  [
    'engine-load',
    // "Load failed" is Safari's whole fetch-failure message; anchored so that
    // "Image load failed" (a decode error) doesn't match.
    /Failed to load FFmpeg|Failed to fetch|NetworkError|(^|: )Load failed$|integrity check|HTTP \d{3}|NEXT_PUBLIC_FFMPEG_BASE_URL/i,
  ],
  ['unsupported', /Unsupported (conversion|file type)|No encoder for/i],
  [
    'corrupt-input',
    /Invalid XML|Not a valid \.xlsx|decode failed|Image load failed|could not be decoded|Unexpected (token|end of JSON)|is not valid JSON|JSON\.parse|No records found|has no pages|no worksheets|Invalid data found when processing input|moov atom not found|end of file|Failed to load document|YAMLParseError|Nested mappings/i,
  ],
];

export function classifyError(err: unknown): ConversionFailure {
  if (err instanceof ConversionError) {
    return { code: err.code, detail: err.message, params: err.params };
  }
  const detail =
    err instanceof Error
      ? `${err.name && err.name !== 'Error' ? `${err.name}: ` : ''}${err.message}`
      : String(err);
  // Parser errors carry their meaning in the type as much as the message.
  if (err instanceof SyntaxError) return { code: 'corrupt-input', detail };
  if (err instanceof RangeError && /length|allocation|call stack/i.test(err.message)) {
    return { code: 'out-of-memory', detail };
  }
  for (const [code, pattern] of RULES) {
    if (pattern.test(detail)) return { code, detail };
  }
  return { code: 'unknown', detail: detail || 'Conversion failed' };
}

/** Across postMessage an Error loses its class; this is what crosses instead. */
export function toTransferable(failure: ConversionFailure): ConversionFailure {
  return { code: failure.code, detail: failure.detail, params: failure.params };
}

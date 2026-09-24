// Times typed into the trim fields: "90", "1:30", "1:30.5" or "0:01:30".
// Seconds in, seconds out; the UI never deals in frames.

/** Parses h:mm:ss(.fff), m:ss(.fff) or plain seconds. Blank is 0; junk is null. */
export function parseTimecode(text: string): number | null {
  const value = text.trim();
  if (!value) return 0;
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(value)) return null;
  const parts = value.split(':').map(Number);
  if (parts.slice(1).some((p) => p >= 60)) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** Seconds as m:ss or h:mm:ss, with tenths when there are any; 0 is blank. */
export function formatTimecode(seconds: number): string {
  if (!(seconds > 0)) return '';
  const tenths = Math.round(seconds * 10);
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10 ? `.${tenths % 10}` : '';
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}${frac}` : `${m}:${s}${frac}`;
}

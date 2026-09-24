import type { FormatInfo } from './types';

// Every format the app knows, with its label, MIME type and category. The one
// place MIME types live: engines ask mimeFor() instead of keeping tables.
// No imports beyond types, so any engine can use it without an import cycle.

export const FORMATS: FormatInfo[] = [
  // Images
  { ext: 'jpg', label: 'JPEG', mimeType: 'image/jpeg', category: 'image' },
  { ext: 'png', label: 'PNG', mimeType: 'image/png', category: 'image' },
  { ext: 'webp', label: 'WebP', mimeType: 'image/webp', category: 'image' },
  { ext: 'gif', label: 'GIF', mimeType: 'image/gif', category: 'image' },
  { ext: 'bmp', label: 'BMP', mimeType: 'image/bmp', category: 'image' },
  { ext: 'ico', label: 'ICO', mimeType: 'image/x-icon', category: 'image' },
  { ext: 'svg', label: 'SVG', mimeType: 'image/svg+xml', category: 'image' },
  { ext: 'heic', label: 'HEIC', mimeType: 'image/heic', category: 'image' },
  { ext: 'avif', label: 'AVIF', mimeType: 'image/avif', category: 'image' },
  // Video
  { ext: 'mp4', label: 'MP4', mimeType: 'video/mp4', category: 'video' },
  { ext: 'webm', label: 'WebM', mimeType: 'video/webm', category: 'video' },
  { ext: 'avi', label: 'AVI', mimeType: 'video/x-msvideo', category: 'video' },
  { ext: 'mov', label: 'MOV', mimeType: 'video/quicktime', category: 'video' },
  { ext: 'mkv', label: 'MKV', mimeType: 'video/x-matroska', category: 'video' },
  { ext: 'flv', label: 'FLV', mimeType: 'video/x-flv', category: 'video' },
  { ext: 'm4v', label: 'M4V', mimeType: 'video/mp4', category: 'video' },
  { ext: '3gp', label: '3GP', mimeType: 'video/3gpp', category: 'video' },
  // Audio
  { ext: 'mp3', label: 'MP3', mimeType: 'audio/mpeg', category: 'audio' },
  { ext: 'wav', label: 'WAV', mimeType: 'audio/wav', category: 'audio' },
  { ext: 'aac', label: 'AAC', mimeType: 'audio/aac', category: 'audio' },
  { ext: 'ogg', label: 'OGG', mimeType: 'audio/ogg', category: 'audio' },
  { ext: 'flac', label: 'FLAC', mimeType: 'audio/flac', category: 'audio' },
  { ext: 'm4a', label: 'M4A', mimeType: 'audio/mp4', category: 'audio' },
  { ext: 'wma', label: 'WMA', mimeType: 'audio/x-ms-wma', category: 'audio' },
  { ext: 'opus', label: 'OPUS', mimeType: 'audio/opus', category: 'audio' },
  // Documents
  { ext: 'txt', label: 'TXT', mimeType: 'text/plain', category: 'document' },
  { ext: 'md', label: 'Markdown', mimeType: 'text/markdown', category: 'document' },
  { ext: 'html', label: 'HTML', mimeType: 'text/html', category: 'document' },
  { ext: 'pdf', label: 'PDF', mimeType: 'application/pdf', category: 'document' },
  { ext: 'epub', label: 'ePub', mimeType: 'application/epub+zip', category: 'document' },
  // Data
  { ext: 'csv', label: 'CSV', mimeType: 'text/csv', category: 'data' },
  { ext: 'json', label: 'JSON', mimeType: 'application/json', category: 'data' },
  { ext: 'xml', label: 'XML', mimeType: 'application/xml', category: 'data' },
  { ext: 'yaml', label: 'YAML', mimeType: 'application/yaml', category: 'data' },
  { ext: 'tsv', label: 'TSV', mimeType: 'text/tab-separated-values', category: 'data' },
  {
    ext: 'xlsx',
    label: 'Excel',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    category: 'data',
  },
];

export function getFormatInfo(ext: string): FormatInfo | undefined {
  return FORMATS.find((f) => f.ext === ext.toLowerCase());
}

/** MIME type for an extension, `application/octet-stream` if unknown. `jpeg` is an alias of `jpg`. */
export function mimeFor(ext: string): string {
  const key = ext.toLowerCase() === 'jpeg' ? 'jpg' : ext;
  return getFormatInfo(key)?.mimeType ?? 'application/octet-stream';
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

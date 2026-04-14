import { marked } from 'marked';
import TurndownService from 'turndown';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function mdToHtml(file: File): Promise<Blob> {
  return file.text().then(async text => {
    const htmlBody = await marked.parse(text);
    const html = `<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="utf-8">\n</head>\n<body>\n${htmlBody}\n</body>\n</html>`;
    return new Blob([html], { type: 'text/html' });
  });
}

export function htmlToMd(file: File): Promise<Blob> {
  return file.text().then(text => {
    const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    const md = turndown.turndown(text);
    return new Blob([md], { type: 'text/markdown' });
  });
}

export function htmlToTxt(file: File): Promise<Blob> {
  return file.text().then(text => {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const plain = doc.body?.textContent ?? text.replace(/<[^>]+>/g, '');
    const trimmed = plain.replace(/\n{3,}/g, '\n\n').trim();
    return new Blob([trimmed], { type: 'text/plain' });
  });
}

export function txtToHtml(file: File): Promise<Blob> {
  return file.text().then(text => {
    const paragraphs = text
      .split('\n')
      .map(line => `<p>${escapeHtml(line)}</p>`)
      .join('\n');
    const html = `<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="utf-8">\n</head>\n<body>\n${paragraphs}\n</body>\n</html>`;
    return new Blob([html], { type: 'text/html' });
  });
}

export function txtToMd(file: File): Promise<Blob> {
  return file.text().then(text => {
    return new Blob([text], { type: 'text/markdown' });
  });
}

export function jsonToTxt(file: File): Promise<Blob> {
  return file.text().then(text => {
    const data = JSON.parse(text);
    return new Blob([JSON.stringify(data, null, 2)], { type: 'text/plain' });
  });
}
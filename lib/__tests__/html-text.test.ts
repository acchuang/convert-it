import { describe, it, expect } from 'vitest';
import { htmlToPlainText } from '@/lib/html-text';

describe('htmlToPlainText', () => {
  it('keeps paragraph and line breaks that textContent drops', () => {
    expect(htmlToPlainText('<p>line1</p><p>line2</p>')).toBe('line1\n\nline2');
    expect(htmlToPlainText('a<br>b<br/>c')).toBe('a\nb\nc');
  });

  it('drops script, style and head contents', () => {
    const html =
      '<html><head><title>T</title><style>p{color:red}</style></head>' +
      '<body><script>alert(1)</script><p>visible</p><noscript>ns</noscript></body></html>';
    expect(htmlToPlainText(html)).toBe('visible');
  });

  it('collapses source whitespace outside <pre> and preserves it inside', () => {
    expect(htmlToPlainText('<p>  a\n   b  </p>')).toBe('a b');
    expect(htmlToPlainText('<pre>  x\n    y</pre>')).toBe('x\n    y');
  });

  it('renders lists with bullets and table cells with tabs', () => {
    expect(htmlToPlainText('<ul><li>one</li><li>two</li></ul>')).toBe('• one\n• two');
    expect(
      htmlToPlainText('<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>'),
    ).toBe('a\tb\n1\t2');
  });

  it('does not attach parsed markup to the live document', () => {
    const before = document.body.innerHTML;
    htmlToPlainText('<img src="x" onerror="window.__pwned = true"><p>ok</p>');
    expect(document.body.innerHTML).toBe(before);
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });
});

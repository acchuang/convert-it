// @vitest-environment node
// Every word a visitor reads comes from locales/, so the five languages stay
// complete: this walks the components' JSX and fails on English left in
// text, or in the attributes people read (title, placeholder, alt,
// aria-label). Brand marks, units and format names are allowed below.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

// app/convert/[pair] is left out: those are static English landing pages
// (their copy is SEO text from lib/pairs.ts); the converter they embed is
// localized like the home page.
const DIRS = ['app/components', 'app/components/settings', 'app/about', 'app'];
const READ_ATTRS = new Set(['title', 'placeholder', 'alt', 'aria-label']);
// Not words to translate: brand, units, codec and paper names, symbols.
const ALLOWED =
  /^(Convert|Convert-it|-it|root|-IT|IT|CRF( \{.*\})?|KB|MB|px|A4|Letter|GitHub|×|→|↑|↓|—|·|%|[\d\s.,:%×→·()+-]*)$/;

function rendered(node: ts.Node): boolean {
  for (let up = node.parent; up; up = up.parent) {
    if (
      ts.isCallExpression(up) ||
      ts.isTaggedTemplateExpression(up) ||
      ts.isElementAccessExpression(up)
    )
      return false;
    if (
      ts.isBinaryExpression(up) &&
      up.operatorToken.kind !== ts.SyntaxKind.BarBarToken &&
      up.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken &&
      up.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken
    )
      return false;
    if (ts.isJsxAttribute(up)) return READ_ATTRS.has(up.name.getText());
    if (ts.isJsxExpression(up)) {
      return (
        !up.parent || !ts.isJsxAttribute(up.parent) || READ_ATTRS.has(up.parent.name.getText())
      );
    }
    if (
      !ts.isConditionalExpression(up) &&
      !ts.isParenthesizedExpression(up) &&
      !ts.isBinaryExpression(up)
    )
      return false;
  }
  return false;
}

function literals(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const text = node.getText().replace(/\s+/g, ' ').trim();
      if (/[A-Za-z]{2}/.test(text) && !ALLOWED.test(text)) found.push(text);
    }
    // Strings a JSX expression renders: {x || 'Processing…'}, {ok ? 'Yes' : 'No'},
    // and the same inside a read attribute. Not inside a call (t('key'),
    // classnames, replace()) and not in other attributes (className, style).
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && rendered(node)) {
      const text = node.text.trim();
      if (/[A-Za-z]{2}/.test(text) && /\s|^[A-Z]/.test(text) && !ALLOWED.test(text))
        found.push(`{'${text}'}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('no hard-coded UI text', () => {
  const files = DIRS.flatMap((dir) =>
    readdirSync(join(process.cwd(), dir))
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => join(process.cwd(), dir, f)),
  );

  it.each(files.map((f) => [f.slice(process.cwd().length + 1), f]))('%s', (_name, file) => {
    expect(literals(file)).toEqual([]);
  });
});

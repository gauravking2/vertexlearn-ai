import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.css'), 'utf8');

/**
 * Regression guard for the app-wide dark-contrast remap in index.css.
 * Real cascade rendering is verified in Playwright (e2e/phase-contrast);
 * this locks the mechanism: every rule present, correctly guarded so
 * explicit `dark:` variants keep winning, and syntactically valid
 * (`:not()` must precede `::placeholder`).
 */
describe('dark contrast remap (index.css)', () => {
  const rules: [string, string][] = [
    ['text-[#1F2421] → near-white', '.text-\\[\\#1F2421\\]'],
    ['text-[#5C635D] → light gray', '.text-\\[\\#5C635D\\]'],
    ['text-[#C4612F] → light accent', '.text-\\[\\#C4612F\\]'],
    ['error red-600', '.text-red-600'],
    ['error red-700', '.text-red-700'],
    ['success green', '.text-green-700'],
    ['warning yellow', '.text-yellow-700'],
    ['surface white', '.bg-\\[\\#FFFFFF\\]'],
    ['surface cream', '.bg-\\[\\#FBF9F5\\]'],
    ['page bg', '.bg-\\[\\#F7F4EF\\]'],
    ['borders', '.border-\\[\\#E7E1D7\\]'],
    ['hover surface', '.hover\\:bg-\\[\\#FBF9F5\\]:hover'],
    ['hover chip', '.hover\\:bg-\\[\\#F2E3D6\\]:hover'],
    ['hover ink text', '.hover\\:text-\\[\\#1F2421\\]:hover'],
    ['hover accent text', '.hover\\:text-\\[\\#C4612F\\]:hover'],
    ['placeholder', '.placeholder\\:text-\\[\\#5C635D\\]'],
  ];

  test.each(rules)('%s rule exists under html.dark', (_label, selector) => {
    expect(css).toContain(`html.dark ${selector}`);
  });

  test('every remap is guarded so explicit dark: variants win', () => {
    const blocks = css.split('html.dark').slice(1);
    expect(blocks.length).toBeGreaterThan(10);
    for (const b of blocks) {
      const selector = b.split('{')[0];
      // body/focus/skip-link rules need no guard; everything with a
      // Tailwind palette class must carry a :not([class*=dark:...]) guard.
      if (/\\\[#|text-(red|green|yellow)-/.test(selector)) {
        expect(selector).toMatch(/:not\(\[class\*="dark:/);
      }
    }
  });

  test('no :not() after ::placeholder (invalid CSS would drop the rule)', () => {
    expect(css).not.toMatch(/::placeholder:not\(/);
    expect(css).toMatch(/:not\(\[class\*="dark:placeholder"\]\)::placeholder/);
  });

  test('remap declarations use the AA palette', () => {
    for (const color of ['#ece9e2', '#b9beb4', '#e8a06f', '#1a1d17', '#23261f', '#2c2f2a', '#8a9184', '#f87171', '#86efac', '#fde047']) {
      expect(css).toContain(color);
    }
  });

  test('braces are balanced (basic validity)', () => {
    const open = (css.match(/{/g) || []).length;
    const close = (css.match(/}/g) || []).length;
    expect(close).toBe(open);
    expect(open).toBeGreaterThan(10);
  });
});

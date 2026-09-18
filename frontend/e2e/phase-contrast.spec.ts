import { test, expect, Page } from '@playwright/test';

// Contrast regression: measures REAL computed text/background contrast in
// both themes. Fails loudly if dark text ever renders on dark surfaces again.
const CONTRAST_AA = 4.5;
const CONTRAST_MUTED = 3.0;

async function mockApp(page: Page) {
  // NOTE: catch-all FIRST — Playwright gives precedence to later
  // registrations, so specific mocks below override this fallback.
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  );
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'mock-access',
        refreshToken: 'mock-refresh',
        user: { id: 'u1', email: 'stud@example.com', name: 'Stu', roles: ['student'] },
      }),
    })
  );
  await page.route('**/api/v1/courses?page*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'c1',
            title: 'Contrast 101',
            description: 'A course with a readable description for contrast checks.',
            category: 'Programming',
            difficulty: 'Beginner',
            avg_rating: 4.5,
            rating_count: 10,
            enrollmentCount: 42,
            instructor: { name: 'Prof Contrast' },
          },
        ],
        total: 1,
        pageSize: 12,
      }),
    })
  );
}

async function loginAsStudent(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('your@email.com').fill('stud@example.com');
  await page.getByPlaceholder('••••••••').fill('Password123!');
  await page.getByRole('button', { name: /log in|sign in/i }).click();
  await expect(page.getByRole('button', { name: /toggle sidebar/i })).toBeVisible();
}

async function setTheme(page: Page, mode: 'light' | 'dark') {
  await page.addInitScript((m) => {
    localStorage.setItem(
      'theme-storage',
      JSON.stringify({ state: { mode: m, resolved: m }, version: 0 })
    );
  }, mode);
}

interface Sample {
  selector: string;
  ratio: number;
  fg: string;
  bg: string;
  inH1: boolean;
}

async function sampleContrast(page: Page, selectors: string[], pseudo?: string): Promise<Sample[]> {
  return page.evaluate(
    ({ sels, pseudoEl }) => {
      const parse = (s: string): [number, number, number, number] => {
        const m = s.match(/rgba?\(([^)]+)\)/);
        if (!m) return [0, 0, 0, 1];
        const parts = m[1].split(',').map((x) => parseFloat(x.trim()));
        return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts[3] === undefined ? 1 : parts[3]];
      };
      const lum = ([r, g, b]: [number, number, number, number]): number => {
        const f = (v: number): number => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratio = (a: string, b: string): number => {
        const [r1, g1, b1] = parse(a);
        const [r2, g2, b2] = parse(b);
        const x = lum([r1, g1, b1, 1]);
        const y = lum([r2, g2, b2, 1]);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      const effectiveBg = (el: Element | null): string => {
        let cur: Element | null = el;
        while (cur && cur !== document.documentElement) {
          const bg = getComputedStyle(cur).backgroundColor;
          const [, , , a] = parse(bg);
          if (a > 0 && bg !== 'rgba(0, 0, 0, 0)') return bg;
          cur = cur.parentElement;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      const out: Sample[] = [];
      for (const sel of sels) {
        const els = Array.from(document.querySelectorAll(sel)).slice(0, 6);
        for (const el of els) {
          const fg = getComputedStyle(el, pseudoEl as never).color;
          const bg = effectiveBg(el);
          out.push({ selector: sel, ratio: ratio(fg, bg), fg, bg, inH1: el.closest('h1') !== null });
        }
      }
      return out;
    },
    { sels: selectors, pseudoEl: pseudo ?? null }
  );
}

test.describe('theme contrast (measured, AA)', () => {
  for (const mode of ['light', 'dark'] as const) {
    test(`${mode}: dashboard text is readable`, async ({ page }) => {
      await setTheme(page, mode);
      await mockApp(page);
      await loginAsStudent(page);
      await expect(page.getByRole('heading', { name: 'Your Learning Journey', exact: true })).toBeVisible();
      const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(dark).toBe(mode === 'dark');
      const samples = await sampleContrast(page, [
        '#main-content h1',
        '#main-content h2',
        '#main-content h3',
        '#main-content .text-2xl',
        '#main-content p',
        '#main-content button',
      ]);
      expect(samples.length).toBeGreaterThan(5);
      for (const s of samples) {
        expect(
          s.ratio,
          `${mode} ${s.selector} fg=${s.fg} bg=${s.bg} ratio=${s.ratio.toFixed(2)}`
        ).toBeGreaterThanOrEqual(CONTRAST_AA);
      }
    });

    test(`${mode}: catalog text, inputs and cards are readable`, async ({ page }) => {
      await setTheme(page, mode);
      await mockApp(page);
      await loginAsStudent(page);
      await page.goto('/courses');
      await expect(page.getByRole('heading', { name: /catalog/i })).toBeVisible();
      await expect(page.getByText('Contrast 101')).toBeVisible();
      const samples = await sampleContrast(page, [
        '#main-content h1',
        '#main-content h3',
        '#main-content p',
        '#main-content input',
        '#main-content button',
        '#main-content div span',
      ]);
      expect(samples.length).toBeGreaterThan(5);
      for (const s of samples) {
        // h1 display accents follow the large-text bar (asserted below).
        if (s.selector.includes('span') && s.inH1) continue;
        expect(
          s.ratio,
          `${mode} ${s.selector} fg=${s.fg} bg=${s.bg} ratio=${s.ratio.toFixed(2)}`
        ).toBeGreaterThanOrEqual(CONTRAST_AA);
      }
      // Large display accents (text-3xl serif) follow the WCAG large-text bar.
      const display = await sampleContrast(page, ['#main-content h1 span']);
      for (const s of display) {
        expect(
          s.ratio,
          `${mode} display ${s.selector} fg=${s.fg} bg=${s.bg} ratio=${s.ratio.toFixed(2)}`
        ).toBeGreaterThanOrEqual(3.0);
      }
      const placeholders = await sampleContrast(page, ['#main-content input'], '::placeholder');
      expect(placeholders.length).toBeGreaterThanOrEqual(1);
      for (const s of placeholders) {
        expect(
          s.ratio,
          `${mode} placeholder fg=${s.fg} bg=${s.bg} ratio=${s.ratio.toFixed(2)}`
        ).toBeGreaterThanOrEqual(CONTRAST_MUTED);
      }
    });
  }

  test('dark mobile: catalog stays readable at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setTheme(page, 'dark');
    await mockApp(page);
    await loginAsStudent(page);
    await page.goto('/courses');
    await expect(page.getByText('Contrast 101')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const samples = await sampleContrast(page, ['#main-content h1', '#main-content h3', '#main-content p', '#main-content button']);
    for (const s of samples) {
      expect(
        s.ratio,
        `dark-mobile ${s.selector} fg=${s.fg} bg=${s.bg} ratio=${s.ratio.toFixed(2)}`
      ).toBeGreaterThanOrEqual(CONTRAST_AA);
    }
  });
});

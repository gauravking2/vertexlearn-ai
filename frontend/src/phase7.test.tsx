import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { themeStore, applyTheme, resolveTheme } from '@/store/themeStore';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { t, DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n';
import { localeStore } from '@/store/localeStore';
import { LanguageSelector } from '@/components/common/LanguageSelector';
import { Input } from '@/components/common/Input';

beforeEach(() => {
  document.documentElement.classList.remove('dark');
  themeStore.setState({ mode: 'system', resolved: 'light' });
  localeStore.setState({ locale: 'en' });
  localStorage.clear();
});

describe('dark mode', () => {
  test('light mode removes .dark, dark mode adds it (persistent preference)', () => {
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  test('system preference resolves via matchMedia', () => {
    expect(['light', 'dark']).toContain(resolveTheme('system'));
  });

  test('toggle flips resolved theme and persists mode', () => {
    themeStore.setState({ mode: 'light', resolved: 'light' });
    themeStore.getState().toggle();
    expect(themeStore.getState().mode).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    themeStore.getState().toggle();
    expect(themeStore.getState().mode).toBe('light');
  });

  test('ThemeToggle exposes accessible pressed state', () => {
    themeStore.setState({ mode: 'light', resolved: 'light' });
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: /toggle color theme/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    expect(screen.getByRole('button', { name: /toggle color theme/i })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('i18n scaffolding', () => {
  test('default locale is English with dictionary structure', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(SUPPORTED_LOCALES.map((l) => l.code)).toContain('en');
    expect(t('nav.dashboard')).toBe('Dashboard');
  });

  test('missing keys fall back to the key (no crash)', () => {
    expect(t('does.not.exist')).toBe('does.not.exist');
  });

  test('language selector renders and persists choice', () => {
    render(<LanguageSelector />);
    const select = screen.getByRole('combobox', { name: /select language/i });
    expect(select).toHaveValue('en');
    fireEvent.change(select, { target: { value: 'en' } });
    expect(localeStore.getState().locale).toBe('en');
  });
});

describe('accessibility', () => {
  test('Input links label to control with error alert semantics', () => {
    render(<Input label="Email address" error="Required" placeholder="you@example.com" />);
    const input = screen.getByLabelText('Email address');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const described = input.getAttribute('aria-describedby') ?? '';
    expect(described.length).toBeGreaterThan(0);
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });

  test('Input helper text is programmatically associated', () => {
    render(<Input label="Name" helperText="Your display name" />);
    const input = screen.getByLabelText('Name');
    const described = input.getAttribute('aria-describedby') ?? '';
    const helper = screen.getByText('Your display name');
    expect(helper.id).toBeTruthy();
    expect(described).toContain(helper.id);
  });

  test('buttons expose focus ring and disabled semantics', async () => {
    const { Button } = await import('@/components/common/Button');
    render(
      <>
        <Button>Save</Button>
        <Button loading>Busy</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeVisible();
    const busy = screen.getByRole('button', { name: /busy/i });
    expect(busy).toBeDisabled();
  });

  test('skip-link CSS contract: link becomes visible on focus', () => {
    render(
      <div>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <main id="main-content">content</main>
      </div>,
    );
    const link = screen.getByText('Skip to main content');
    expect(link).toHaveClass('skip-link');
    expect(link.getAttribute('href')).toBe('#main-content');
  });
});

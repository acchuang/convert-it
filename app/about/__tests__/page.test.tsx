import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import AboutPage from '@/app/about/page';
import { ThemeProvider } from '@/app/components/ThemeProvider';
import { LocaleProvider } from '@/app/components/LocaleProvider';

describe('AboutPage', () => {
  // about.intro already opens with the product name, so prefixing it rendered
  // "Convert-it Convert-it is a free...".
  it('names the product once in the hero', () => {
    const { container } = render(
      <ThemeProvider>
        <LocaleProvider>
          <AboutPage />
        </LocaleProvider>
      </ThemeProvider>,
    );
    const hero = container.querySelector('strong')!.parentElement!;
    expect(hero.querySelector('strong')!.textContent).toBe('Convert-it');
    expect(hero.textContent!.match(/Convert-it/g)).toHaveLength(1);
  });
});

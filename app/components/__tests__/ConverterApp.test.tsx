import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConverterApp from '@/app/components/ConverterApp';
import { ThemeProvider } from '@/app/components/ThemeProvider';
import { LocaleProvider } from '@/app/components/LocaleProvider';

function renderApp() {
  return render(
    <ThemeProvider>
      <LocaleProvider>
        <ConverterApp />
      </LocaleProvider>
    </ThemeProvider>,
  );
}

describe('ConverterApp', () => {
  // The file input used to live inside the drop zone, which unmounts once a
  // file is queued, so "Add files" clicked a null ref and did nothing.
  it('keeps the file picker working after files are queued', async () => {
    const { container } = renderApp();
    const input = () => container.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(input()!, {
      target: { files: [new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' })] },
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'DRAG & DROP' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('region', { name: 'DRAG & DROP' })).toBeNull());

    expect(input()).not.toBeNull();
    const click = vi.spyOn(input()!, 'click');
    fireEvent.click(screen.getAllByRole('button', { name: 'ADD FILES' })[0]);
    expect(click).toHaveBeenCalledOnce();
  });

  it('Clear can be undone from the toast or with Ctrl+Z', async () => {
    const { container } = renderApp();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, {
      target: { files: [new File(['a'], 'a.csv'), new File(['b'], 'b.csv')] },
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'CLEAR' }));
    await waitFor(() => expect(screen.queryAllByRole('listitem')).toHaveLength(0));
    expect(screen.getByText('Removed 2 files')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));

    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
  });
});

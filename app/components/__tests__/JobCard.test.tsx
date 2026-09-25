import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { JobCard, describeError } from '@/app/components/JobCard';
import type { FileJob } from '@/app/components/JobCard';
import { DEFAULT_SETTINGS } from '@/lib/types';

const t = (key: string) => key;

const idleJob: FileJob = {
  id: '1',
  file: new File(['hello'], 'test.csv', { type: 'text/csv' }),
  sourceExt: 'csv',
  targetExt: 'json',
  status: 'idle',
  progress: 0,
  settings: {
    quality: 0.92,
    jsonIndent: 2,
    csvDelimiter: ',',
    xmlRootElement: 'root',
    audioBitrate: 192,
    videoQuality: 23,
    videoPreset: 'medium',
  },
};

const convertingJob: FileJob = {
  ...idleJob,
  id: '2',
  status: 'converting',
  progress: 45,
};

const doneJob: FileJob = {
  ...idleJob,
  id: '3',
  status: 'done',
  resultBlob: new Blob(['{"a":1}']),
};

describe('JobCard', () => {
  it('renders filename and extension', () => {
    render(
      <JobCard
        job={idleJob}
        onTargetChange={vi.fn()}
        onConvert={vi.fn()}
        onDownload={vi.fn()}
        onRemove={vi.fn()}
        onSettingsChange={vi.fn()}
        t={t}
      />,
    );
    expect(screen.getByText('test.csv')).toBeDefined();
    expect(screen.getByText('.CSV')).toBeDefined();
  });

  it('shows Convert button when idle with target', () => {
    render(
      <JobCard
        job={idleJob}
        onTargetChange={vi.fn()}
        onConvert={vi.fn()}
        onDownload={vi.fn()}
        onRemove={vi.fn()}
        onSettingsChange={vi.fn()}
        t={t}
      />,
    );
    expect(screen.getByText('job.convert')).toBeDefined();
  });

  it('shows progress during conversion', () => {
    render(
      <JobCard
        job={convertingJob}
        onTargetChange={vi.fn()}
        onConvert={vi.fn()}
        onDownload={vi.fn()}
        onRemove={vi.fn()}
        onSettingsChange={vi.fn()}
        t={t}
      />,
    );
    expect(screen.getByText('45%')).toBeDefined();
  });

  it('shows Download button when done', () => {
    render(
      <JobCard
        job={doneJob}
        onTargetChange={vi.fn()}
        onConvert={vi.fn()}
        onDownload={vi.fn()}
        onRemove={vi.fn()}
        onSettingsChange={vi.fn()}
        t={t}
      />,
    );
    expect(screen.getByText('job.download')).toBeDefined();
  });
});

describe('JobCard errors', () => {
  const en: Record<string, string> = {
    'errors.corruptInput.title': 'Couldn’t read this file',
    'errors.corruptInput.hint': 'Not really a .{ext} file?',
    'errors.tooLarge.title': 'File too large ({size} MB; the limit is {limit} MB)',
    'errors.tooLarge.hint': 'Split it.',
    'errors.details': 'Technical details',
  };
  const tr = (key: string) => en[key] ?? key;
  const render_ = (error: FileJob['error']) =>
    render(
      <JobCard
        job={{ ...idleJob, status: 'error', error }}
        onTargetChange={vi.fn()}
        onConvert={vi.fn()}
        onDownload={vi.fn()}
        onRemove={vi.fn()}
        onSettingsChange={vi.fn()}
        t={tr}
      />,
    );

  it('shows the localized title and hint, with the engine detail behind a disclosure', () => {
    render_({ code: 'corrupt-input', detail: 'Invalid XML (line 3): Unclosed tag' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t read this file');
    expect(alert).toHaveTextContent('Not really a .csv file?');
    expect(alert).toHaveTextContent('Technical details');
    expect(alert.querySelector('details code')).toHaveTextContent(
      'Invalid XML (line 3): Unclosed tag',
    );
  });

  it('fills parameters into the message', () => {
    render_({ code: 'too-large', detail: 'x', params: { size: 612, limit: 500 } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'File too large (612 MB; the limit is 500 MB)',
    );
  });

  it('offers to copy its settings to similar files, and says how many it changed', () => {
    const onApply = vi.fn();
    render(
      <JobCard
        job={{ ...idleJob, settings: DEFAULT_SETTINGS }}
        onTargetChange={vi.fn()}
        onConvert={vi.fn()}
        onDownload={vi.fn()}
        onRemove={vi.fn()}
        onSettingsChange={vi.fn()}
        similarCount={3}
        onApplyToSimilar={onApply}
        t={t}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'job.settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'job.applyToSimilar' }));
    expect(onApply).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('job.appliedToSimilar');
  });

  it('explains an unreadable file by kind', () => {
    const tr = (key: string) =>
      ({
        'errors.unsupportedFile.title': 'Can’t convert .{label} files',
        'errors.unsupportedFile.image': 'Export it as {formats}.',
      })[key] ?? key;
    expect(
      describeError(
        {
          code: 'unsupported',
          detail: '',
          params: { kind: 'image', label: 'TIFF', formats: 'PNG' },
        },
        'tiff',
        tr,
      ),
    ).toEqual({ title: 'Can’t convert .TIFF files', hint: 'Export it as PNG.' });
  });

  it('an unreadable file offers no retry; a renamed one says what it was read as', () => {
    const props = {
      onTargetChange: vi.fn(),
      onConvert: vi.fn(),
      onDownload: vi.fn(),
      onRemove: vi.fn(),
      onSettingsChange: vi.fn(),
      t: (key: string) => (key === 'job.readAsAlias' ? '.{from} is .{to}; read as .{to}.' : key),
    };
    const { unmount } = render(
      <JobCard
        job={{
          ...idleJob,
          targetExt: null,
          status: 'error',
          error: { code: 'unsupported', detail: '', params: { kind: 'unknown', label: '' } },
        }}
        {...props}
      />,
    );
    expect(screen.queryByRole('button', { name: 'job.retry' })).toBeNull();
    unmount();
    render(
      <JobCard
        job={{ ...idleJob, sourceExt: 'yaml', identified: { from: 'yml', reason: 'alias' } }}
        {...props}
      />,
    );
    expect(screen.getByTestId('identified')).toHaveTextContent('.YML is .YAML; read as .YAML.');
  });
});

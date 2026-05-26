import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobCard } from '@/app/components/JobCard';
import type { FileJob } from '@/app/components/JobCard';

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
      />
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
      />
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
      />
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
      />
    );
    expect(screen.getByText('job.download')).toBeDefined();
  });
});

'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  convertFile,
  getFileExtension,
  getTargetFormats,
  FORMATS,
} from '@/lib/converters';
import { JobCard, type FileJob } from './components/JobCard';

const CATEGORY_COLORS: Record<string, string> = {
  image: '#FF4D00',
  document: '#00C2FF',
  data: '#C8FF00',
};

export default function HomePage() {
  const [jobs, setJobs] = useState<FileJob[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newJobs: FileJob[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(),
      file,
      sourceExt: getFileExtension(file.name),
      targetExt: getTargetFormats(getFileExtension(file.name))[0] ?? null,
      status: 'idle',
      progress: 0,
    }));
    setJobs(prev => [...prev, ...newJobs]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const updateJob = (id: string, patch: Partial<FileJob>) =>
    setJobs(prev => prev.map(j => (j.id === id ? { ...j, ...patch } : j)));

  const convertJob = async (job: FileJob) => {
    if (!job.targetExt) return;
    updateJob(job.id, { status: 'converting', progress: 10 });
    try {
      await new Promise(r => setTimeout(r, 300));
      updateJob(job.id, { progress: 50 });
      const blob = await convertFile(job.file, job.targetExt);
      updateJob(job.id, { status: 'done', resultBlob: blob, progress: 100 });
    } catch (err) {
      updateJob(job.id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Conversion failed',
        progress: 0,
      });
    }
  };

  const downloadJob = (job: FileJob) => {
    if (!job.resultBlob || !job.targetExt) return;
    const url = URL.createObjectURL(job.resultBlob);
    const a = document.createElement('a');
    const base = job.file.name.replace(/\.[^.]+$/, '');
    a.href = url;
    a.download = `${base}.${job.targetExt}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const removeJob = (id: string) =>
    setJobs(prev => prev.filter(j => j.id !== id));

  const convertAll = () => {
    jobs.filter(j => j.status === 'idle' && j.targetExt).forEach(convertJob);
  };

  const clearAll = () => setJobs([]);

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-[#F5F0E8]" style={{ fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <header className="border-b border-[#1A1A1A] px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-[#0A0A0A]/95 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-8 h-8 bg-[#C8FF00] rounded-sm flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h8v2l4-3-4-3v2H1v4h1V4z" fill="#0A0A0A" />
              <path d="M14 12H6v-2l-4 3 4 3v-2h9V10h-1v2z" fill="#0A0A0A" />
            </svg>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em' }} className="text-2xl text-[#F5F0E8]">
            CONVERT
          </span>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="hidden md:flex items-center gap-6 text-xs text-[#666] tracking-widest uppercase"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <span>Free</span>
          <span className="w-1 h-1 rounded-full bg-[#333]" />
          <span>No Signup</span>
          <span className="w-1 h-1 rounded-full bg-[#333]" />
          <span>Client-Side</span>
        </motion.div>
      </header>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-12">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <h1
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.04em', lineHeight: 0.9 }}
            className="text-[clamp(3.5rem,12vw,8rem)] text-[#F5F0E8] mb-4"
          >
            ANY FILE.<br />
            <span className="text-[#C8FF00]">ANY FORMAT.</span>
          </h1>
          <p className="text-[#888] text-lg max-w-md mx-auto">
            Upload, pick your target format, and convert instantly — all in your browser.
          </p>
        </motion.section>

        {/* Drop Zone */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-12 md:p-16 text-center cursor-pointer transition-all duration-300 mb-8 overflow-hidden ${
            dragging
              ? 'border-[#C8FF00] bg-[#C8FF00]/5'
              : 'border-[#2A2A2A] hover:border-[#444] bg-[#111]'
          }`}
        >
          {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, i) => (
            <div key={i} className={`absolute ${pos} w-6 h-6 ${dragging ? 'border-[#C8FF00]' : 'border-[#333]'} transition-colors duration-300`}
              style={{
                borderTop: i < 2 ? `2px solid` : 'none',
                borderBottom: i >= 2 ? `2px solid` : 'none',
                borderLeft: i % 2 === 0 ? `2px solid` : 'none',
                borderRight: i % 2 === 1 ? `2px solid` : 'none',
                borderColor: dragging ? '#C8FF00' : '#333',
              }}
            />
          ))}

          <AnimatePresence>
            {dragging ? (
              <motion.div
                key="dragging"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
              >
                <div className="text-6xl mb-4">⚡</div>
                <p style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em' }} className="text-2xl text-[#C8FF00]">
                  DROP IT
                </p>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="w-16 h-16 border-2 border-[#333] rounded-xl flex items-center justify-center mx-auto mb-5 bg-[#1A1A1A]">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  </svg>
                </div>
                <p className="text-[#F5F0E8] font-medium mb-1 text-lg">
                  Drop files here or{' '}
                  <span className="text-[#C8FF00] underline underline-offset-2">browse</span>
                </p>
                <p className="text-[#555] text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
                  Images · Documents · Data files
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => e.target.files && addFiles(e.target.files)}
          />
        </motion.div>

        {/* Format pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex flex-wrap gap-2 justify-center mb-12"
        >
          {['image', 'data', 'document'].map(cat => {
            const catFormats = FORMATS.filter(f => f.category === cat);
            const color = CATEGORY_COLORS[cat];
            return catFormats.map(f => (
              <span
                key={f.ext}
                className="text-xs px-2 py-1 rounded border"
                style={{
                  fontFamily: 'var(--font-mono)',
                  borderColor: color + '40',
                  color: color,
                  background: color + '0D',
                  letterSpacing: '0.05em',
                }}
              >
                .{f.ext.toUpperCase()}
              </span>
            ));
          })}
        </motion.div>

        {/* Jobs list */}
        <AnimatePresence>
          {jobs.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4">
                <h2
                  style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
                  className="text-xl text-[#F5F0E8]"
                >
                  {jobs.length} FILE{jobs.length !== 1 ? 'S' : ''} QUEUED
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={clearAll}
                    className="px-4 py-2 text-xs border border-[#2A2A2A] rounded-lg text-[#666] hover:border-[#444] hover:text-[#999] transition-all"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    CLEAR ALL
                  </button>
                  <button
                    onClick={convertAll}
                    className="px-5 py-2 text-xs bg-[#C8FF00] text-[#0A0A0A] rounded-lg font-semibold hover:bg-[#D8FF33] transition-all"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    CONVERT ALL →
                  </button>
                </div>
              </div>

              {/* Job cards */}
              <div className="space-y-3">
                <AnimatePresence>
                  {jobs.map(job => (
                    <JobCard
                      key={job.id}
                      job={job}
                      onTargetChange={ext => updateJob(job.id, { targetExt: ext, status: 'idle', resultBlob: undefined })}
                      onConvert={() => convertJob(job)}
                      onDownload={() => downloadJob(job)}
                      onRemove={() => removeJob(job.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* How it works */}
        {jobs.length === 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            {[
              { num: '01', title: 'DROP', desc: 'Drag and drop your files or click to browse from your device.' },
              { num: '02', title: 'SELECT', desc: 'Choose the target format from the available conversions.' },
              { num: '03', title: 'CONVERT', desc: 'Instant conversion in your browser. No uploads, no data leaves your device.' },
            ].map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="bg-[#111] border border-[#1A1A1A] rounded-2xl p-6 hover:border-[#2A2A2A] transition-colors"
              >
                <div
                  style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
                  className="text-5xl text-[#C8FF00] mb-3"
                >
                  {step.num}
                </div>
                <div
                  style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
                  className="text-xl text-[#F5F0E8] mb-2"
                >
                  {step.title}
                </div>
                <p className="text-[#555] text-sm leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </motion.section>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1A1A1A] px-6 py-6 mt-16">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span style={{ fontFamily: 'var(--font-mono)' }} className="text-xs text-[#444]">
            © 2025 CONVERT — All conversions happen in your browser
          </span>
          <div className="flex gap-6 text-xs text-[#444]" style={{ fontFamily: 'var(--font-mono)' }}>
            <span>Images</span>
            <span>Documents</span>
            <span>Data</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
'use client';

import { useState, useEffect, useRef } from 'react';

interface Stats {
  total: number;
  active: number;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export { formatCount };

export function useStats(): Stats | null {
  const [stats, setStats] = useState<Stats | null>(null);
  const isNewRef = useRef(true);

  useEffect(() => {
    let sessionId = sessionStorage.getItem('convert-it-session');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem('convert-it-session', sessionId);
    }
    const sid = sessionId;

    const track = async () => {
      try {
        const res = await fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sid, isNew: isNewRef.current }),
        });
        if (res.ok) {
          setStats(await res.json());
          isNewRef.current = false;
        }
      } catch {
        // network unavailable or running locally without functions — silent fail
      }
    };

    track();
    const interval = setInterval(track, 30_000);
    return () => clearInterval(interval);
  }, []);

  return stats;
}

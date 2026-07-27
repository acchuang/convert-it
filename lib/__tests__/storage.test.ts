import { readStored, writeStored, removeStored } from '@/lib/storage';

function blockStorage() {
  const boom = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);
}

describe('storage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('round-trips through localStorage when it works', () => {
    writeStored('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
    expect(readStored('k')).toBe('v');

    removeStored('k');
    expect(readStored('k')).toBeNull();
  });

  it('returns null for a key that was never set', () => {
    expect(readStored('absent')).toBeNull();
  });

  // A browser with site data blocked throws on every access. The switchers must keep
  // working for the tab instead of the whole render dying on getItem.
  it('survives blocked storage and holds the value in memory', () => {
    blockStorage();

    expect(() => writeStored('theme', 'light')).not.toThrow();
    expect(readStored('theme')).toBe('light');
    expect(() => removeStored('theme')).not.toThrow();
    expect(readStored('theme')).toBeNull();
  });

  // Memory is a fallback, not a shadow — otherwise a value written while storage was
  // blocked would outrank a real one, and another tab's write would never be seen.
  it('prefers localStorage over a memory fallback once storage recovers', () => {
    blockStorage();
    writeStored('locale', 'es');

    vi.restoreAllMocks();
    localStorage.setItem('locale', 'ja');
    expect(readStored('locale')).toBe('ja');
  });
});

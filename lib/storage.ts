// localStorage throws — not returns null — when a browser blocks site data, and
// setItem throws on quota. Theme and locale read through this during render, so an
// unguarded call takes the whole page down with it; history writes run inside the
// conversion's try block, where a throw would report a successful conversion as failed.
//
// When storage is unavailable the value is held in memory instead, so a switcher still
// works for the tab rather than looking dead. Memory is only a fallback, never a shadow:
// a readable localStorage always wins, so writes from another tab are not masked.
const memory = new Map<string, string>();

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}

export function removeStored(key: string): void {
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // nothing to remove: the write it would undo never landed
  }
}

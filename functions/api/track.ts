interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

interface Env {
  STATS: KVNamespace;
}

interface PagesContext {
  request: Request;
  env: Env;
}

const SESSION_TTL_MS = 60_000; // 60s — a session is "active" if heartbeat within this window

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestOptions = async (): Promise<Response> => {
  return new Response(null, { status: 204, headers: CORS });
};

export const onRequestPost = async ({ request, env }: PagesContext): Promise<Response> => {
  let body: { sessionId?: unknown; isNew?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const { sessionId, isNew } = body;

  if (typeof sessionId !== 'string' || sessionId.length > 64 || !/^[a-z0-9-]+$/.test(sessionId)) {
    return new Response('Bad request', { status: 400 });
  }

  const now = Date.now();

  // Increment total visits counter for new sessions
  if (isNew === true) {
    const current = await env.STATS.get('total_visits');
    const next = (parseInt(current ?? '0') || 0) + 1;
    await env.STATS.put('total_visits', String(next));
  }

  // Read-modify-write active sessions map, pruning stale entries
  const raw = await env.STATS.get('sessions');
  const sessions: Record<string, number> = raw ? JSON.parse(raw) : {};

  const cutoff = now - SESSION_TTL_MS;
  for (const id of Object.keys(sessions)) {
    if (sessions[id] < cutoff) delete sessions[id];
  }
  sessions[sessionId] = now;

  await env.STATS.put('sessions', JSON.stringify(sessions));

  const totalRaw = await env.STATS.get('total_visits');
  const total = parseInt(totalRaw ?? '0') || 0;
  const active = Object.keys(sessions).length;

  return new Response(JSON.stringify({ total, active }), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
};

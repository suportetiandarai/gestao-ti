export {};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'apikey, authorization, if-none-match',
  'Access-Control-Expose-Headers': 'ETag, X-Snapshot-Version, X-Total-Count',
  'Access-Control-Max-Age': '86400',
};

function env(name: string) {
  return Deno.env.get(name)?.trim() || '';
}

function json(body: unknown, status: number, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function matchesEtag(candidate: string | null, etag: string) {
  return Boolean(candidate?.split(',').some((value) => value.trim().replace(/^W\//, '') === etag));
}

function synchronizationStatus(lastSuccessAt: string | null) {
  const lastSuccess = lastSuccessAt ? new Date(lastSuccessAt).getTime() : Number.NaN;
  if (!Number.isFinite(lastSuccess)) return 'offline';
  const age = Date.now() - lastSuccess;
  if (age <= 180_000) return 'online';
  return age <= 900_000 ? 'delayed' : 'offline';
}

async function database(path: string) {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Configuração interna incompleta.');
  return fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Método não permitido.' }, 405);
  const url = new URL(request.url);
  const source = url.searchParams.get('dashboard');
  if (!['timed', 'training', 'ad'].includes(source || '')) return json({ error: 'Dashboard inválido.' }, 400);
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('page_size') || '50', 10) || 50));
  const offset = (page - 1) * pageSize;

  try {
    const snapshotResponse = await database(
      `google_sheet_dashboard_snapshots?source=eq.${source}&select=source,total_count,completed_count,pending_count,not_started_count,snapshot_hash,snapshot_version,integration_status,cutoff_at,last_synced_at`,
    );
    if (!snapshotResponse.ok) throw new Error(`Snapshot HTTP ${snapshotResponse.status}`);
    const snapshot = (await snapshotResponse.json())?.[0];
    if (!snapshot) {
      return json({ ok: false, state: 'not_ready', message: 'Dados ainda não sincronizados.' }, 503, {
        'Cache-Control': 'public, max-age=5',
        'Retry-After': '30',
      });
    }
    const syncStateResponse = await database(
      `google_sheet_sync_state?source=eq.${source}&select=last_success_at`,
    );
    if (!syncStateResponse.ok) throw new Error(`Sincronização HTTP ${syncStateResponse.status}`);
    const syncState = (await syncStateResponse.json())?.[0];
    const status = synchronizationStatus(syncState?.last_success_at || snapshot.last_synced_at);
    const etag = `"${snapshot.snapshot_hash}-${status}-${page}-${pageSize}"`;
    const responseHeaders = {
      'Cache-Control': 'public, max-age=15, stale-while-revalidate=45',
      ETag: etag,
      Vary: 'If-None-Match',
      'X-Snapshot-Version': String(snapshot.snapshot_version),
      'X-Total-Count': String(snapshot.total_count),
    };
    if (matchesEtag(request.headers.get('If-None-Match'), etag)) {
      return new Response(null, { status: 304, headers: { ...corsHeaders, ...responseHeaders } });
    }
    if (request.method === 'HEAD') {
      return new Response(null, { status: 200, headers: { ...corsHeaders, ...responseHeaders } });
    }

    const fields = source === 'training'
      ? 'source_row,requested_at,requester_name,sector,job_title,training_topic,dashboard_status'
      : source === 'timed'
        ? 'source_row,requested_at,requester_name,sector,job_title,dashboard_status'
        : 'source_row,requested_at,requester_name,dashboard_status';
    const rowsResponse = await database(
      `google_sheet_requests?source=eq.${source}&select=${fields}&order=sort_priority.asc,requested_at.desc&offset=${offset}&limit=${pageSize}`,
    );
    if (!rowsResponse.ok) throw new Error(`Listagem HTTP ${rowsResponse.status}`);
    const rows = await rowsResponse.json();
    return json({
      ok: true,
      dashboard: source,
      summary: {
        total: snapshot.total_count,
        completed: snapshot.completed_count,
        pending: snapshot.pending_count,
        notStarted: snapshot.not_started_count,
      },
      rows,
      page: { current: page, pageSize, total: snapshot.total_count },
      status,
      cutoffAt: snapshot.cutoff_at,
      lastSyncedAt: snapshot.last_synced_at,
    }, 200, responseHeaders);
  } catch (error) {
    console.error('Dashboard Google Sheets:', error instanceof Error ? error.message.slice(0, 300) : 'erro');
    return json({ error: 'Dados temporariamente indisponíveis.' }, 503, { 'Cache-Control': 'no-store' });
  }
});

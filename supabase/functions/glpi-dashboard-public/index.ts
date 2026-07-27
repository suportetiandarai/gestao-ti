import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'apikey, authorization, if-none-match, x-client-info',
  'Access-Control-Expose-Headers': 'ETag, X-Snapshot-Version, X-Snapshot-Synced-At, X-Snapshot-Status, X-Snapshot-Checked-At',
  'Access-Control-Max-Age': '86400',
};

const cacheHeaders = {
  ...corsHeaders,
  'Cache-Control': 'public, max-age=15, stale-while-revalidate=45',
  Vary: 'If-None-Match',
};

function env(name: string) {
  return Deno.env.get(name)?.trim() || '';
}

function json(body: unknown, status: number, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function etag(value: unknown) {
  const hash = String(value || '').replace(/[^a-f0-9]/gi, '');
  return hash ? `"${hash}"` : '';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (!['GET', 'HEAD'].includes(request.method)) {
    return json({ error: 'Método não permitido.' }, 405, corsHeaders);
  }
  if (env('PUBLIC_DASHBOARD_ENABLED') !== 'true') {
    return json({ error: 'Dashboard público indisponível.' }, 404, {
      ...corsHeaders,
      'Cache-Control': 'no-store',
    });
  }

  const supabaseUrl = env('SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY');
  const groupId = Number(env('GLPI_TECH_GROUP_ID'));
  if (!supabaseUrl || !anonKey || !Number.isFinite(groupId) || groupId <= 0) {
    return json({ error: 'Configuração pública incompleta.' }, 503, {
      ...corsHeaders,
      'Cache-Control': 'no-store',
    });
  }

  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: snapshot, error } = await publicClient
    .from('gestao_ti_dashboard_snapshot')
    .select([
      'scope',
      'group_id',
      'shift_start',
      'shift_end',
      'shift_type',
      'open_count',
      'in_progress_count',
      'waiting_count',
      'pending_count',
      'overdue_count',
      'technicians_chart_json',
      'latest_tickets_json',
      'snapshot_hash',
      'snapshot_version',
      'integration_status',
      'last_synced_at',
      'updated_at',
    ].join(','))
    .eq('scope', 'daily_public')
    .eq('group_id', groupId)
    .maybeSingle();

  if (error) {
    console.error('Falha ao ler snapshot público:', String(error.message || 'erro desconhecido').slice(0, 300));
    return json({ error: 'Snapshot público indisponível.' }, 503, {
      ...corsHeaders,
      'Cache-Control': 'no-store',
    });
  }
  if (!snapshot) {
    return json({
      ok: false,
      state: 'not_ready',
      message: 'Dados ainda não sincronizados.',
    }, 503, {
      ...corsHeaders,
      'Cache-Control': 'public, max-age=5',
      'Retry-After': '30',
    });
  }

  const checkedAt = new Date().toISOString();
  const responseEtag = etag(snapshot.snapshot_hash);
  const headers = {
    ...cacheHeaders,
    ETag: responseEtag,
    'X-Snapshot-Version': String(snapshot.snapshot_version),
    'X-Snapshot-Synced-At': String(snapshot.last_synced_at),
    'X-Snapshot-Status': String(snapshot.integration_status),
    'X-Snapshot-Checked-At': checkedAt,
  };
  if (responseEtag && request.headers.get('If-None-Match') === responseEtag) {
    return new Response(null, { status: 304, headers });
  }
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });

  return json({
    ok: true,
    snapshot: {
      scope: snapshot.scope,
      groupId: snapshot.group_id,
      shiftStart: snapshot.shift_start,
      shiftEnd: snapshot.shift_end,
      shiftType: snapshot.shift_type,
      counts: {
        open: snapshot.open_count,
        inProgress: snapshot.in_progress_count,
        waiting: snapshot.waiting_count,
        pending: snapshot.pending_count,
        overdue: snapshot.overdue_count,
      },
      techniciansChart: snapshot.technicians_chart_json,
      latestTickets: snapshot.latest_tickets_json,
      version: snapshot.snapshot_version,
      lastSyncedAt: snapshot.last_synced_at,
      integrationStatus: snapshot.integration_status,
    },
    checkedAt,
  }, 200, headers);
});

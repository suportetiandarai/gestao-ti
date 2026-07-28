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

function matchesEtag(ifNoneMatch: string | null, currentEtag: string) {
  if (!ifNoneMatch || !currentEtag) return false;
  return ifNoneMatch.split(',').some((candidate) => {
    const normalized = candidate.trim().replace(/^W\//i, '');
    return normalized === '*' || normalized === currentEtag;
  });
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
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Configuração pública incompleta.' }, 503, {
      ...corsHeaders,
      'Cache-Control': 'no-store',
    });
  }

  const publicClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: snapshot, error } = await publicClient
    .from('dashboard_shift_snapshots')
    .select([
      'group_id',
      'shift_start',
      'shift_end',
      'shift_type',
      'open_count',
      'in_progress_count',
      'waiting_assignment_count',
      'pending_count',
      'overdue_count',
      'technician_chart',
      'snapshot_hash',
      'snapshot_version',
      'integration_status',
      'last_synced_at',
      'updated_at',
    ].join(','))
    .order('shift_start', { ascending: false })
    .limit(1)
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

  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get('page_size') || '50', 10) || 50));
  const { data: shiftTickets, error: ticketsError } = await publicClient.rpc('get_shift_tickets', {
    p_shift_start: snapshot.shift_start,
    p_shift_end: snapshot.shift_end,
    p_page: page,
    p_page_size: pageSize,
  });
  if (ticketsError) {
    console.error('Falha ao ler chamados do plantão:', String(ticketsError.message || 'erro desconhecido').slice(0, 300));
    return json({ error: 'Listagem do plantão indisponível.' }, 503, {
      ...corsHeaders,
      'Cache-Control': 'no-store',
    });
  }

  const checkedAt = new Date().toISOString();
  const responseEtag = etag(`${snapshot.snapshot_hash}${page.toString(16)}${pageSize.toString(16)}`);
  const headers = {
    ...cacheHeaders,
    ETag: responseEtag,
    'X-Snapshot-Version': String(snapshot.snapshot_version),
    'X-Snapshot-Synced-At': String(snapshot.last_synced_at),
    'X-Snapshot-Status': String(snapshot.integration_status),
    'X-Snapshot-Checked-At': checkedAt,
  };
  if (matchesEtag(request.headers.get('If-None-Match'), responseEtag)) {
    return new Response(null, { status: 304, headers });
  }
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });

  return json({
    ok: true,
    snapshot: {
      groupId: snapshot.group_id,
      shiftStart: snapshot.shift_start,
      shiftEnd: snapshot.shift_end,
      shiftType: snapshot.shift_type,
      counts: {
        open: snapshot.open_count,
        inProgress: snapshot.in_progress_count,
        waiting: snapshot.waiting_assignment_count,
        pending: snapshot.pending_count,
        overdue: snapshot.overdue_count,
      },
      techniciansChart: snapshot.technician_chart,
      shiftTickets: shiftTickets || [],
      ticketsPage: {
        page,
        pageSize,
        total: Number(shiftTickets?.[0]?.total_count || 0),
      },
      version: snapshot.snapshot_version,
      lastSyncedAt: snapshot.last_synced_at,
      integrationStatus: snapshot.integration_status,
    },
    checkedAt,
  }, 200, headers);
});

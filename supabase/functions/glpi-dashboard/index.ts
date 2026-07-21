import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function env(name: string) {
  return Deno.env.get(name)?.trim() || '';
}

function normalizeDate(value: unknown) {
  if (!value || value === 'NULL') return null;
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function label(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') {
    const record = value as JsonRecord;
    return String(record.completename || record.name || record.realname || record.firstname || record.id || '').trim() || null;
  }
  return String(value);
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function statusName(status: unknown) {
  const map: Record<number, string> = {
    1: 'Novo',
    2: 'Atribuído',
    3: 'Planejado',
    4: 'Pendente',
    5: 'Solucionado',
    6: 'Fechado',
  };
  return map[Number(status)] || label(status) || 'Não disponível';
}

function priorityName(value: unknown) {
  const map: Record<number, string> = {
    1: 'Muito baixa',
    2: 'Baixa',
    3: 'Média',
    4: 'Alta',
    5: 'Muito alta',
    6: 'Maior',
  };
  return map[Number(value)] || label(value);
}

function slaStatus(ticket: JsonRecord) {
  const due = normalizeDate(ticket.time_to_resolve || ticket.sla_due_at);
  if (!due) return 'unavailable';
  if (normalizeDate(ticket.solvedate) || normalizeDate(ticket.closedate)) return 'ok';
  const minutes = (new Date(due).getTime() - Date.now()) / 60000;
  if (minutes < 0) return 'breached';
  if (minutes <= Number(env('GLPI_SLA_WARNING_MINUTES') || 240)) return 'warning';
  return 'ok';
}

async function logSync(client: ReturnType<typeof createClient>, level: string, message: string, records = 0, detail = '', cursor: string | null = null) {
  await client.from('glpi_sync_logs').insert({
    level,
    message,
    records_processed: records,
    technical_detail: detail.slice(0, 4000),
    last_cursor: cursor,
  });
}

class GlpiClient {
  private baseUrl: string;
  private appToken: string;
  private sessionToken = '';

  constructor() {
    const apiUrl = env('GLPI_API_URL');
    const base = env('GLPI_BASE_URL');
    if (apiUrl) this.baseUrl = apiUrl.replace(/\/+$/, '');
    else {
      if (!base) throw new Error('GLPI_BASE_URL não configurado.');
      this.baseUrl = `${base.replace(/\/+$/, '')}/apirest.php`;
    }
    this.appToken = env('GLPI_APP_TOKEN');
  }

  private headers(extra: HeadersInit = {}) {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(extra as Record<string, string>),
    };
    if (this.appToken) headers['App-Token'] = this.appToken;
    if (this.sessionToken) headers['Session-Token'] = this.sessionToken;
    return headers;
  }

  private async request(path: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(env('GLPI_REQUEST_TIMEOUT') || env('GLPI_TIMEOUT_MS') || 15000));
    try {
      const response = await fetch(`${this.baseUrl}/${path.replace(/^\/+/, '')}`, {
        ...init,
        headers: this.headers(init.headers || {}),
        signal: controller.signal,
      });
      const text = await response.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch (_) {
        body = text;
      }
      if (!response.ok) throw new Error(`GLPI ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  async initSession() {
    const userToken = env('GLPI_USER_TOKEN');
    const login = env('GLPI_LOGIN');
    const password = env('GLPI_PASSWORD');
    const headers: Record<string, string> = {};
    if (userToken) headers.Authorization = `user_token ${userToken}`;
    else if (login && password) headers.Authorization = `Basic ${btoa(`${login}:${password}`)}`;
    else throw new Error('Configure GLPI_USER_TOKEN ou GLPI_LOGIN/GLPI_PASSWORD.');

    const response = await this.request('initSession', { method: 'GET', headers }) as JsonRecord;
    this.sessionToken = String(response.session_token || '');
    if (!this.sessionToken) throw new Error('GLPI não retornou session_token.');
  }

  async killSession() {
    if (!this.sessionToken) return;
    try {
      await this.request('killSession', { method: 'GET' });
    } catch (error) {
      console.warn('Falha ao encerrar sessão GLPI:', error);
    }
  }

  async getTickets() {
    const pageSize = Number(env('GLPI_SYNC_PAGE_SIZE') || 100);
    const maxPages = Number(env('GLPI_SYNC_MAX_PAGES') || 10);
    const modifiedAfter = env('GLPI_SYNC_MODIFIED_AFTER');
    const tickets: JsonRecord[] = [];

    for (let page = 0; page < maxPages; page += 1) {
      const start = page * pageSize;
      const end = start + pageSize - 1;
      const params = new URLSearchParams({
        range: `${start}-${end}`,
        sort: 'date_mod',
        order: 'DESC',
        expand_dropdowns: 'true',
      });
      const result = await this.request(`Ticket?${params.toString()}`, { method: 'GET' }) as unknown;
      const pageRows = Array.isArray(result) ? result as JsonRecord[] : [];
      if (!pageRows.length) break;
      for (const ticket of pageRows) {
        if (modifiedAfter) {
          const modified = normalizeDate(ticket.date_mod);
          if (modified && modified < new Date(modifiedAfter).toISOString()) continue;
        }
        tickets.push(ticket);
      }
      if (pageRows.length < pageSize) break;
    }

    return tickets;
  }

  async countItems(itemType: string) {
    const params = new URLSearchParams({
      range: '0-0',
      expand_dropdowns: 'false',
    });
    const result = await this.request(`${itemType}?${params.toString()}`, { method: 'GET' }) as unknown;
    return Array.isArray(result) ? result.length : 0;
  }
}

function mapTicket(ticket: JsonRecord) {
  const id = numberOrNull(ticket.id);
  const base = env('GLPI_BASE_URL').replace(/\/+$/, '');
  return {
    glpi_id: id,
    title: label(ticket.name),
    status_id: numberOrNull(ticket.status),
    status: statusName(ticket.status),
    technician_id: numberOrNull(ticket.users_id_assign || ticket.technician_id),
    technician_name: label(ticket.users_id_assign || ticket.technician_name || ticket._users_id_assign),
    group_id: numberOrNull(ticket.groups_id_assign || ticket.group_id),
    group_name: label(ticket.groups_id_assign || ticket.group_name || ticket._groups_id_assign),
    requester_id: numberOrNull(ticket.users_id_recipient),
    requester_name: label(ticket.users_id_recipient || ticket.requester_name),
    category_id: numberOrNull(ticket.itilcategories_id),
    category_name: label(ticket.itilcategories_id),
    priority: numberOrNull(ticket.priority),
    priority_name: priorityName(ticket.priority),
    urgency: numberOrNull(ticket.urgency),
    urgency_name: priorityName(ticket.urgency),
    impact: numberOrNull(ticket.impact),
    impact_name: priorityName(ticket.impact),
    entity_id: numberOrNull(ticket.entities_id),
    entity_name: label(ticket.entities_id),
    unit_name: label(ticket.locations_id),
    location_id: numberOrNull(ticket.locations_id),
    location_name: label(ticket.locations_id),
    type_id: numberOrNull(ticket.type),
    type_name: Number(ticket.type) === 2 ? 'Requisição' : 'Incidente',
    opened_at: normalizeDate(ticket.date),
    assigned_at: normalizeDate(ticket.date_assign),
    first_response_at: normalizeDate(ticket.takeintoaccount_delay_stat),
    solved_at: normalizeDate(ticket.solvedate),
    closed_at: normalizeDate(ticket.closedate),
    modified_at: normalizeDate(ticket.date_mod),
    sla_due_at: normalizeDate(ticket.time_to_resolve),
    sla_status: slaStatus(ticket),
    pending_reason: label(ticket.pending_reason),
    glpi_url: id ? `${base}/front/ticket.form.php?id=${id}` : null,
    raw_payload: ticket,
    source_environment: 'real',
    synced_at: new Date().toISOString(),
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const auth = request.headers.get('Authorization') || '';
  if (!supabaseUrl || !serviceKey || !auth) return json({ error: 'Não autorizado.' }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const token = auth.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return json({ error: 'Sessão inválida.' }, 401);
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    const role = String(profile?.role || '').toLowerCase();
    if (!['admin', 'gestor'].includes(role)) return json({ error: 'Acesso restrito a administradores e gestores.' }, 403);

    const body = await request.json().catch(() => ({}));
    if (!['sync-incremental', 'test-connection'].includes(body.action)) return json({ error: 'Ação inválida.' }, 400);

    const glpi = new GlpiClient();
    await glpi.initSession();
    if (body.action === 'test-connection') {
      const ticketsCount = await glpi.countItems('Ticket');
      const usersCount = await glpi.countItems('User');
      await glpi.killSession();
      await logSync(admin, 'info', 'Conexão com GLPI validada.', ticketsCount);
      return json({ ok: true, tickets: ticketsCount, technicians: usersCount });
    }

    const tickets = await glpi.getTickets();
    const mapped = tickets.map(mapTicket).filter((ticket) => ticket.glpi_id);
    if (mapped.length) {
      const { error } = await admin.from('glpi_tickets_dashboard').upsert(mapped, { onConflict: 'glpi_id' });
      if (error) throw error;
    }
    const cursor = mapped.reduce<string | null>((latest, ticket) => {
      if (!ticket.modified_at) return latest;
      return !latest || ticket.modified_at > latest ? ticket.modified_at : latest;
    }, null);
    await glpi.killSession();
    await logSync(admin, 'info', 'Sincronização incremental concluída.', mapped.length, '', cursor);
    return json({ ok: true, records: mapped.length, lastCursor: cursor });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logSync(admin, 'erro', 'Falha na sincronização com o GLPI.', 0, message);
    console.error('glpi-dashboard failed:', message, error);
    return json({ error: 'Falha na integração com o GLPI. Detalhes registrados nos logs.' }, 500);
  }
});

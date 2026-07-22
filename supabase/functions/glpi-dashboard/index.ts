import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

type JsonRecord = Record<string, unknown>;

const GLPI_STATUS: Readonly<Record<number, string>> = Object.freeze({
  1: 'Novo',
  2: 'Atribuído',
  3: 'Planejado',
  4: 'Pendente',
  5: 'Solucionado',
  6: 'Fechado',
});

const REQUIRED_TICKET_FIELDS = Object.freeze([
  'date',
  'date_mod',
  'date_assign',
  'takeintoaccount_delay_stat',
  'time_to_own',
  'time_to_resolve',
  'internal_time_to_own',
  'internal_time_to_resolve',
  'users_id_lastupdater',
  'status',
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function env(name: string) {
  return Deno.env.get(name)?.trim() || '';
}

function boundedNumber(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(env(name) || fallback);
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/(user_token|app-token|session-token|authorization|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 4000);
}

function normalizeDate(value: unknown) {
  if (!value || value === 'NULL') return null;
  const raw = String(value).trim().replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
  const date = new Date(hasTimezone ? raw : `${raw}${env('GLPI_TIMEZONE_OFFSET') || '-03:00'}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function datePlusSeconds(value: unknown, seconds: unknown) {
  const start = normalizeDate(value);
  const delay = Number(seconds);
  if (!start || !Number.isFinite(delay) || delay < 0) return null;
  return new Date(new Date(start).getTime() + delay * 1000).toISOString();
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
  return GLPI_STATUS[Number(status)] || label(status) || 'Não disponível';
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

async function updateSyncState(client: ReturnType<typeof createClient>, values: JsonRecord) {
  const { error } = await client.from('glpi_sync_state').update({ ...values, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) console.warn('Falha ao atualizar estado da sincronização:', safeError(error));
}

class GlpiClient {
  private baseUrl: string;
  private appToken: string;
  private sessionToken = '';
  glpiVersion: string | null = null;

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
    const attempts = boundedNumber('GLPI_RETRY_ATTEMPTS', 3, 1, 5);
    const baseDelay = boundedNumber('GLPI_RETRY_BASE_DELAY_MS', 300, 100, 5000);
    let lastError: unknown = new Error('Falha desconhecida na API GLPI.');

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), boundedNumber('GLPI_REQUEST_TIMEOUT', Number(env('GLPI_TIMEOUT_MS') || 15000), 1000, 60000));
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
        } catch {
          body = text;
        }
        const retryable = response.status === 429 || response.status >= 500;
        if (!response.ok && retryable && attempt < attempts) {
          lastError = new Error(`GLPI ${response.status}: indisponibilidade temporária.`);
        } else if (!response.ok) {
          throw new Error(`GLPI ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
        } else {
          return body;
        }
      } catch (error) {
        lastError = error;
        if (attempt >= attempts) throw error;
      } finally {
        clearTimeout(timeout);
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelay * attempt));
    }
    throw lastError;
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
    this.glpiVersion = label(response.glpi_version || response.version);
    if (!this.sessionToken) throw new Error('GLPI não retornou session_token.');
  }

  async killSession() {
    if (!this.sessionToken) return;
    try {
      await this.request('killSession', { method: 'GET' });
    } catch (error) {
      console.warn('Falha ao encerrar sessão GLPI:', safeError(error));
    } finally {
      this.sessionToken = '';
    }
  }

  async getTickets(cursor: string | null = null) {
    const pageSize = boundedNumber('GLPI_SYNC_PAGE_SIZE', 100, 1, 1000);
    const maxPages = boundedNumber('GLPI_SYNC_MAX_PAGES', 10, 1, 100);
    const modifiedAfter = env('GLPI_SYNC_MODIFIED_AFTER') || cursor;
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
      let pageHasRecentTicket = false;
      for (const ticket of pageRows) {
        if (modifiedAfter) {
          const modified = normalizeDate(ticket.date_mod);
          if (modified && modified < new Date(modifiedAfter).toISOString()) continue;
        }
        pageHasRecentTicket = true;
        tickets.push(ticket);
      }
      if (pageRows.length < pageSize || (modifiedAfter && !pageHasRecentTicket)) break;
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

  async sampleTickets() {
    const params = new URLSearchParams({ range: '0-4', sort: 'date_mod', order: 'DESC', expand_dropdowns: 'false' });
    const result = await this.request(`Ticket?${params.toString()}`, { method: 'GET' });
    return Array.isArray(result) ? result as JsonRecord[] : [];
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
    first_response_at: datePlusSeconds(ticket.date, ticket.takeintoaccount_delay_stat),
    solved_at: normalizeDate(ticket.solvedate),
    closed_at: normalizeDate(ticket.closedate),
    modified_at: normalizeDate(ticket.date_mod),
    sla_due_at: normalizeDate(ticket.time_to_resolve),
    attention_due_at: normalizeDate(ticket.time_to_own),
    internal_sla_due_at: normalizeDate(ticket.internal_time_to_resolve),
    internal_attention_due_at: normalizeDate(ticket.internal_time_to_own),
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
  const startedAt = Date.now();
  let glpi: GlpiClient | null = null;
  let lockAcquired = false;
  let action = '';

  try {
    const token = auth.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return json({ error: 'Sessão inválida.' }, 401);
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    const role = String(profile?.role || '').toLowerCase();
    if (!['admin', 'gestor'].includes(role)) return json({ error: 'Acesso restrito a administradores e gestores.' }, 403);

    const body = await request.json().catch(() => ({})) as JsonRecord;
    action = String(body.action || '');
    if (!['configuration-status', 'sync-incremental', 'test-connection'].includes(action)) return json({ error: 'Ação inválida.' }, 400);

    if (action === 'configuration-status') {
      const baseUrl = env('GLPI_BASE_URL').replace(/\/+$/, '');
      const apiUrl = (env('GLPI_API_URL') || (baseUrl ? `${baseUrl}/apirest.php` : '')).replace(/\/+$/, '');
      return json({
        ok: true,
        configured: Boolean(baseUrl && env('GLPI_APP_TOKEN') && (env('GLPI_USER_TOKEN') || (env('GLPI_LOGIN') && env('GLPI_PASSWORD')))),
        baseUrl: baseUrl || null,
        apiUrl: apiUrl || null,
        apiRest: 'not-tested',
        credentials: {
          appToken: Boolean(env('GLPI_APP_TOKEN')),
          userToken: Boolean(env('GLPI_USER_TOKEN')),
          loginFallback: Boolean(env('GLPI_LOGIN') && env('GLPI_PASSWORD')),
        },
        timezone: env('GLPI_TIMEZONE') || 'America/Sao_Paulo',
        checkedAt: new Date().toISOString(),
      });
    }

    if (action === 'sync-incremental') {
      const { data: acquired, error: lockError } = await admin.rpc('acquire_glpi_sync_lock', {
        lock_seconds: boundedNumber('GLPI_SYNC_LOCK_SECONDS', 120, 30, 600),
      });
      if (lockError) throw lockError;
      lockAcquired = Boolean(acquired);
      if (!lockAcquired) return json({ error: 'Sincronização GLPI já está em andamento.' }, 409);
    }

    glpi = new GlpiClient();
    await glpi.initSession();
    if (action === 'test-connection') {
      const [sample, usersCount, groupsCount, categoriesCount] = await Promise.all([
        glpi.sampleTickets(),
        glpi.countItems('User'),
        glpi.countItems('Group'),
        glpi.countItems('ITILCategory'),
      ]);
      const fields = Object.fromEntries(REQUIRED_TICKET_FIELDS.map((field) => [
        field,
        sample.some((ticket) => Object.hasOwn(ticket, field)),
      ]));
      const statuses = [...new Map(sample.map((ticket) => [
        Number(ticket.status),
        statusName(ticket.status),
      ])).entries()].filter(([code]) => Number.isFinite(code)).map(([code, name]) => ({ code, name }));
      await logSync(admin, 'info', 'Conexão somente leitura com GLPI validada.', sample.length);
      return json({
        ok: true,
        glpiVersion: glpi.glpiVersion,
        baseUrl: env('GLPI_BASE_URL').replace(/\/+$/, '') || null,
        apiUrl: (env('GLPI_API_URL') || `${env('GLPI_BASE_URL').replace(/\/+$/, '')}/apirest.php`).replace(/\/+$/, '') || null,
        apiRest: 'online',
        credentials: { appToken: Boolean(env('GLPI_APP_TOKEN')), userToken: Boolean(env('GLPI_USER_TOKEN')) },
        tickets: sample.length,
        technicians: usersCount,
        access: { tickets: true, users: usersCount >= 0, groups: groupsCount >= 0, categories: categoriesCount >= 0 },
        fields,
        statuses,
        elapsedMs: Date.now() - startedAt,
      });
    }

    const { data: syncState } = await admin.from('glpi_sync_state').select('last_cursor').eq('id', 1).maybeSingle();
    const previousCursor = syncState?.last_cursor ? String(syncState.last_cursor) : null;
    const tickets = await glpi.getTickets(previousCursor);
    const mapped = tickets.map(mapTicket).filter((ticket) => ticket.glpi_id);
    if (mapped.length) {
      const { error } = await admin.from('glpi_tickets_dashboard').upsert(mapped, { onConflict: 'glpi_id' });
      if (error) throw error;
    }
    const cursor = mapped.reduce<string | null>((latest, ticket) => {
      if (!ticket.modified_at) return latest;
      return !latest || ticket.modified_at > latest ? ticket.modified_at : latest;
    }, previousCursor);
    await updateSyncState(admin, {
      status: 'online',
      locked_until: null,
      last_success_at: new Date().toISOString(),
      last_cursor: cursor,
      last_records_processed: mapped.length,
      last_error: null,
    });
    await logSync(admin, 'info', 'Sincronização incremental concluída.', mapped.length, '', cursor);
    return json({ ok: true, records: mapped.length, lastCursor: cursor, elapsedMs: Date.now() - startedAt });
  } catch (error) {
    const message = safeError(error);
    if (lockAcquired || action === 'sync-incremental') {
      await updateSyncState(admin, {
        status: 'offline',
        locked_until: null,
        last_error_at: new Date().toISOString(),
        last_error: message,
      });
    }
    await logSync(admin, 'erro', 'Falha na sincronização com o GLPI.', 0, message);
    console.error('glpi-dashboard failed:', message);
    return json({ error: 'Falha na integração com o GLPI. Detalhes registrados nos logs.' }, 500);
  } finally {
    await glpi?.killSession();
  }
});

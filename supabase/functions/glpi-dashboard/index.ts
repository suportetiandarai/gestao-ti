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

function jwtRole(token: string) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(payload)) as JsonRecord;
    return String(decoded.role || '').toLowerCase();
  } catch {
    return '';
  }
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

function comparable(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function statusName(status: unknown) {
  return GLPI_STATUS[Number(status)] || label(status) || 'Não disponível';
}

function formatTechnicianName(user: JsonRecord) {
  const clean = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();
  const complete = clean(user.display_name || user.completename);
  if (complete) return complete;
  return [clean(user.firstname), clean(user.realname)].filter(Boolean).join(' ')
    || clean(user.name);
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

function sanitizePublicText(value: unknown) {
  return String(value || '')
    .replace(/(?:&#0*62;?|&gt;)/gi, '')
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function publicDashboardTicket(ticket: JsonRecord) {
  const raw = ticket.raw_payload && typeof ticket.raw_payload === 'object'
    ? ticket.raw_payload as JsonRecord
    : {};
  const solution = raw._dashboard_solution_technician
    && typeof raw._dashboard_solution_technician === 'object'
    ? raw._dashboard_solution_technician as JsonRecord
    : {};
  return {
    glpi_id: numberOrNull(ticket.glpi_id),
    title: sanitizePublicText(ticket.title || raw.name || raw.title),
    status_id: numberOrNull(ticket.status_id),
    status: statusName(ticket.status_id || ticket.status),
    technician_id: numberOrNull(ticket.technician_id),
    technician_name: label(ticket.technician_name),
    group_id: numberOrNull(ticket.group_id),
    group_name: label(ticket.group_name),
    opened_at: normalizeDate(ticket.opened_at),
    assigned_at: normalizeDate(ticket.assigned_at),
    solved_at: normalizeDate(ticket.solved_at),
    closed_at: normalizeDate(ticket.closed_at),
    sla_due_at: normalizeDate(ticket.sla_due_at),
    attention_due_at: normalizeDate(ticket.attention_due_at),
    internal_sla_due_at: normalizeDate(ticket.internal_sla_due_at),
    internal_attention_due_at: normalizeDate(ticket.internal_attention_due_at),
    solution_technician_id: numberOrNull(solution.id),
    solution_technician_name: label(solution.name),
    source_environment: 'real',
  };
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

async function updateSyncState(client: ReturnType<typeof createClient>, values: JsonRecord, strict = true) {
  const { error } = await client.from('glpi_sync_state').update({ ...values, updated_at: new Date().toISOString() }).eq('id', 1);
  if (!error) return;
  if (strict) throw error;
  console.warn('Falha ao atualizar estado da sincronização:', safeError(error));
}

class GlpiClient {
  private baseUrl: string;
  private appToken: string;
  private sessionToken = '';
  private userCache = new Map<number, string>();
  private technicalGroup: { id: number; name: string } | null = null;
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
        const invalidSession = Boolean(
          this.sessionToken
          && !['initSession', 'killSession'].includes(path)
          && [400, 401].includes(response.status)
          && /session[_ -]?token|session.*invalid|invalid.*session/i.test(text)
        );
        if (invalidSession && attempt < attempts) {
          this.sessionToken = '';
          await this.initSession();
          lastError = new Error('Sessão GLPI expirada; autenticação renovada.');
          continue;
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
    const configuredCursor = env('GLPI_SYNC_MODIFIED_AFTER') || cursor;
    const overlapSeconds = boundedNumber('GLPI_SYNC_OVERLAP_SECONDS', 120, 0, 900);
    const parsedCursor = configuredCursor ? new Date(configuredCursor) : null;
    const modifiedAfter = parsedCursor && !Number.isNaN(parsedCursor.getTime())
      ? new Date(parsedCursor.getTime() - overlapSeconds * 1000).toISOString()
      : configuredCursor;
    const effectiveMaxPages = modifiedAfter
      ? maxPages
      : boundedNumber('GLPI_SYNC_INITIAL_MAX_PAGES', 1, 1, maxPages);
    const tickets: JsonRecord[] = [];

    for (let page = 0; page < effectiveMaxPages; page += 1) {
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

  async resolveTechnicalGroup() {
    if (this.technicalGroup) return this.technicalGroup;
    const configuredId = numberOrNull(env('GLPI_TECH_GROUP_ID'));
    const expectedName = env('GLPI_TECH_GROUP_NAME') || 'Suporte TI';

    if (configuredId) {
      const group = await this.request(`Group/${configuredId}`, { method: 'GET' }) as JsonRecord;
      this.technicalGroup = {
        id: configuredId,
        name: label(group.completename || group.name) || expectedName,
      };
      return this.technicalGroup;
    }

    const result = await this.request('Group?range=0-999&expand_dropdowns=false', { method: 'GET' });
    const groups = Array.isArray(result) ? result as JsonRecord[] : [];
    const match = groups.find((group) =>
      comparable(group.name) === comparable(expectedName)
      || comparable(group.completename) === comparable(expectedName)
    );
    const id = numberOrNull(match?.id);
    if (!match || !id) throw new Error(`Grupo técnico "${expectedName}" não localizado no GLPI.`);
    this.technicalGroup = { id, name: label(match.completename || match.name) || expectedName };
    return this.technicalGroup;
  }

  async technicalGroupTicketIds(groupId: number) {
    const pageSize = 1000;
    const ids = new Set<number>();
    for (let start = 0; start < 100000; start += pageSize) {
      const params = new URLSearchParams({
        'criteria[0][field]': '8',
        'criteria[0][searchtype]': 'equals',
        'criteria[0][value]': String(groupId),
        range: `${start}-${start + pageSize - 1}`,
        'forcedisplay[0]': '1',
      });
      const result = await this.request(`search/Ticket?${params.toString()}`, { method: 'GET' }) as JsonRecord;
      const rows = Array.isArray(result.data) ? result.data as JsonRecord[] : [];
      rows.forEach((row) => {
        const id = numberOrNull(row['2']);
        if (id) ids.add(id);
      });
      const total = Number(result.totalcount || 0);
      if (!rows.length || ids.size >= total || rows.length < pageSize) break;
    }
    return ids;
  }

  async technicianName(userId: number) {
    const cached = this.userCache.get(userId);
    if (cached) return cached;
    const user = await this.request(`User/${userId}`, { method: 'GET' }) as JsonRecord;
    const name = formatTechnicianName(user) || `Técnico ${userId}`;
    this.userCache.set(userId, name);
    return name;
  }

  async enrichTicketAssignments(ticket: JsonRecord) {
    const ticketId = numberOrNull(ticket.id);
    if (!ticketId) return ticket;

    const isFinal = [5, 6].includes(Number(ticket.status));
    const [relationsResult, logsResult, groupsResult, solutionsResult] = await Promise.all([
      this.request(`Ticket/${ticketId}/Ticket_User`, { method: 'GET' }),
      this.request(`Ticket/${ticketId}/Log?range=0-99`, { method: 'GET' }),
      this.request(`Ticket/${ticketId}/Group_Ticket`, { method: 'GET' }),
      isFinal
        ? this.request(`Ticket/${ticketId}/ITILSolution`, { method: 'GET' })
        : Promise.resolve([]),
    ]);
    const relations = Array.isArray(relationsResult) ? relationsResult as JsonRecord[] : [];
    const logs = Array.isArray(logsResult) ? logsResult as JsonRecord[] : [];
    const groupRelations = Array.isArray(groupsResult) ? groupsResult as JsonRecord[] : [];
    const solutions = Array.isArray(solutionsResult) ? solutionsResult as JsonRecord[] : [];
    const technicianRelations = relations.filter((relation) => Number(relation.type) === 2 && numberOrNull(relation.users_id));
    const technicalGroups = groupRelations
      .filter((relation) => Number(relation.type) === 2 && numberOrNull(relation.groups_id))
      .map((relation) => ({ id: Number(relation.groups_id) }));
    const assignmentEvents = logs
      .filter((entry) => {
        const assignedValue = comparable(entry.new_value);
        return Number(entry.id_search_option) === 5
          && normalizeDate(entry.date_mod)
          && assignedValue !== ''
          && assignedValue !== '0';
      })
      .sort((left, right) => String(left.date_mod).localeCompare(String(right.date_mod)));

    const technicians = await Promise.all(technicianRelations.map(async (relation) => {
      const id = Number(relation.users_id);
      const name = await this.technicianName(id);
      const match = assignmentEvents.find((entry) => {
        const changedTo = comparable(entry.new_value);
        return changedTo.includes(comparable(name)) || changedTo.includes(String(id));
      });
      const fallback = technicianRelations.length === 1 ? assignmentEvents[0] : null;
      return {
        id,
        name,
        assigned_at: normalizeDate(match?.date_mod || fallback?.date_mod || ticket.date_assign),
        source: ticket.date_assign ? 'ticket_date_assign' : 'history',
      };
    }));
    const targetGroup = await this.resolveTechnicalGroup();
    const belongsToTargetGroup = technicalGroups.some((group) => group.id === targetGroup.id);
    const latestSolution = [...solutions]
      .filter((solution) => numberOrNull(solution.users_id))
      .sort((left, right) =>
        String(right.date_creation || right.date_mod || '').localeCompare(String(left.date_creation || left.date_mod || ''))
      )[0];
    const solutionTechnicianId = numberOrNull(latestSolution?.users_id);
    const solutionTechnician = solutionTechnicianId
      ? {
          id: solutionTechnicianId,
          name: await this.technicianName(solutionTechnicianId),
          resolved_at: normalizeDate(latestSolution?.date_creation || latestSolution?.date_mod || ticket.solvedate || ticket.closedate),
          source: 'itil_solution_author',
        }
      : null;

    return {
      ...ticket,
      date_assign: normalizeDate(ticket.date_assign)
        || normalizeDate(assignmentEvents[0]?.date_mod)
        || technicians.find((technician) => technician.assigned_at)?.assigned_at
        || null,
      _dashboard_first_assigned_at: normalizeDate(assignmentEvents[0]?.date_mod)
        || normalizeDate(ticket.date_assign)
        || technicians.find((technician) => technician.assigned_at)?.assigned_at
        || null,
      technician_id: technicians[0]?.id || null,
      technician_name: technicians[0]?.name || null,
      group_id: belongsToTargetGroup ? targetGroup.id : technicalGroups[0]?.id || null,
      group_name: belongsToTargetGroup ? targetGroup.name : null,
      _dashboard_technicians: technicians,
      _dashboard_technical_groups: technicalGroups,
      _dashboard_in_tech_group: belongsToTargetGroup,
      _dashboard_solution_technician: solutionTechnician,
      _dashboard_resolution_diagnostic: isFinal
        ? {
            ticket_id: ticketId,
            solution_author_id: solutionTechnicianId,
            current_technician_ids: technicians.map((technician) => technician.id),
            last_updater_id: numberOrNull(ticket.users_id_lastupdater),
            source: solutionTechnician ? 'itil_solution_author' : 'unavailable',
          }
        : null,
    };
  }

  async enrichTickets(tickets: JsonRecord[]) {
    const concurrency = boundedNumber('GLPI_ENRICH_CONCURRENCY', 6, 1, 12);
    const enriched = new Array<JsonRecord>(tickets.length);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(concurrency, tickets.length) }, async () => {
      while (nextIndex < tickets.length) {
        const index = nextIndex;
        nextIndex += 1;
        enriched[index] = await this.enrichTicketAssignments(tickets[index]);
      }
    });
    await Promise.all(workers);
    return enriched;
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
    technician_id: numberOrNull(ticket.technician_id || ticket.users_id_assign),
    technician_name: label(ticket.technician_name || ticket.users_id_assign || ticket._users_id_assign),
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
    assigned_at: normalizeDate(ticket._dashboard_first_assigned_at || ticket.date_assign),
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

function mapTicketAssignments(ticket: JsonRecord) {
  const ticketId = numberOrNull(ticket.id);
  const technicians = Array.isArray(ticket._dashboard_technicians)
    ? ticket._dashboard_technicians as JsonRecord[]
    : [];
  return technicians.flatMap((technician) => {
    const technicianId = numberOrNull(technician.id);
    if (!ticketId || !technicianId) return [];
    return [{
      ticket_glpi_id: ticketId,
      technician_id: technicianId,
      technician_name: label(technician.name),
      assigned_at: normalizeDate(technician.assigned_at),
      assignment_source: label(technician.source) || 'history',
      synced_at: new Date().toISOString(),
    }];
  });
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
  let stage = 'authorize';
  let trustedOperationalCall = false;

  try {
    const token = auth.replace(/^Bearer\s+/i, '');
    const operationalRole = jwtRole(token);
    trustedOperationalCall = token === serviceKey || ['service_role', 'postgres'].includes(operationalRole);
    const body = await request.json().catch(() => ({})) as JsonRecord;
    action = String(body.action || '');

    if (action === 'public-dashboard') {
      if (env('PUBLIC_DASHBOARD_ENABLED') !== 'true') return json({ error: 'Dashboard público indisponível.' }, 404);
      const groupId = numberOrNull(env('GLPI_TECH_GROUP_ID'));
      if (!groupId) return json({ error: 'Grupo técnico público não configurado.' }, 503);
      const [{ data: tickets, error: ticketsError }, { data: integrationState, error: stateError }] = await Promise.all([
        admin
          .from('glpi_tickets_dashboard')
          .select('glpi_id,title,status_id,status,technician_id,technician_name,group_id,group_name,opened_at,assigned_at,solved_at,closed_at,sla_due_at,attention_due_at,internal_sla_due_at,internal_attention_due_at,raw_payload')
          .eq('group_id', groupId)
          .order('opened_at', { ascending: false })
          .limit(2000),
        admin
          .from('glpi_sync_state')
          .select('status,last_started_at,last_success_at,last_error_at,last_duration_ms,last_records_processed,last_records_changed,sync_origin,next_run_at,scheduler_interval_seconds,updated_at')
          .eq('id', 1)
          .maybeSingle(),
      ]);
      if (ticketsError) throw ticketsError;
      if (stateError) throw stateError;
      return json({
        ok: true,
        tickets: (tickets || []).map((ticket: JsonRecord) => publicDashboardTicket(ticket)),
        integrationState: integrationState || { status: 'offline' },
        checkedAt: new Date().toISOString(),
      });
    }

    if (!trustedOperationalCall) {
      const { data: { user }, error: userError } = await admin.auth.getUser(token);
      if (userError || !user) return json({ error: 'Sessão inválida.' }, 401);
      const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
      const role = String(profile?.role || '').toLowerCase();
      if (!['admin', 'gestor'].includes(role)) return json({ error: 'Acesso restrito a administradores e gestores.' }, 403);
    }

    if (!['configuration-status', 'sync-incremental', 'sync-current-shift', 'backfill-group-cache', 'test-connection'].includes(action)) return json({ error: 'Ação inválida.' }, 400);

    if (action === 'configuration-status') {
      const baseUrl = env('GLPI_BASE_URL').replace(/\/+$/, '');
      const apiUrl = (env('GLPI_API_URL') || (baseUrl ? `${baseUrl}/apirest.php` : '')).replace(/\/+$/, '');
      const [ticketsResult, assignmentsResult, syncStateResult] = await Promise.all([
        admin.from('glpi_tickets_dashboard').select('glpi_id', { count: 'exact', head: true }),
        admin.from('glpi_ticket_assignments_dashboard').select('technician_id').limit(5000),
        admin
          .from('glpi_sync_state')
          .select('status, last_success_at, last_cursor, last_records_processed, last_error_at')
          .eq('id', 1)
          .maybeSingle(),
      ]);
      if (ticketsResult.error) throw ticketsResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;
      if (syncStateResult.error) throw syncStateResult.error;
      const technicianIds = new Set(
        (assignmentsResult.data || [])
          .map((row: { technician_id: unknown }) => row.technician_id)
          .filter(Boolean),
      );
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
        cache: {
          tickets: ticketsResult.count || 0,
          technicians: technicianIds.size,
          assignments: assignmentsResult.data?.length || 0,
        },
        syncState: syncStateResult.data || null,
        timezone: env('GLPI_TIMEZONE') || 'America/Sao_Paulo',
        technicalGroup: {
          configuredId: numberOrNull(env('GLPI_TECH_GROUP_ID')),
          configuredName: env('GLPI_TECH_GROUP_NAME') || 'Suporte TI',
        },
        checkedAt: new Date().toISOString(),
      });
    }

    if (['sync-incremental', 'sync-current-shift', 'backfill-group-cache'].includes(action)) {
      stage = 'acquire-lock';
      const { data: acquired, error: lockError } = await admin.rpc('acquire_glpi_sync_lock', {
        lock_seconds: boundedNumber('GLPI_SYNC_LOCK_SECONDS', 120, 30, 600),
      });
      if (lockError) throw lockError;
      lockAcquired = Boolean(acquired);
      if (!lockAcquired) return json({ error: 'Sincronização GLPI já está em andamento.' }, 409);
      const requestedOrigin = String(body.origin || '');
      const syncOrigin = trustedOperationalCall && requestedOrigin === 'supabase_cron'
        ? 'supabase_cron'
        : 'manual_admin';
      const requestedInterval = Number(body.expectedIntervalSeconds || 60);
      const expectedIntervalSeconds = Number.isFinite(requestedInterval)
        ? Math.max(60, Math.min(requestedInterval, 300))
        : 60;
      await updateSyncState(admin, {
        sync_origin: syncOrigin,
        scheduler_interval_seconds: expectedIntervalSeconds,
        next_run_at: new Date(Date.now() + expectedIntervalSeconds * 1000).toISOString(),
      });
    }

    stage = 'init-session';
    glpi = new GlpiClient();
    await glpi.initSession();
    const technicalGroup = await glpi.resolveTechnicalGroup();
    if (action === 'backfill-group-cache') {
      stage = 'search-technical-group';
      const groupTicketIds = await glpi.technicalGroupTicketIds(technicalGroup.id);
      stage = 'read-cache';
      const [{ data: cachedTickets, error: cacheError }, { data: assignments, error: assignmentsError }] = await Promise.all([
        admin.from('glpi_tickets_dashboard').select('glpi_id, technician_id').limit(10000),
        admin.from('glpi_ticket_assignments_dashboard').select('technician_id').limit(10000),
      ]);
      if (cacheError) throw cacheError;
      if (assignmentsError) throw assignmentsError;
      const matchingIds = (cachedTickets || [])
        .map((ticket: { glpi_id: unknown }) => numberOrNull(ticket.glpi_id))
        .filter((id: number | null): id is number => Boolean(id && groupTicketIds.has(id)));
      stage = 'update-group-cache';
      for (let index = 0; index < matchingIds.length; index += 200) {
        const { error } = await admin
          .from('glpi_tickets_dashboard')
          .update({ group_id: technicalGroup.id, group_name: technicalGroup.name })
          .in('glpi_id', matchingIds.slice(index, index + 200));
        if (error) throw error;
      }
      const technicianIds = [...new Set([
        ...(cachedTickets || []).map((ticket: { technician_id: unknown }) => numberOrNull(ticket.technician_id)),
        ...(assignments || []).map((assignment: { technician_id: unknown }) => numberOrNull(assignment.technician_id)),
      ].filter((id): id is number => Boolean(id)))];
      stage = 'normalize-technician-names';
      for (const technicianId of technicianIds) {
        const name = await glpi.technicianName(technicianId);
        const [{ error: ticketError }, { error: assignmentError }] = await Promise.all([
          admin.from('glpi_tickets_dashboard').update({ technician_name: name }).eq('technician_id', technicianId),
          admin.from('glpi_ticket_assignments_dashboard').update({ technician_name: name }).eq('technician_id', technicianId),
        ]);
        if (ticketError) throw ticketError;
        if (assignmentError) throw assignmentError;
      }
      await updateSyncState(admin, {
        status: 'online',
        locked_until: null,
        last_success_at: new Date().toISOString(),
        last_records_processed: matchingIds.length,
        last_records_changed: matchingIds.length,
        last_duration_ms: Date.now() - startedAt,
        last_error_at: null,
        last_error: null,
      });
      await logSync(admin, 'info', 'Cache do grupo técnico e nomes normalizado.', matchingIds.length);
      return json({
        ok: true,
        group: technicalGroup,
        groupTicketsFound: groupTicketIds.size,
        cacheTicketsMatched: matchingIds.length,
        techniciansNormalized: technicianIds.length,
        elapsedMs: Date.now() - startedAt,
      });
    }
    if (action === 'test-connection') {
      const [rawSample, usersCount, groupsCount, categoriesCount] = await Promise.all([
        glpi.sampleTickets(),
        glpi.countItems('User'),
        glpi.countItems('Group'),
        glpi.countItems('ITILCategory'),
      ]);
      const sample = await glpi.enrichTickets(rawSample);
      const fields = Object.fromEntries(REQUIRED_TICKET_FIELDS.map((field) => [
        field,
        rawSample.some((ticket) => Object.hasOwn(ticket, field)),
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
        technicalGroup,
        sampleTechnicalGroupMatches: sample.filter((ticket) => ticket._dashboard_in_tech_group === true).length,
        assignmentFallback: {
          required: !fields.date_assign,
          currentTechnicianSource: 'Ticket_User.type=2',
          assignedAtSource: fields.date_assign ? 'Ticket.date_assign' : 'Log.date_mod where id_search_option=5',
          techniciansFound: sample.reduce((total, ticket) => total + (Array.isArray(ticket._dashboard_technicians) ? ticket._dashboard_technicians.length : 0), 0),
        },
        elapsedMs: Date.now() - startedAt,
      });
    }

    stage = 'read-sync-state';
    const { data: syncState, error: syncStateError } = await admin.from('glpi_sync_state').select('last_cursor').eq('id', 1).maybeSingle();
    if (syncStateError) throw syncStateError;
    const previousCursor = syncState?.last_cursor ? String(syncState.last_cursor) : null;
    stage = 'fetch-tickets';
    const rawTickets = await glpi.getTickets(action === 'sync-current-shift' ? null : previousCursor);
    stage = 'enrich-tickets';
    const tickets = await glpi.enrichTickets(rawTickets);
    const mapped = tickets.map(mapTicket).filter((ticket) => ticket.glpi_id);
    if (mapped.length) {
      stage = 'upsert-tickets';
      const { error } = await admin.from('glpi_tickets_dashboard').upsert(mapped, { onConflict: 'glpi_id' });
      if (error) throw error;
    }
    const ticketIds = mapped.map((ticket) => ticket.glpi_id);
    if (ticketIds.length) {
      stage = 'replace-assignments';
      const assignments = tickets.flatMap(mapTicketAssignments);
      const { error: deleteAssignmentsError } = await admin
        .from('glpi_ticket_assignments_dashboard')
        .delete()
        .in('ticket_glpi_id', ticketIds);
      if (deleteAssignmentsError) throw deleteAssignmentsError;
      if (assignments.length) {
        const { error: assignmentError } = await admin
          .from('glpi_ticket_assignments_dashboard')
          .upsert(assignments, { onConflict: 'ticket_glpi_id,technician_id' });
        if (assignmentError) throw assignmentError;
      }
    }
    const cursor = mapped.reduce<string | null>((latest, ticket) => {
      if (!ticket.modified_at) return latest;
      return !latest || ticket.modified_at > latest ? ticket.modified_at : latest;
    }, previousCursor);
    stage = 'update-sync-state';
    await updateSyncState(admin, {
      status: 'online',
      locked_until: null,
      last_success_at: new Date().toISOString(),
      last_cursor: cursor,
      last_records_processed: mapped.length,
      last_records_changed: mapped.length,
      last_duration_ms: Date.now() - startedAt,
      last_error_at: null,
      last_error: null,
    });
    stage = 'write-sync-log';
    await logSync(admin, 'info', action === 'sync-current-shift'
      ? 'Sincronização do período operacional concluída.'
      : 'Sincronização incremental concluída.', mapped.length, '', cursor);
    return json({ ok: true, records: mapped.length, lastCursor: cursor, elapsedMs: Date.now() - startedAt });
  } catch (error) {
    const message = safeError(error);
    if (lockAcquired || ['sync-incremental', 'sync-current-shift', 'backfill-group-cache'].includes(action)) {
      await updateSyncState(admin, {
        status: 'offline',
        locked_until: null,
        last_error_at: new Date().toISOString(),
        last_error: message,
        last_duration_ms: Date.now() - startedAt,
      }, false);
    }
    await logSync(admin, 'erro', 'Falha na sincronização com o GLPI.', 0, message);
    console.error('glpi-dashboard failed:', message);
    return json({
      error: 'Falha na integração com o GLPI. Detalhes registrados nos logs.',
      stage,
      ...(trustedOperationalCall ? { diagnostic: message } : {}),
    }, 500);
  } finally {
    await glpi?.killSession();
  }
});

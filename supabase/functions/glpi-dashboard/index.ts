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

async function logSync(
  client: ReturnType<typeof createClient>,
  executionId: string,
  startedAt: string,
  status: 'running' | 'success' | 'error' | 'skipped',
  records: number,
  detail = '',
) {
  await client.from('glpi_sync_logs').upsert({
    execution_id: executionId,
    started_at: startedAt,
    finished_at: status === 'running' ? null : new Date().toISOString(),
    status,
    records_requested: records,
    records_processed: records,
    error_code: status === 'error' ? 'GLPI_SYNC_FAILED' : null,
    error_message: status === 'error' ? detail.slice(0, 500) : null,
    duration_ms: Math.max(0, Date.now() - new Date(startedAt).getTime()),
  }, { onConflict: 'execution_id' });
}

async function refreshDashboardSnapshot(
  client: ReturnType<typeof createClient>,
  groupId: string,
  syncedAt: string,
) {
  const { data, error } = await client.rpc('rebuild_shift_snapshot', {
    p_group_id: groupId,
    p_synced_at: syncedAt,
  });
  if (error) throw error;
  return data;
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

  async ticketsByIds(ticketIds: number[]) {
    const batchSize = boundedNumber('GLPI_RECONCILE_BATCH_SIZE', 50, 1, 100);
    const tickets: JsonRecord[] = [];
    for (let start = 0; start < ticketIds.length; start += batchSize) {
      const ids = ticketIds.slice(start, start + batchSize);
      const params = new URLSearchParams({ expand_dropdowns: 'true' });
      ids.forEach((id, index) => {
        params.set(`items[${index}][itemtype]`, 'Ticket');
        params.set(`items[${index}][items_id]`, String(id));
      });
      try {
        const result = await this.request(`getMultipleItems?${params.toString()}`, { method: 'GET' });
        const rows = Array.isArray(result) ? result as JsonRecord[] : [];
        rows.forEach((row) => {
          const candidate = row.data && typeof row.data === 'object'
            ? row.data as JsonRecord
            : row;
          if (numberOrNull(candidate.id)) tickets.push(candidate);
        });
      } catch {
        const fallback = await Promise.all(ids.map(async (id) =>
          this.request(`Ticket/${id}?expand_dropdowns=true`, { method: 'GET' }) as Promise<JsonRecord>
        ));
        tickets.push(...fallback.filter((ticket) => numberOrNull(ticket.id)));
      }
    }
    return tickets;
  }

  async getRelevantGroupTickets(groupId: number, shiftStart: string, shiftEnd: string) {
    const ids = [...await this.technicalGroupTicketIds(groupId)];
    const tickets = await this.ticketsByIds(ids);
    const start = new Date(shiftStart).getTime();
    const end = new Date(shiftEnd).getTime();
    const withinShift = (value: unknown) => {
      const normalized = normalizeDate(value);
      if (!normalized) return false;
      const instant = new Date(normalized).getTime();
      return instant >= start && instant < end;
    };
    return tickets
      .filter((ticket) =>
        ![5, 6].includes(Number(ticket.status))
        || withinShift(ticket.date)
        || withinShift(ticket.solvedate)
      )
      .map((ticket) => ({ ...ticket, _dashboard_group_prevalidated: true }));
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
    const targetGroup = await this.resolveTechnicalGroup();
    const groupPrevalidated = ticket._dashboard_group_prevalidated === true;
    const [relationsResult, logsResult, groupsResult, solutionsResult] = await Promise.all([
      this.request(`Ticket/${ticketId}/Ticket_User`, { method: 'GET' }),
      this.request(`Ticket/${ticketId}/Log?range=0-99`, { method: 'GET' }),
      groupPrevalidated
        ? Promise.resolve([])
        : this.request(`Ticket/${ticketId}/Group_Ticket`, { method: 'GET' }),
      isFinal
        ? this.request(`Ticket/${ticketId}/ITILSolution`, { method: 'GET' })
        : Promise.resolve([]),
    ]);
    const relations = Array.isArray(relationsResult) ? relationsResult as JsonRecord[] : [];
    const logs = Array.isArray(logsResult) ? logsResult as JsonRecord[] : [];
    const groupRelations = Array.isArray(groupsResult) ? groupsResult as JsonRecord[] : [];
    const solutions = Array.isArray(solutionsResult) ? solutionsResult as JsonRecord[] : [];
    const technicianRelations = relations.filter((relation) => Number(relation.type) === 2 && numberOrNull(relation.users_id));
    const technicalGroups = groupPrevalidated
      ? [{ id: targetGroup.id }]
      : groupRelations
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
    const belongsToTargetGroup = technicalGroups.some((group) => group.id === targetGroup.id);
    const latestSolution = [...solutions]
      .filter((solution) => numberOrNull(solution.users_id))
      .sort((left, right) =>
        String(right.date_creation || right.date_mod || '').localeCompare(String(left.date_creation || left.date_mod || ''))
      )[0];
    const solutionTechnicianId = numberOrNull(latestSolution?.users_id);
    const solutionTechnician = solutionTechnicianId
      ? {
          solution_id: numberOrNull(latestSolution?.id),
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

function normalizedTicket(ticket: JsonRecord, groupUuid: string) {
  return {
    glpi_ticket_id: numberOrNull(ticket.id),
    title: label(ticket.name),
    glpi_status_id: Number(ticket.status),
    glpi_status_name: statusName(ticket.status),
    group_id: groupUuid,
    category_id: numberOrNull(ticket.itilcategories_id),
    category_name: label(ticket.itilcategories_id),
    entity_id: numberOrNull(ticket.entities_id),
    entity_name: label(ticket.entities_id),
    location_id: numberOrNull(ticket.locations_id),
    location_name: label(ticket.locations_id),
    priority: numberOrNull(ticket.priority),
    urgency: numberOrNull(ticket.urgency),
    impact: numberOrNull(ticket.impact),
    opened_at: normalizeDate(ticket.date),
    first_assigned_at: normalizeDate(ticket._dashboard_first_assigned_at || ticket.date_assign),
    first_response_at: datePlusSeconds(ticket.date, ticket.takeintoaccount_delay_stat),
    solved_at: normalizeDate(ticket.solvedate),
    closed_at: normalizeDate(ticket.closedate),
    sla_attention_deadline: normalizeDate(ticket.time_to_own),
    sla_solution_deadline: normalizeDate(ticket.time_to_resolve),
    ola_attention_deadline: normalizeDate(ticket.internal_time_to_own),
    ola_solution_deadline: normalizeDate(ticket.internal_time_to_resolve),
    is_pending: Number(ticket.status) === 4,
    requester_count: 0,
    last_glpi_update: normalizeDate(ticket.date_mod) || new Date().toISOString(),
    source_environment: 'real',
  };
}

async function upsertTechnician(
  admin: ReturnType<typeof createClient>,
  glpiUserId: number,
  fullName: string,
  syncedAt: string,
) {
  const { data, error } = await admin.from('glpi_technicians').upsert({
    glpi_user_id: glpiUserId,
    full_name: fullName,
    is_active: true,
    last_synced_at: syncedAt,
  }, { onConflict: 'glpi_user_id' }).select('id').single();
  if (error) throw error;
  return String(data.id);
}

async function persistTicket(
  admin: ReturnType<typeof createClient>,
  ticket: JsonRecord,
  groupUuid: string,
  syncedAt: string,
) {
  const mapped = normalizedTicket(ticket, groupUuid);
  if (!mapped.glpi_ticket_id || !mapped.opened_at) return null;
  const { data: stored, error: ticketError } = await admin
    .from('glpi_tickets')
    .upsert(mapped, { onConflict: 'glpi_ticket_id' })
    .select('id,glpi_ticket_id,last_glpi_update')
    .single();
  if (ticketError) throw ticketError;
  const ticketUuid = String(stored.id);

  const technicians = Array.isArray(ticket._dashboard_technicians)
    ? ticket._dashboard_technicians as JsonRecord[]
    : [];
  const currentTechnicianIds: string[] = [];
  for (const technician of technicians) {
    const glpiUserId = numberOrNull(technician.id);
    const fullName = label(technician.name);
    if (!glpiUserId || !fullName) continue;
    const technicianUuid = await upsertTechnician(admin, glpiUserId, fullName, syncedAt);
    currentTechnicianIds.push(technicianUuid);
    const { error } = await admin.from('glpi_ticket_technicians').upsert({
      ticket_id: ticketUuid,
      technician_id: technicianUuid,
      relation_type: 'assigned',
      assigned_at: normalizeDate(technician.assigned_at),
      removed_at: null,
      is_current: true,
    }, { onConflict: 'ticket_id,technician_id,relation_type,assigned_at' });
    if (error) throw error;
  }
  let staleAssignments = admin.from('glpi_ticket_technicians')
    .update({ is_current: false, removed_at: syncedAt })
    .eq('ticket_id', ticketUuid)
    .eq('relation_type', 'assigned')
    .eq('is_current', true);
  if (currentTechnicianIds.length) staleAssignments = staleAssignments.not('technician_id', 'in', `(${currentTechnicianIds.join(',')})`);
  const { error: staleError } = await staleAssignments;
  if (staleError) throw staleError;

  const solution = ticket._dashboard_solution_technician
    && typeof ticket._dashboard_solution_technician === 'object'
    ? ticket._dashboard_solution_technician as JsonRecord
    : null;
  const solutionUserId = numberOrNull(solution?.id);
  const solutionId = numberOrNull(solution?.solution_id);
  const solvedAt = normalizeDate(ticket.solvedate);
  if (solution && solutionUserId && solutionId && solvedAt) {
    const solutionTechUuid = await upsertTechnician(
      admin,
      solutionUserId,
      label(solution.name) || `Técnico ${solutionUserId}`,
      syncedAt,
    );
    const { error: solutionError } = await admin.from('glpi_ticket_solutions').upsert({
      ticket_id: ticketUuid,
      glpi_solution_id: solutionId,
      solved_at: solvedAt,
      solved_by_technician_id: solutionTechUuid,
      solution_type: 'itil_solution_author',
    }, { onConflict: 'ticket_id,glpi_solution_id' });
    if (solutionError) throw solutionError;
  }
  const { error: classificationError } = await admin.rpc('refresh_ticket_classification', {
    p_ticket_id: ticketUuid,
    p_reference: syncedAt,
  });
  if (classificationError) throw classificationError;
  return { glpiId: Number(stored.glpi_ticket_id), modifiedAt: String(stored.last_glpi_update) };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const auth = request.headers.get('Authorization') || '';
  if (!supabaseUrl || !serviceKey || !auth) return json({ error: 'Não autorizado.' }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  let glpi: GlpiClient | null = null;
  let executionId = '';
  let action: string;
  let stage = 'authorize';
  let trustedOperationalCall = false;
  let cursor: string | null = null;
  let records = 0;

  try {
    const token = auth.replace(/^Bearer\s+/i, '');
    trustedOperationalCall = token === serviceKey || ['service_role', 'postgres'].includes(jwtRole(token));
    const body = await request.json().catch(() => ({})) as JsonRecord;
    action = String(body.action || '');
    if (!trustedOperationalCall) {
      const { data: { user }, error } = await admin.auth.getUser(token);
      if (error || !user) return json({ error: 'Sessão inválida.' }, 401);
      const { data: profile } = await admin.from('user_profiles').select('role,is_active').eq('auth_user_id', user.id).single();
      if (!profile?.is_active || !['admin', 'gestor'].includes(String(profile.role).toLowerCase())) {
        return json({ error: 'Acesso restrito a administradores e gestores.' }, 403);
      }
    }
    if (!['configuration-status', 'sync-incremental', 'sync-current-shift', 'test-connection'].includes(action)) {
      return json({ error: 'Ação inválida.' }, 400);
    }

    if (action === 'configuration-status') {
      const [{ count: tickets }, { count: technicians }, { data: syncState }] = await Promise.all([
        admin.from('glpi_tickets').select('id', { count: 'exact', head: true }),
        admin.from('glpi_technicians').select('id', { count: 'exact', head: true }),
        admin.from('glpi_sync_state').select('*').eq('sync_name', 'glpi_incremental').maybeSingle(),
      ]);
      return json({
        ok: true,
        configured: Boolean(env('GLPI_BASE_URL') && env('GLPI_APP_TOKEN') && env('GLPI_USER_TOKEN')),
        credentials: { appToken: Boolean(env('GLPI_APP_TOKEN')), userToken: Boolean(env('GLPI_USER_TOKEN')) },
        cache: { tickets: tickets || 0, technicians: technicians || 0 },
        syncState,
        timezone: env('GLPI_TIMEZONE') || 'America/Sao_Paulo',
        checkedAt: new Date().toISOString(),
      });
    }

    stage = 'init-session';
    glpi = new GlpiClient();
    await glpi.initSession();
    const technicalGroup = await glpi.resolveTechnicalGroup();
    if (action === 'test-connection') {
      const [rawSample, usersCount, groupsCount, categoriesCount] = await Promise.all([
        glpi.sampleTickets(), glpi.countItems('User'), glpi.countItems('Group'), glpi.countItems('ITILCategory'),
      ]);
      const sample = await glpi.enrichTickets(rawSample);
      return json({
        ok: true,
        glpiVersion: glpi.glpiVersion,
        apiRest: 'online',
        tickets: sample.length,
        technicians: usersCount,
        access: { tickets: true, users: usersCount >= 0, groups: groupsCount >= 0, categories: categoriesCount >= 0 },
        fields: Object.fromEntries(REQUIRED_TICKET_FIELDS.map((field) => [field, rawSample.some((ticket) => Object.hasOwn(ticket, field))])),
        technicalGroup,
        elapsedMs: Date.now() - startedAt,
      });
    }

    stage = 'acquire-lock';
    const { data: acquired, error: lockError } = await admin.rpc('acquire_glpi_sync_lock', {
      p_sync_name: 'glpi_incremental',
      p_lock_seconds: boundedNumber('GLPI_SYNC_LOCK_SECONDS', 120, 30, 600),
    });
    if (lockError) throw lockError;
    executionId = String(acquired || '');
    if (!executionId) return json({ error: 'Sincronização GLPI já está em andamento.' }, 409);
    await logSync(admin, executionId, startedAtIso, 'running', 0);

    stage = 'upsert-group';
    const { data: group, error: groupError } = await admin.from('glpi_groups').upsert({
      glpi_group_id: technicalGroup.id,
      name: technicalGroup.name,
      is_active: true,
      is_dashboard_group: true,
    }, { onConflict: 'glpi_group_id' }).select('id').single();
    if (groupError) throw groupError;

    stage = 'read-sync-state';
    const { data: syncState, error: syncStateError } = await admin
      .from('glpi_sync_state').select('last_cursor').eq('sync_name', 'glpi_incremental').single();
    if (syncStateError) throw syncStateError;
    const previousCursor = action === 'sync-current-shift' ? null : (syncState.last_cursor ? String(syncState.last_cursor) : null);
    stage = 'fetch-tickets';
    const fullReconciliation = action === 'sync-current-shift' || !previousCursor;
    let rawTickets: JsonRecord[];
    if (fullReconciliation) {
      const { data: shifts, error: shiftError } = await admin.rpc('get_current_shift', {
        p_reference: new Date().toISOString(),
      });
      if (shiftError) throw shiftError;
      const shift = Array.isArray(shifts) ? shifts[0] as JsonRecord : null;
      const shiftStart = normalizeDate(shift?.shift_start);
      const shiftEnd = normalizeDate(shift?.shift_end);
      if (!shiftStart || !shiftEnd) throw new Error('Não foi possível calcular o plantão para a reconciliação.');
      rawTickets = await glpi.getRelevantGroupTickets(technicalGroup.id, shiftStart, shiftEnd);
    } else {
      rawTickets = await glpi.getTickets(previousCursor);
    }
    stage = 'enrich-tickets';
    const enriched = await glpi.enrichTickets(rawTickets);
    const targetTickets = enriched.filter((ticket) => ticket._dashboard_in_tech_group === true);
    records = targetTickets.length;
    cursor = previousCursor;
    stage = 'persist-normalized-cache';
    for (const ticket of targetTickets) {
      const persisted = await persistTicket(admin, ticket, String(group.id), new Date().toISOString());
      if (persisted?.modifiedAt && (!cursor || persisted.modifiedAt > cursor)) cursor = persisted.modifiedAt;
    }
    const syncedAt = new Date().toISOString();
    stage = 'rebuild-snapshot';
    const snapshot = await refreshDashboardSnapshot(admin, String(group.id), syncedAt);
    stage = 'finish-sync';
    const duration = Date.now() - startedAt;
    const { error: finishError } = await admin.rpc('finish_glpi_sync', {
      p_execution_id: executionId,
      p_success: true,
      p_cursor: cursor,
      p_processed: records,
      p_inserted: 0,
      p_updated: records,
      p_duration_ms: duration,
      p_error: null,
    });
    if (finishError) throw finishError;
    await logSync(admin, executionId, startedAtIso, 'success', records);
    executionId = '';
    return json({
      ok: true,
      records,
      lastCursor: cursor,
      snapshotVersion: snapshot?.snapshot_version || null,
      elapsedMs: duration,
    });
  } catch (error) {
    const message = safeError(error);
    if (executionId) {
      await admin.rpc('finish_glpi_sync', {
        p_execution_id: executionId,
        p_success: false,
        p_cursor: cursor,
        p_processed: records,
        p_inserted: 0,
        p_updated: 0,
        p_duration_ms: Date.now() - startedAt,
        p_error: message,
      }).catch(() => undefined);
      await logSync(admin, executionId, startedAtIso, 'error', records, message).catch(() => undefined);
    }
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

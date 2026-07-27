type JsonRecord = Record<string, unknown>;

export type SnapshotTicket = {
  id: number;
  title: string;
  status: string;
  status_id: number;
  technician_id: number | null;
  technician_name: string | null;
  opened_at: string;
  assigned_at: string | null;
  solved_at: string | null;
  closed_at: string | null;
  is_pending: boolean;
  is_overdue: boolean;
  is_resolved: boolean;
};

export type DashboardSnapshot = {
  scope: 'daily_public';
  group_id: number;
  shift_start: string;
  shift_end: string;
  shift_type: 'Diurno' | 'Noturno';
  open_count: number;
  in_progress_count: number;
  waiting_count: number;
  pending_count: number;
  overdue_count: number;
  technicians_chart_json: Array<{ technician_id: number; label: string; value: number }>;
  shift_tickets_json: SnapshotTicket[];
  integration_status: 'online';
  last_synced_at: string;
};

const STATUS = Object.freeze({
  PENDING: 4,
  SOLVED: 5,
  CLOSED: 6,
});

function date(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown) {
  return String(value || '')
    .replace(/(?:&#0*62;?|&gt;)/gi, '')
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

function saoPauloDate(reference: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(reference);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return {
    day: `${part('year')}-${part('month')}-${part('day')}`,
    hour: Number(part('hour')),
  };
}

function addDays(day: string, amount: number) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function zonedDateTime(day: string, hour: number) {
  // America/Sao_Paulo has remained UTC-03:00 throughout the supported GLPI
  // operational period. Intl above is still used to select the local shift.
  return new Date(`${day}T${String(hour).padStart(2, '0')}:00:00-03:00`);
}

export function currentShiftWindow(reference = new Date()) {
  const local = saoPauloDate(reference);
  const dayShift = local.hour >= 7 && local.hour < 19;
  const startDay = dayShift ? local.day : (local.hour >= 19 ? local.day : addDays(local.day, -1));
  const endDay = dayShift ? local.day : addDays(startDay, 1);
  return {
    type: (dayShift ? 'Diurno' : 'Noturno') as 'Diurno' | 'Noturno',
    start: zonedDateTime(startDay, dayShift ? 7 : 19),
    end: zonedDateTime(endDay, dayShift ? 19 : 7),
  };
}

function isWithin(value: unknown, start: Date, end: Date) {
  const parsed = date(value);
  return Boolean(parsed && parsed >= start && parsed < end);
}

function deadlineExpired(ticket: JsonRecord, dueField: string, completedField: string, reference: Date) {
  const due = date(ticket[dueField]);
  if (!due) return false;
  const completed = date(ticket[completedField]);
  return completed ? completed > due : reference > due;
}

export function snapshotTicketFlags(ticket: JsonRecord, reference = new Date()) {
  const status = Number(ticket.status_id);
  const isResolved = status === STATUS.SOLVED || status === STATUS.CLOSED;
  const isPending = status === STATUS.PENDING;
  const hasTechnician = Boolean(number(ticket.technician_id));
  const hasExpiredDeadline =
    deadlineExpired(ticket, 'attention_due_at', 'first_response_at', reference)
    || deadlineExpired(ticket, 'internal_attention_due_at', 'first_response_at', reference)
    || deadlineExpired(ticket, 'sla_due_at', 'solved_at', reference)
    || deadlineExpired(ticket, 'internal_sla_due_at', 'solved_at', reference);
  return {
    isResolved,
    isPending,
    isInProgress: !isResolved && !isPending && hasTechnician,
    isWaiting: !isResolved && !isPending && !hasTechnician,
    isOverdue: !isResolved && !isPending && hasExpiredDeadline,
  };
}

export function dashboardTicketStatus(ticket: JsonRecord, reference = new Date()) {
  const flags = snapshotTicketFlags(ticket, reference);
  if (flags.isWaiting) return 'Aguardando Atribuição';
  return text(ticket.status) || 'Não disponível';
}

function earliestExpiredDeadline(ticket: JsonRecord, reference: Date) {
  const pairs = [
    ['attention_due_at', 'first_response_at'],
    ['internal_attention_due_at', 'first_response_at'],
    ['sla_due_at', 'solved_at'],
    ['internal_sla_due_at', 'solved_at'],
  ];
  return pairs
    .filter(([due, completed]) => deadlineExpired(ticket, due, completed, reference))
    .map(([due]) => date(ticket[due])?.getTime() ?? Number.POSITIVE_INFINITY)
    .sort((left, right) => left - right)[0] ?? Number.POSITIVE_INFINITY;
}

function operationalSort(tickets: JsonRecord[], reference: Date) {
  return [...tickets].sort((left, right) => {
    const leftFlags = snapshotTicketFlags(left, reference);
    const rightFlags = snapshotTicketFlags(right, reference);
    const leftPriority = leftFlags.isOverdue ? 1 : leftFlags.isResolved ? 3 : 2;
    const rightPriority = rightFlags.isOverdue ? 1 : rightFlags.isResolved ? 3 : 2;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    const comparison = leftPriority === 1
      ? earliestExpiredDeadline(left, reference) - earliestExpiredDeadline(right, reference)
      : leftPriority === 2
        ? (date(left.opened_at)?.getTime() ?? 0) - (date(right.opened_at)?.getTime() ?? 0)
        : (date(right.solved_at)?.getTime() ?? 0) - (date(left.solved_at)?.getTime() ?? 0);
    return comparison || (number(left.glpi_id) || 0) - (number(right.glpi_id) || 0);
  });
}

function publicTicket(ticket: JsonRecord, reference: Date): SnapshotTicket | null {
  const id = number(ticket.glpi_id);
  const groupId = number(ticket.group_id);
  const openedAt = date(ticket.opened_at);
  const statusId = number(ticket.status_id);
  if (!id || !groupId || !openedAt || !statusId) return null;
  const flags = snapshotTicketFlags(ticket, reference);
  return {
    id,
    title: text(ticket.title) || `Chamado #${id}`,
    status: dashboardTicketStatus(ticket, reference),
    status_id: statusId,
    technician_id: number(ticket.technician_id),
    technician_name: text(ticket.technician_name),
    opened_at: openedAt.toISOString(),
    assigned_at: date(ticket.assigned_at)?.toISOString() || null,
    solved_at: date(ticket.solved_at)?.toISOString() || null,
    closed_at: date(ticket.closed_at)?.toISOString() || null,
    is_pending: flags.isPending,
    is_overdue: flags.isOverdue,
    is_resolved: flags.isResolved,
  };
}

export function buildDashboardSnapshot(
  tickets: JsonRecord[],
  groupId: number,
  syncedAt: string,
  reference = new Date(),
): DashboardSnapshot {
  const shift = currentShiftWindow(reference);
  const unique = new Map<number, JsonRecord>();
  tickets.forEach((ticket) => {
    const id = number(ticket.glpi_id);
    if (id && number(ticket.group_id) === groupId) unique.set(id, ticket);
  });
  const groupTickets = [...unique.values()];
  const classified = groupTickets.map((ticket) => ({
    ticket,
    flags: snapshotTicketFlags(ticket, reference),
  }));
  const openedInShift = groupTickets.filter((ticket) => isWithin(ticket.opened_at, shift.start, shift.end));
  const technicianTickets = new Map<string, { technician_id: number; label: string }>();
  groupTickets.forEach((ticket) => {
    const flags = snapshotTicketFlags(ticket, reference);
    if (!flags.isResolved || !isWithin(ticket.solved_at, shift.start, shift.end)) return;
    const technicianId = number(ticket.solving_technician_id);
    const technicianName = text(ticket.solving_technician_name);
    const ticketId = number(ticket.glpi_id);
    if (!technicianId || !technicianName || !ticketId) return;
    technicianTickets.set(`${ticketId}:${technicianId}`, {
      technician_id: technicianId,
      label: technicianName,
    });
  });
  const technicians = new Map<number, { technician_id: number; label: string; value: number }>();
  technicianTickets.forEach((item) => {
    const current = technicians.get(item.technician_id);
    technicians.set(item.technician_id, {
      ...item,
      value: (current?.value || 0) + 1,
    });
  });
  const shiftTickets = operationalSort(openedInShift, reference)
    .map((ticket) => publicTicket(ticket, reference))
    .filter((ticket): ticket is SnapshotTicket => Boolean(ticket));
  return {
    scope: 'daily_public',
    group_id: groupId,
    shift_start: shift.start.toISOString(),
    shift_end: shift.end.toISOString(),
    shift_type: shift.type,
    open_count: openedInShift.length,
    in_progress_count: classified.filter(({ flags }) => flags.isInProgress).length,
    waiting_count: classified.filter(({ flags }) => flags.isWaiting).length,
    pending_count: classified.filter(({ flags }) => flags.isPending).length,
    overdue_count: classified.filter(({ flags }) => flags.isOverdue).length,
    technicians_chart_json: [...technicians.values()]
      .sort((left, right) =>
        right.value - left.value
        || left.label.localeCompare(right.label)
        || left.technician_id - right.technician_id),
    shift_tickets_json: shiftTickets,
    integration_status: 'online',
    last_synced_at: syncedAt,
  };
}

function etagPayload(snapshot: DashboardSnapshot) {
  const stableContent = { ...snapshot } as Partial<DashboardSnapshot>;
  delete stableContent.last_synced_at;
  return stableContent;
}

export async function snapshotHash(snapshot: DashboardSnapshot) {
  const bytes = new TextEncoder().encode(JSON.stringify(etagPayload(snapshot)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export const SNAPSHOT_TICKET_COLUMNS = [
  'glpi_id',
  'title',
  'status_id',
  'status',
  'technician_id',
  'technician_name',
  'group_id',
  'opened_at',
  'assigned_at',
  'first_response_at',
  'solved_at',
  'closed_at',
  'sla_due_at',
  'attention_due_at',
  'internal_sla_due_at',
  'internal_attention_due_at',
  'solving_technician_id',
  'solving_technician_name',
].join(',');

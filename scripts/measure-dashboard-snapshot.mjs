import { gzipSync } from 'node:zlib';

// Baseline medido na resposta pública real antes da alteração, em 27/07/2026.
const baseline = {
  rows: 998,
  uncompressedBytes: 549_573,
  gzipBytes: 52_510,
};
const shiftTicketCount = Math.max(0, Number(process.env.SHIFT_TICKET_COUNT || 120));
const pageSize = 50;

const ticket = (id) => ({
  ticket_id: id,
  title: `Chamado operacional ${id} com título completo autorizado`,
  dashboard_status: id % 3 === 0 ? 'Solucionado' : 'Em atendimento',
  glpi_status: id % 3 === 0 ? 'Solucionado' : 'Atribuído',
  technician_name: `TECNICO RESPONSAVEL ${id}`,
  opened_at: '2026-07-27T10:30:00.000Z',
  assigned_at: '2026-07-27T10:45:00.000Z',
  solved_at: id % 3 === 0 ? '2026-07-27T12:00:00.000Z' : null,
  total_time: 5400,
  assignment_time: 900,
  solution_time: id % 3 === 0 ? 4500 : 0,
  is_pending: false,
  is_overdue: false,
  is_resolved: id % 3 === 0,
  operational_priority: id % 3 === 0 ? 3 : 2,
});

const summaryPayload = JSON.stringify({
  ok: true,
  snapshot: {
    scope: 'daily_public',
    groupId: 1,
    shiftStart: '2026-07-27T10:00:00.000Z',
    shiftEnd: '2026-07-27T22:00:00.000Z',
    shiftType: 'Diurno',
    counts: { open: 23, inProgress: 14, waiting: 4, pending: 3, overdue: 2 },
    techniciansChart: [
      { technician_id: 101, label: 'TECNICO RESPONSAVEL 1', value: 5 },
      { technician_id: 102, label: 'TECNICO RESPONSAVEL 2', value: 3 },
    ],
    ticketsCount: shiftTicketCount,
    version: 1,
    lastSyncedAt: '2026-07-27T15:00:00.000Z',
    integrationStatus: 'online',
  },
  checkedAt: '2026-07-27T15:00:05.000Z',
});

const pagePayload = JSON.stringify({
  ok: true,
  tickets: Array.from(
    { length: Math.min(pageSize, shiftTicketCount) },
    (_, index) => ticket(index + 1),
  ),
  pagination: {
    page: 1,
    pageSize,
    total: shiftTicketCount,
    totalPages: Math.max(1, Math.ceil(shiftTicketCount / pageSize)),
  },
});

const candidate = {
  summaryRows: 1,
  pageRows: Math.min(pageSize, shiftTicketCount),
  totalShiftTickets: shiftTicketCount,
  summaryUncompressedBytes: Buffer.byteLength(summaryPayload),
  summaryGzipBytes: gzipSync(summaryPayload).byteLength,
  pageUncompressedBytes: Buffer.byteLength(pagePayload),
  pageGzipBytes: gzipSync(pagePayload).byteLength,
  notModifiedBodyBytes: 0,
};
const percent = (before, after) => Number((((before - after) / before) * 100).toFixed(2));
const firstRefreshBytes = candidate.summaryGzipBytes + candidate.pageGzipBytes;

console.log(JSON.stringify({
  baseline,
  candidate,
  reduction: {
    rowsPerPagePercent: percent(baseline.rows, candidate.summaryRows + candidate.pageRows),
    firstRefreshGzipPercent: percent(baseline.gzipBytes, firstRefreshBytes),
    unchangedBodyPercent: 100,
  },
  qualification: `Projeção local com ${shiftTicketCount} chamados no plantão e páginas de ${pageSize}; medir novamente após implantação controlada.`,
}, null, 2));

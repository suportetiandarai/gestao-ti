import { gzipSync } from 'node:zlib';

// Baseline medido na resposta pública real antes da alteração, em 27/07/2026.
const baseline = {
  rows: 998,
  uncompressedBytes: 549_573,
  gzipBytes: 52_510,
};

const ticket = (id) => ({
  id,
  title: `Chamado operacional ${id} com título completo autorizado`,
  status: id % 3 === 0 ? 'Solucionado' : 'Atribuído',
  status_id: id % 3 === 0 ? 5 : 2,
  technician_id: 100 + id,
  technician_name: `TECNICO RESPONSAVEL ${id}`,
  group_id: 1,
  opened_at: '2026-07-27T10:30:00.000Z',
  assigned_at: '2026-07-27T10:45:00.000Z',
  first_response_at: '2026-07-27T10:50:00.000Z',
  solved_at: id % 3 === 0 ? '2026-07-27T12:00:00.000Z' : null,
  closed_at: null,
  sla_due_at: '2026-07-27T18:00:00.000Z',
  attention_due_at: '2026-07-27T11:00:00.000Z',
  internal_sla_due_at: null,
  internal_attention_due_at: null,
  solution_technician_id: id % 3 === 0 ? 100 + id : null,
  solution_technician_name: id % 3 === 0 ? `TECNICO RESPONSAVEL ${id}` : null,
  is_pending: false,
  is_overdue: false,
  is_resolved: id % 3 === 0,
});

const candidatePayload = JSON.stringify({
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
    latestTickets: Array.from({ length: 10 }, (_, index) => ticket(index + 1)),
    version: 1,
    lastSyncedAt: '2026-07-27T15:00:00.000Z',
    integrationStatus: 'online',
  },
  checkedAt: '2026-07-27T15:00:05.000Z',
});

const candidate = {
  rows: 1,
  listedTickets: 10,
  uncompressedBytes: Buffer.byteLength(candidatePayload),
  gzipBytes: gzipSync(candidatePayload).byteLength,
  notModifiedBodyBytes: 0,
};
const percent = (before, after) => Number((((before - after) / before) * 100).toFixed(2));

console.log(JSON.stringify({
  baseline,
  candidate,
  reduction: {
    rowsPercent: percent(baseline.rows, candidate.rows),
    uncompressedPercent: percent(baseline.uncompressedBytes, candidate.uncompressedBytes),
    gzipPercent: percent(baseline.gzipBytes, candidate.gzipBytes),
    unchangedBodyPercent: 100,
  },
  qualification: 'Projeção local do novo contrato; medir novamente após implantação controlada.',
}, null, 2));

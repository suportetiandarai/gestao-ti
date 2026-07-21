// Dashboard GLPI: camada de apresentação, filtros, métricas e exportações.
(function () {
    const TZ = 'America/Sao_Paulo';
    const GLPI_VERSION = '10.0.18';
    const GLPI_STATUS = Object.freeze({
        1: 'Novo',
        2: 'Atribuído',
        3: 'Planejado',
        4: 'Pendente',
        5: 'Solucionado',
        6: 'Fechado'
    });
    const STATUS_OPEN = new Set(['Novo', 'Atribuído', 'Planejado', 'Pendente']);
    const STATUS_FINAL = new Set(['Solucionado', 'Fechado']);
    const state = {
        initialized: false,
        demo: false,
        tickets: [],
        filtered: [],
        syncLogs: [],
        metadata: {},
        page: 1,
        pageSize: 12,
        sortKey: 'openedAt',
        sortDir: 'desc',
        refreshTimer: null,
        subtab: 'geral'
    };

    function esc(value) {
        return (value === null || value === undefined || value === '')
            ? 'Não disponível'
            : String(value).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
    }

    function parseDate(value) {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function toDateInput(date) {
        return date.toISOString().slice(0, 10);
    }

    function dateOnlyInSaoPaulo(date = new Date()) {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
        const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${map.year}-${map.month}-${map.day}`;
    }

    function formatDateTime(value) {
        const date = parseDate(value);
        if (!date) return 'Não disponível';
        return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: TZ }).format(date);
    }

    function formatDate(value) {
        const date = parseDate(value);
        if (!date) return 'Não disponível';
        return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: TZ }).format(date);
    }

    function diffMinutes(start, end) {
        const a = parseDate(start);
        const b = parseDate(end);
        if (!a || !b || b < a) return null;
        return Math.round((b - a) / 60000);
    }

    function formatDuration(minutes) {
        if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return 'Não disponível';
        if (minutes < 60) return `${minutes} minuto${minutes === 1 ? '' : 's'}`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours < 24) return mins ? `${hours} hora${hours === 1 ? '' : 's'} e ${mins} minuto${mins === 1 ? '' : 's'}` : `${hours} hora${hours === 1 ? '' : 's'}`;
        const days = Math.floor(hours / 24);
        const restHours = hours % 24;
        return restHours ? `${days} dia${days === 1 ? '' : 's'} e ${restHours} hora${restHours === 1 ? '' : 's'}` : `${days} dia${days === 1 ? '' : 's'}`;
    }

    function average(values) {
        const valid = values.filter(value => typeof value === 'number' && Number.isFinite(value));
        return valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null;
    }

    function startOfWeek(date) {
        const copy = new Date(date);
        const day = copy.getDay() || 7;
        copy.setDate(copy.getDate() - day + 1);
        copy.setHours(0, 0, 0, 0);
        return copy;
    }

    function endOfDay(date) {
        const copy = new Date(date);
        copy.setHours(23, 59, 59, 999);
        return copy;
    }

    function getField(id) {
        return document.getElementById(id);
    }

    function normalizeTicket(row) {
        const status = GLPI_STATUS[row.status_id] || row.status || 'Não disponível';
        const openedAt = row.opened_at || row.date || row.created_at;
        const solvedAt = row.solved_at || row.solvedate;
        const closedAt = row.closed_at || row.closedate;
        const assignedAt = row.assigned_at || row.date_assign;
        const firstResponseAt = row.first_response_at;
        return {
            id: row.glpi_id || row.id,
            title: row.title || row.name || `Chamado ${row.glpi_id || row.id}`,
            status,
            statusId: row.status_id,
            technician: row.technician_name || row.technician || 'Não disponível',
            technicianId: row.technician_id || null,
            group: row.group_name || row.group || 'Não disponível',
            requester: row.requester_name || row.requester || 'Não disponível',
            category: row.category_name || row.category || 'Não disponível',
            priority: row.priority_name || row.priority || 'Não disponível',
            urgency: row.urgency_name || row.urgency || 'Não disponível',
            impact: row.impact_name || row.impact || 'Não disponível',
            entity: row.entity_name || row.entity || 'Não disponível',
            unit: row.unit_name || row.unit || row.location_name || 'Não disponível',
            location: row.location_name || row.location || 'Não disponível',
            type: row.type_name || row.type || 'Não disponível',
            openedAt,
            assignedAt,
            firstResponseAt,
            solvedAt,
            closedAt,
            modifiedAt: row.modified_at || row.date_mod || openedAt,
            slaDueAt: row.sla_due_at || row.time_to_resolve,
            slaStatus: row.sla_status || calculateSlaStatus(row),
            pendingReason: row.pending_reason || 'Não disponível',
            glpiUrl: row.glpi_url || buildGlpiTicketUrl(row.glpi_id || row.id),
            sourceEnvironment: row.source_environment || 'real'
        };
    }

    function calculateSlaStatus(row) {
        const due = parseDate(row.sla_due_at || row.time_to_resolve);
        if (!due) return 'unavailable';
        if (row.solved_at || row.closed_at || row.solvedate || row.closedate) return 'ok';
        const now = new Date();
        const diff = (due - now) / 60000;
        if (diff < 0) return 'breached';
        if (diff <= 240) return 'warning';
        return 'ok';
    }

    function buildGlpiTicketUrl(id) {
        const base = state.metadata.web_url || state.metadata.base_url || '';
        if (!base || !id) return '';
        return `${base.replace(/\/+$/, '')}/front/ticket.form.php?id=${encodeURIComponent(id)}`;
    }

    function demoTickets() {
        const today = dateOnlyInSaoPaulo();
        const base = new Date(`${today}T10:00:00-03:00`);
        const technicians = ['Ana Souza', 'Bruno Lima', 'Carla Mendes', 'Diego Santos', 'Fernanda Alves'];
        const statuses = ['Novo', 'Atribuído', 'Planejado', 'Pendente', 'Solucionado', 'Fechado'];
        const categories = ['Sistemas', 'Rede', 'Impressão', 'Acesso', 'Equipamentos'];
        return Array.from({ length: 42 }, (_, index) => {
            const opened = new Date(base);
            opened.setDate(opened.getDate() - (index % 18));
            opened.setHours(8 + (index % 8), (index * 7) % 60, 0, 0);
            const status = statuses[index % statuses.length];
            const solved = STATUS_FINAL.has(status) ? new Date(opened.getTime() + (90 + index * 18) * 60000) : null;
            const closed = status === 'Fechado' && solved ? new Date(solved.getTime() + 120 * 60000) : null;
            const due = new Date(opened.getTime() + (8 + (index % 5) * 4) * 3600000);
            return normalizeTicket({
                glpi_id: 21000 + index,
                title: ['Instalação de equipamento', 'Falha de acesso', 'Atualização de sistema', 'Troca de periférico'][index % 4],
                status,
                technician_name: technicians[index % technicians.length],
                group_name: index % 3 === 0 ? 'Suporte N2' : 'Suporte N1',
                requester_name: ['Unidade Andaraí', 'Coordenação TI', 'Administrativo', 'Ambulatório'][index % 4],
                category_name: categories[index % categories.length],
                priority_name: ['Baixa', 'Média', 'Alta', 'Muito alta'][index % 4],
                urgency_name: ['Baixa', 'Média', 'Alta'][index % 3],
                impact_name: ['Baixo', 'Médio', 'Alto'][index % 3],
                entity_name: 'RioSaúde',
                unit_name: ['Hospital Municipal', 'UPA', 'CER', 'CAPS'][index % 4],
                location_name: ['1º andar', 'TI', 'Recepção', 'Farmácia'][index % 4],
                type_name: index % 2 ? 'Requisição' : 'Incidente',
                opened_at: opened.toISOString(),
                assigned_at: new Date(opened.getTime() + 35 * 60000).toISOString(),
                first_response_at: new Date(opened.getTime() + 55 * 60000).toISOString(),
                solved_at: solved?.toISOString(),
                closed_at: closed?.toISOString(),
                sla_due_at: due.toISOString(),
                pending_reason: index % 6 === 3 ? 'Aguardando retorno da unidade' : null,
                source_environment: 'demo'
            });
        });
    }

    async function loadTickets() {
        state.metadata = {
            glpi_version: GLPI_VERSION,
            api_enabled: 'A confirmar no endpoint /apirest.php/initSession',
            api_url: '/apirest.php',
            auth_method: 'App-Token + User-Token preferencial; login/senha apenas se autorizado',
            sync_strategy: 'Supabase Edge Function com cache em PostgreSQL e sincronização incremental por data de modificação',
            permissions: 'Usuário de API somente leitura com acesso aos chamados, usuários, grupos, entidades, categorias, SLAs e acompanhamentos necessários',
            base_url: ''
        };

        if (!window.supabase) {
            state.demo = true;
            state.tickets = demoTickets();
            state.syncLogs = [{ level: 'aviso', message: 'Supabase não configurado. Modo demonstração local ativado.', created_at: new Date().toISOString() }];
            return;
        }

        try {
            const { data: config } = await supabase.from('glpi_dashboard_settings').select('*').limit(1).maybeSingle();
            if (config) state.metadata = { ...state.metadata, ...config.public_metadata };

            const { data, error } = await supabase
                .from('glpi_tickets_dashboard')
                .select('*')
                .order('modified_at', { ascending: false })
                .limit(2000);
            if (error) throw error;

            const { data: logs } = await supabase
                .from('glpi_sync_logs')
                .select('level, message, records_processed, created_at')
                .order('created_at', { ascending: false })
                .limit(20);
            state.syncLogs = logs || [];

            if (!data || data.length === 0) {
                state.demo = true;
                state.tickets = demoTickets();
                state.syncLogs.unshift({ level: 'aviso', message: 'Nenhum chamado real sincronizado. Modo demonstração ativado sem gravar dados fictícios.', created_at: new Date().toISOString() });
            } else {
                state.demo = false;
                state.tickets = data.map(normalizeTicket);
            }
        } catch (error) {
            console.warn('Dashboard GLPI em modo demonstração:', error);
            state.demo = true;
            state.tickets = demoTickets();
            state.syncLogs = [{ level: 'erro', message: 'Não foi possível ler as tabelas GLPI. Modo demonstração ativado.', created_at: new Date().toISOString() }];
        }
    }

    function fillSelect(id, values, allLabel = 'Todos') {
        const select = getField(id);
        if (!select) return;
        const current = select.value;
        const options = [...new Set(values.filter(Boolean).filter(value => value !== 'Não disponível'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        select.innerHTML = `<option value="">${allLabel}</option>` + options.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
        select.value = options.includes(current) ? current : '';
    }

    function populateFilters() {
        fillSelect('glpi-filter-technician', state.tickets.map(ticket => ticket.technician), 'Todos');
        fillSelect('glpi-filter-group', state.tickets.map(ticket => ticket.group), 'Todos');
        fillSelect('glpi-filter-status', Object.values(GLPI_STATUS), 'Todos');
        fillSelect('glpi-filter-category', state.tickets.map(ticket => ticket.category), 'Todas');
        fillSelect('glpi-filter-priority', state.tickets.map(ticket => ticket.priority), 'Todas');
        fillSelect('glpi-filter-urgency', state.tickets.map(ticket => ticket.urgency), 'Todas');
        fillSelect('glpi-filter-impact', state.tickets.map(ticket => ticket.impact), 'Todos');
        fillSelect('glpi-filter-entity', state.tickets.map(ticket => ticket.entity), 'Todas');
        fillSelect('glpi-filter-unit', state.tickets.map(ticket => ticket.unit), 'Todas');
        fillSelect('glpi-filter-location', state.tickets.map(ticket => ticket.location), 'Todas');
        fillSelect('glpi-filter-type', state.tickets.map(ticket => ticket.type), 'Todos');
    }

    function currentFilters() {
        return {
            start: getField('glpi-filter-start')?.value,
            end: getField('glpi-filter-end')?.value,
            technician: getField('glpi-filter-technician')?.value,
            group: getField('glpi-filter-group')?.value,
            status: getField('glpi-filter-status')?.value,
            category: getField('glpi-filter-category')?.value,
            priority: getField('glpi-filter-priority')?.value,
            urgency: getField('glpi-filter-urgency')?.value,
            impact: getField('glpi-filter-impact')?.value,
            entity: getField('glpi-filter-entity')?.value,
            unit: getField('glpi-filter-unit')?.value,
            location: getField('glpi-filter-location')?.value,
            type: getField('glpi-filter-type')?.value,
            requester: getField('glpi-filter-requester')?.value?.trim().toLowerCase(),
            sla: getField('glpi-filter-sla')?.value
        };
    }

    function applyFilters() {
        const filters = currentFilters();
        const start = filters.start ? new Date(`${filters.start}T00:00:00`) : null;
        const end = filters.end ? new Date(`${filters.end}T23:59:59`) : null;
        state.filtered = state.tickets.filter(ticket => {
            const opened = parseDate(ticket.openedAt);
            if (start && opened && opened < start) return false;
            if (end && opened && opened > end) return false;
            if (filters.technician && ticket.technician !== filters.technician) return false;
            if (filters.group && ticket.group !== filters.group) return false;
            if (filters.status && ticket.status !== filters.status) return false;
            if (filters.category && ticket.category !== filters.category) return false;
            if (filters.priority && ticket.priority !== filters.priority) return false;
            if (filters.urgency && ticket.urgency !== filters.urgency) return false;
            if (filters.impact && ticket.impact !== filters.impact) return false;
            if (filters.entity && ticket.entity !== filters.entity) return false;
            if (filters.unit && ticket.unit !== filters.unit) return false;
            if (filters.location && ticket.location !== filters.location) return false;
            if (filters.type && ticket.type !== filters.type) return false;
            if (filters.sla && ticket.slaStatus !== filters.sla) return false;
            if (filters.requester && !ticket.requester.toLowerCase().includes(filters.requester)) return false;
            return true;
        });
        state.page = 1;
        renderAll();
    }

    function groupBy(items, keyFn) {
        return items.reduce((acc, item) => {
            const key = keyFn(item) || 'Não disponível';
            acc[key] = acc[key] || [];
            acc[key].push(item);
            return acc;
        }, {});
    }

    function countBy(items, keyFn) {
        return Object.entries(groupBy(items, keyFn)).map(([label, values]) => ({ label, value: values.length }));
    }

    function metricsFor(items) {
        const today = dateOnlyInSaoPaulo();
        const open = items.filter(ticket => STATUS_OPEN.has(ticket.status));
        const pending = items.filter(ticket => ticket.status === 'Pendente');
        const solvedToday = items.filter(ticket => ticket.solvedAt && dateOnlyInSaoPaulo(parseDate(ticket.solvedAt)) === today);
        const closedToday = items.filter(ticket => ticket.closedAt && dateOnlyInSaoPaulo(parseDate(ticket.closedAt)) === today);
        return {
            total: items.length,
            open: open.length,
            pending: pending.length,
            solvedToday: solvedToday.length,
            closedToday: closedToday.length,
            slaBreached: items.filter(ticket => ticket.slaStatus === 'breached').length,
            avgFirstResponse: average(items.map(ticket => diffMinutes(ticket.openedAt, ticket.firstResponseAt))),
            avgSolution: average(items.map(ticket => diffMinutes(ticket.openedAt, ticket.solvedAt))),
            avgClose: average(items.map(ticket => diffMinutes(ticket.openedAt, ticket.closedAt)))
        };
    }

    function renderDiagnostics() {
        const el = getField('glpi-diagnostic');
        if (!el) return;
        el.innerHTML = `
            <strong>Diagnóstico:</strong>
            versão GLPI ${GLPI_VERSION}; API REST esperada em <code>{GLPI_BASE_URL}/apirest.php</code>;
            autenticação por <code>App-Token</code> + <code>User-Token</code> preferencialmente;
            endpoints: <code>initSession</code>, <code>killSession</code>, <code>Ticket</code>, <code>Ticket/{id}/Ticket_User</code>, <code>User</code>, <code>Group</code>, <code>ITILCategory</code>, <code>Entity</code>, <code>Location</code> e campos de SLA do chamado.
            ${state.demo ? '<span class="glpi-demo-flag">Modo demonstração ativo: dados fictícios não são gravados no banco.</span>' : ''}
        `;
    }

    function renderKpis() {
        const m = metricsFor(state.filtered);
        const cards = [
            ['Chamados abertos', m.open, 'Não solucionados nem fechados'],
            ['Pendentes', m.pending, 'Status pendente no GLPI'],
            ['Finalizados hoje', m.solvedToday + m.closedToday, 'Soluções e fechamentos do dia'],
            ['SLA vencido', m.slaBreached, 'Prazo ultrapassado'],
            ['1ª resposta média', formatDuration(m.avgFirstResponse), 'Abertura até primeira resposta'],
            ['Solução média', formatDuration(m.avgSolution), 'Abertura até solução'],
            ['Fechamento médio', formatDuration(m.avgClose), 'Abertura até fechamento'],
            ['Base filtrada', m.total, 'Registros considerados']
        ];
        getField('glpi-kpis').innerHTML = cards.map(([label, value, hint]) => `
            <article class="glpi-kpi">
                <span>${esc(label)}</span>
                <strong>${esc(value)}</strong>
                <small>${esc(hint)}</small>
            </article>
        `).join('');
    }

    function renderBarChart(id, data, maxItems = 8) {
        const el = getField(id);
        if (!el) return;
        const ordered = data.sort((a, b) => b.value - a.value).slice(0, maxItems);
        const max = Math.max(...ordered.map(item => item.value), 1);
        el.innerHTML = ordered.length ? ordered.map(item => `
            <div class="glpi-bar-row">
                <span title="${esc(item.label)}">${esc(item.label)}</span>
                <div class="glpi-bar-track"><div class="glpi-bar-fill" style="width:${Math.round((item.value / max) * 100)}%"></div></div>
                <strong>${item.value}</strong>
            </div>
        `).join('') : '<p class="glpi-empty">Nenhum dado encontrado.</p>';
    }

    function renderLineChart() {
        const data = countBy(state.filtered, ticket => formatDate(ticket.openedAt)).sort((a, b) => {
            const [da, ma, ya] = a.label.split('/');
            const [db, mb, yb] = b.label.split('/');
            return new Date(`${ya}-${ma}-${da}`) - new Date(`${yb}-${mb}-${db}`);
        }).slice(-14);
        renderBarChart('glpi-chart-evolution', data, 14);
    }

    function technicianStats(items = state.filtered) {
        const groups = groupBy(items, ticket => ticket.technician);
        const today = dateOnlyInSaoPaulo();
        return Object.entries(groups).map(([name, tickets]) => {
            const solved = tickets.filter(ticket => ticket.solvedAt);
            const closed = tickets.filter(ticket => ticket.closedAt);
            const inProgress = tickets.filter(ticket => STATUS_OPEN.has(ticket.status));
            const attendedToday = tickets.filter(ticket => {
                const rule = getField('glpi-attended-rule')?.value || 'solved';
                if (rule === 'assigned') return ticket.assignedAt && dateOnlyInSaoPaulo(parseDate(ticket.assignedAt)) === today;
                if (rule === 'closed') return ticket.closedAt && dateOnlyInSaoPaulo(parseDate(ticket.closedAt)) === today;
                return ticket.solvedAt && dateOnlyInSaoPaulo(parseDate(ticket.solvedAt)) === today;
            });
            return {
                name,
                total: tickets.length,
                attendedToday: attendedToday.length,
                solved: solved.length,
                closed: closed.length,
                inProgress: inProgress.length,
                pending: tickets.filter(ticket => ticket.status === 'Pendente').length,
                avgFirstResponse: average(tickets.map(ticket => diffMinutes(ticket.openedAt, ticket.firstResponseAt))),
                avgAttendance: average(tickets.map(ticket => diffMinutes(ticket.assignedAt || ticket.openedAt, ticket.solvedAt))),
                avgSolution: average(tickets.map(ticket => diffMinutes(ticket.openedAt, ticket.solvedAt))),
                avgClose: average(tickets.map(ticket => diffMinutes(ticket.openedAt, ticket.closedAt))),
                sample: solved.length
            };
        }).sort((a, b) => b.total - a.total);
    }

    function renderRankings() {
        renderBarChart('glpi-chart-status', countBy(state.filtered, ticket => ticket.status));
        renderLineChart();
        renderBarChart('glpi-chart-sla', countBy(state.filtered, ticket => ({
            ok: 'Dentro do prazo',
            warning: 'Próximo do vencimento',
            breached: 'SLA vencido',
            unavailable: 'Não disponível'
        }[ticket.slaStatus] || 'Não disponível')));
        const totalToday = Math.max(technicianStats().reduce((sum, tech) => sum + tech.attendedToday, 0), 1);
        getField('glpi-ranking-productivity').innerHTML = technicianStats().slice(0, 8).map(tech => `
            <div class="glpi-rank-row">
                <strong>${esc(tech.name)}</strong>
                <span>${tech.attendedToday} atendidos hoje • ${Math.round((tech.attendedToday / totalToday) * 100)}%</span>
                <small>${tech.solved} solucionados • ${tech.inProgress} em andamento • média ${formatDuration(tech.avgSolution)}</small>
            </div>
        `).join('') || '<p class="glpi-empty">Nenhum técnico encontrado.</p>';
    }

    function renderTechnicians() {
        const totalToday = Math.max(technicianStats().reduce((sum, tech) => sum + tech.attendedToday, 0), 1);
        getField('glpi-technician-cards').innerHTML = technicianStats().map(tech => `
            <article class="glpi-tech-card">
                <div>
                    <h4>${esc(tech.name)}</h4>
                    <span>${tech.total} chamados no período • ${Math.round((tech.attendedToday / totalToday) * 100)}% do dia</span>
                </div>
                <dl>
                    <dt>Atendidos hoje</dt><dd>${tech.attendedToday}</dd>
                    <dt>Solucionados</dt><dd>${tech.solved}</dd>
                    <dt>Fechados</dt><dd>${tech.closed}</dd>
                    <dt>Em andamento</dt><dd>${tech.inProgress}</dd>
                    <dt>Pendentes</dt><dd>${tech.pending}</dd>
                    <dt>1ª resposta média</dt><dd>${formatDuration(tech.avgFirstResponse)}</dd>
                    <dt>Atendimento médio</dt><dd>${formatDuration(tech.avgAttendance)}</dd>
                    <dt>Solução média</dt><dd>${formatDuration(tech.avgSolution)}</dd>
                    <dt>Fechamento médio</dt><dd>${formatDuration(tech.avgClose)}</dd>
                    <dt>Amostra</dt><dd>${tech.sample || 'Não disponível'}</dd>
                </dl>
            </article>
        `).join('') || '<p class="glpi-empty">Nenhum técnico encontrado.</p>';
    }

    function sortedTicketsForTable() {
        const search = getField('glpi-ticket-search')?.value?.trim().toLowerCase();
        const source = search
            ? state.filtered.filter(ticket => [ticket.id, ticket.title, ticket.status, ticket.technician, ticket.group, ticket.requester, ticket.category].join(' ').toLowerCase().includes(search))
            : [...state.filtered];
        return source.sort((a, b) => {
            const va = a[state.sortKey] || '';
            const vb = b[state.sortKey] || '';
            const result = String(va).localeCompare(String(vb), 'pt-BR', { numeric: true });
            return state.sortDir === 'asc' ? result : -result;
        });
    }

    function renderTicketTable() {
        const rows = sortedTicketsForTable();
        const totalPages = Math.max(Math.ceil(rows.length / state.pageSize), 1);
        if (state.page > totalPages) state.page = totalPages;
        const pageRows = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
        getField('glpi-ticket-table').innerHTML = pageRows.map(ticket => `
            <tr>
                <td><strong>${esc(ticket.id)}</strong></td>
                <td>${esc(ticket.title)}</td>
                <td><span class="glpi-pill">${esc(ticket.status)}</span></td>
                <td>${esc(ticket.technician)}</td>
                <td>${esc(ticket.group)}</td>
                <td>${esc(ticket.requester)}</td>
                <td>${esc(ticket.category)}</td>
                <td>${esc(ticket.priority)}</td>
                <td>${esc(ticket.entity)}</td>
                <td>${esc(ticket.unit)}<br><small>${esc(ticket.location)}</small></td>
                <td>${formatDateTime(ticket.openedAt)}</td>
                <td>${formatDateTime(ticket.assignedAt)}</td>
                <td>${formatDateTime(ticket.firstResponseAt)}</td>
                <td>${formatDateTime(ticket.solvedAt)}</td>
                <td>${formatDateTime(ticket.closedAt)}</td>
                <td>${formatDuration(diffMinutes(ticket.openedAt, new Date()))}</td>
                <td>${formatDuration(diffMinutes(ticket.assignedAt || ticket.openedAt, ticket.solvedAt || ticket.closedAt))}</td>
                <td>${formatDateTime(ticket.slaDueAt)}</td>
                <td>${esc({ ok: 'Dentro do prazo', warning: 'Próximo do vencimento', breached: 'Vencido', unavailable: 'Não disponível' }[ticket.slaStatus])}</td>
                <td>${ticket.glpiUrl ? `<a href="${esc(ticket.glpiUrl)}" target="_blank" rel="noopener">Abrir</a>` : 'Não disponível'}</td>
            </tr>
        `).join('') || '<tr><td colspan="20" style="text-align:center;">Nenhum chamado encontrado.</td></tr>';
        getField('glpi-page-info').textContent = `Página ${state.page} de ${totalPages} • ${rows.length} registros`;
    }

    function renderReportPreview() {
        const m = metricsFor(state.filtered);
        getField('glpi-report-preview').innerHTML = `
            <h4>Resumo executivo</h4>
            <p>Período com ${m.total} chamados considerados, ${m.open} ainda abertos, ${m.pending} pendentes e ${m.slaBreached} com SLA vencido.</p>
            <p>Tempo médio de primeira resposta: <strong>${formatDuration(m.avgFirstResponse)}</strong>. Tempo médio de solução: <strong>${formatDuration(m.avgSolution)}</strong>.</p>
            <p class="glpi-muted">O PDF inclui logotipo quando disponível no projeto, período analisado, emissão em ${formatDateTime(new Date())}, indicadores, gráficos, tabelas e este resumo.</p>
        `;
    }

    function renderConfig() {
        getField('glpi-config-summary').innerHTML = `
            <dt>Versão identificada</dt><dd>GLPI ${GLPI_VERSION}</dd>
            <dt>API REST</dt><dd>${esc(state.metadata.api_enabled)}</dd>
            <dt>URL da API</dt><dd><code>{GLPI_BASE_URL}/apirest.php</code></dd>
            <dt>Credenciais necessárias</dt><dd>GLPI_BASE_URL, GLPI_APP_TOKEN e GLPI_USER_TOKEN; alternativa controlada: GLPI_LOGIN e GLPI_PASSWORD.</dd>
            <dt>OAuth</dt><dd>Não adotado para GLPI 10.0.18 neste MVP.</dd>
            <dt>Banco próprio</dt><dd>PostgreSQL/Supabase, com tabelas de tickets, configurações, favoritos e logs.</dd>
            <dt>Tempo real</dt><dd>Sincronização incremental por data de modificação, cache no banco e atualização automática configurável.</dd>
        `;
    }

    function renderMonitoring() {
        const last = state.syncLogs[0];
        getField('glpi-sync-summary').innerHTML = `
            <dt>Conexão</dt><dd>${state.demo ? 'Modo demonstração ou aguardando configuração' : 'Dados reais disponíveis'}</dd>
            <dt>Última sincronização</dt><dd>${last ? formatDateTime(last.created_at) : 'Não disponível'}</dd>
            <dt>Registros carregados</dt><dd>${state.tickets.length}</dd>
            <dt>Erros recentes</dt><dd>${state.syncLogs.filter(log => log.level === 'erro').length}</dd>
        `;
        getField('glpi-sync-logs').innerHTML = state.syncLogs.map(log => `
            <div class="glpi-log ${esc(log.level)}">
                <strong>${esc(log.level || 'info')}</strong>
                <span>${esc(log.message)}</span>
                <small>${formatDateTime(log.created_at)}${log.records_processed ? ` • ${log.records_processed} registros` : ''}</small>
            </div>
        `).join('') || '<p class="glpi-empty">Nenhum log registrado.</p>';
    }

    function renderStatus() {
        const status = getField('glpi-connection-status');
        status.textContent = state.demo ? 'Demonstração' : 'Conectado ao cache GLPI';
        status.className = `glpi-status-badge ${state.demo ? 'warning' : 'ok'}`;
        const last = state.syncLogs[0]?.created_at || new Date();
        getField('glpi-last-update').textContent = `Última atualização: ${formatDateTime(last)}`;
    }

    function renderAll() {
        renderDiagnostics();
        renderStatus();
        renderKpis();
        renderRankings();
        renderTechnicians();
        renderTicketTable();
        renderReportPreview();
        renderConfig();
        renderMonitoring();
    }

    async function refreshData(triggerSync = false) {
        if (triggerSync && window.supabase?.functions && !state.demo) {
            const { error } = await supabase.functions.invoke('glpi-dashboard', { body: { action: 'sync-incremental' } });
            if (error) mostrarAviso('Falha na solicitação de sincronização. Verifique o monitoramento.', 'erro');
        }
        await loadTickets();
        populateFilters();
        applyFilters();
    }

    function setDefaultPeriod() {
        if (getField('glpi-filter-start')?.value) return;
        window.glpiAplicarPresetPeriodo('ultimos7');
        getField('glpi-filter-preset').value = 'ultimos7';
    }

    window.inicializarDashboardGlpi = async function () {
        if (state.initialized) {
            renderAll();
            return;
        }
        state.initialized = true;
        await refreshData(false);
        setDefaultPeriod();
        applyFilters();
        window.glpiAtualizarIntervaloSincronizacao();
    };

    window.glpiAbrirSubaba = function (name) {
        state.subtab = name;
        document.querySelectorAll('.glpi-subtab').forEach(btn => btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(`'${name}'`)));
        document.querySelectorAll('.glpi-view').forEach(view => view.classList.add('hidden'));
        getField(`glpi-view-${name}`)?.classList.remove('hidden');
    };

    window.glpiAplicarPresetPeriodo = function (preset) {
        const today = new Date(`${dateOnlyInSaoPaulo()}T12:00:00`);
        let start = new Date(today);
        let end = new Date(today);
        if (preset === 'ontem') start.setDate(start.getDate() - 1), end.setDate(end.getDate() - 1);
        if (preset === 'ultimos7') start.setDate(start.getDate() - 6);
        if (preset === 'semanaAtual') start = startOfWeek(today);
        if (preset === 'semanaAnterior') { start = startOfWeek(today); start.setDate(start.getDate() - 7); end = new Date(start); end.setDate(end.getDate() + 6); }
        if (preset === 'mesAtual') start = new Date(today.getFullYear(), today.getMonth(), 1);
        if (preset === 'mesAnterior') { start = new Date(today.getFullYear(), today.getMonth() - 1, 1); end = new Date(today.getFullYear(), today.getMonth(), 0); }
        if (preset === 'anoAtual') start = new Date(today.getFullYear(), 0, 1);
        if (!preset) return;
        getField('glpi-filter-start').value = toDateInput(start);
        getField('glpi-filter-end').value = toDateInput(endOfDay(end));
        applyFilters();
    };

    window.glpiAplicarFiltros = applyFilters;

    window.glpiLimparFiltros = function () {
        document.querySelectorAll('#aba-glpi input, #aba-glpi select').forEach(field => {
            if (field.id === 'glpi-sync-interval' || field.id === 'glpi-attended-rule') return;
            field.value = '';
        });
        state.page = 1;
        applyFilters();
    };

    window.glpiSalvarFiltroFavorito = async function () {
        const payload = { name: `Filtro ${formatDateTime(new Date())}`, filters: currentFilters() };
        try {
            if (!window.supabase || state.demo) throw new Error('Favoritos reais exigem Supabase configurado.');
            const { error } = await supabase.from('glpi_filter_favorites').insert(payload);
            if (error) throw error;
            mostrarAviso('Filtro favorito salvo.', 'sucesso');
        } catch (error) {
            localStorage.setItem('glpiFiltroFavorito', JSON.stringify(payload));
            mostrarAviso('Filtro salvo localmente enquanto o banco GLPI não está disponível.', 'aviso');
        }
    };

    window.glpiAtualizarAgora = async function () {
        mostrarAviso('Atualizando dados do GLPI...', 'aviso');
        await refreshData(true);
        mostrarAviso('Dashboard GLPI atualizado.', 'sucesso');
    };

    window.glpiAtualizarIntervaloSincronizacao = function () {
        clearInterval(state.refreshTimer);
        const interval = Number(getField('glpi-sync-interval')?.value || 60000);
        state.refreshTimer = setInterval(() => {
            const aba = getField('aba-glpi');
            if (aba && !aba.classList.contains('hidden')) refreshData(!state.demo);
        }, interval);
    };

    window.glpiOrdenarTabela = function (key) {
        if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else state.sortKey = key, state.sortDir = 'asc';
        renderTicketTable();
    };

    window.glpiRenderizarTabelaChamados = renderTicketTable;

    window.glpiMudarPagina = function (direction) {
        const total = Math.max(Math.ceil(sortedTicketsForTable().length / state.pageSize), 1);
        state.page = Math.min(Math.max(state.page + direction, 1), total);
        renderTicketTable();
    };

    function rowsForExport() {
        return sortedTicketsForTable().map(ticket => ({
            ID: ticket.id,
            Titulo: ticket.title,
            Status: ticket.status,
            Tecnico: ticket.technician,
            Grupo: ticket.group,
            Requerente: ticket.requester,
            Categoria: ticket.category,
            Prioridade: ticket.priority,
            Entidade: ticket.entity,
            Unidade: ticket.unit,
            Localizacao: ticket.location,
            Abertura: formatDateTime(ticket.openedAt),
            Atribuicao: formatDateTime(ticket.assignedAt),
            PrimeiraResposta: formatDateTime(ticket.firstResponseAt),
            Solucao: formatDateTime(ticket.solvedAt),
            Fechamento: formatDateTime(ticket.closedAt),
            TempoAberto: formatDuration(diffMinutes(ticket.openedAt, new Date())),
            TempoAtendimento: formatDuration(diffMinutes(ticket.assignedAt || ticket.openedAt, ticket.solvedAt || ticket.closedAt)),
            SLA: formatDateTime(ticket.slaDueAt),
            SituacaoSLA: { ok: 'Dentro do prazo', warning: 'Próximo do vencimento', breached: 'Vencido', unavailable: 'Não disponível' }[ticket.slaStatus]
        }));
    }

    function downloadBlob(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    window.glpiExportar = function (format) {
        const rows = rowsForExport();
        const stamp = dateOnlyInSaoPaulo().replaceAll('-', '');
        if (!rows.length) return mostrarAviso('Nenhum chamado encontrado para exportar.', 'aviso');
        if (format === 'pdf') {
            const source = document.getElementById('aba-glpi');
            if (!window.html2pdf || !source) return mostrarAviso('Gerador de PDF indisponível.', 'erro');
            return html2pdf().set({
                margin: 8,
                filename: `Relatorio_GLPI_RioSaude_${stamp}.pdf`,
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
            }).from(source).save();
        }
        const headers = Object.keys(rows[0]);
        const csv = ['\ufeff' + headers.join(';')]
            .concat(rows.map(row => headers.map(header => `"${String(row[header] ?? '').replace(/"/g, '""')}"`).join(';')))
            .join('\n');
        downloadBlob(csv, `Chamados_GLPI_RioSaude_${stamp}.${format === 'xlsx' ? 'xls' : 'csv'}`, 'text/csv;charset=utf-8;');
        mostrarAviso('Exportação gerada com os filtros atuais.', 'sucesso');
    };
})();

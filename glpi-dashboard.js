// Dashboard GLPI: camada de apresentação, filtros, métricas e exportações.
(function () {
    const CORE = window.GLPI_DASHBOARD_CORE;
    if (!CORE) throw new Error('Módulo de regras do Dashboard GLPI não carregado.');
    const TZ = CORE.TIME_ZONE;
    const GLPI_VERSION = '10.0.18';
    const DAILY_REFRESH_SECONDS = 30;
    const SYNC_STALE_TOLERANCE_SECONDS = DAILY_REFRESH_SECONDS * 3;
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
        dailyAssignments: [],
        filtered: [],
        syncLogs: [],
        metadata: {},
        integrationState: null,
        page: 1,
        pageSize: 12,
        sortKey: 'openedAt',
        sortDir: 'desc',
        refreshTimer: null,
        countdownTimer: null,
        secondsToRefresh: DAILY_REFRESH_SECONDS,
        refreshing: false,
        lastUpdatedAt: null,
        subtab: 'diario',
        panelMode: false,
        menuCollapsedBeforePanel: null,
        publicMode: false,
        serverTimeOffsetMs: 0,
        serverTimeVerified: false,
        publicConfig: {},
        localConfig: {},
        serviceChecking: false,
        serviceChecks: { supabase: null, glpi: null }
    };

    const DEFAULT_PUBLIC_CONFIG = Object.freeze({
        enabled: false,
        token: '',
        techMode: 'first',
        showTitle: false,
        showCategory: true,
        showUnit: true
    });
    const DEFAULT_LOCAL_CONFIG = Object.freeze({
        integrationEnabled: true,
        demoEnabled: false,
        dailyRecentLimit: 10
    });

    function esc(value) {
        return (value === null || value === undefined || value === '')
            ? 'Não disponível'
            : String(value)
                .replace(/(?:&#0*62;?|&gt;)/gi, '')
                .replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
    }

    function publicSupabaseConfig() {
        const config = window.GESTAO_TI_CONFIG || {};
        const url = String(config.SUPABASE_URL || '').replace(/\/+$/, '');
        const projectRef = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/i)?.[1] || '';
        return { url, projectRef, publicKey: String(config.SUPABASE_PUBLIC_KEY || '') };
    }

    async function fetchPublicDashboard() {
        const { url, publicKey } = publicSupabaseConfig();
        if (!url || !publicKey) throw new Error('Back-end público não configurado.');
        const response = await fetch(`${url}/functions/v1/glpi-dashboard`, {
            method: 'POST',
            headers: {
                apikey: publicKey,
                Authorization: `Bearer ${publicKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'public-dashboard' }),
            cache: 'no-store'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) throw new Error('Dashboard público indisponível.');
        return data;
    }

    function safeExternalUrl(value) {
        try {
            const url = new URL(String(value || ''));
            return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
        } catch {
            return '';
        }
    }

    function openExternal(value) {
        const url = safeExternalUrl(value);
        if (!url) return false;
        window.open(url, '_blank', 'noopener,noreferrer');
        return true;
    }

    function serviceStatus(id, status) {
        const field = getField(id);
        if (!field) return;
        const map = {
            connected: ['Conectado', 'ok'],
            disconnected: ['Não conectado', 'error'],
            incomplete: ['Configuração incompleta', 'warning']
        };
        const [label, className] = map[status] || map.incomplete;
        field.textContent = label;
        field.className = `glpi-status-badge ${className}`;
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
        return CORE.dateOnlyInTimeZone(date);
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

    function readJsonStorage(key, fallback = {}) {
        try {
            return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') };
        } catch (_) {
            return { ...fallback };
        }
    }

    function loadLocalConfig() {
        state.localConfig = readJsonStorage('glpiDashboardLocalConfig', DEFAULT_LOCAL_CONFIG);
        return state.localConfig;
    }

    function canTriggerSync() {
        const role = String(window.perfilAtual?.role || '').toLowerCase();
        return !window.GESTAO_TI_PUBLIC_DASHBOARD
            && ['admin', 'gestor'].includes(role)
            && state.localConfig.integrationEnabled !== false
            && state.localConfig.demoEnabled !== true;
    }

    function saveJsonStorage(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function generatePublicToken() {
        const bytes = new Uint8Array(24);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function isBetween(value, start, end) {
        return CORE.isBetween(value, start, end);
    }

    function technicianDisplayName(name) {
        return name || 'Não disponível';
    }

    function normalizeTicket(row) {
        const raw = row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload : row;
        const currentTechnicians = Array.isArray(raw._dashboard_technicians)
            ? raw._dashboard_technicians.map(technician => ({
                id: Number(technician.id) || null,
                name: technician.name || 'Não disponível'
            }))
            : [];
        const technicalGroups = Array.isArray(raw._dashboard_technical_groups)
            ? raw._dashboard_technical_groups
            : [];
        const solutionTechnician = raw._dashboard_solution_technician || {
            id: row.solution_technician_id,
            name: row.solution_technician_name
        };
        const status = GLPI_STATUS[row.status_id] || row.status || 'Não disponível';
        const openedAt = row.opened_at || row.date || row.created_at;
        const solvedAt = row.solved_at || row.solvedate;
        const closedAt = row.closed_at || row.closedate;
        const assignedAt = row.assigned_at || row.date_assign;
        const firstResponseAt = row.first_response_at;
        return {
            id: row.glpi_id || row.id,
            title: row.title || row.name || `Chamado #${row.glpi_id || row.id}`,
            status,
            statusId: row.status_id,
            technician: row.technician_name || row.technician || 'Não disponível',
            technicianId: row.technician_id || null,
            currentTechnicians,
            currentTechnicianCount: currentTechnicians.length,
            solutionTechnician: solutionTechnician.name || null,
            solutionTechnicianId: Number(solutionTechnician.id) || null,
            group: row.group_name || row.group || 'Não disponível',
            groupId: Number(row.group_id) || null,
            technicalGroupIds: technicalGroups.map(group => Number(group.id)).filter(Number.isFinite),
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
            firstAssignedAt: assignedAt,
            firstResponseAt,
            solvedAt,
            closedAt,
            modifiedAt: row.modified_at || row.date_mod || openedAt,
            slaDueAt: row.sla_due_at || row.time_to_resolve,
            attentionDueAt: row.attention_due_at || row.time_to_own,
            internalSlaDueAt: row.internal_sla_due_at || row.internal_time_to_resolve,
            internalAttentionDueAt: row.internal_attention_due_at || row.internal_time_to_own,
            slaStatus: row.sla_status || calculateSlaStatus(row),
            pendingReason: row.pending_reason || 'Não disponível',
            glpiUrl: row.glpi_url || buildGlpiTicketUrl(row.glpi_id || row.id),
            sourceEnvironment: row.source_environment || 'real'
        };
    }

    function normalizeAssignment(row) {
        return {
            id: row.ticket_glpi_id,
            technician: row.technician_name || 'Não disponível',
            technicianId: row.technician_id || null,
            assignedAt: row.assigned_at || null
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
        state.publicMode = Boolean(window.GESTAO_TI_PUBLIC_DASHBOARD);
        state.publicConfig = readJsonStorage('glpiPublicDashboardConfig', DEFAULT_PUBLIC_CONFIG);
        loadLocalConfig();
        state.metadata = {
            glpi_version: GLPI_VERSION,
            api_enabled: 'A confirmar no endpoint /apirest.php/initSession',
            api_url: '/apirest.php',
            auth_method: 'App-Token + User-Token preferencial; login/senha apenas se autorizado',
            sync_strategy: 'Supabase Edge Function com cache em PostgreSQL e sincronização incremental por data de modificação',
            permissions: 'Usuário de API somente leitura com acesso aos chamados, usuários, grupos, entidades, categorias, SLAs e acompanhamentos necessários',
            base_url: ''
        };

        if (state.publicMode) {
            state.demo = false;
            const data = await fetchPublicDashboard();
            const checkedAt = parseDate(data.checkedAt);
            if (checkedAt) {
                state.serverTimeOffsetMs = checkedAt.getTime() - Date.now();
                state.serverTimeVerified = true;
            }
            state.tickets = (data.tickets || []).map(normalizeTicket);
            state.dailyAssignments = [];
            state.integrationState = data.integrationState || { status: 'offline' };
            state.syncLogs = [];
            return;
        }

        if (state.localConfig.demoEnabled) {
            state.demo = true;
            state.tickets = demoTickets();
            state.dailyAssignments = state.tickets;
            state.syncLogs = [{ level: 'aviso', message: 'Modo demonstração ativado explicitamente na configuração local.', created_at: new Date().toISOString() }];
            return;
        }

        if (state.demo) {
            state.tickets = [];
            state.dailyAssignments = [];
        }
        state.demo = false;

        if (!window.supabase) {
            state.integrationState = { ...(state.integrationState || {}), status: 'offline' };
            state.syncLogs = [{ level: 'erro', message: 'Supabase não configurado. Nenhum dado fictício foi carregado.', created_at: new Date().toISOString() }];
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

            const { start: shiftStart, end: shiftEnd } = CORE.currentShift();
            const { data: assignmentRows, error: assignmentError } = await supabase
                .from('glpi_ticket_assignments_dashboard')
                .select('ticket_glpi_id, technician_id, technician_name, assigned_at')
                .gte('assigned_at', shiftStart.toISOString())
                .lt('assigned_at', shiftEnd.toISOString())
                .limit(5000);
            if (!assignmentError) state.dailyAssignments = (assignmentRows || []).map(normalizeAssignment);
            else console.warn('Atribuições detalhadas ainda não estão disponíveis; usando dados do chamado.');

            const { data: logs } = await supabase
                .from('glpi_sync_logs')
                .select('level, message, records_processed, created_at')
                .order('created_at', { ascending: false })
                .limit(20);
            state.syncLogs = logs || [];

            const { data: integrationState } = await supabase
                .from('glpi_sync_state')
                .select('status, last_started_at, last_success_at, last_error_at, last_cursor, last_records_processed, updated_at')
                .eq('id', 1)
                .maybeSingle();
            if (integrationState) state.integrationState = integrationState;

            if ((!data || data.length === 0) && !state.tickets.length) {
                state.tickets = [];
                state.dailyAssignments = [];
                state.syncLogs.unshift({ level: 'aviso', message: 'Nenhum chamado real foi sincronizado. Nenhum dado fictício foi carregado.', created_at: new Date().toISOString() });
            } else if (data?.length) {
                state.demo = false;
                state.tickets = data.map(normalizeTicket);
            }
        } catch (error) {
            console.warn('Dashboard GLPI offline; detalhes sensíveis não foram registrados.', error?.name || 'Erro');
            state.demo = false;
            state.integrationState = { ...(state.integrationState || {}), status: 'offline' };
            state.syncLogs = [{ level: 'erro', message: 'Não foi possível ler as tabelas GLPI. Últimos dados válidos preservados quando disponíveis.', created_at: new Date().toISOString() }];
            if (!state.tickets.length) {
                state.tickets = [];
                state.dailyAssignments = [];
                state.syncLogs[0].message = 'Não foi possível ler as tabelas GLPI. Nenhum dado fictício foi carregado.';
            }
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

    function countActiveFilters(filters = currentFilters()) {
        return Object.entries(filters)
            .filter(([key, value]) => key !== 'start' && key !== 'end' && value)
            .length + (filters.start || filters.end ? 1 : 0);
    }

    function renderActiveFilterCount() {
        const count = countActiveFilters();
        const badge = getField('glpi-active-filter-count');
        const drawer = getField('glpi-filter-drawer-count');
        if (badge) badge.textContent = count;
        if (drawer) drawer.textContent = `Filtros ativos: ${count}`;
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
        renderActiveFilterCount();
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

    function hasRecordedSolution(ticket) {
        const statusId = Number(ticket?.statusId);
        const resolvedStatus =
            statusId === CORE.STATUS_CODE.SOLVED
            || statusId === CORE.STATUS_CODE.CLOSED;
        return resolvedStatus && Boolean(parseDate(ticket?.solvedAt));
    }

    function renderDailyTimers(reference = new Date()) {
        document.querySelectorAll('.glpi-ticket-time[data-ticket-id][data-time-kind]').forEach((element) => {
            const ticket = state.tickets.find((item) => String(item.id) === element.dataset.ticketId);
            const valueElement = element.querySelector('.glpi-ticket-time-value') || element;
            if (!ticket) {
                valueElement.textContent = 'Não disponível';
                element.querySelector('.ticket-solved-label')?.remove();
                element.querySelector('.ticket-overdue-label')?.remove();
                return;
            }
            const durations = CORE.calculateTicketDurations(ticket, reference);
            const field = {
                assignment: 'assignmentSeconds',
                solution: 'solutionSeconds',
                total: 'totalSeconds'
            }[element.dataset.timeKind];
            valueElement.textContent = CORE.formatElapsedTime(durations[field]);

            if (element.dataset.timeKind !== 'total') return;
            const solvedLabel = element.querySelector('.ticket-solved-label');
            const overdueLabel = element.querySelector('.ticket-overdue-label');
            const flags = CORE.calculateTicketFlags(ticket, reference);
            if (flags.isOverdue) {
                solvedLabel?.remove();
                if (overdueLabel) return;
                const label = document.createElement('span');
                label.className = 'ticket-overdue-label';
                label.textContent = 'CHAMADO ATRASADO';
                element.append(label);
                return;
            }
            overdueLabel?.remove();
            if (!hasRecordedSolution(ticket)) {
                solvedLabel?.remove();
                return;
            }
            if (solvedLabel) return;
            const label = document.createElement('span');
            label.className = 'ticket-solved-label';
            label.textContent = 'SOLUCIONADO';
            element.append(label);
        });
    }

    function dailyCard([labelText, value, hint]) {
        return `
            <article class="glpi-kpi glpi-daily-kpi">
                <span class="glpi-kpi-title">${esc(labelText)}</span>
                <strong>${esc(value)}</strong>
                <small>${esc(hint)}</small>
            </article>
        `;
    }

    function renderDailyDashboard() {
        const groupId = 1;
        const metrics = CORE.shiftMetrics(state.tickets, new Date(), groupId);
        const { createdInShift, inServiceNow, waitingNow, pendingNow, breachedNow } = metrics;
        const shift = getField('glpi-current-shift');
        if (shift) {
            shift.innerHTML = `
                <strong>Plantão atual: ${esc(metrics.type)} — ${esc(metrics.label)}</strong>
                <span>${esc(formatDateTime(metrics.start))} até ${esc(formatDateTime(metrics.end))} • Grupo SUPORTE TI</span>
            `;
        }

        const cards = [
            ['Chamados abertos', createdInShift.length, `${metrics.label} • SUPORTE TI`],
            ['Em atendimento', inServiceNow.length, 'Não finalizados com técnico atribuído'],
            ['Aguardando atendimento', waitingNow.length, 'Não finalizados sem técnico atribuído'],
            ['Chamados estourados', breachedNow.length, 'Prazo real SLA/OLA ultrapassado'],
            ['Pendentes', pendingNow.length, 'Chamados colocados como pendentes']
        ];

        getField('glpi-daily-kpis').innerHTML = cards
            .map((card) => dailyCard(card))
            .join('');

        const techRows = CORE.technicianResolutionsInShift(state.tickets, new Date(), groupId);

        renderBarChart('glpi-daily-technicians', techRows.map(tech => ({
            label: technicianDisplayName(tech.label),
            value: tech.value
        })), 20);

        const reference = new Date();
        const recent = CORE.sortDailyDashboardTickets(createdInShift, reference)
            .slice(0, Number(state.localConfig.dailyRecentLimit) || 10);
        getField('glpi-daily-recent').innerHTML = recent.length ? `
            <div class="glpi-daily-ticket glpi-daily-ticket-head" aria-hidden="true">
                <strong>Chamado</strong><span>Título</span><span>Status</span><span>Técnico</span><span>Abertura</span>
                <span>Tempo de atribuição</span><span>Tempo de solução</span><span>Tempo total</span>
            </div>
            ${recent.map(ticket => {
                const visible = state.publicMode ? CORE.publicTicket(ticket, state.publicConfig) : ticket;
                return `
                <article class="glpi-daily-ticket" data-ticket-id="${esc(ticket.id)}" data-operational-priority="${CORE.dailyDashboardTicketPriority(ticket, reference)}">
                    <strong>#${esc(visible.id)}</strong>
                    <span data-label="Título">${esc(visible.title || `Chamado #${ticket.id}`)}</span>
                    <span data-label="Status">${esc(visible.status)}</span>
                    <span data-label="Técnico">${esc(CORE.hasAssignedTechnician(ticket) ? technicianDisplayName(visible.technician) : 'Aguardando atendimento')}</span>
                    <time data-label="Abertura">${new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short', timeZone: TZ }).format(parseDate(visible.openedAt))}</time>
                    <span class="glpi-ticket-time" data-label="Tempo de atribuição" data-ticket-id="${esc(ticket.id)}" data-time-kind="assignment">Não disponível</span>
                    <span class="glpi-ticket-time" data-label="Tempo de solução" data-ticket-id="${esc(ticket.id)}" data-time-kind="solution">Não disponível</span>
                    <span class="glpi-ticket-time glpi-ticket-total" data-label="Tempo total" data-ticket-id="${esc(ticket.id)}" data-time-kind="total"><span class="glpi-ticket-time-value">Não disponível</span></span>
                </article>
            `; }).join('')}` : '<p class="glpi-empty">Nenhum chamado aberto neste plantão.</p>';
        renderDailyTimers();
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
        const glpiCheck = state.serviceChecks.glpi;
        getField('glpi-config-summary').innerHTML = `
            <dt>Versão identificada</dt><dd>GLPI ${esc(glpiCheck?.glpiVersion || state.metadata.glpi_version || GLPI_VERSION)}</dd>
            <dt>API REST</dt><dd>${esc(state.metadata.api_enabled)}</dd>
            <dt>URL da API</dt><dd><code>{GLPI_BASE_URL}/apirest.php</code></dd>
            <dt>URL base do GLPI</dt><dd>${esc(state.metadata.base_url || 'Configurada por GLPI_BASE_URL no back-end')}</dd>
            <dt>App-Token</dt><dd>${glpiCheck ? (glpiCheck.credentials?.appToken ? 'Configurado' : 'Não configurado') : 'A confirmar no back-end'}</dd>
            <dt>User-Token</dt><dd>${glpiCheck ? (glpiCheck.credentials?.userToken ? 'Configurado' : 'Não configurado') : 'A confirmar no back-end'}</dd>
            <dt>Entidade</dt><dd>${esc(state.metadata.entity_id || 'Não disponível')}</dd>
            <dt>Perfil</dt><dd>${esc(state.metadata.profile_id || 'Não disponível')}</dd>
            <dt>Credenciais necessárias</dt><dd>GLPI_BASE_URL, GLPI_APP_TOKEN e GLPI_USER_TOKEN; alternativa controlada: GLPI_LOGIN e GLPI_PASSWORD.</dd>
            <dt>OAuth</dt><dd>Não adotado para GLPI 10.0.18 neste MVP.</dd>
            <dt>Banco próprio</dt><dd>PostgreSQL/Supabase, com tabelas de tickets, configurações, favoritos e logs.</dd>
            <dt>Tempo real</dt><dd>Sincronização incremental por data de modificação, cache no banco e atualização automática configurável.</dd>
        `;
        renderServiceConnections();
        renderConfigFields();
    }

    function renderServiceConnections() {
        const supabaseConfig = publicSupabaseConfig();
        const supabaseCheck = state.serviceChecks.supabase;
        const supabaseConfigured = Boolean(supabaseConfig.url && supabaseConfig.projectRef && supabaseConfig.publicKey);
        serviceStatus('glpi-supabase-service-status', supabaseCheck?.ok ? 'connected' : (supabaseConfigured ? 'incomplete' : 'disconnected'));
        getField('glpi-supabase-service-details').innerHTML = `
            <dt>Project Reference</dt><dd>${esc(supabaseConfig.projectRef || 'Não configurado')}</dd>
            <dt>URL do projeto</dt><dd>${esc(supabaseConfig.url || 'Não configurada')}</dd>
            <dt>Sessão autenticada</dt><dd>${supabaseCheck ? (supabaseCheck.authenticated ? 'Sim' : 'Não') : 'Não verificada'}</dd>
            <dt>Última verificação</dt><dd>${supabaseCheck?.checkedAt ? formatDateTime(supabaseCheck.checkedAt) : 'Não realizada'}</dd>
        `;

        const glpiCheck = state.serviceChecks.glpi;
        const baseUrl = glpiCheck?.baseUrl || state.metadata.base_url || '';
        const hasKnownConfiguration = Boolean(baseUrl || glpiCheck?.configured);
        serviceStatus('glpi-glpi-service-status', glpiCheck?.ok && glpiCheck.apiRest === 'online'
            ? 'connected'
            : (glpiCheck?.failed ? 'disconnected' : (hasKnownConfiguration ? 'incomplete' : 'incomplete')));
        getField('glpi-glpi-service-details').innerHTML = `
            <dt>URL da instância</dt><dd>${esc(baseUrl || 'Não informada pelo back-end')}</dd>
            <dt>Versão identificada</dt><dd>${esc(glpiCheck?.glpiVersion || state.metadata.glpi_version || GLPI_VERSION)}${glpiCheck?.glpiVersion ? '' : ' (a confirmar)'}</dd>
            <dt>API REST</dt><dd>${glpiCheck?.apiRest === 'online' ? 'Ativa e acessível' : (glpiCheck?.apiRest === 'not-tested' ? 'Não testada' : 'Não confirmada')}</dd>
            <dt>App-Token</dt><dd>${glpiCheck ? (glpiCheck.credentials?.appToken ? 'Configurado' : 'Não configurado') : 'Não verificado'}</dd>
            <dt>User-Token</dt><dd>${glpiCheck ? (glpiCheck.credentials?.userToken ? 'Configurado' : 'Não configurado') : 'Não verificado'}</dd>
            <dt>Última verificação</dt><dd>${glpiCheck?.checkedAt ? formatDateTime(glpiCheck.checkedAt) : 'Não realizada'}</dd>
        `;
    }

    function publicDashboardUrl(pathMode = false) {
        const token = state.publicConfig.token || '';
        if (!token) return '';
        if (pathMode) return `${window.location.origin}/dashboard/publico/${encodeURIComponent(token)}`;
        return `${window.location.origin}${window.location.pathname}?painel_publico=${encodeURIComponent(token)}`;
    }

    function renderConfigFields() {
        const publicEnabled = getField('glpi-public-enabled');
        const techMode = getField('glpi-public-tech-mode');
        const integrationEnabled = getField('glpi-integration-enabled');
        const demoEnabled = getField('glpi-demo-enabled');
        const dailyRecentLimit = getField('glpi-daily-recent-limit');
        if (publicEnabled) publicEnabled.value = String(Boolean(state.publicConfig.enabled));
        if (techMode) techMode.value = state.publicConfig.techMode || 'first';
        if (integrationEnabled) integrationEnabled.value = String(state.localConfig.integrationEnabled !== false);
        if (demoEnabled) demoEnabled.value = String(Boolean(state.localConfig.demoEnabled));
        if (dailyRecentLimit) dailyRecentLimit.value = String(Number(state.localConfig.dailyRecentLimit) || 10);

        [
            ['glpi-public-show-title', 'showTitle'],
            ['glpi-public-show-category', 'showCategory'],
            ['glpi-public-show-unit', 'showUnit']
        ].forEach(([id, key]) => {
            const field = getField(id);
            if (field) field.checked = Boolean(state.publicConfig[key]);
        });

        const preview = getField('glpi-public-link-preview');
        if (preview) {
            const url = publicDashboardUrl(true);
            preview.textContent = url ? `Link público: ${url}` : 'Link público: Não disponível';
        }
    }

    function renderMonitoring() {
        const last = state.syncLogs[0];
        getField('glpi-sync-summary').innerHTML = `
            <dt>Conexão</dt><dd>${state.demo ? 'Modo demonstração ativado explicitamente' : (state.tickets.length ? 'Dados reais disponíveis' : 'GLPI offline ou aguardando a primeira sincronização')}</dd>
            <dt>Saúde da integração</dt><dd>${esc(state.integrationState?.status || 'Não disponível')}</dd>
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
        const reference = state.serverTimeVerified
            ? new Date(Date.now() + state.serverTimeOffsetMs)
            : new Date();
        const health = CORE.calculateSyncHealth(
            state.integrationState,
            reference,
            SYNC_STALE_TOLERANCE_SECONDS
        );
        const connection = state.demo
            ? { label: 'Demonstração', className: 'warning' }
            : health === 'syncing'
                    ? { label: 'Sincronizando GLPI', className: 'warning' }
                : health === 'delayed'
                        ? { label: 'Sincronização atrasada', className: 'warning' }
                    : health === 'online'
                        ? { label: 'Online • GLPI', className: 'ok' }
                        : { label: 'Offline • GLPI', className: 'error' };
        status.textContent = connection.label;
        status.className = `glpi-status-badge ${connection.className}`;
        const last = state.lastUpdatedAt || state.syncLogs[0]?.created_at;
        getField('glpi-last-update').textContent = `Última atualização: ${formatDateTime(last)}`;
        const currentTime = getField('glpi-current-time');
        const nextRefresh = getField('glpi-next-refresh');
        if (currentTime) currentTime.textContent = `Hora atual: ${new Intl.DateTimeFormat('pt-BR', { timeStyle: 'medium', timeZone: TZ }).format(new Date())}`;
        if (nextRefresh) nextRefresh.textContent = `Próxima atualização em ${state.secondsToRefresh} segundos`;
    }

    function renderDashboardHeader() {
        const daily = state.subtab === 'diario';
        const title = getField('glpi-dashboard-title');
        const subtitle = getField('glpi-dashboard-subtitle');
        if (title) title.textContent = daily ? 'DASHBOARD CHAMADOS DIÁRIO' : 'Dashboard gerencial de chamados';
        if (subtitle) subtitle.textContent = daily
            ? 'Indicadores de chamados'
            : 'Indicadores de operação, produtividade, SLA e evolução dos atendimentos.';
        const panelButton = getField('glpi-panel-button');
        const fullscreenButton = getField('glpi-fullscreen-button');
        if (panelButton) panelButton.textContent = state.panelMode ? 'Sair do modo painel' : 'Modo Painel';
        if (fullscreenButton) fullscreenButton.textContent = document.fullscreenElement
            ? 'Sair da tela cheia'
            : 'Entrar em tela cheia';
    }

    function renderAll() {
        renderDashboardHeader();
        renderStatus();
        renderDailyDashboard();
        if (state.publicMode) return;
        renderKpis();
        renderRankings();
        renderTechnicians();
        renderTicketTable();
        renderReportPreview();
        renderConfig();
        renderMonitoring();
    }

    async function refreshData(triggerSync = false) {
        if (state.refreshing) return false;
        state.refreshing = true;
        const scrollTop = document.querySelector('.main-content')?.scrollTop || 0;
        try {
            if (triggerSync && window.supabase?.functions && canTriggerSync()) {
                const { error } = await supabase.functions.invoke('glpi-dashboard', { body: { action: 'sync-incremental' } });
                if (error) throw error;
            }
            await loadTickets();
            state.lastUpdatedAt = new Date();
            if (state.subtab === 'diario') {
                renderStatus();
                renderDailyDashboard();
            } else {
                populateFilters();
                applyFilters();
            }
            return true;
        } catch (error) {
            console.error('Falha ao atualizar GLPI:', error);
            state.demo = false;
            state.integrationState = { ...(state.integrationState || {}), status: 'offline' };
            state.syncLogs.unshift({ level: 'erro', message: 'Falha na atualização. Os últimos dados válidos foram mantidos.', created_at: new Date().toISOString() });
            mostrarAviso('Não foi possível atualizar agora. Mantive os últimos dados válidos.', 'aviso');
            renderAll();
            return false;
        } finally {
            state.refreshing = false;
            state.secondsToRefresh = state.subtab === 'diario'
                ? DAILY_REFRESH_SECONDS
                : Number(getField('glpi-sync-interval')?.value || 30000) / 1000;
            const main = document.querySelector('.main-content');
            if (main) main.scrollTop = scrollTop;
        }
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
        loadLocalConfig();
        await refreshData(false);
        setDefaultPeriod();
        applyFilters();
        window.glpiAbrirSubaba(window.GESTAO_TI_PUBLIC_DASHBOARD ? 'diario' : state.subtab || 'diario');
        window.glpiAtualizarIntervaloSincronizacao();
    };

    window.glpiAbrirSubaba = function (name) {
        if (window.GESTAO_TI_PUBLIC_DASHBOARD && name !== 'diario') return;
        state.subtab = name;
        document.body.classList.toggle('glpi-daily-active', name === 'diario');
        document.querySelectorAll('.glpi-subtab').forEach(btn => btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(`'${name}'`)));
        document.querySelectorAll('.glpi-view').forEach(view => view.classList.add('hidden'));
        getField(`glpi-view-${name}`)?.classList.remove('hidden');
        if (name === 'configuracoes' && state.initialized && !state.serviceChecks.glpi) {
            void window.glpiTestarConfiguracaoServicos(true);
        }
        renderDashboardHeader();
        if (state.initialized) window.glpiAtualizarIntervaloSincronizacao();
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

    window.glpiAplicarFiltros = function () {
        applyFilters();
        window.glpiFecharFiltros();
    };

    window.glpiAbrirFiltros = function () {
        getField('glpi-filter-drawer')?.classList.add('open');
        getField('glpi-filter-backdrop')?.classList.add('open');
        getField('glpi-filter-drawer')?.setAttribute('aria-hidden', 'false');
    };

    window.glpiFecharFiltros = function () {
        getField('glpi-filter-drawer')?.classList.remove('open');
        getField('glpi-filter-backdrop')?.classList.remove('open');
        getField('glpi-filter-drawer')?.setAttribute('aria-hidden', 'true');
    };

    window.glpiLimparFiltros = function () {
        document.querySelectorAll('#glpi-filter-drawer input, #glpi-filter-drawer select').forEach(field => {
            field.value = '';
        });
        state.page = 1;
        applyFilters();
        renderActiveFilterCount();
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
        if (state.refreshing) return;
        mostrarAviso('Atualizando dados do cache...', 'aviso');
        const updated = await refreshData(false);
        if (updated) mostrarAviso('Dashboard atualizado com o cache mais recente.', 'sucesso');
    };

    window.glpiSincronizarAgora = async function () {
        if (!canTriggerSync()) {
            mostrarAviso('Sincronização restrita a administradores e gestores.', 'aviso');
            return;
        }
        mostrarAviso('Sincronizando dados do GLPI...', 'aviso');
        const updated = await refreshData(true);
        if (updated) mostrarAviso('Sincronização GLPI concluída.', 'sucesso');
    };

    window.glpiAbrirSupabase = function () {
        const { projectRef } = publicSupabaseConfig();
        openExternal(projectRef
            ? `https://supabase.com/dashboard/project/${encodeURIComponent(projectRef)}`
            : 'https://supabase.com/dashboard');
    };

    window.glpiAbrirInstrucoesSupabase = function () {
        openExternal('https://supabase.com/dashboard/account/tokens');
    };

    window.glpiAbrirGlpi = function () {
        const baseUrl = state.serviceChecks.glpi?.baseUrl || state.metadata.base_url;
        if (!openExternal(baseUrl)) mostrarAviso('GLPI_BASE_URL ainda não foi informado pelo back-end.', 'aviso');
    };

    window.glpiAbrirConfiguracaoApiGlpi = function () {
        const baseUrl = state.serviceChecks.glpi?.baseUrl || state.metadata.base_url;
        if (!openExternal(baseUrl)) {
            mostrarAviso('Configure GLPI_BASE_URL antes de abrir a instância.', 'aviso');
            return;
        }
        mostrarAviso('No GLPI, acesse Configurar → Geral → API. A rota administrativa varia conforme a instalação.', 'aviso');
    };

    window.glpiTestarSupabase = async function (silent = false) {
        const config = publicSupabaseConfig();
        const checkedAt = new Date().toISOString();
        try {
            if (!config.url || !config.projectRef || !config.publicKey) throw new Error('Configuração pública incompleta.');
            if (!window.supabase?.auth) throw new Error('Cliente Supabase indisponível.');
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !sessionData?.session) throw new Error('Sessão Supabase não autenticada.');
            const { error } = await supabase.from('profiles').select('id').limit(1);
            if (error) throw error;
            state.serviceChecks.supabase = { ok: true, authenticated: true, checkedAt };
            renderServiceConnections();
            if (!silent) mostrarAviso('Configuração do Supabase validada.', 'sucesso');
            return true;
        } catch {
            state.serviceChecks.supabase = { ok: false, authenticated: false, checkedAt };
            renderServiceConnections();
            if (!silent) mostrarAviso('Supabase não conectado ou com configuração incompleta.', 'erro');
            return false;
        }
    };

    async function testGlpiConfiguration(silent = false) {
        const checkedAt = new Date().toISOString();
        try {
            if (!window.supabase?.functions) throw new Error('Edge Function indisponível.');
            const { data, error } = await supabase.functions.invoke('glpi-dashboard', { body: { action: 'configuration-status' } });
            if (error) throw error;
            state.serviceChecks.glpi = { ...data, ok: false, checkedAt: data?.checkedAt || checkedAt };
            if (data?.baseUrl) state.metadata.base_url = data.baseUrl;
            if (data?.apiUrl) state.metadata.api_url = data.apiUrl;
            renderConfig();
            if (!silent) mostrarAviso(data?.configured ? 'Secrets do GLPI configurados; falta testar a API.' : 'Configuração GLPI incompleta.', data?.configured ? 'aviso' : 'erro');
            return Boolean(data?.configured);
        } catch {
            state.serviceChecks.glpi = { ...(state.serviceChecks.glpi || {}), ok: false, failed: true, checkedAt };
            renderServiceConnections();
            if (!silent) mostrarAviso('Não foi possível consultar a configuração GLPI no back-end.', 'erro');
            return false;
        }
    }

    window.glpiTestarConfiguracaoServicos = async function (silent = false) {
        if (state.serviceChecking) return false;
        state.serviceChecking = true;
        try {
            const [supabaseOk, glpiConfigured] = await Promise.all([
                window.glpiTestarSupabase(true),
                testGlpiConfiguration(true)
            ]);
            if (!silent) mostrarAviso(`Verificação concluída: Supabase ${supabaseOk ? 'conectado' : 'incompleto'}; GLPI ${glpiConfigured ? 'configurado, aguardando teste' : 'incompleto'}.`, supabaseOk && glpiConfigured ? 'sucesso' : 'aviso');
            return supabaseOk && glpiConfigured;
        } finally {
            state.serviceChecking = false;
        }
    };

    window.glpiTestarConexao = async function () {
        try {
            if (!window.supabase?.functions) throw new Error('Edge Function indisponível no ambiente local.');
            const { data, error } = await supabase.functions.invoke('glpi-dashboard', { body: { action: 'test-connection' } });
            if (error) throw error;
            state.serviceChecks.glpi = { ...data, ok: true, checkedAt: new Date().toISOString() };
            if (data?.baseUrl) state.metadata.base_url = data.baseUrl;
            if (data?.apiUrl) state.metadata.api_url = data.apiUrl;
            if (data?.glpiVersion) state.metadata.glpi_version = data.glpiVersion;
            state.metadata.api_enabled = data?.apiRest === 'online' ? 'Ativa e acessível' : state.metadata.api_enabled;
            renderConfig();
            mostrarAviso(`Conexão somente leitura validada em ${data?.elapsedMs ?? 'tempo não informado'} ms. Amostra de chamados: ${data?.tickets ?? 'Não disponível'}. Usuários, grupos e categorias: ${data?.access?.users && data?.access?.groups && data?.access?.categories ? 'acessíveis' : 'verificação incompleta'}.`, 'sucesso');
        } catch (error) {
            state.serviceChecks.glpi = { ...(state.serviceChecks.glpi || {}), ok: false, failed: true, checkedAt: new Date().toISOString() };
            renderServiceConnections();
            console.warn('Teste GLPI falhou; detalhes sensíveis não foram registrados.', error?.name || 'Erro');
            mostrarAviso('Não foi possível validar a conexão. Verifique URL, tokens, API habilitada, permissões, rede e logs.', 'erro');
        }
    };

    window.glpiLimparCache = function () {
        if (!window.exigirAdmin?.()) return;
        state.tickets = [];
        state.dailyAssignments = [];
        state.filtered = [];
        state.demo = state.localConfig.demoEnabled === true;
        if (state.demo) {
            state.tickets = demoTickets();
            state.dailyAssignments = state.tickets;
        } else {
            state.integrationState = { ...(state.integrationState || {}), status: 'offline' };
        }
        applyFilters();
        mostrarAviso('Cache visual local limpo. O cache real do banco deve ser limpo pela rotina administrativa do back-end.', 'aviso');
    };

    window.glpiAlternarPainel = function () {
        state.panelMode = !document.body.classList.contains('glpi-panel-mode');
        if (state.panelMode) state.menuCollapsedBeforePanel = document.body.classList.contains('menu-collapsed');
        document.body.classList.toggle('glpi-panel-mode', state.panelMode);
        localStorage.setItem('glpiPanelMode', String(state.panelMode));
        if (state.panelMode) document.body.classList.add('menu-collapsed');
        else document.body.classList.toggle('menu-collapsed', Boolean(state.menuCollapsedBeforePanel));
        renderDashboardHeader();
        mostrarAviso(state.panelMode ? 'Modo painel ativado.' : 'Modo painel desativado.', 'sucesso');
    };

    window.glpiTelaCheia = async function () {
        try {
            if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
            else await document.exitFullscreen();
            renderDashboardHeader();
        } catch (error) {
            mostrarAviso('Tela cheia indisponível neste navegador.', 'aviso');
        }
    };

    window.glpiSalvarConfiguracaoLocal = function () {
        state.localConfig = {
            integrationEnabled: getField('glpi-integration-enabled')?.value !== 'false',
            demoEnabled: getField('glpi-demo-enabled')?.value === 'true',
            dailyRecentLimit: Number(getField('glpi-daily-recent-limit')?.value || 10)
        };
        saveJsonStorage('glpiDashboardLocalConfig', state.localConfig);
        mostrarAviso('Configuração local salva.', 'sucesso');
        refreshData(false);
    };

    window.glpiSalvarConfiguracaoPublica = function () {
        state.publicConfig = {
            ...DEFAULT_PUBLIC_CONFIG,
            ...state.publicConfig,
            enabled: getField('glpi-public-enabled')?.value === 'true',
            techMode: getField('glpi-public-tech-mode')?.value || 'first',
            showTitle: Boolean(getField('glpi-public-show-title')?.checked),
            showCategory: Boolean(getField('glpi-public-show-category')?.checked),
            showUnit: Boolean(getField('glpi-public-show-unit')?.checked)
        };
        if (state.publicConfig.enabled && !state.publicConfig.token) state.publicConfig.token = generatePublicToken();
        saveJsonStorage('glpiPublicDashboardConfig', state.publicConfig);
        renderConfigFields();
        renderDailyDashboard();
        mostrarAviso('Configuração do painel público salva.', 'sucesso');
    };

    window.glpiRegenerarTokenPublico = function () {
        state.publicConfig = { ...DEFAULT_PUBLIC_CONFIG, ...state.publicConfig, enabled: true, token: generatePublicToken() };
        saveJsonStorage('glpiPublicDashboardConfig', state.publicConfig);
        renderConfigFields();
        mostrarAviso('Link público regenerado. Links antigos deixam de funcionar neste ambiente.', 'sucesso');
    };

    window.glpiRevogarPainelPublico = function () {
        state.publicConfig = { ...DEFAULT_PUBLIC_CONFIG, ...state.publicConfig, enabled: false, token: '' };
        saveJsonStorage('glpiPublicDashboardConfig', state.publicConfig);
        renderConfigFields();
        mostrarAviso('Acesso público revogado.', 'sucesso');
    };

    window.glpiCopiarLinkPublico = async function () {
        if (!state.publicConfig.enabled || !state.publicConfig.token) window.glpiRegenerarTokenPublico();
        const url = publicDashboardUrl(true);
        try {
            await navigator.clipboard.writeText(url);
            mostrarAviso('Link público copiado.', 'sucesso');
        } catch (_) {
            mostrarAviso(`Copie o link exibido: ${url}`, 'aviso');
        }
    };

    window.glpiAbrirPainelPublico = function () {
        if (!state.publicConfig.enabled || !state.publicConfig.token) window.glpiRegenerarTokenPublico();
        window.open(publicDashboardUrl(false), '_blank', 'noopener');
    };

    window.glpiAtualizarIntervaloSincronizacao = function () {
        clearInterval(state.refreshTimer);
        clearInterval(state.countdownTimer);
        const interval = state.subtab === 'diario'
            ? DAILY_REFRESH_SECONDS * 1000
            : Number(getField('glpi-sync-interval')?.value || 30000);
        state.secondsToRefresh = Math.round(interval / 1000);
        state.refreshTimer = setInterval(() => {
            const aba = getField('aba-glpi');
            if (aba && !aba.classList.contains('hidden')) refreshData(false);
        }, interval);
        state.countdownTimer = setInterval(() => {
            state.secondsToRefresh = state.secondsToRefresh <= 1 ? Math.round(interval / 1000) : state.secondsToRefresh - 1;
            renderStatus();
            if (state.subtab === 'diario') renderDailyTimers();
        }, 1000);
        renderStatus();
    };

    document.addEventListener('fullscreenchange', renderDashboardHeader);

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

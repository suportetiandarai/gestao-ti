(() => {
    'use strict';

    const source = document.body.dataset.dashboard;
    const isTraining = source === 'training';
    const isAd = source === 'ad';
    const pageSize = 50;
    const state = { page: 1, etag: '', timer: null, loading: false };

    function get(id) {
        return document.getElementById(id);
    }

    function config() {
        return {
            url: String(window.GESTAO_TI_CONFIG?.SUPABASE_URL || '').replace(/\/+$/, ''),
            publicKey: String(window.GESTAO_TI_CONFIG?.SUPABASE_PUBLIC_KEY || '')
        };
    }

    function formatDate(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Não disponível';
        return new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            dateStyle: 'short',
            timeStyle: 'short'
        }).format(date);
    }

    function statusLabel(status) {
        const labels = isTraining
            ? { completed: 'Realizado', scheduled: 'Agendado', not_scheduled: 'Não agendado' }
            : { completed: 'Realizado', pending: 'Pendente', not_completed: 'Não realizado' };
        return labels[status] || 'Não informado';
    }

    function createCell(row, value, className = '') {
        const cell = document.createElement('td');
        cell.textContent = value || 'Não informado';
        if (className) cell.className = className;
        row.appendChild(cell);
    }

    function renderRows(rows) {
        const body = get('sheet-dashboard-rows');
        body.replaceChildren();
        if (!rows.length) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = isTraining ? 6 : isAd ? 3 : 5;
            cell.className = 'sheet-empty';
            cell.textContent = 'Nenhuma solicitação nova encontrada desde 28/07/2026.';
            row.appendChild(cell);
            body.appendChild(row);
            return;
        }
        for (const item of rows) {
            const row = document.createElement('tr');
            createCell(row, formatDate(item.requested_at), 'sheet-date');
            createCell(row, item.requester_name);
            if (isTraining) {
                createCell(row, item.sector);
                createCell(row, item.job_title);
                createCell(row, item.training_topic);
            } else if (!isAd) {
                createCell(row, item.job_title);
                createCell(row, item.sector);
            }
            createCell(row, statusLabel(item.dashboard_status), `sheet-status status-${item.dashboard_status}`);
            body.appendChild(row);
        }
    }

    function render(data) {
        get('summary-total').textContent = String(data.summary.total);
        get('summary-completed').textContent = String(data.summary.completed);
        get('summary-pending').textContent = String(data.summary.pending);
        get('summary-not-started').textContent = String(data.summary.notStarted);
        get('last-sync').textContent = `Última sincronização: ${formatDate(data.lastSyncedAt)}`;
        const connectionLabels = {
            online: 'Online',
            delayed: 'Sincronização atrasada',
            offline: 'Indisponível'
        };
        get('connection-status').textContent = connectionLabels[data.status] || 'Dados ainda não sincronizados';
        get('connection-status').dataset.status = data.status;
        renderRows(data.rows || []);
        const totalPages = Math.max(1, Math.ceil(data.page.total / data.page.pageSize));
        get('page-info').textContent = `Página ${data.page.current} de ${totalPages} • ${data.page.total} solicitações`;
        get('previous-page').disabled = state.page <= 1;
        get('next-page').disabled = state.page >= totalPages;
    }

    async function load({ preserveEtag = true } = {}) {
        if (state.loading) return;
        const { url, publicKey } = config();
        if (!url) {
            get('dashboard-message').textContent = 'Configuração do Supabase não encontrada.';
            return;
        }
        state.loading = true;
        get('refresh-button').disabled = true;
        const headers = {};
        if (publicKey) headers.apikey = publicKey;
        if (preserveEtag && state.etag) headers['If-None-Match'] = state.etag;
        try {
            const response = await fetch(
                `${url}/functions/v1/google-sheets-dashboard-public?dashboard=${source}&page=${state.page}&page_size=${pageSize}`,
                { headers, cache: 'no-cache' }
            );
            if (response.status === 304) {
                get('dashboard-message').textContent = 'Dados verificados; nenhuma alteração.';
                return;
            }
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
            state.etag = response.headers.get('ETag') || '';
            render(data);
            get('dashboard-message').textContent = '';
        } catch {
            get('dashboard-message').textContent = 'Não foi possível validar os dados agora. Tentaremos novamente automaticamente.';
            get('connection-status').textContent = 'Indisponível';
            get('connection-status').dataset.status = 'offline';
        } finally {
            state.loading = false;
            get('refresh-button').disabled = false;
        }
    }

    function changePage(delta) {
        state.page = Math.max(1, state.page + delta);
        state.etag = '';
        load({ preserveEtag: false });
    }

    async function toggleFullscreen() {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
        } catch {
            get('dashboard-message').textContent = 'Tela cheia não está disponível neste navegador.';
        }
    }

    function start() {
        get('refresh-button').addEventListener('click', () => load({ preserveEtag: false }));
        get('fullscreen-button').addEventListener('click', toggleFullscreen);
        get('previous-page').addEventListener('click', () => changePage(-1));
        get('next-page').addEventListener('click', () => changePage(1));
        load({ preserveEtag: false });
        state.timer = window.setInterval(() => load(), 30000);
    }

    window.addEventListener('beforeunload', () => window.clearInterval(state.timer));
    document.addEventListener('DOMContentLoaded', start);
})();

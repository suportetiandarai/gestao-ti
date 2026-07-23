(function exposeDashboardCore(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.GLPI_DASHBOARD_CORE = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createDashboardCore() {
    'use strict';

    const TIME_ZONE = 'America/Sao_Paulo';
    const STATUS = Object.freeze({
        NEW: 'Novo',
        ASSIGNED: 'Atribuído',
        PLANNED: 'Planejado',
        PENDING: 'Pendente',
        SOLVED: 'Solucionado',
        CLOSED: 'Fechado'
    });
    const IN_SERVICE = new Set([STATUS.ASSIGNED, STATUS.PLANNED]);
    const OPEN = new Set([STATUS.NEW, STATUS.ASSIGNED, STATUS.PLANNED, STATUS.PENDING]);

    function parseDate(value) {
        if (!value) return null;
        const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function dateParts(date, timeZone = TIME_ZONE) {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(date);
        return Object.fromEntries(parts.map((part) => [part.type, part.value]));
    }

    function dateOnlyInTimeZone(date = new Date(), timeZone = TIME_ZONE) {
        const parts = dateParts(parseDate(date) || new Date(), timeZone);
        return `${parts.year}-${parts.month}-${parts.day}`;
    }

    function zonedDateTime(dateText, hour, minute, second, millisecond, timeZone = TIME_ZONE) {
        const [year, month, day] = dateText.split('-').map(Number);
        const desired = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
        let guess = desired;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const parts = new Intl.DateTimeFormat('en-CA', {
                timeZone,
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hourCycle: 'h23'
            }).formatToParts(new Date(guess));
            const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
            const represented = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second), millisecond);
            guess += desired - represented;
        }
        return new Date(guess);
    }

    function todayRange(reference = new Date()) {
        const label = dateOnlyInTimeZone(reference);
        return {
            label,
            start: zonedDateTime(label, 0, 0, 0, 0),
            end: zonedDateTime(label, 23, 59, 59, 999)
        };
    }

    function isBetween(value, start, end) {
        const date = parseDate(value);
        return Boolean(date && date >= start && date <= end);
    }

    function isDeadlineBreached(ticket, dueField, completedField, now = new Date()) {
        const due = parseDate(ticket[dueField]);
        if (!due) return false;
        const completed = parseDate(ticket[completedField]);
        return completed ? completed > due : parseDate(now) > due;
    }

    function isTicketBreached(ticket, now = new Date()) {
        if (!OPEN.has(ticket.status)) return false;
        return isDeadlineBreached(ticket, 'attentionDueAt', 'firstResponseAt', now)
            || isDeadlineBreached(ticket, 'internalAttentionDueAt', 'firstResponseAt', now)
            || isDeadlineBreached(ticket, 'slaDueAt', 'solvedAt', now)
            || isDeadlineBreached(ticket, 'internalSlaDueAt', 'solvedAt', now);
    }

    function dailyMetrics(tickets, reference = new Date()) {
        const { start, end, label } = todayRange(reference);
        const createdToday = tickets.filter((ticket) => isBetween(ticket.openedAt, start, end));
        const inServiceNow = tickets.filter((ticket) => IN_SERVICE.has(ticket.status) && parseDate(ticket.firstResponseAt));
        const waitingNow = tickets.filter((ticket) => ticket.status === STATUS.NEW || (IN_SERVICE.has(ticket.status) && !parseDate(ticket.firstResponseAt)));
        const pendingNow = tickets.filter((ticket) => ticket.status === STATUS.PENDING);
        const breachedNow = tickets.filter((ticket) => isTicketBreached(ticket, reference));
        return { start, end, label, createdToday, inServiceNow, waitingNow, pendingNow, breachedNow };
    }

    function technicianAssignmentsToday(tickets, reference = new Date()) {
        const { start, end } = todayRange(reference);
        const unique = new Map();
        tickets.forEach((ticket) => {
            if (ticket.technician === 'Não disponível' || !isBetween(ticket.assignedAt, start, end)) return;
            const key = `${ticket.technicianId || ticket.technician}:${ticket.id}`;
            if (!unique.has(key)) unique.set(key, ticket);
        });
        const counts = new Map();
        unique.forEach((ticket) => counts.set(ticket.technician, (counts.get(ticket.technician) || 0) + 1));
        return [...counts.entries()].map(([label, value]) => ({ label, value }));
    }

    function publicTicket(ticket, config = {}) {
        const result = {
            id: ticket.id,
            status: ticket.status,
            technician: config.techMode === 'hidden' ? 'Técnico' : ticket.technician,
            openedAt: ticket.openedAt
        };
        if (config.showTitle) result.title = ticket.title;
        if (config.showCategory) result.category = ticket.category;
        if (config.showUnit) result.unit = ticket.unit;
        return result;
    }

    function createRefreshCoordinator() {
        let refreshing = false;
        return Object.freeze({
            isRefreshing: () => refreshing,
            async run(previousData, loader) {
                if (refreshing) return { started: false, data: previousData, error: null };
                refreshing = true;
                try {
                    const data = await loader();
                    return { started: true, data: data ?? previousData, error: null };
                } catch (error) {
                    return { started: true, data: previousData, error };
                } finally {
                    refreshing = false;
                }
            }
        });
    }

    return Object.freeze({
        TIME_ZONE,
        STATUS,
        dateOnlyInTimeZone,
        todayRange,
        isBetween,
        isDeadlineBreached,
        isTicketBreached,
        dailyMetrics,
        technicianAssignmentsToday,
        publicTicket,
        createRefreshCoordinator
    });
});

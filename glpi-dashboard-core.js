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
    const STATUS_CODE = Object.freeze({
        NEW: 1,
        ASSIGNED: 2,
        PLANNED: 3,
        PENDING: 4,
        SOLVED: 5,
        CLOSED: 6
    });
    const OPEN = new Set([STATUS.NEW, STATUS.ASSIGNED, STATUS.PLANNED, STATUS.PENDING]);
    const FINAL = new Set([STATUS.SOLVED, STATUS.CLOSED]);

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

    function addDays(dateText, days) {
        const [year, month, day] = dateText.split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day + days));
        return date.toISOString().slice(0, 10);
    }

    function hourInTimeZone(date = new Date(), timeZone = TIME_ZONE) {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            hour: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(parseDate(date) || new Date());
        return Number(parts.find((part) => part.type === 'hour')?.value || 0);
    }

    function currentShift(reference = new Date()) {
        const current = parseDate(reference) || new Date();
        const dateText = dateOnlyInTimeZone(current);
        const hour = hourInTimeZone(current);
        const isDay = hour >= 7 && hour < 19;
        const startDate = isDay ? dateText : (hour >= 19 ? dateText : addDays(dateText, -1));
        const endDate = isDay ? dateText : addDays(startDate, 1);
        return {
            type: isDay ? 'Diurno' : 'Noturno',
            label: isDay ? '07:00 às 19:00' : '19:00 às 07:00',
            start: zonedDateTime(startDate, isDay ? 7 : 19, 0, 0, 0),
            end: zonedDateTime(endDate, isDay ? 19 : 7, 0, 0, 0)
        };
    }

    function isBetween(value, start, end) {
        const date = parseDate(value);
        return Boolean(date && date >= start && date <= end);
    }

    function isWithinShift(value, start, end) {
        const date = parseDate(value);
        return Boolean(date && date >= start && date < end);
    }

    function ticketGroupIds(ticket) {
        const values = [
            ticket.groupId,
            ...(Array.isArray(ticket.technicalGroupIds) ? ticket.technicalGroupIds : [])
        ];
        return [...new Set(values.map(Number).filter(Number.isFinite))];
    }

    function belongsToTechnicalGroup(ticket, groupId) {
        const expected = Number(groupId);
        return Number.isFinite(expected) && ticketGroupIds(ticket).includes(expected);
    }

    function hasAssignedTechnician(ticket) {
        if (Number(ticket.currentTechnicianCount) > 0) return true;
        if (Array.isArray(ticket.currentTechnicians) && ticket.currentTechnicians.length > 0) return true;
        return Boolean(ticket.technicianId);
    }

    function ticketStatusCode(ticket) {
        const code = Number(ticket.statusId);
        if (Number.isFinite(code) && code > 0) return code;
        const entry = Object.entries(STATUS).find(([, name]) => name === ticket.status);
        return entry ? STATUS_CODE[entry[0]] : null;
    }

    function hasExpiredSlaOrOla(ticket, now = new Date()) {
        return isDeadlineBreached(ticket, 'attentionDueAt', 'firstResponseAt', now)
            || isDeadlineBreached(ticket, 'internalAttentionDueAt', 'firstResponseAt', now)
            || isDeadlineBreached(ticket, 'slaDueAt', 'solvedAt', now)
            || isDeadlineBreached(ticket, 'internalSlaDueAt', 'solvedAt', now);
    }

    function calculateTicketFlags(ticket, now = new Date()) {
        const statusCode = ticketStatusCode(ticket);
        const isResolved = statusCode === STATUS_CODE.SOLVED
            || statusCode === STATUS_CODE.CLOSED
            || FINAL.has(ticket.status);
        const isPending = statusCode === STATUS_CODE.PENDING;
        const hasTechnician = hasAssignedTechnician(ticket);
        const isInProgress = !isResolved && !isPending && hasTechnician;
        const isWaiting = !isResolved && !isPending && !hasTechnician;
        const isOverdue = !isResolved && !isPending && hasExpiredSlaOrOla(ticket, now);
        return {
            statusCode,
            isResolved,
            isPending,
            hasTechnician,
            isInProgress,
            isWaiting,
            isOverdue
        };
    }

    function classifyTicket(ticket) {
        const flags = calculateTicketFlags(ticket);
        if (flags.isResolved) return 'resolved';
        if (flags.isPending) return 'pending';
        return flags.isInProgress ? 'in_service' : 'waiting';
    }

    function isDeadlineBreached(ticket, dueField, completedField, now = new Date()) {
        const due = parseDate(ticket[dueField]);
        if (!due) return false;
        const completed = parseDate(ticket[completedField]);
        return completed ? completed > due : parseDate(now) > due;
    }

    function isTicketBreached(ticket, now = new Date()) {
        if (!OPEN.has(ticket.status) && ![1, 2, 3, 4].includes(ticketStatusCode(ticket))) return false;
        return calculateTicketFlags(ticket, now).isOverdue;
    }

    function shiftMetrics(tickets, reference = new Date(), groupId = 1) {
        const shift = currentShift(reference);
        const groupTickets = tickets.filter((ticket) => belongsToTechnicalGroup(ticket, groupId));
        const classified = groupTickets.map((ticket) => ({
            ticket,
            flags: calculateTicketFlags(ticket, reference)
        }));
        const createdInShift = groupTickets.filter((ticket) => isWithinShift(ticket.openedAt, shift.start, shift.end));
        const inServiceNow = classified.filter(({ flags }) => flags.isInProgress).map(({ ticket }) => ticket);
        const waitingNow = classified.filter(({ flags }) => flags.isWaiting).map(({ ticket }) => ticket);
        const resolvedNow = classified.filter(({ flags }) => flags.isResolved).map(({ ticket }) => ticket);
        const pendingNow = classified.filter(({ flags }) => flags.isPending).map(({ ticket }) => ticket);
        const breachedNow = classified.filter(({ flags }) => flags.isOverdue).map(({ ticket }) => ticket);
        return { ...shift, groupTickets, createdInShift, inServiceNow, waitingNow, resolvedNow, pendingNow, breachedNow };
    }

    function technicianResolutionsInShift(tickets, reference = new Date(), groupId = 1) {
        const { start, end } = currentShift(reference);
        const unique = new Map();
        tickets.forEach((ticket) => {
            if (!belongsToTechnicalGroup(ticket, groupId) || classifyTicket(ticket) !== 'resolved') return;
            const resolvedAt = isWithinShift(ticket.solvedAt, start, end)
                ? ticket.solvedAt
                : (isWithinShift(ticket.closedAt, start, end) ? ticket.closedAt : null);
            if (!resolvedAt) return;
            const technicianId = ticket.solutionTechnicianId || ticket.technicianId;
            const technician = ticket.solutionTechnician || ticket.technician;
            if (!technicianId || !technician || technician === 'Não disponível') return;
            const key = `${technicianId}:${ticket.id}`;
            if (!unique.has(key)) unique.set(key, { ...ticket, technician });
        });
        const counts = new Map();
        unique.forEach((ticket) => counts.set(ticket.technician, (counts.get(ticket.technician) || 0) + 1));
        return [...counts.entries()].map(([label, value]) => ({ label, value }));
    }

    function formatTechnicianName(user) {
        if (!user || typeof user !== 'object') return '';
        const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const complete = clean(user.display_name || user.completename);
        if (complete) return complete;
        const official = [clean(user.firstname), clean(user.realname)].filter(Boolean).join(' ');
        return official || clean(user.name);
    }

    function elapsedSeconds(startValue, endValue) {
        const start = parseDate(startValue);
        const end = parseDate(endValue);
        if (!start || !end) return null;
        return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    }

    function calculateTicketDurations(ticket, reference = new Date()) {
        const now = parseDate(reference) || new Date();
        const openedAt = parseDate(ticket.openedAt);
        const assignedAt = parseDate(ticket.firstAssignedAt || ticket.assignedAt);
        const isClosed =
            ticket.status === STATUS.CLOSED
            || Number(ticket.statusId) === STATUS_CODE.CLOSED;
        const solvedAt = parseDate(ticket.solvedAt)
            || (isClosed ? parseDate(ticket.closedAt) : null);
        if (!openedAt) {
            return { assignmentSeconds: null, solutionSeconds: null, totalSeconds: null };
        }
        const assignmentEnd = assignedAt || now;
        const totalEnd = solvedAt || now;
        return {
            assignmentSeconds: elapsedSeconds(openedAt, assignmentEnd),
            solutionSeconds: assignedAt ? elapsedSeconds(assignedAt, totalEnd) : 0,
            totalSeconds: elapsedSeconds(openedAt, totalEnd)
        };
    }

    function formatElapsedTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return 'Não disponível';
        const whole = Math.floor(seconds);
        const days = Math.floor(whole / 86400);
        const hours = Math.floor((whole % 86400) / 3600);
        const minutes = Math.floor((whole % 3600) / 60);
        const remainingSeconds = whole % 60;
        const clock = [hours, minutes, remainingSeconds]
            .map((value) => String(value).padStart(2, '0'))
            .join(':');
        return days ? `${days}d ${clock}` : clock;
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
        STATUS_CODE,
        dateOnlyInTimeZone,
        todayRange,
        currentShift,
        isBetween,
        isWithinShift,
        belongsToTechnicalGroup,
        hasAssignedTechnician,
        ticketStatusCode,
        hasExpiredSlaOrOla,
        calculateTicketFlags,
        classifyTicket,
        isDeadlineBreached,
        isTicketBreached,
        shiftMetrics,
        technicianResolutionsInShift,
        formatTechnicianName,
        elapsedSeconds,
        calculateTicketDurations,
        formatElapsedTime,
        publicTicket,
        createRefreshCoordinator
    });
});

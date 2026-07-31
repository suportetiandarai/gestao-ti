(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SheetsDashboardCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const TIME_ZONE = 'America/Sao_Paulo';
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    });

    function normalizeStatus(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    function zonedParts(value) {
        const parts = {};
        for (const part of formatter.formatToParts(new Date(value))) {
            if (part.type !== 'literal') parts[part.type] = Number(part.value);
        }
        return parts;
    }

    function zonedDateTime(parts) {
        const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute || 0, parts.second || 0);
        let candidate = target;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const current = zonedParts(candidate);
            const represented = Date.UTC(
                current.year, current.month - 1, current.day, current.hour, current.minute, current.second
            );
            candidate += target - represented;
        }
        return new Date(candidate);
    }

    function addLocalDays(parts, days) {
        const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
        return {
            year: date.getUTCFullYear(),
            month: date.getUTCMonth() + 1,
            day: date.getUTCDate()
        };
    }

    function getCurrentShift(value = new Date()) {
        const parts = zonedParts(value);
        const isDay = parts.hour >= 7 && parts.hour < 19;
        const startsPreviousDay = parts.hour < 7;
        const startDate = addLocalDays(parts, startsPreviousDay ? -1 : 0);
        const endDate = addLocalDays(parts, isDay ? 0 : startsPreviousDay ? 0 : 1);
        return {
            type: isDay ? 'day' : 'night',
            start: zonedDateTime({ ...startDate, hour: isDay ? 7 : 19 }),
            end: zonedDateTime({ ...endDate, hour: isDay ? 19 : 7 })
        };
    }

    function formatShiftDate(value) {
        const parts = zonedParts(value);
        return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}, ` +
            `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
    }

    function getCurrentShiftRange(value = new Date()) {
        const shift = getCurrentShift(value);
        return {
            shiftStart: shift.start,
            shiftEnd: shift.end,
            shiftLabel: `${formatShiftDate(shift.start)} até ${formatShiftDate(shift.end)}`
        };
    }

    function getShiftEnd(value = new Date()) {
        return getCurrentShift(value).end;
    }

    function completedBeforeCurrentShift(request, now = new Date()) {
        if (!request?.completed_at) return false;
        const completedAt = new Date(request.completed_at);
        if (Number.isNaN(completedAt.getTime())) return false;
        return completedAt < getCurrentShift(now).start;
    }

    function shouldHideTimedRequest(request, now = new Date()) {
        return normalizeStatus(request?.dashboard_status) === 'completed' &&
            completedBeforeCurrentShift(request, now);
    }

    function shouldHideAdRequest(request, now = new Date()) {
        return ['completed', 'already_exists'].includes(normalizeStatus(request?.dashboard_status)) &&
            completedBeforeCurrentShift(request, now);
    }

    function shouldHideTrainingRequest(request, now = new Date()) {
        return normalizeStatus(request?.dashboard_status) === 'completed' &&
            completedBeforeCurrentShift(request, now);
    }

    const STANDARD_PRIORITY = Object.freeze({
        not_completed: 1,
        pending: 2,
        already_exists: 3,
        completed: 3
    });
    const TRAINING_PRIORITY = Object.freeze({
        not_scheduled: 1,
        pending: 1,
        no_contact: 2,
        duplicate: 3,
        other: 4,
        withdrawal: 5,
        scheduled: 6,
        completed: 7
    });

    function sortByPriority(requests, priorities) {
        return [...requests].sort((left, right) => {
            const leftStatus = normalizeStatus(left?.dashboard_status);
            const rightStatus = normalizeStatus(right?.dashboard_status);
            const priorityDifference = (priorities[leftStatus] || 99) - (priorities[rightStatus] || 99);
            if (priorityDifference) return priorityDifference;
            const terminal = ['completed', 'already_exists'].includes(leftStatus);
            const leftTime = new Date(terminal && left?.completed_at ? left.completed_at : left?.requested_at).getTime() || 0;
            const rightTime = new Date(terminal && right?.completed_at ? right.completed_at : right?.requested_at).getTime() || 0;
            if (leftTime !== rightTime) return terminal ? rightTime - leftTime : leftTime - rightTime;
            return Number(left?.source_row || 0) - Number(right?.source_row || 0);
        });
    }

    function sortTimedRequests(requests) {
        return sortByPriority(requests, STANDARD_PRIORITY);
    }

    function sortAdRequests(requests) {
        return sortByPriority(requests, STANDARD_PRIORITY);
    }

    function sortTrainingRequests(requests) {
        return [...requests].sort((left, right) => {
            const leftStatus = normalizeStatus(left?.dashboard_status);
            const rightStatus = normalizeStatus(right?.dashboard_status);
            const priorityDifference = (TRAINING_PRIORITY[leftStatus] || 99) -
                (TRAINING_PRIORITY[rightStatus] || 99);
            if (priorityDifference) return priorityDifference;

            const terminal = leftStatus === 'completed';
            const leftValue = terminal
                ? left?.completed_at
                : left?.scheduled_at || left?.requested_at;
            const rightValue = terminal
                ? right?.completed_at
                : right?.scheduled_at || right?.requested_at;
            const leftTime = new Date(leftValue).getTime();
            const rightTime = new Date(rightValue).getTime();
            const leftValid = Number.isFinite(leftTime);
            const rightValid = Number.isFinite(rightTime);
            if (leftValid !== rightValid) return leftValid ? -1 : 1;
            if (leftValid && leftTime !== rightTime) return terminal ? rightTime - leftTime : leftTime - rightTime;
            return Number(left?.source_row || 0) - Number(right?.source_row || 0);
        });
    }

    return {
        TIME_ZONE,
        normalizeStatus,
        getCurrentShift,
        getCurrentShiftRange,
        getShiftEnd,
        shouldHideTimedRequest,
        shouldHideAdRequest,
        shouldHideTrainingRequest,
        sortTimedRequests,
        sortAdRequests,
        sortTrainingRequests
    };
}));

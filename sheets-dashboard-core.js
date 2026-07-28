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

    return {
        TIME_ZONE,
        normalizeStatus,
        getCurrentShift,
        getShiftEnd,
        shouldHideTimedRequest,
        shouldHideAdRequest,
        shouldHideTrainingRequest
    };
}));

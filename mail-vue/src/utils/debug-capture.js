const DEBUG_ERROR_KEY = 'cloud-mail-debug-errors';
const MAX_ERRORS = 20;

function readErrors() {
    try {
        const value = localStorage.getItem(DEBUG_ERROR_KEY);
        return value ? JSON.parse(value) : [];
    } catch (e) {
        return [];
    }
}

function writeErrors(errors) {
    try {
        localStorage.setItem(DEBUG_ERROR_KEY, JSON.stringify(errors.slice(0, MAX_ERRORS)));
    } catch (e) {
        console.warn('Failed to store debug errors', e);
    }
}

function toMessage(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value.message) return value.message;
    try {
        return JSON.stringify(value);
    } catch (e) {
        return String(value);
    }
}

function toStack(value) {
    if (!value) return '';
    if (value.stack) return String(value.stack);
    return '';
}

export function recordDebugError(type, payload = {}) {
    const errors = readErrors();
    errors.unshift({
        type,
        time: new Date().toISOString(),
        path: location.href,
        message: toMessage(payload.message || payload.reason || payload.error || payload),
        stack: toStack(payload.error || payload.reason || payload),
        source: payload.filename || payload.source || '',
        line: payload.lineno || '',
        column: payload.colno || ''
    });
    writeErrors(errors);
}

export function getDebugErrors() {
    return readErrors();
}

export function clearDebugErrors() {
    writeErrors([]);
}

export function installDebugCapture(app) {
    window.addEventListener('error', (event) => {
        recordDebugError('window.error', {
            message: event.message,
            error: event.error,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
        });
    });

    window.addEventListener('unhandledrejection', (event) => {
        recordDebugError('unhandledrejection', {
            reason: event.reason
        });
    });

    app.config.errorHandler = (error, instance, info) => {
        recordDebugError('vue.error', {
            message: `${toMessage(error)} (${info})`,
            error
        });
        console.error(error);
    };
}

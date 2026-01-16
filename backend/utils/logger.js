/**
 * Production-safe logger utility
 * Sadece development modunda detaylı log gösterir
 * Production'da sadece error ve kritik bilgileri loglar
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

const logger = {
    // Her zaman logla (errors, kritik bilgiler)
    error: (...args) => {
        console.error('[ERROR]', new Date().toISOString(), ...args);
    },

    // Her zaman logla (önemli sistem mesajları)
    critical: (...args) => {
        console.log('[CRITICAL]', new Date().toISOString(), ...args);
    },

    // Sadece development'ta logla
    info: (...args) => {
        if (isDevelopment) {
            console.log('[INFO]', ...args);
        }
    },

    // Sadece development'ta logla
    debug: (...args) => {
        if (isDevelopment) {
            console.log('[DEBUG]', ...args);
        }
    },

    // Sadece development'ta logla
    warn: (...args) => {
        if (isDevelopment) {
            console.warn('[WARN]', ...args);
        }
    },

    // WebSocket olayları - sadece development
    socket: (...args) => {
        if (isDevelopment) {
            console.log('[SOCKET]', ...args);
        }
    },

    // API istekleri - sadece development
    api: (...args) => {
        if (isDevelopment) {
            console.log('[API]', ...args);
        }
    },

    // Webhook olayları - her zaman (izleme için)
    webhook: (...args) => {
        console.log('[WEBHOOK]', new Date().toISOString(), ...args);
    }
};

export default logger;






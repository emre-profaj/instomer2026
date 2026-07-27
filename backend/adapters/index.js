/**
 * ═══════════════════════════════════════════════════════════════
 * ADAPTER INDEX
 * ═══════════════════════════════════════════════════════════════
 * 
 * Tüm kanal adapter'larını tek yerden export eder.
 * 
 * Kullanım:
 *   import { normalizeWhatsAppMessage } from '../adapters/index.js';
 *   import { normalizeManualEntry } from '../adapters/index.js';
 */

export { normalizeWhatsAppMessage, tagContactSource as tagWhatsAppSource } from './whatsapp.adapter.js';
export { normalizeFacebookMessage, tagContactSource as tagFacebookSource } from './facebook.adapter.js';
export { normalizeWidgetMessage } from './widget.adapter.js';
export { normalizeFormSubmission } from './form.adapter.js';
export { normalizeEmailMessage } from './email.adapter.js';
export { normalizeRetellCall } from './retell.adapter.js';
export { normalizeManualEntry } from './manual.adapter.js';

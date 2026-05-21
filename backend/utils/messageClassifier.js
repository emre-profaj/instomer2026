/**
 * Helper to check if a message consists purely of emojis, icons, symbols, or punctuation.
 * 
 * Rules:
 * - Empty or whitespace-only messages are considered emoji/icon-only (nothing to reply to).
 * - Media attachment placeholders (e.g. starting with '📎') are considered emoji/icon-only.
 * - Text that has NO Unicode letters (\p{L}) and NO Unicode numbers (\p{N}) is considered emoji/icon-only.
 * 
 * @param {string} text The incoming message text
 * @returns {boolean} True if the message should not get an AI reply, false otherwise
 */
export function isEmojiOrIconOnly(text) {
    if (!text) return true;

    const cleanText = text.trim();
    if (!cleanText) return true;

    // If it is a system/WhatsApp attachment prefix (e.g., '📎 Sticker', '📎 Fotoğraf')
    if (cleanText.startsWith('📎')) {
        return true;
    }

    // Check if the text contains any letters or numbers (any Unicode language)
    // \p{L} matches any letter, \p{N} matches any number
    const hasLettersOrNumbers = /[\p{L}\p{N}]/u.test(cleanText);

    return !hasLettersOrNumbers;
}

/**
 * Turkish Profanity & Abuse Filter Utility
 */

const BLOCKED_WORDS = new Set([
    'amk', 'aq', 'amına', 'amınakoyayım', 'amcık', 'amcığı',
    'göt', 'götü', 'götveren', 'götlek',
    'siktir', 'siktirgit', 'sikerim', 'sikiş', 'sikik', 'sikti', 'sikeyim', 'sik',
    'yarrak', 'yarraga', 'yarrağı', 'taşak', 'taşşağı', 'pezevenk', 'pezevenkler', 'pezo',
    'orospu', 'orospunun', 'kahpe', 'kahpenin', 'piç', 'piçi', 'piçler',
    'şerefsiz', 'şerefsizin', 'ibne', 'ibnenin', 'puşt', 'kaltak', 'oç'
]);

const PROFANITY_REGEXES = [
    /(?<=^|[^a-zA-Z0-9çÇöÖüÜıİşŞğĞ])a[._\-\s]*[mq][._\-\s]*k(?=$|[^a-zA-Z0-9çÇöÖüÜıİşŞğĞ])/gi, // a.m.k, a-m-k, a m k, a.q, etc.
    /(?<=^|[^a-zA-Z0-9çÇöÖüÜıİşŞğĞ])o[._\-\s]*[çc](?=$|[^a-zA-Z0-9çÇöÖüÜıİşŞğĞ])/gi,           // o.ç, o-ç, o ç, oc
    /(?<=^|[^a-zA-Z0-9çÇöÖüÜıİşŞğĞ])s[._\-\s]*i[._\-\s]*k[._\-\s]*t[._\-\s]*i[._\-\s]*r(?=$|[^a-zA-Z0-9çÇöÖüÜıİşŞğĞ])/gi // s.i.k.t.i.r
];

function cleanWordForCheck(word) {
    if (!word) return '';
    return word.toLocaleLowerCase('tr-TR')
        .replace(/1/g, 'i')
        .replace(/!/g, 'i')
        .replace(/\*/g, 'i')
        .replace(/0/g, 'o')
        .replace(/3/g, 'e')
        .replace(/4/g, 'a');
}

/**
 * Checks if a string contains Turkish profanity.
 * 
 * @param {string} text - Input text
 * @returns {boolean} - True if profanity is found, false otherwise
 */
export function hasProfanity(text) {
    if (!text) return false;

    // 1. Check targeted bypass regexes first
    for (const pattern of PROFANITY_REGEXES) {
        // Reset lastIndex for global regexes
        pattern.lastIndex = 0;
        if (pattern.test(text)) return true;
    }

    // 2. Check word-by-word
    const words = text.match(/[\p{L}\p{N}]+/gu) || [];
    for (const word of words) {
        const cleaned = cleanWordForCheck(word);
        if (BLOCKED_WORDS.has(cleaned)) {
            return true;
        }
    }

    return false;
}

/**
 * Censers Turkish profanities by replacing characters with asterisks (e.g. s***ir).
 * 
 * @param {string} text - Input text
 * @returns {string} - Censored text
 */
export function censorProfanity(text) {
    if (!text) return text;

    let result = text;

    // 1. Censor targeted bypass regex patterns
    for (const pattern of PROFANITY_REGEXES) {
        pattern.lastIndex = 0;
        result = result.replace(pattern, (matched) => {
            return matched.split('').map((char, index) => {
                if (index === 0) return char;
                if (/[\s.,;:!?()\"\'\-\[\]\{\}\/\\]/.test(char)) return char;
                return '*';
            }).join('');
        });
    }

    // 2. Censor word-by-word
    const wordRegex = /[\p{L}\p{N}]+/gu;
    result = result.replace(wordRegex, (matchedWord) => {
        const cleaned = cleanWordForCheck(matchedWord);
        if (BLOCKED_WORDS.has(cleaned)) {
            if (matchedWord.length <= 1) return matchedWord;
            return matchedWord[0] + '*'.repeat(matchedWord.length - 1);
        }
        return matchedWord;
    });

    return result;
}

import prisma from '../lib/prisma.js';

/**
 * Increments suffix in sequence:
 * aa001 -> aa002 -> ... -> aa999 -> ab001 -> ... -> az999 -> ba001 -> ... -> zz999
 */
export function getNextSequence(lastSeq = '') {
    if (!lastSeq) return 'aa001';
    const match = lastSeq.match(/^([a-z]+)(\d+)$/i);
    let letters = 'aa';
    let num = 0;
    if (match) {
        letters = match[1].toLowerCase();
        num = parseInt(match[2], 10);
    }
    num += 1;
    if (num > 999) {
        num = 1;
        let chars = letters.split('');
        let carry = true;
        for (let i = chars.length - 1; i >= 0 && carry; i--) {
            let code = chars[i].charCodeAt(0) + 1;
            if (code > 122) { // 'z'
                chars[i] = 'a';
                carry = true;
            } else {
                chars[i] = String.fromCharCode(code);
                carry = false;
            }
        }
        if (carry) chars.unshift('a');
        letters = chars.join('');
    }
    return `${letters}${String(num).padStart(3, '0')}`;
}

/**
 * Standard Case Number Generator:
 * Format: YYYY-MM-DD-aa001 (e.g. 2026-09-03-aa001, 2026-09-03-aa002 ... 2026-09-03-ab001)
 */
export const generateCaseNumber = async (workspaceId) => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Istanbul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const datePrefix = formatter.format(now); // "YYYY-MM-DD" e.g. "2026-09-03"

    const lastCase = await prisma.case.findFirst({
        where: {
            workspaceId,
            caseNumber: { startsWith: `${datePrefix}-` }
        },
        orderBy: { caseNumber: 'desc' }
    });

    let lastSeq = '';
    if (lastCase?.caseNumber) {
        const parts = lastCase.caseNumber.split('-');
        if (parts.length >= 4) {
            lastSeq = parts[3];
        }
    }

    let nextSeq = getNextSequence(lastSeq);
    let candidate = `${datePrefix}-${nextSeq}`;

    // Safety loop against race conditions / duplicate numbers
    let attempts = 0;
    while (attempts < 20) {
        const exists = await prisma.case.findFirst({
            where: { workspaceId, caseNumber: candidate },
            select: { id: true }
        });
        if (!exists) break;
        nextSeq = getNextSequence(nextSeq);
        candidate = `${datePrefix}-${nextSeq}`;
        attempts++;
    }

    return candidate;
};

export default {
    generateCaseNumber,
    getNextSequence
};

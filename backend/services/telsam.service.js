import prisma from '../lib/prisma.js';

// Helper to build Telsam API URL
function buildTelsamUrl(config, action, extraParams = {}) {
    const url = new URL(config.siteUrl.startsWith('http') ? config.siteUrl : `https://${config.siteUrl}`);
    url.searchParams.set('username', config.username);
    url.searchParams.set('password', config.password);
    url.searchParams.set('action', action);
    for (const [k, v] of Object.entries(extraParams)) {
        url.searchParams.set(k, v);
    }
    return url.toString();
}

function normalizePhoneNumber(phone) {
    if (!phone) return null;
    let num = phone.replace(/\D/g, '');
    if (num.startsWith('0')) {
        num = num.substring(1);
    }
    if (num.length === 10 && !num.startsWith('90')) {
        num = '90' + num;
    }
    return num;
}

export async function getTelsamConfig(workspaceId) {
    return await prisma.telsamConfig.findUnique({
        where: { workspaceId }
    });
}

export async function testConnection(config) {
    const url = buildTelsamUrl(config, 'activecalls');
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Telsam API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data;
}

export async function initiateCall(workspaceId, phoneNumber, userExtension) {
    const config = await getTelsamConfig(workspaceId);
    if (!config) throw new Error('Telsam config not found');

    const url = buildTelsamUrl(config, 'callnumber', {
        number: phoneNumber,
        internal: userExtension
    });

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Telsam API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.text();
    return data;
}

export async function getActiveCalls(workspaceId) {
    const config = await getTelsamConfig(workspaceId);
    if (!config) throw new Error('Telsam config not found');

    const url = buildTelsamUrl(config, 'activecalls');
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Telsam API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data;
}

export async function getCDRRecords(workspaceId, dateFrom, dateTo, phoneNumber) {
    const config = await getTelsamConfig(workspaceId);
    if (!config) throw new Error('Telsam config not found');

    const extraParams = { uf: 'yes' };
    if (dateFrom) extraParams.date1 = dateFrom;
    if (dateTo) extraParams.date2 = dateTo;
    if (phoneNumber) extraParams.number = phoneNumber;

    const url = buildTelsamUrl(config, 'cdr', extraParams);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Telsam API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data;
}

export async function getCallRecording(workspaceId, cdrId) {
    const config = await getTelsamConfig(workspaceId);
    if (!config) throw new Error('Telsam config not found');

    const url = buildTelsamUrl(config, 'getrecord', { id: cdrId });
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Telsam API error: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
}

export async function matchContactByPhone(workspaceId, phoneNumber) {
    const normalized = normalizePhoneNumber(phoneNumber);
    if (!normalized) return null;

    // We'll search for the number or similar combinations
    const contact = await prisma.contact.findFirst({
        where: {
            workspaceId,
            phone: {
                contains: normalized.substring(2) // Search without country code for broader match
            }
        }
    });
    return contact;
}

export async function syncCDRRecords(workspaceId, dateFrom, dateTo) {
    const config = await getTelsamConfig(workspaceId);
    if (!config) throw new Error('Telsam config not found');

    const records = await getCDRRecords(workspaceId, dateFrom, dateTo);
    if (!Array.isArray(records)) {
        throw new Error('Invalid CDR data from Telsam');
    }

    const results = [];
    for (const record of records) {
        const { id, calldate, src, dst, duration, disposition } = record;
        
        // Find if this already exists
        const existingLog = await prisma.telsamCallLog.findUnique({
            where: {
                configId_externalId: {
                    configId: config.id,
                    externalId: String(id)
                }
            }
        });

        if (existingLog) continue; // Skip existing

        // Check direction (simplified logic based on typical PBX patterns)
        const direction = (src.length > 4 && dst.length <= 4) ? 'INBOUND' : 'OUTBOUND';
        const externalPhone = direction === 'INBOUND' ? src : dst;
        
        // Match contact
        const contact = await matchContactByPhone(workspaceId, externalPhone);

        // Convert calldate (assuming DDMMYYYYHHmm to ISO or Date)
        // Note: Implement real date parsing logic based on actual Telsam CDR date format
        // For now using simple fallback
        let callDateObj = new Date();
        if (calldate && calldate.length === 12) {
            const DD = calldate.substring(0,2);
            const MM = calldate.substring(2,4);
            const YYYY = calldate.substring(4,8);
            const HH = calldate.substring(8,10);
            const mm = calldate.substring(10,12);
            callDateObj = new Date(`${YYYY}-${MM}-${DD}T${HH}:${mm}:00Z`);
        }

        const callLog = await prisma.telsamCallLog.create({
            data: {
                configId: config.id,
                workspaceId,
                contactId: contact ? contact.id : null,
                externalId: String(id),
                direction,
                src,
                dst,
                duration: parseInt(duration) || 0,
                disposition,
                callDate: callDateObj
            }
        });
        
        // Optionally create contact activity
        if (contact) {
            // Case miras al
            let telsamCaseId = null;
            try {
                const activeCase = await prisma.case.findFirst({
                    where: { contactId: contact.id, workspaceId, status: 'ACTIVE' },
                    orderBy: { updatedAt: 'desc' },
                    select: { id: true }
                });
                telsamCaseId = activeCase?.id || null;
            } catch (_) {}

            await prisma.contactActivity.create({
                data: {
                    contactId: contact.id,
                    workspaceId,
                    type: 'TELSAM_CALL',
                    description: `${direction} call ${disposition} duration: ${duration}s`,
                    metadata: { callLogId: callLog.id },
                    ...(telsamCaseId ? { caseId: telsamCaseId } : {})
                }
            });
        }
        
        results.push(callLog);
    }
    return results;
}

export async function processWebhookEvent(workspaceId, eventData) {
    // Process webhook logic
    return { status: 'received' };
}

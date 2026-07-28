import prisma from '../lib/prisma.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';

/**
 * Merges sourceContact into targetContact.
 * Moves all related records (conversations, cases, activities, deals, form submissions, attributions, group members).
 * Merges contact fields (tags, phones, emails, notes, facebookId, instagramId, whatsappId).
 * Finally deletes the sourceContact.
 * 
 * @param {string} targetContactId The ID of the contact to keep
 * @param {string} sourceContactId The ID of the contact to merge and delete
 * @returns {object} The merged target contact
 */
export const mergeContacts = async (targetContactId, sourceContactId) => {
    if (targetContactId === sourceContactId) {
        throw new Error('Cannot merge a contact into itself');
    }

    // Fetch both contacts
    const targetContact = await prisma.contact.findUnique({ where: { id: targetContactId } });
    const sourceContact = await prisma.contact.findUnique({ where: { id: sourceContactId } });

    if (!targetContact || !sourceContact) {
        throw new Error('One or both contacts not found');
    }

    if (targetContact.workspaceId !== sourceContact.workspaceId) {
        throw new Error('Cannot merge contacts from different workspaces');
    }

    console.log(`🔄 [Contact Merge] Merging source: ${sourceContactId} (${sourceContact.name}) -> target: ${targetContactId} (${targetContact.name})`);

    // We need to do this in a transaction if possible, but some operations might need careful handling (e.g. unique constraint on ContactGroupMember).
    // Let's migrate related entities one by one.

    // 1. Conversations
    await prisma.conversation.updateMany({
        where: { contactId: sourceContactId },
        data: { contactId: targetContactId }
    });

    // 2. Cases
    await prisma.case.updateMany({
        where: { contactId: sourceContactId },
        data: { contactId: targetContactId }
    });

    // 3. ContactActivity
    await prisma.contactActivity.updateMany({
        where: { contactId: sourceContactId },
        data: { contactId: targetContactId }
    });

    // 4. Deal
    await prisma.deal.updateMany({
        where: { contactId: sourceContactId },
        data: { contactId: targetContactId }
    });

    // 5. FormSubmission
    await prisma.formSubmission.updateMany({
        where: { contactId: sourceContactId },
        data: { contactId: targetContactId }
    });

    // 6. ContactAttribution
    await prisma.contactAttribution.updateMany({
        where: { contactId: sourceContactId },
        data: { contactId: targetContactId }
    });

    // 7. ContactGroupMember - needs to avoid duplicates
    const sourceGroups = await prisma.contactGroupMember.findMany({
        where: { contactId: sourceContactId }
    });
    
    if (sourceGroups.length > 0) {
        const targetGroups = await prisma.contactGroupMember.findMany({
            where: { contactId: targetContactId }
        });
        const targetGroupIds = new Set(targetGroups.map(g => g.groupId));

        for (const sg of sourceGroups) {
            if (targetGroupIds.has(sg.groupId)) {
                // Target already in this group, just delete the source membership
                await prisma.contactGroupMember.delete({ where: { id: sg.id } });
            } else {
                // Move source membership to target
                await prisma.contactGroupMember.update({
                    where: { id: sg.id },
                    data: { contactId: targetContactId }
                });
            }
        }
    }

    // Merge Contact Fields
    const updateData = {};

    // Basic fields: use target's if present, otherwise source's
    if (!targetContact.phone && sourceContact.phone) updateData.phone = sourceContact.phone;
    if (!targetContact.email && sourceContact.email) updateData.email = sourceContact.email;
    if (!targetContact.company && sourceContact.company) updateData.company = sourceContact.company;
    if (!targetContact.notes && sourceContact.notes) updateData.notes = sourceContact.notes;
    else if (targetContact.notes && sourceContact.notes) updateData.notes = targetContact.notes + '\n\n---\n\n' + sourceContact.notes;

    // Social IDs (facebookId, instagramId, whatsappId)
    if (!targetContact.facebookId && sourceContact.facebookId) updateData.facebookId = sourceContact.facebookId;
    if (!targetContact.instagramId && sourceContact.instagramId) updateData.instagramId = sourceContact.instagramId;
    if (!targetContact.whatsappId && sourceContact.whatsappId) updateData.whatsappId = sourceContact.whatsappId;

    // Tags
    let targetTags = [];
    try { targetTags = targetContact.tags ? JSON.parse(targetContact.tags) : []; } catch (e) { targetTags = []; }
    let sourceTags = [];
    try { sourceTags = sourceContact.tags ? JSON.parse(sourceContact.tags) : []; } catch (e) { sourceTags = []; }
    
    if (sourceTags.length > 0) {
        const mergedTags = [...new Set([...targetTags, ...sourceTags])];
        updateData.tags = JSON.stringify(mergedTags);
    }

    // Phones array
    let targetPhones = [];
    try { targetPhones = targetContact.phones ? JSON.parse(targetContact.phones) : []; } catch (e) { targetPhones = []; }
    let sourcePhones = [];
    try { sourcePhones = sourceContact.phones ? JSON.parse(sourceContact.phones) : []; } catch (e) { sourcePhones = []; }
    
    if (sourcePhones.length > 0 || (sourceContact.phone && !targetPhones.includes(sourceContact.phone))) {
        const allPhones = [...targetPhones, ...sourcePhones, sourceContact.phone, targetContact.phone].filter(Boolean);
        const mergedPhones = [...new Set(allPhones.map(p => normalizePhone(p)))];
        updateData.phones = JSON.stringify(mergedPhones);
    }

    // Status: if source is hotter, use source
    const statusOrder = ['NEW', 'OPPORTUNITY', 'IN_PROGRESS', 'WON', 'LOST'];
    const targetStatusIdx = statusOrder.indexOf(targetContact.status);
    const sourceStatusIdx = statusOrder.indexOf(sourceContact.status);
    if (sourceStatusIdx > targetStatusIdx) {
        updateData.status = sourceContact.status;
    }

    // Update target contact
    if (Object.keys(updateData).length > 0) {
        await prisma.contact.update({
            where: { id: targetContactId },
            data: updateData
        });
    }

    // Delete source contact
    await prisma.contact.delete({
        where: { id: sourceContactId }
    });

    console.log(`✅ [Contact Merge] Successfully merged ${sourceContactId} into ${targetContactId}`);

    return await prisma.contact.findUnique({
        where: { id: targetContactId },
        include: {
            conversations: true
        }
    });
};

/**
 * Cleanup script to remove orphan conversations and contacts
 * (conversations without linked WhatsApp/Facebook/Email channels)
 * (contacts without any conversations)
 * 
 * Run with: node cleanup-orphan-conversations.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupOrphanData() {
    console.log('🧹 Starting orphan data cleanup...\n');

    try {
        // ===== STEP 1: FIND ORPHAN CONVERSATIONS =====
        
        // Find WhatsApp conversations with no linked phone number
        const orphanWhatsappConvs = await prisma.conversation.findMany({
            where: {
                channel: 'WHATSAPP',
                whatsappPhoneNumberId: { not: null }
            },
            include: {
                whatsappPhoneNumber: true
            }
        });

        const orphanWAIds = orphanWhatsappConvs
            .filter(c => !c.whatsappPhoneNumber)
            .map(c => c.id);

        console.log(`📱 Found ${orphanWAIds.length} orphan WhatsApp conversations`);

        // Find Facebook conversations with no linked page
        const orphanFacebookConvs = await prisma.conversation.findMany({
            where: {
                channel: { in: ['FACEBOOK', 'INSTAGRAM'] },
                facebookPageId: { not: null }
            },
            include: {
                facebookPage: true
            }
        });

        const orphanFBIds = orphanFacebookConvs
            .filter(c => !c.facebookPage)
            .map(c => c.id);

        console.log(`📘 Found ${orphanFBIds.length} orphan Facebook/Instagram conversations`);

        // Find Email conversations with no linked channel
        const orphanEmailConvs = await prisma.conversation.findMany({
            where: {
                channel: 'EMAIL',
                emailChannelId: { not: null }
            },
            include: {
                emailChannel: true
            }
        });

        const orphanEmailIds = orphanEmailConvs
            .filter(c => !c.emailChannel)
            .map(c => c.id);

        console.log(`📧 Found ${orphanEmailIds.length} orphan Email conversations`);

        const allOrphanIds = [...orphanWAIds, ...orphanFBIds, ...orphanEmailIds];

        if (allOrphanIds.length > 0) {
            console.log(`\n🗑️ Total orphan conversations to delete: ${allOrphanIds.length}`);

            // Delete messages
            const msgDeleted = await prisma.message.deleteMany({
                where: { conversationId: { in: allOrphanIds } }
            });
            console.log(`   - Deleted ${msgDeleted.count} messages`);

            // Delete internal notes
            const notesDeleted = await prisma.internalNote.deleteMany({
                where: { conversationId: { in: allOrphanIds } }
            });
            console.log(`   - Deleted ${notesDeleted.count} internal notes`);

            // Delete transfers
            const transfersDeleted = await prisma.conversationTransfer.deleteMany({
                where: { conversationId: { in: allOrphanIds } }
            });
            console.log(`   - Deleted ${transfersDeleted.count} transfers`);

            // Delete conversations
            const convsDeleted = await prisma.conversation.deleteMany({
                where: { id: { in: allOrphanIds } }
            });
            console.log(`   - Deleted ${convsDeleted.count} conversations`);
        } else {
            console.log('\n✅ No orphan conversations found.');
        }

        // ===== STEP 2: FIND AND DELETE ORPHAN CONTACTS =====
        console.log('\n🔍 Checking for orphan contacts...');
        
        // Find all contacts
        const allContacts = await prisma.contact.findMany({
            select: { id: true, name: true }
        });
        
        let orphanContactCount = 0;
        
        for (const contact of allContacts) {
            // Check if contact has any conversations
            const convCount = await prisma.conversation.count({
                where: { contactId: contact.id }
            });
            
            if (convCount === 0) {
                await prisma.contact.delete({ where: { id: contact.id } }).catch(() => {});
                orphanContactCount++;
            }
        }
        
        console.log(`👤 Deleted ${orphanContactCount} orphan contacts (contacts with no conversations)`);

        // ===== STEP 3: DELETE ORPHAN LEADS =====
        console.log('\n🔍 Checking for orphan leads...');
        
        const allLeads = await prisma.facebookLead.findMany({
            include: {
                facebookPage: true
            }
        });
        
        const orphanLeadIds = allLeads
            .filter(l => !l.facebookPage)
            .map(l => l.id);
        
        if (orphanLeadIds.length > 0) {
            const leadsDeleted = await prisma.facebookLead.deleteMany({
                where: { id: { in: orphanLeadIds } }
            });
            console.log(`📋 Deleted ${leadsDeleted.count} orphan leads`);
        } else {
            console.log('📋 No orphan leads found.');
        }

        console.log('\n✅ Cleanup complete!');

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
    } finally {
        await prisma.$disconnect();
    }
}

cleanupOrphanData();


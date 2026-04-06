/**
 * Cleanup script for orphan data
 * - Orphan conversations (broken channel references) → channel ref is NULLIFIED, data preserved
 * - Orphan leads (no linked Facebook page) → deleted
 * 
 * ⚠️  This script NEVER deletes conversations or messages.
 *     It only clears broken foreign key references.
 * 
 * Run with: node cleanup-orphan-conversations.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupOrphanData() {
    console.log('🧹 Starting orphan data cleanup...\n');

    try {
        // ===== STEP 1: FIND & FIX ORPHAN CONVERSATIONS =====
        // Instead of deleting, we nullify the broken channel reference
        // so conversations and messages are PRESERVED.
        
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

        // Find Facebook/Instagram conversations with no linked page
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

        // Nullify broken channel references (SAFE - no data loss)
        if (orphanWAIds.length > 0) {
            const updated = await prisma.conversation.updateMany({
                where: { id: { in: orphanWAIds } },
                data: { whatsappPhoneNumberId: null }
            });
            console.log(`   ✅ Cleared ${updated.count} broken WhatsApp references (conversations preserved)`);
        }

        if (orphanFBIds.length > 0) {
            const updated = await prisma.conversation.updateMany({
                where: { id: { in: orphanFBIds } },
                data: { facebookPageId: null }
            });
            console.log(`   ✅ Cleared ${updated.count} broken Facebook/Instagram references (conversations preserved)`);
        }

        if (orphanEmailIds.length > 0) {
            const updated = await prisma.conversation.updateMany({
                where: { id: { in: orphanEmailIds } },
                data: { emailChannelId: null }
            });
            console.log(`   ✅ Cleared ${updated.count} broken Email references (conversations preserved)`);
        }

        const totalOrphans = orphanWAIds.length + orphanFBIds.length + orphanEmailIds.length;
        if (totalOrphans === 0) {
            console.log('\n✅ No orphan conversations found.');
        } else {
            console.log(`\n✅ Fixed ${totalOrphans} orphan conversations (data preserved, broken refs cleared)`);
        }

        // ===== STEP 2: DELETE ORPHAN LEADS =====
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


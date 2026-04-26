/**
 * Bu script, telefon numarası olan ve status'ü NEW olan tüm contact'ları
 * POTENTIAL olarak günceller.
 * 
 * Kullanım: node update-contacts-potential.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateContactsToPotential() {
    console.log('🔄 Starting contact status migration...');
    console.log('-------------------------------------------');
    
    try {
        // Telefon numarası olan ve status'ü NEW olan contact'ları bul
        const contactsToUpdate = await prisma.contact.findMany({
            where: {
                phone: { not: null },
                status: 'NEW'
            },
            select: {
                id: true,
                name: true,
                phone: true,
                status: true,
                workspaceId: true
            }
        });

        console.log(`📱 Found ${contactsToUpdate.length} contacts with phone and status=NEW`);

        if (contactsToUpdate.length === 0) {
            console.log('✅ No contacts need to be updated.');
            return;
        }

        // Batch update
        const result = await prisma.contact.updateMany({
            where: {
                phone: { not: null },
                status: 'NEW'
            },
            data: {
                status: 'POTENTIAL'
            }
        });

        console.log(`✅ Updated ${result.count} contacts to POTENTIAL status`);
        console.log('-------------------------------------------');

        // Show first 10 examples
        console.log('\n📋 Examples of updated contacts:');
        contactsToUpdate.slice(0, 10).forEach(contact => {
            console.log(`   - ${contact.name || 'No name'} (${contact.phone})`);
        });

        if (contactsToUpdate.length > 10) {
            console.log(`   ... and ${contactsToUpdate.length - 10} more`);
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

updateContactsToPotential();


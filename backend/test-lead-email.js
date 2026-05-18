import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { executeLeadAutomation } from './controllers/automation.controller.js';

const prisma = new PrismaClient();

async function testEmail() {
    try {
        console.log('En son lead bulunuyor...');
        const latestContact = await prisma.contact.findFirst({
            where: { isLead: true },
            orderBy: { createdAt: 'desc' }
        });

        if (!latestContact) {
            console.log('Sistemde lead bulunamadı.');
            process.exit(0);
        }

        console.log(`Lead bulundu: ${latestContact.name} (${latestContact.id})`);
        
        // Lead kaydını da bulalım
        const leadRecord = {
            id: latestContact.id,
            name: latestContact.name,
            phone: latestContact.phone,
            email: latestContact.email
        };

        console.log('Otomasyon tetikleniyor (Mail gönderilecek)...');
        await executeLeadAutomation(latestContact.workspaceId, leadRecord, latestContact);
        console.log('İşlem tamamlandı! E-postanızı kontrol edin.');
        
    } catch (error) {
        console.error('Hata:', error);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}

testEmail();

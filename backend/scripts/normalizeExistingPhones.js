/**
 * Mevcut veritabanındaki telefon numaralarını normalize eden script
 * Tek seferlik çalıştırılacak.
 * 
 * Kullanım: node scripts/normalizeExistingPhones.js
 */
import { PrismaClient } from '@prisma/client';
import { normalizePhone, normalizePhonesArray } from '../utils/phoneNormalizer.js';

const prisma = new PrismaClient();

async function normalizeExistingPhones() {
    console.log('🔧 Telefon numarası normalizasyonu başlıyor...\n');

    // 1. Contacts tablosundaki phone alanı
    const contacts = await prisma.contact.findMany({
        where: { phone: { not: null } },
        select: { id: true, phone: true, phones: true }
    });

    let contactUpdated = 0;
    for (const contact of contacts) {
        const updates = {};

        if (contact.phone) {
            const normalized = normalizePhone(contact.phone);
            if (normalized !== contact.phone) {
                updates.phone = normalized;
            }
        }

        if (contact.phones && contact.phones !== '[]') {
            const normalized = normalizePhonesArray(contact.phones);
            if (normalized !== contact.phones) {
                updates.phones = normalized;
            }
        }

        if (Object.keys(updates).length > 0) {
            await prisma.contact.update({
                where: { id: contact.id },
                data: updates
            });
            contactUpdated++;
            console.log(`  ✅ Contact: ${contact.phone} → ${updates.phone || contact.phone}`);
        }
    }
    console.log(`\n📇 Contacts: ${contactUpdated}/${contacts.length} güncellendi\n`);

    // 2. Conversations tablosundaki contactPhone alanı
    const conversations = await prisma.conversation.findMany({
        where: { contactPhone: { not: null } },
        select: { id: true, contactPhone: true }
    });

    let convUpdated = 0;
    for (const conv of conversations) {
        const normalized = normalizePhone(conv.contactPhone);
        if (normalized !== conv.contactPhone) {
            await prisma.conversation.update({
                where: { id: conv.id },
                data: { contactPhone: normalized }
            });
            convUpdated++;
            console.log(`  ✅ Conversation: ${conv.contactPhone} → ${normalized}`);
        }
    }
    console.log(`\n💬 Conversations: ${convUpdated}/${conversations.length} güncellendi\n`);

    // 3. Appointments tablosundaki phone alanı
    const appointments = await prisma.appointment.findMany({
        where: { phone: { not: null } },
        select: { id: true, phone: true }
    });

    let apptUpdated = 0;
    for (const appt of appointments) {
        const normalized = normalizePhone(appt.phone);
        if (normalized !== appt.phone) {
            await prisma.appointment.update({
                where: { id: appt.id },
                data: { phone: normalized }
            });
            apptUpdated++;
            console.log(`  ✅ Appointment: ${appt.phone} → ${normalized}`);
        }
    }
    console.log(`\n📅 Appointments: ${apptUpdated}/${appointments.length} güncellendi\n`);

    console.log('✅ Normalizasyon tamamlandı!');
    console.log(`Toplam: ${contactUpdated + convUpdated + apptUpdated} kayıt güncellendi`);
}

normalizeExistingPhones()
    .catch(console.error)
    .finally(() => prisma.$disconnect());

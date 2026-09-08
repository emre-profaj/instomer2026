/**
 * Migration: AppointmentDoctor → CalendarResource + ResourceBranch
 * 
 * Bu script mevcut AppointmentDoctor kayıtlarını CalendarResource'a taşır
 * ve ResourceBranch ilişkilerini oluşturur.
 * 
 * Kullanım: node scripts/migrate-doctors-to-resources.js
 * NOT: Sadece 1 kez çalıştırılmalıdır!
 */

import prisma from '../lib/prisma.js';

async function migrate() {
    console.log('🔄 Migration başlıyor: AppointmentDoctor → CalendarResource + ResourceBranch\n');

    // 1. Tüm AppointmentDoctor kayıtlarını al
    const doctors = await prisma.appointmentDoctor.findMany({
        include: { branch: true }
    });
    console.log(`📋 ${doctors.length} AppointmentDoctor kaydı bulundu`);

    let created = 0;
    let linked = 0;
    let skipped = 0;

    for (const doctor of doctors) {
        // 2. CalendarResource'ta karşılığı var mı?
        let resource = await prisma.calendarResource.findFirst({
            where: {
                workspaceId: doctor.branch.workspaceId,
                name: { equals: doctor.name, mode: 'insensitive' }
            }
        });

        if (!resource) {
            // CalendarResource oluştur
            resource = await prisma.calendarResource.create({
                data: {
                    workspaceId: doctor.branch.workspaceId,
                    name: doctor.name,
                    title: doctor.title,
                    type: 'PERSON',
                    userId: doctor.userId,
                    availableStart: doctor.workStart || '09:00',
                    availableEnd: doctor.workEnd || '17:00',
                    availableDays: doctor.workingDays || JSON.stringify([1, 2, 3, 4, 5]),
                    slotMinutes: doctor.slotMinutes || 30,
                    branchId: doctor.branchId,
                    isActive: doctor.isActive,
                    color: '#3b82f6'
                }
            });
            created++;
            console.log(`  ✅ Oluşturuldu: ${doctor.name} (${doctor.branch.name})`);
        } else {
            // Mevcut kaydı güncelle (eksik alanları doldur)
            await prisma.calendarResource.update({
                where: { id: resource.id },
                data: {
                    title: resource.title || doctor.title,
                    userId: resource.userId || doctor.userId,
                    availableStart: resource.availableStart || doctor.workStart,
                    availableEnd: resource.availableEnd || doctor.workEnd,
                    availableDays: resource.availableDays || doctor.workingDays,
                    slotMinutes: resource.slotMinutes || doctor.slotMinutes || 30
                }
            });
            skipped++;
        }

        // 3. ResourceBranch oluştur (yoksa)
        try {
            await prisma.resourceBranch.upsert({
                where: {
                    resourceId_branchId: {
                        resourceId: resource.id,
                        branchId: doctor.branchId
                    }
                },
                update: { isAvailable: true },
                create: {
                    resourceId: resource.id,
                    branchId: doctor.branchId,
                    isAvailable: doctor.isActive
                }
            });
            linked++;
        } catch (e) {
            // Zaten var, sorun yok
        }
    }

    // 4. Mevcut CalendarResource.branchId → ResourceBranch'e dönüştür
    const resourcesWithBranch = await prisma.calendarResource.findMany({
        where: { branchId: { not: null } }
    });

    let legacyLinked = 0;
    for (const res of resourcesWithBranch) {
        try {
            await prisma.resourceBranch.upsert({
                where: {
                    resourceId_branchId: {
                        resourceId: res.id,
                        branchId: res.branchId
                    }
                },
                update: {},
                create: {
                    resourceId: res.id,
                    branchId: res.branchId,
                    isAvailable: res.isActive
                }
            });
            legacyLinked++;
        } catch (e) {}
    }

    console.log(`\n📊 Migration Sonuçları:`);
    console.log(`  ✅ Yeni CalendarResource: ${created}`);
    console.log(`  🔄 Güncellenen (zaten vardı): ${skipped}`);
    console.log(`  🔗 ResourceBranch bağlantısı: ${linked}`);
    console.log(`  🔗 Legacy branchId → ResourceBranch: ${legacyLinked}`);
    console.log('\n✅ Migration tamamlandı!');

    await prisma.$disconnect();
}

migrate().catch(err => {
    console.error('❌ Migration hatası:', err);
    process.exit(1);
});

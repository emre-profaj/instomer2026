import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 marketing_recipients tablosundaki geçersiz contactId kayıtları kontrol ediliyor...');

    try {
        const result = await prisma.$executeRawUnsafe(`
            UPDATE marketing_recipients 
            SET "contactId" = NULL 
            WHERE "contactId" IS NOT NULL 
              AND "contactId" NOT IN (SELECT id FROM contacts);
        `);

        console.log(`✅ Temizlenen yetim contactId kayıt sayısı: ${result}`);
        console.log('🚀 Artık "npx prisma db push" komutunu çalıştırabilirsiniz.');
    } catch (error) {
        console.error('❌ Hata oluştu:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();

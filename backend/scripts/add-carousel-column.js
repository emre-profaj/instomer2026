/**
 * whatsapp_templates.carouselCards sütununu ekler.
 *
 * Meta, carousel kartının görselini yalnızca "handle" olarak döndürür ve
 * handle'dan bağlantı üretilemez. Mesaj GÖNDERİRKEN her karta bağlantı
 * vermek zorunlu olduğu için, şablonu oluştururken yüklediğimiz dosyanın
 * URL'ini kendi tarafımızda saklıyoruz.
 *
 *   node scripts/add-carousel-column.js
 */
import prisma from '../lib/prisma.js';

const r = await prisma.$executeRawUnsafe(
    `ALTER TABLE "whatsapp_templates" ADD COLUMN IF NOT EXISTS "carouselCards" TEXT`
);
const [row] = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'whatsapp_templates' AND column_name = 'carouselCards'`
);
console.log(row ? '✅ Sütun hazır: whatsapp_templates.carouselCards' : '❌ Eklenemedi');
await prisma.$disconnect();

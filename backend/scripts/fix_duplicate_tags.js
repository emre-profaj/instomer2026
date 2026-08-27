/**
 * Tüm contact'lardaki duplikat etiketleri temizle
 * Kullanım: node scripts/fix_duplicate_tags.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Duplikat etiketleri olan contact\'lar aranıyor...');
    
    const contacts = await prisma.contact.findMany({
        where: {
            tags: { not: null }
        },
        select: { id: true, tags: true, name: true }
    });

    let fixedCount = 0;

    for (const contact of contacts) {
        try {
            const tags = JSON.parse(contact.tags || '[]');
            if (!Array.isArray(tags)) continue;
            
            const uniqueTags = [...new Set(tags)];
            
            if (uniqueTags.length < tags.length) {
                const removed = tags.length - uniqueTags.length;
                await prisma.contact.update({
                    where: { id: contact.id },
                    data: { tags: JSON.stringify(uniqueTags) }
                });
                fixedCount++;
                console.log(`  ✅ ${contact.name || contact.id}: ${tags.length} → ${uniqueTags.length} (${removed} duplikat silindi)`);
            }
        } catch (e) {
            // JSON parse error, skip
        }
    }

    console.log(`\n✅ Toplam ${fixedCount} contact düzeltildi (${contacts.length} contact tarandı)`);
    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

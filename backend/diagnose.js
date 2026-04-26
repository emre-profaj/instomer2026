const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Diyagnoz başlatılıyor...');

    // 1. Tüm Kullanıcıları ve Workspacelerini listele
    const users = await prisma.user.findMany({
        include: {
            workspaceMembers: {
                include: {
                    workspace: true
                }
            }
        }
    });

    console.log('\n👥 KULLANICILAR VE ÇALIŞMA ALANLARI:');
    users.forEach(user => {
        console.log(`\nUser: ${user.name} (${user.email}) [ID: ${user.id}]`);
        if (user.workspaceMembers.length === 0) {
            console.log('  ❌ Hiçbir workspace üyesi değil!');
        } else {
            user.workspaceMembers.forEach(wm => {
                console.log(`  🏠 Workspace: ${wm.workspace.name} (Rol: ${wm.role})`);
                console.log(`     ID: ${wm.workspace.id}`);
                console.log(`     Slug: ${wm.workspace.slug}`);
            });
        }
    });

    // 2. Tüm Facebook Sayfalarını Listele
    const pages = await prisma.facebookPage.findMany();
    console.log('\n📄 FACEBOOK SAYFALARI:');

    if (pages.length === 0) {
        console.log('  ❌ Hiç kayıtlı sayfa yok.');
    } else {
        for (const page of pages) {
            console.log(`\n  Facebook Page: ${page.pageName} (ID: ${page.pageId})`);
            console.log(`  🔗 Bağlı olduğu Workspace ID: ${page.workspaceId}`);

            // Hangi workspace bu?
            const ws = await prisma.workspace.findUnique({ where: { id: page.workspaceId } });
            if (ws) {
                console.log(`     👉 Workspace Adı: ${ws.name}`);
            } else {
                console.log(`     ❌ BU WORKSPACE BULUNAMADI! (Veri tutarsızlığı)`);
            }
        }
    }

    // 3. Özet Analiz
    console.log('\n🧐 ANALİZ SONUCU:');
    const orphanedPages = pages.filter(p => !p.workspaceId);
    if (orphanedPages.length > 0) {
        console.log(`⚠️  ${orphanedPages.length} sayfanın hiç workspace ID'si yok.`);
    } else {
        console.log('✓ Tüm sayfaların bir workspace ID'si var.');
    }

    console.log('\nLoglardaki beklenen Workspace ID ile yukarıdaki sayfaların Workspace ID\'lerini karşılaştırın.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

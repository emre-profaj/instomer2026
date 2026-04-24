require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
    const pages = await p.facebookPage.findMany({
        where: {
            OR: [
                { instagramBotId: { not: null } },
                { assignedBotId: { not: null } }
            ]
        },
        select: {
            workspaceId: true,
            pageName: true,
            pageId: true,
            instagramBusinessId: true,
            instagramBotId: true,
            assignedBotId: true
        }
    });

    const grouped = {};
    pages.forEach(page => {
        const key = page.instagramBusinessId || page.pageId;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(page);
    });

    let found = false;
    Object.entries(grouped).forEach(([id, ws]) => {
        if (ws.length > 1) {
            found = true;
            console.log('\n⚠️ DUPLIKAT SAYFA:', id);
            ws.forEach(w => console.log('  -', w.workspaceId, '|', w.pageName));
        }
    });

    if (!found) console.log('✅ Duplikat sayfa bulunamadı');
    console.log('Toplam sayfa:', pages.length);
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

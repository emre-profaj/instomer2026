import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function testProbel() {
    const workspaceId = 'dbdb6e87-9769-4975-ad57-a984a1e8b995'; // From the user's logs
    const integration = await prisma.apiIntegration.findFirst({
        where: { workspaceId, authType: 'OAUTH_PASSWORD', isActive: true }
    });

    if (!integration) return console.log('No integration found');

    const response = await fetch(`${integration.baseUrl}/api/oracle/runasync`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${integration.authToken}`
        },
        body: JSON.stringify({
            stored_procedure: 'PKG_HSW_MBL_API.prc_get_uygun_gunler_list',
            cursor_list: ['ref_out_list'],
            input_data: { SUBE_KODU: 1, BRANS_KODU: 1700 }
        })
    });

    const data = await response.json();
    const resultList = data?.JsonData?.data?.ref_out_list || data?.ref_out_list || [];
    
    console.log(`Returned ${resultList.length} items`);
    if (resultList.length > 0) {
        console.log('Sample item:', resultList[0]);
        // Find the one for Laman Yagubova (doktor_kodu: '1700-01', servis_kodu: '278470')
        const target = resultList.filter(d => d.SERVIS_KODU == '278470');
        console.log(`Found ${target.length} items for target doctor`);
        if (target.length > 0) {
            console.log('Target item:', target[0]);
        }
    }
}

testProbel().catch(console.error);

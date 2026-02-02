/**
 * Token Doğrulama Scripti
 * Facebook, Instagram ve WhatsApp tokenlarını kontrol eder
 * Geçersiz tokenları workspace bilgileriyle listeler
 * 
 * Kullanım: node scripts/check-tokens.js
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

const GRAPH_API_VERSION = 'v21.0';

// Token durumlarını tutacak diziler
const results = {
    facebook: { valid: [], invalid: [] },
    whatsapp: { valid: [], invalid: [] }
};

// Test Facebook/Instagram token - basit /me kontrolü
async function testFacebookToken(page) {
    try {
        // Basit /me endpoint kontrolü - daha güvenilir
        const response = await axios.get(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/me`,
            {
                params: { access_token: page.pageAccessToken },
                timeout: 10000
            }
        );

        // Token çalışıyor, şimdi debug_token ile süre bilgisi alalım
        try {
            const debugResponse = await axios.get(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/debug_token`,
                {
                    params: {
                        input_token: page.pageAccessToken,
                        access_token: page.pageAccessToken
                    },
                    timeout: 10000
                }
            );

            const data = debugResponse.data?.data;
            const expiresAt = data?.expires_at;

            let expiryInfo = 'Bilinmiyor';
            if (expiresAt === 0) {
                expiryInfo = '♾️ Süresiz';
            } else if (expiresAt) {
                const expiryDate = new Date(expiresAt * 1000);
                const now = new Date();
                const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

                if (daysLeft < 0) {
                    expiryInfo = `❌ Süresi doldu`;
                } else if (daysLeft < 7) {
                    expiryInfo = `⚠️ ${daysLeft} gün kaldı`;
                } else {
                    expiryInfo = `${daysLeft} gün`;
                }
            }

            return { valid: true, expiryInfo };
        } catch (debugErr) {
            // Debug başarısız ama /me çalıştı - token geçerli
            return { valid: true, expiryInfo: '✅ Çalışıyor (süre bilinmiyor)' };
        }
    } catch (error) {
        return {
            valid: false,
            error: error.response?.data?.error?.message || error.message,
            errorCode: error.response?.data?.error?.code,
            expiryInfo: '❌ Token geçersiz'
        };
    }
}



// Test WhatsApp token
async function testWhatsAppToken(phone) {
    try {
        const response = await axios.get(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/${phone.phoneNumberId}`,
            {
                params: { access_token: phone.accessToken },
                timeout: 10000
            }
        );
        return { valid: true, data: response.data };
    } catch (error) {
        return {
            valid: false,
            error: error.response?.data?.error?.message || error.message,
            errorCode: error.response?.data?.error?.code
        };
    }
}

async function main() {
    console.log('🔍 Token Doğrulama Başlıyor...\n');
    console.log('='.repeat(80));

    // 1. Facebook/Instagram sayfalarını kontrol et
    console.log('\n📘 FACEBOOK/INSTAGRAM SAYFALARI');
    console.log('-'.repeat(80));

    const facebookPages = await prisma.facebookPage.findMany({
        include: {
            workspace: {
                select: { id: true, name: true, slug: true }
            }
        }
    });

    console.log(`Toplam ${facebookPages.length} Facebook sayfası bulundu\n`);

    for (const page of facebookPages) {
        process.stdout.write(`  Kontrol ediliyor: ${page.pageName}... `);
        const result = await testFacebookToken(page);

        if (result.valid) {
            console.log(`✅ Geçerli | Süre: ${result.expiryInfo}`);
            results.facebook.valid.push({
                pageId: page.pageId,
                pageName: page.pageName,
                workspaceName: page.workspace.name,
                workspaceSlug: page.workspace.slug,
                expiryInfo: result.expiryInfo
            });
        } else {

            console.log('❌ GEÇERSİZ');
            results.facebook.invalid.push({
                pageId: page.pageId,
                pageName: page.pageName,
                workspaceId: page.workspace.id,
                workspaceName: page.workspace.name,
                workspaceSlug: page.workspace.slug,
                hasInstagram: !!page.instagramBusinessId,
                instagramUsername: page.instagramUsername,
                error: result.error,
                errorCode: result.errorCode
            });
        }

        // Rate limiting
        await new Promise(r => setTimeout(r, 200));
    }

    // 2. WhatsApp numaralarını kontrol et
    console.log('\n\n📱 WHATSAPP NUMARALARI');
    console.log('-'.repeat(80));

    const whatsappPhones = await prisma.whatsappPhoneNumber.findMany({
        include: {
            workspace: {
                select: { id: true, name: true, slug: true }
            }
        }
    });

    console.log(`Toplam ${whatsappPhones.length} WhatsApp numarası bulundu\n`);

    for (const phone of whatsappPhones) {
        process.stdout.write(`  Kontrol ediliyor: ${phone.displayPhoneNumber}... `);
        const result = await testWhatsAppToken(phone);

        if (result.valid) {
            console.log('✅ Geçerli');
            results.whatsapp.valid.push({
                phoneNumberId: phone.phoneNumberId,
                displayPhoneNumber: phone.displayPhoneNumber,
                workspaceName: phone.workspace.name,
                workspaceSlug: phone.workspace.slug
            });
        } else {
            console.log('❌ GEÇERSİZ');
            results.whatsapp.invalid.push({
                phoneNumberId: phone.phoneNumberId,
                displayPhoneNumber: phone.displayPhoneNumber,
                workspaceId: phone.workspace.id,
                workspaceName: phone.workspace.name,
                workspaceSlug: phone.workspace.slug,
                error: result.error,
                errorCode: result.errorCode
            });
        }

        // Rate limiting
        await new Promise(r => setTimeout(r, 200));
    }

    // 3. Özet Raporu
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 ÖZET RAPOR');
    console.log('='.repeat(80));

    console.log(`
📘 Facebook/Instagram:
   ✅ Geçerli: ${results.facebook.valid.length}
   ❌ Geçersiz: ${results.facebook.invalid.length}

📱 WhatsApp:
   ✅ Geçerli: ${results.whatsapp.valid.length}
   ❌ Geçersiz: ${results.whatsapp.invalid.length}
`);

    // 4. Geçersiz tokenları detaylı listele
    if (results.facebook.invalid.length > 0) {
        console.log('\n🚨 GEÇERSİZ FACEBOOK/INSTAGRAM TOKENLARI:');
        console.log('-'.repeat(80));
        console.log('Workspace Adı                    | Sayfa Adı                | Instagram');
        console.log('-'.repeat(80));

        for (const item of results.facebook.invalid) {
            const wsName = item.workspaceName.substring(0, 30).padEnd(30);
            const pageName = item.pageName.substring(0, 24).padEnd(24);
            const instagram = item.instagramUsername || '-';
            console.log(`${wsName} | ${pageName} | ${instagram}`);
        }
    }

    if (results.whatsapp.invalid.length > 0) {
        console.log('\n🚨 GEÇERSİZ WHATSAPP TOKENLARI:');
        console.log('-'.repeat(80));
        console.log('Workspace Adı                    | Telefon');
        console.log('-'.repeat(80));

        for (const item of results.whatsapp.invalid) {
            const wsName = item.workspaceName.substring(0, 30).padEnd(30);
            console.log(`${wsName} | ${item.displayPhoneNumber}`);
        }
    }

    // 5. Workspace bazlı özet
    const affectedWorkspaces = new Set();
    results.facebook.invalid.forEach(i => affectedWorkspaces.add(i.workspaceName));
    results.whatsapp.invalid.forEach(i => affectedWorkspaces.add(i.workspaceName));

    if (affectedWorkspaces.size > 0) {
        console.log('\n\n📋 ETKİLENEN WORKSPACE\'LER (Token yenilemesi gereken):');
        console.log('-'.repeat(80));
        let index = 1;
        for (const ws of affectedWorkspaces) {
            console.log(`${index}. ${ws}`);
            index++;
        }
        console.log(`\nToplam: ${affectedWorkspaces.size} workspace etkilendi`);
    } else {
        console.log('\n\n✅ Tüm tokenlar geçerli! Hiçbir workspace etkilenmedi.');
    }

    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error('❌ Hata:', e);
    await prisma.$disconnect();
    process.exit(1);
});

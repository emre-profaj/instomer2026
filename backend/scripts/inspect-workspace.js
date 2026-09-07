import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

import prisma from '../lib/prisma.js';

const targetWorkspaceId = process.argv[2] || 'd2f62dfb-36ba-4b8c-a4b8-938be2ad3a6f';

async function inspectWorkspace() {
    console.log(`\n===============================================================`);
    console.log(`🔍 WORKSPACE DETAYLI ENTEGRASYON VE BAĞLANTI TARAMASI`);
    console.log(`🎯 Hedef Workspace ID: ${targetWorkspaceId}`);
    console.log(`===============================================================\n`);

    try {
        const ws = await prisma.workspace.findUnique({
            where: { id: targetWorkspaceId },
            include: {
                company: true,
                facebookPages: true,
                whatsappPhoneNumbers: true,
                emailChannels: true,
                webWidget: true,
                apiIntegrations: true,
                formWebhooks: true,
                telsamConfig: true,
                userGoogleCalendars: true,
                automations: {
                    select: {
                        id: true,
                        name: true,
                        trigger: true,
                        actions: true,
                        isActive: true
                    }
                }
            }
        });

        if (!ws) {
            console.error(`❌ Workspace bulunamadı: ${targetWorkspaceId}`);
            process.exit(1);
        }

        console.log(`🏢 [Workspace Bilgisi]`);
        console.log(`   - İsim       : ${ws.name}`);
        console.log(`   - Slug       : ${ws.slug}`);
        console.log(`   - Şirket     : ${ws.company?.name || 'Bağlı Şirket Yok'}`);
        console.log(`   - Oluşturma  : ${ws.createdAt?.toISOString()}`);
        console.log(`   - Güncelleme : ${ws.updatedAt?.toISOString()}`);

        console.log(`\n📡 [1. BAĞLI RESMİ KANALLAR]`);
        console.log(`   ├─ Facebook Sayfaları (${ws.facebookPages.length} adet):`);
        if (ws.facebookPages.length === 0) {
            console.log(`   │  └─ (Yok)`);
        } else {
            ws.facebookPages.forEach(p => {
                console.log(`   │  ├─ Sayfa: "${p.name}" (Page ID: ${p.pageId}) | Durum: ${p.isActive ? '✅ Aktif' : '❌ Pasif'}`);
            });
        }

        console.log(`   ├─ WhatsApp Numaraları (${ws.whatsappPhoneNumbers.length} adet):`);
        if (ws.whatsappPhoneNumbers.length === 0) {
            console.log(`   │  └─ (Yok)`);
        } else {
            ws.whatsappPhoneNumbers.forEach(w => {
                console.log(`   │  ├─ Tel: "${w.phoneNumber}" (Display: ${w.displayName || '-'})`);
                console.log(`   │  │  ├─ Phone Number ID: ${w.phoneNumberId}`);
                console.log(`   │  │  ├─ WABA ID: ${w.wabaId || '-'}`);
                console.log(`   │  │  └─ Durum: ${w.isActive ? '✅ Aktif' : '❌ Pasif'}`);
            });
        }

        console.log(`   ├─ E-posta Kanalları (${ws.emailChannels.length} adet):`);
        if (ws.emailChannels.length === 0) {
            console.log(`   │  └─ (Yok)`);
        } else {
            ws.emailChannels.forEach(e => {
                console.log(`   │  ├─ Provider: ${e.provider} | Email: ${e.email} | Durum: ${e.isActive ? '✅ Aktif' : '❌ Pasif'}`);
            });
        }

        console.log(`   └─ Web Widget (${ws.webWidget.length} adet):`);
        if (ws.webWidget.length === 0) {
            console.log(`      └─ (Yok)`);
        } else {
            ws.webWidget.forEach(ww => {
                console.log(`      ├─ Başlık: "${ww.title}" | Widget ID: ${ww.id} | Durum: ${ww.isActive ? '✅ Aktif' : '❌ Pasif'}`);
            });
        }

        console.log(`\n🔌 [2. DIŞ SERVİS VE CRM ENTEGRASYONLARI]`);
        console.log(`   ├─ API Entegrasyonları (ApiIntegration: ${ws.apiIntegrations.length} adet):`);
        if (ws.apiIntegrations.length === 0) {
            console.log(`   │  └─ (Tanımlı özel API entegrasyonu yok)`);
        } else {
            ws.apiIntegrations.forEach(api => {
                console.log(`   │  ├─ İsim: "${api.name}"`);
                console.log(`   │  │  ├─ Base URL: ${api.baseUrl}`);
                console.log(`   │  │  ├─ Auth Type: ${api.authType}`);
                console.log(`   │  │  └─ Durum: ${api.isActive ? '✅ Aktif' : '❌ Pasif'}`);
            });
        }

        console.log(`   ├─ Form / Webhook Kanalları (FormWebhook: ${ws.formWebhooks.length} adet):`);
        if (ws.formWebhooks.length === 0) {
            console.log(`   │  └─ (Tanımlı webhook formu yok)`);
        } else {
            ws.formWebhooks.forEach(fw => {
                console.log(`   │  ├─ Form: "${fw.name}" (Slug: ${fw.slug}) | Durum: ${fw.isActive ? '✅ Aktif' : '❌ Pasif'}`);
            });
        }

        console.log(`   ├─ Disao CRM Entegrasyonu:`);
        console.log(`   │  ├─ Aktif mi?: ${ws.disaoCrmEnabled ? '⚠️ EVET (Aktif)' : 'Hayır (Kapalı)'}`);
        if (ws.disaoCrmSettings) {
            console.log(`   │  └─ Ayarlar: ${JSON.stringify(ws.disaoCrmSettings)}`);
        }

        console.log(`   ├─ Retell AI Voice (Sesli Arama):`);
        console.log(`   │  ├─ API Key Tanımlı mı?: ${ws.retellApiKey ? 'Evet' : 'Hayır'}`);
        console.log(`   │  ├─ Agent ID: ${ws.retellAgentId || 'Tanımsız'}`);
        console.log(`   │  └─ From Number: ${ws.retellFromNumber || 'Tanımsız'}`);

        console.log(`   ├─ Telsam Santral (VoIP):`);
        console.log(`   │  └─ Durum: ${ws.telsamConfig ? '✅ Tanımlı' : 'Yok'}`);

        console.log(`   └─ Google Calendar Entegrasyonu:`);
        console.log(`      ├─ Workspace Seviyesi Client ID: ${ws.googleClientId ? 'Tanımlı' : 'Yok'}`);
        console.log(`      └─ Bağlı Kullanıcı Takvimleri: ${ws.userGoogleCalendars.length} adet`);

        console.log(`\n⚡ [3. OTOMASYONLARDA DIŞ WEBHOOK ÇAĞRILARI]`);
        let webhookActionsFound = 0;
        ws.automations.forEach(auto => {
            const rawActions = typeof auto.actions === 'string' ? JSON.parse(auto.actions || '[]') : (auto.actions || []);
            const webhookActions = (Array.isArray(rawActions) ? rawActions : []).filter(a =>
                a.type === 'WEBHOOK' || a.type === 'HTTP_REQUEST' || a.actionType === 'WEBHOOK' || (a.url && a.url.includes('http'))
            );
            if (webhookActions.length > 0) {
                webhookActionsFound++;
                console.log(`   ├─ ⚠️ Otomasyon: "${auto.name}" (Tetikleyici: ${auto.trigger}, Aktif: ${auto.isActive})`);
                webhookActions.forEach(wa => {
                    console.log(`   │  └─ Webhook URL: ${wa.url || wa.endpoint || JSON.stringify(wa)}`);
                });
            }
        });
        if (webhookActionsFound === 0) {
            console.log(`   └─ (Dışarıya veri gönderen webhook otomasyonu bulunamadı)`);
        }

        console.log(`\n🔎 [4. VERİTABANI İÇİNDE "KOMMO / AMO / WEBHOOK" İZLERİ]`);
        const kommoContacts = await prisma.contact.findMany({
            where: {
                workspaceId: targetWorkspaceId,
                OR: [
                    { source: { contains: 'kommo', mode: 'insensitive' } },
                    { source: { contains: 'amo', mode: 'insensitive' } },
                    { customAttributes: { contains: 'kommo', mode: 'insensitive' } },
                    { customAttributes: { contains: 'amo', mode: 'insensitive' } }
                ]
            },
            take: 5,
            select: { id: true, name: true, phone: true, source: true, customAttributes: true }
        });

        if (kommoContacts.length > 0) {
            console.log(`   ⚠️ DİKKAT: "Kommo / Amo" izi taşıyan ${kommoContacts.length} kişi bulundu:`);
            kommoContacts.forEach(c => {
                console.log(`   ├─ ${c.name || c.phone} | Source: ${c.source} | Attributes: ${c.customAttributes}`);
            });
        } else {
            console.log(`   ✅ Kişi kayıtlarında "kommo" kaynak izine rastlanmadı.`);
        }

        console.log(`\n===============================================================`);
        console.log(`💡 KOMMO / AMOCRM DEĞERLENDİRMESİ:`);
        console.log(`===============================================================`);
        if (ws.whatsappPhoneNumbers.length > 0) {
            console.log(`📌 Bu workspace'de tanımlı WhatsApp numarası:`);
            ws.whatsappPhoneNumbers.forEach(w => {
                console.log(`   - Tel: ${w.phoneNumber} (WABA ID: ${w.wabaId || 'Yok'}, Phone ID: ${w.phoneNumberId})`);
            });
            console.log(`\n⚠️ KOMMO NASIL ÇAKIŞIR?`);
            console.log(`   1) Kommo doğrudan Meta (Facebook Business Manager) üzerinden bu WhatsApp numarasına bağlıysa:`);
            console.log(`      Meta gelen mesaj webhook'larını hem Kommo'ya hem Instomer'a göndermeye çalışır veya biri diğerini ezer.`);
            console.log(`   2) Kontrol için: https://business.facebook.com adresine girip:`);
            console.log(`      İşletme Ayarları > WhatsApp Hesapları > İlgili Numara > 'Uygulamalar' veya 'Sistem Kullanıcıları'`);
            console.log(`      sekmesinde Kommo / amoCRM yetkisi var mı bakın.`);
        }

    } catch (err) {
        console.error('❌ Tarama hatası:', err);
    } finally {
        await prisma.$disconnect();
    }
}

inspectWorkspace();

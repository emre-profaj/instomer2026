import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function backfillRetellConversations() {
    const ws = '9860e961-22ec-4caf-9426-0ad459f4dd82';
    console.log(`🚀 Sohbeti olmayan Retell Çağrıları Inbox'a aktarılıyor...\n`);

    // 1. Hedef Workspace'teki varsayılan (veya ilk) Funnel Stage'i bul
    const stage = await prisma.funnelStage.findFirst({
        where: { funnel: { workspaceId: ws } },
        orderBy: { order: 'asc' }
    });

    if (!stage) {
        console.error('❌ Hedef çalışma alanında hiç Funnel/Aşama bulunamadı!');
        process.exit(1);
    }

    // 2. Sohbeti (conversationId'si) olmayan çağrıları çek
    const orphanCalls = await prisma.retellCall.findMany({
        where: { workspaceId: ws, conversationId: null }
    });

    console.log(`📌 Toplam ${orphanCalls.length} adet havada kalan çağrı (sohbeti açılmamış) bulundu.`);

    let createdCount = 0;

    for (const call of orphanCalls) {
        try {
            // İlgili telefon numarasını belirle
            let customerPhone = call.direction === 'inbound' ? call.fromNumber : call.toNumber;
            if (!customerPhone || customerPhone.length < 5) continue; // Geçersiz numara
            
            // Format phone number (remove + sign if needed, or leave it)
            if (!customerPhone.startsWith('+')) customerPhone = '+' + customerPhone;

            // Gerçek tarih
            const callDate = call.startedAt || call.createdAt;

            // 1. Kişiyi (Contact) bul veya yarat
            let contact = await prisma.contact.findFirst({
                where: { workspaceId: ws, phone: { contains: customerPhone } }
            });

            if (!contact) {
                contact = await prisma.contact.create({
                    data: {
                        workspaceId: ws,
                        name: 'AI Arama ' + customerPhone.slice(-4),
                        phone: customerPhone,
                        source: 'RETELL_CALL',
                        status: 'NEW_APPLICATION',
                        createdAt: callDate
                    }
                });
            }

            // 2. Sohbeti (Conversation) yarat
            const conversation = await prisma.conversation.create({
                data: {
                    workspaceId: ws,
                    contactId: contact.id,
                    channel: 'RETELL_CALL',
                    status: 'CLOSED', // Geçmiş çağrı olduğu için Kapatıldı durumunda başlatıyoruz
                    isArchived: false,
                    funnelStageId: stage.id,
                    createdAt: callDate,
                    updatedAt: callDate,
                    lastMessageAt: callDate,
                }
            });

            // 3. İçine bir adet temsilci "Özet" mesajı bırakalım ki Inbox listesinde yazısı görünsün
            let snippet = call.summary ? `Arama Özeti: ${call.summary.substring(0, 50)}...` : `Geçmiş Yapay Zeka Araması (${call.duration || 0} sn)`;
            await prisma.message.create({
                data: {
                    conversationId: conversation.id,
                    content: snippet,
                    type: 'call_ended',
                    direction: 'incoming', // veya system
                    createdAt: callDate,
                    updatedAt: callDate
                }
            });

            // 4. RetellCall kaydını artık bu Conversation'a bağla!
            await prisma.retellCall.update({
                where: { id: call.id },
                data: { conversationId: conversation.id }
            });

            createdCount++;
        } catch (error) {
            console.error(`Hata: ${call.id} aktarılırken sorun oldu ->`, error.message);
        }
    }

    console.log(`\n🎉 Aktarım Başarıyla Tamamlandı!`);
    console.log(`✅ Inbox içerisine toplam ${createdCount} adet YENİ Sohbet kutusu açıldı ve AI çağrılarıyla eşleştirildi.`);
    
    await prisma.$disconnect();
}

backfillRetellConversations().catch(console.error);

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function syncRetellDates() {
    console.log('🔄 Global Retell Çağrı Tarihleri Senkronizasyonu Başlıyor...\n');

    // Sohbet ID'sine (conversationId) bağlı tüm RetellCall kayıtlarını getir (Hangi workspace olursa olsun)
    const calls = await prisma.retellCall.findMany({
        where: {
            conversationId: { not: null }
        }
    });

    console.log(`📌 Toplam ${calls.length} adet Retell çağrısı bulundu. Eşleştirme yapılıyor...`);

    let updatedConvs = 0;
    let updatedMsgs = 0;

    for (const call of calls) {
        // Öncelik: Retell'in kendi başlama tarihi, yoksa çağrı kaydının veritabanına eklenme tarihi
        const actualDate = call.startedAt || call.createdAt;
        if (!actualDate) continue;

        try {
            // 1. İlgili Konuşmanın (Conversation) tarihlerini güncelle
            const updatedConv = await prisma.conversation.update({
                where: { id: call.conversationId },
                data: {
                    createdAt: actualDate,
                    updatedAt: actualDate, // İsterseniz çağrı süresini (call.duration) ekleyip updatedAt yapabiliriz ama basitleştirmek için aynı yapıyoruz
                    lastMessageAt: actualDate
                }
            });
            updatedConvs++;

            // 2. Bu konuşmanın içindeki tüm "Mesajların" tarihlerini güncelle
            const msgUpdate = await prisma.message.updateMany({
                where: { conversationId: call.conversationId },
                data: {
                    createdAt: actualDate,
                    updatedAt: actualDate
                }
            });
            updatedMsgs += msgUpdate.count;

        } catch (error) {
            // Eğer o conversationId silinmişse veya bulunamazsa hatayı yut ve devam et
            if (error.code !== 'P2025') {
                console.error(`Hata: ${call.conversationId} güncellenirken bir sorun oluştu ->`, error.message);
            }
        }
    }

    console.log('\n🎉 Senkronizasyon Tamamlandı!');
    console.log(`✅ ${updatedConvs} adet Sohbet'in (Conversation) saati Retell çağrısına göre düzeltildi.`);
    console.log(`✅ ${updatedMsgs} adet Mesaj'ın (Message) saati Retell çağrısına göre düzeltildi.`);
    
    await prisma.$disconnect();
}

syncRetellDates().catch(e => { console.error(e); process.exit(1); });

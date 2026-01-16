-- ChatCRM Veritabanı Temizleme Scripti
-- Bu scripti çalıştırmadan önce backend'i durdurun: pm2 stop chatcrm
-- Çalıştırmak için: sqlite3 prisma/database.db < cleanup-database.sql
-- Sonra backend'i başlatın: pm2 start chatcrm

-- 1. Tüm mesajları sil
DELETE FROM messages;
SELECT 'Mesajlar silindi: ' || changes() || ' kayıt';

-- 2. Tüm dahili notları sil
DELETE FROM internal_notes;
SELECT 'Dahili notlar silindi: ' || changes() || ' kayıt';

-- 3. Tüm transferleri sil
DELETE FROM conversation_transfers;
SELECT 'Transferler silindi: ' || changes() || ' kayıt';

-- 4. Tüm sohbetleri sil
DELETE FROM conversations;
SELECT 'Sohbetler silindi: ' || changes() || ' kayıt';

-- 5. Tüm Facebook Lead'leri sil
DELETE FROM facebook_leads;
SELECT 'Facebook Leads silindi: ' || changes() || ' kayıt';

-- 6. Tüm kişileri sil
DELETE FROM contacts;
SELECT 'Kişiler silindi: ' || changes() || ' kayıt';

-- Opsiyonel: Kanal bağlantılarını da silmek istersen aşağıdaki satırların başındaki -- işaretini kaldır

-- DELETE FROM facebook_pages;
-- SELECT 'Facebook sayfaları silindi: ' || changes() || ' kayıt';

-- DELETE FROM whatsapp_phone_numbers;
-- SELECT 'WhatsApp numaraları silindi: ' || changes() || ' kayıt';

-- DELETE FROM email_channels;
-- SELECT 'E-posta kanalları silindi: ' || changes() || ' kayıt';

SELECT '✅ Temizlik tamamlandı!';













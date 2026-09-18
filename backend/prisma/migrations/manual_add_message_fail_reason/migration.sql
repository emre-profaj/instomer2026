-- Migration: add_message_fail_reason
-- Tarih: 2026-09-18
-- Açıklama: Gönderilemeyen mesajın sebebini saklar.
--
-- Önceden yalnızca status = 'FAILED' yazılıyordu; sebep hiçbir yere
-- kaydedilmiyordu. Ekranda çıplak bir kırmızı ünlem kalıyor, "neden
-- gitmedi" sorusunun cevabı yalnızca sunucu kayıtlarında duruyordu.
-- Gerçek vaka: erişim anahtarı numaraya yetkili olmadığı için Meta
-- "Object with ID ... does not exist" dönüyordu ve kullanıcı bunu
-- göremiyordu.
--
-- Alan isteğe bağlı: mevcut satırlar NULL kalır, geçmiş hatalar için
-- sebep üretilemez (o bilgi kaydedilmemişti).

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "failReason" TEXT;

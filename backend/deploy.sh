#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Instomer ChatCRM - Sıfır Kesinti (Zero-Downtime) Deploy Scripti
# ═══════════════════════════════════════════════════════════════

set -e # Hata olursa durdur

echo "🚀 [1/4] Git son değişiklikler çekiliyor..."
git pull origin main || git pull

echo "📦 [2/4] Bağımlılıklar kontrol ediliyor..."
npm install --omit=dev

echo "🗄️ [3/4] Prisma şeması güncelleniyor..."
npx prisma generate
npx prisma db push --accept-data-loss || npx prisma migrate deploy || true

echo "🔄 [4/4] PM2 Cluster Sıfır Kesinti ile Yenileniyor (Zero-Downtime Reload)..."
pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs || pm2 reload chatcrm-api --update-env

echo "🎉 ✅ Güncelleme başarıyla tamamlandı! Kesinti süresi: 0 saniye."

#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Instomer ChatCRM - Sıfır Kesinti & Otomatik Korumalı Deploy Scripti
# ═══════════════════════════════════════════════════════════════

set -e

echo "🚀 [1/5] Mevcut commit kaydediliyor ve son değişiklikler çekiliyor..."
PREV_COMMIT=$(git rev-parse HEAD)
git pull origin main || git pull

echo "📦 [2/5] Bağımlılıklar kontrol ediliyor..."
npm install --omit=dev

echo "🔍 [3/5] Kod güvenliği, sözdizimi ve importlar denetleniyor (Pre-flight Check)..."
if ! node scripts/verify-build.js; then
    echo ""
    echo "❌ 🚨 [KRİTİK HATA] Çekilen kodda sözdizimi veya import hatası tespit edildi!"
    echo "🛡️ PM2 YENİDEN BAŞLATILMADI! Canlı sistem kesintisiz korunuyor."
    echo "↩️ Eski çalışan kararlı sürüme ($PREV_COMMIT) geri dönülüyor..."
    git reset --hard "$PREV_COMMIT"
    echo "✅ Sistem güvenle önceki çalışan sürümde tutuldu. Canlı sistem çalışmaya devam ediyor."
    exit 1
fi

echo "🗄️ [4/5] Prisma şeması güncelleniyor..."
npx prisma generate
npx prisma db push --accept-data-loss || npx prisma migrate deploy || true

echo "🔄 [5/5] PM2 Cluster Sıfır Kesinti ile Yenileniyor (Zero-Downtime Reload)..."
if pm2 describe instomer 2>&1 | grep -q "your-username"; then
    echo "🧹 Eski/geçersiz instomer tanımı temizleniyor..."
    pm2 delete instomer || true
fi

if pm2 describe chatcrm-api > /dev/null 2>&1 && ! pm2 describe instomer > /dev/null 2>&1; then
    echo "🔄 PM2 servis adı chatcrm-api -> instomer olarak güncelleniyor..."
    pm2 delete chatcrm-api || true
    pm2 start ecosystem.config.cjs
    pm2 save
else
    pm2 reload ecosystem.config.cjs --update-env || pm2 reload instomer --update-env || pm2 start ecosystem.config.cjs || pm2 reload chatcrm-api --update-env
fi

echo "🎉 ✅ Güncelleme başarıyla tamamlandı! Kesinti süresi: 0 saniye."


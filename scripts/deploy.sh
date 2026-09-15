#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Instomer — Dağıtım
# ═══════════════════════════════════════════════════════════════
# Bu script SUNUCUDA, site kullanıcısı olarak çalışır.
# GitHub Actions çağırır; elle de çalıştırılabilir:
#
#   cd ~/htdocs/app.instomer.com && git pull && ./scripts/deploy.sh
#
# Mantık kasıtlı olarak workflow YAML'ında değil burada: sunucuda elle
# çalıştırılabiliyor, git geçmişinde izlenebiliyor, arıza anında adım adım
# debug edilebiliyor.
# ═══════════════════════════════════════════════════════════════
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BACKEND_DIR="${REPO_ROOT}/backend"
FRONTEND_DIR="${REPO_ROOT}/frontend"
ENV_FILE="${BACKEND_DIR}/.env"
PM2_APP="${PM2_APP:-instomer}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:5008/health}"
HTDOCS_DIR="${HTDOCS_DIR:-}"          # boşsa aşağıda tespit edilir
BACKUP_ROOT="${BACKUP_ROOT:-${REPO_ROOT}/_backups}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
SHA_FILE="${REPO_ROOT}/.last-deployed-sha"

step() { echo ""; echo "▸ $*"; }
ok()   { echo "✅ $*"; }
info() { echo "ℹ️  $*"; }
warn() { echo "⚠️  $*"; }
die()  { echo "❌ $*" >&2; exit 1; }

# Sürüm bilgisi: Actions DEPLOY_SHA ile gönderiyor. Sunucuda .git YOK
# (dosyalar rsync ile geliyor), bu yüzden git'e bağımlı olamayız.
CUR_SHA="${DEPLOY_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'n/a')}"
CUR_SUBJECT="${DEPLOY_SUBJECT:-$(git log -1 --format=%s 2>/dev/null || echo '')}"
PREV_SHA="$(cat "$SHA_FILE" 2>/dev/null || echo '')"

# Hata anında geri alma komutunu ekrana yaz — gece yarısı aranacak şey bu.
on_error() {
    local code=$?
    echo ""
    echo "══════════════════════════════════════════════════════════════"
    echo "❌ DAĞITIM BAŞARISIZ (çıkış kodu: ${code})"
    echo "══════════════════════════════════════════════════════════════"
    [ -n "$PREV_SHA" ] && echo "Son çalışan sürüm: ${PREV_SHA}"
    if [ -f "${BACKUP_ROOT}/.last" ]; then
        echo ""
        echo "Dağıtım öncesi yedek: $(cat "${BACKUP_ROOT}/.last")"
        echo ""
        echo "GERİ ALMAK İÇİN:"
        echo "  cd ${REPO_ROOT} && ./scripts/rollback.sh $(cat "${BACKUP_ROOT}/.last")"
    else
        echo "⚠️  Geri alma noktası yok — yedek alınamadan düşmüş olabilir."
    fi
    echo "══════════════════════════════════════════════════════════════"
    exit "$code"
}
trap on_error ERR

echo "══════════════════════════════════════════════════════════════"
echo "🚀 Instomer dağıtımı — $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "   Depo   : ${REPO_ROOT}"
echo "   Commit : ${CUR_SHA:0:8} ($(echo "$CUR_SUBJECT" | cut -c1-60))"
echo "══════════════════════════════════════════════════════════════"

# ─────────────────────────────────────────────────────────────
# 1 · ROOT REDDİ
# ─────────────────────────────────────────────────────────────
# Paylaşımlı sunucuda root'un pm2'si başka sitelerin süreçlerini yönetiyor.
# Root olarak `pm2 save` root'un dump'ına yazarsa, sunucu yeniden başladığında
# DİĞER SİTELER KALKMAZ. Ayrıca root ile çekilen dosyalar root'a ait kalır ve
# bir sonraki dağıtım "Permission denied" verir.
step "1/9 · Kullanıcı kontrolü"
if [ "$(id -u)" -eq 0 ]; then
    die "Bu script root ile ÇALIŞTIRILAMAZ. Site kullanıcısına geç:  su - <SITE_USER>"
fi
ok "Kullanıcı: $(whoami)"

# ─────────────────────────────────────────────────────────────
# 2 · NODE PATH (nvm non-interactive shell'de PATH'e girmiyor)
# ─────────────────────────────────────────────────────────────
step "2/9 · Node ortamı"
if ! command -v node >/dev/null 2>&1; then
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    # shellcheck source=/dev/null
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
fi
command -v node >/dev/null 2>&1 || die "node bulunamadı (nvm non-interactive shell'de yüklenmemiş olabilir)"
ok "node $(node -v) · npm $(npm -v)"

# ─────────────────────────────────────────────────────────────
# 3 · .env SHELL-GÜVENLİK TARAMASI
# ─────────────────────────────────────────────────────────────
# .env aşağıda `. ./.env` ile okunuyor. Tırnaksız bir değerdeki boşluk shell
# için değerin BİTTİĞİ yer: `SMTP_PASS=abcd efgh` satırında `efgh` KOMUT sanılır.
# Geriye kalan tek iz: "./.env: line 97: efgh: command not found".
# Kontrol npm install'dan ÖNCE — bedeli iki dakika değil bir saniye.
# DEĞERLER ASLA YAZDIRILMIYOR: dağıtım çıktısı ekran görüntüsüyle paylaşılıyor.
step "3/9 · .env güvenlik taraması"
[ -f "$ENV_FILE" ] || die ".env bulunamadı: ${ENV_FILE}"

env_problems=0
while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    val="${line#*=}"
    # Tırnaklıysa sorun yok
    case "$val" in '"'*'"'|"'"*"'") continue ;; esac
    # Tırnaksız + boşluk veya shell metakarakteri içeriyorsa tehlikeli
    if [[ "$val" =~ [[:space:]] ]] || [[ "$val" =~ [\;\&\|\`\$\(\)\<\>] ]]; then
        echo "   ⛔ ${key} — tırnaksız değerde boşluk/metakarakter var (değer gizlendi)"
        env_problems=$((env_problems + 1))
    fi
done < "$ENV_FILE"

if [ "$env_problems" -gt 0 ]; then
    echo ""
    echo "   Düzeltme: değeri çift tırnağa al →  ${ENV_FILE}"
    echo '   Örnek:  SMTP_PASS="abcdefghijklmnop"   (Gmail uygulama şifresindeki boşlukları SİL)'
    die "${env_problems} adet .env satırı shell için bozuk. Dağıtım durduruldu."
fi
ok "$(grep -cE '^[A-Za-z_]+=' "$ENV_FILE") değişken · shell için güvenli"

# NODE_ENV=production kabuğa sızarsa npm install devDependency'leri atlar ve
# bir sonraki adımda `prisma: not found` ile düşeriz. Tuzak kendi dosyamızda.
if grep -qE '^NODE_ENV=' "$ENV_FILE"; then
    info "NODE_ENV .env içinde tanımlı — npm install'da açıkça --include=dev veriyoruz"
fi

# ─────────────────────────────────────────────────────────────
# 4 · YEDEK (kod + veritabanı)
# ─────────────────────────────────────────────────────────────
step "4/9 · Dağıtım öncesi yedek"
STAMP="$(date '+%Y%m%d_%H%M%S')"
BDIR="${BACKUP_ROOT}/${STAMP}"
mkdir -p "$BDIR"

tar -czf "${BDIR}/code.tar.gz" -C "$REPO_ROOT" \
    --exclude='backend/node_modules' --exclude='frontend/node_modules' \
    --exclude='backend/logs' --exclude='backend/uploads' \
    --exclude='_backups' --exclude='.git' \
    backend frontend/dist 2>/dev/null || true
ok "Kod: $(du -h "${BDIR}/code.tar.gz" | cut -f1)"

cp "$ENV_FILE" "${BDIR}/backend.env" && chmod 600 "${BDIR}/backend.env"
ok ".env yedeklendi (mod 600)"

DB_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
HAS_DB=no
if [ -n "$DB_URL" ] && command -v pg_dump >/dev/null 2>&1; then
    if pg_dump "$DB_URL" 2>/dev/null | gzip > "${BDIR}/db.sql.gz"; then
        HAS_DB=yes
        ok "Veritabanı: $(du -h "${BDIR}/db.sql.gz" | cut -f1)"
    else
        rm -f "${BDIR}/db.sql.gz"
        warn "pg_dump başarısız — VERİTABANI YEDEĞİ ALINAMADI"
    fi
else
    warn "pg_dump yok veya DATABASE_URL okunamadı — veritabanı yedeği atlandı"
fi

{
    echo "timestamp=${STAMP}"
    echo "date=$(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo "git_commit=${CUR_SHA}"
    echo "git_subject=${CUR_SUBJECT}"
    echo "prev_sha=${PREV_SHA}"
    echo "has_db=${HAS_DB}"
} > "${BDIR}/meta.txt"
echo "$STAMP" > "${BACKUP_ROOT}/.last"

# Eskileri buda
cnt=$(find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ')
if [ "$cnt" -gt "$KEEP_BACKUPS" ]; then
    find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d | sort | head -n "$((cnt - KEEP_BACKUPS))" \
        | while read -r old; do rm -rf "$old"; info "Eski yedek silindi: $(basename "$old")"; done
fi
ok "Yedek etiketi: ${STAMP}"

# ─────────────────────────────────────────────────────────────
# 5 · BAĞIMLILIKLAR
# ─────────────────────────────────────────────────────────────
# --include=dev ZORUNLU: `prisma` CLI devDependency ve derleme sunucuda yapılıyor.
# Bayrak olmazsa .env'deki NODE_ENV=production sızdığında `prisma: not found`.
step "5/9 · Bağımlılıklar"
cd "$BACKEND_DIR"
npm install --include=dev --no-audit --no-fund
ok "backend bağımlılıkları"

# ─────────────────────────────────────────────────────────────
# 6 · KOD BÜTÜNLÜĞÜ (pre-flight)
# ─────────────────────────────────────────────────────────────
# Derlenmeyen kod pm2'ye HİÇ ulaşmamalı. Actions'ta da koşuyor ama sunucuda
# elle dağıtım yapılabildiği için burada da var.
step "6/9 · Kod bütünlüğü denetimi"
if [ -f "${BACKEND_DIR}/scripts/verify-build.js" ]; then
    node scripts/verify-build.js || die "Sözdizimi/import hatası — pm2 YENİDEN BAŞLATILMADI, canlı sistem korunuyor"
else
    warn "verify-build.js yok — denetim atlandı"
fi

# ─────────────────────────────────────────────────────────────
# 7 · PRISMA
# ─────────────────────────────────────────────────────────────
step "7/9 · Prisma"
# .env'i `. ./.env` ile SOURCE ETMİYORUZ. Tırnak içindeki bir değerde $ geçiyorsa
# bash onu genişletir ve parolayı sessizce bozar; sonuç "Authentication failed"
# olur ve .env dosyası gözle bakıldığında kusursuz görünür. (Canlıda yaşandı.)
# Satırı ham okuyup yalnızca tırnakları soyuyoruz.
DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' "$ENV_FILE" | head -1 \
    | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//")"
export DATABASE_URL
[ -n "$DATABASE_URL" ] || die "DATABASE_URL okunamadı: $ENV_FILE"
npx prisma generate
ok "Prisma client üretildi"

# ⚠️ Instomer'da HENÜZ gerçek migration geçmişi yok (prisma/migrations altında
# yalnızca manuel SQL dosyaları var). Bu yüzden `migrate deploy` boş geçer ve
# şema `db push` ile senkronlanıyor. Veri kaybettirebileceği için bilinçli
# bir bayrak olmadan çalışmıyor — yukarıda DB yedeği alındı.
# Şema ile veritabanı arasındaki farkı ÖNCE göster — kör uygulama yapma.
DRIFT="$(npx prisma migrate diff --from-url "$DATABASE_URL" \
        --to-schema-datamodel prisma/schema.prisma --script 2>/dev/null \
        | grep -E "^ALTER|^CREATE|^DROP" || true)"

if [ -z "$DRIFT" ]; then
    ok "Veritabanı şema ile uyumlu — değişiklik gerekmiyor"
else
    echo ""
    warn "ŞEMA FARKI TESPİT EDİLDİ:"
    echo "$DRIFT" | sed 's/^/     /'
    echo ""
    if echo "$DRIFT" | grep -qE "^DROP|DROP COLUMN|DROP TABLE"; then
        warn "⛔ Fark SİLME içeriyor — otomatik uygulanmayacak."
        warn "   Elle incele:  npx prisma migrate diff --from-url \"\$DATABASE_URL\" --to-schema-datamodel prisma/schema.prisma --script"
    elif [ "${ALLOW_DB_PUSH:-false}" = "true" ]; then
        warn "Uygulanıyor (yedek: ${STAMP})"
        npx prisma db push --accept-data-loss
        ok "Şema senkronlandı"
    else
        warn "Şema DEĞİŞTİRİLMEDİ."
        warn "Kod bu alanları isterse çalışma anında P2022 hatası verir ve"
        warn "AI yanıtları sessizce çöker. Uygulamak için:"
        warn "  ALLOW_DB_PUSH=true ./scripts/deploy.sh"
    fi
fi

# ─────────────────────────────────────────────────────────────
# 8 · FRONTEND → htdocs
# ─────────────────────────────────────────────────────────────
step "8/9 · Frontend"
if [ -z "$HTDOCS_DIR" ]; then
    for c in "${HOME}/htdocs/app.instomer.com" "${REPO_ROOT}/../htdocs" "${HOME}/htdocs"; do
        [ -d "$c" ] && { HTDOCS_DIR="$(cd "$c" && pwd)"; break; }
    done
fi

cd "$FRONTEND_DIR"
if [ "${SKIP_FRONTEND_BUILD:-false}" = "true" ]; then
    info "Frontend derlemesi atlandı (depodaki dist kullanılıyor)"
else
    npm install --include=dev --no-audit --no-fund
    npm run build
    ok "dist derlendi ($(du -sh dist | cut -f1))"
fi

if [ -n "$HTDOCS_DIR" ] && [ -d "$HTDOCS_DIR" ] && [ "$HTDOCS_DIR" != "$REPO_ROOT" ]; then
    rsync -a --delete "${FRONTEND_DIR}/dist/" "${HTDOCS_DIR}/"
    chmod -R 755 "$HTDOCS_DIR"
    ok "htdocs senkronize: ${HTDOCS_DIR}"
else
    info "Ayrı htdocs yok — frontend backend üzerinden servis ediliyor"
fi

# ─────────────────────────────────────────────────────────────
# 9 · PM2 + SAĞLIK KONTROLÜ
# ─────────────────────────────────────────────────────────────
step "9/9 · PM2 ve sağlık kontrolü"
cd "$BACKEND_DIR"
# startOrReload: süreç yoksa başlatır, varsa sıfır kesintiyle yeniler.
# --update-env olmazsa .env değişiklikleri sürece YANSIMAZ.
pm2 startOrReload ecosystem.config.cjs --update-env
ok "pm2 ${PM2_APP} yenilendi"

for i in $(seq 1 12); do
    if curl -fsS --max-time 4 "$HEALTH_URL" >/dev/null 2>&1; then
        ok "Sağlık kontrolü geçti (${i}. deneme)"
        HEALTHY=yes
        break
    fi
    echo "   ... ${i}/12"
    sleep 5
done
[ "${HEALTHY:-no}" = "yes" ] || die "Sağlık kontrolü BAŞARISIZ — ${HEALTH_URL} yanıt vermiyor"

# ─────────────────────────────────────────────────────────────
# Geri alma noktasını yaz — SADECE her şey başarılıysa
# ─────────────────────────────────────────────────────────────
echo "$CUR_SHA" > "$SHA_FILE"

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "🎉 DAĞITIM BAŞARILI"
echo "   Commit : ${CUR_SHA:0:8}"
echo "   Yedek  : ${STAMP}$([ "$HAS_DB" = "yes" ] && echo ' (DB dahil)')"
echo "   Önceki : ${PREV_SHA:-yok}"
echo ""
echo "   Geri almak için:"
echo "     ./scripts/rollback.sh              # son yedeğe dön"
echo "     ./scripts/rollback.sh --list       # yedekleri gör"
echo "══════════════════════════════════════════════════════════════"

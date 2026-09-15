#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Instomer — Geri Alma
# ═══════════════════════════════════════════════════════════════
#   ./scripts/rollback.sh                    Son yedeğe dön (kod + .env)
#   ./scripts/rollback.sh <etiket>           Belirli yedeğe dön
#   ./scripts/rollback.sh <etiket> --with-db Veritabanını da geri yükle (YIKICI)
#   ./scripts/rollback.sh --list             Yedekleri listele
#   ./scripts/rollback.sh --sha              Son çalışan commit'e dön (git ile)
#
# NOT: Varsayılan olarak SADECE kod geri alınır. Uygulanmış migration'lar
# geri alınmaz — bu yüzden şema değişikliklerini geriye uyumlu yaz:
# kolon silmek yerine önce kullanımdan kaldır, bir sonraki sürümde sil.
# ═══════════════════════════════════════════════════════════════
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
BACKEND_DIR="${REPO_ROOT}/backend"
BACKUP_ROOT="${BACKUP_ROOT:-${REPO_ROOT}/_backups}"
SHA_FILE="${REPO_ROOT}/.last-deployed-sha"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:5008/health}"

step() { echo ""; echo "▸ $*"; }
ok()   { echo "✅ $*"; }
info() { echo "ℹ️  $*"; }
warn() { echo "⚠️  $*"; }
die()  { echo "❌ $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] && die "root ile çalıştırma. Site kullanıcısına geç."

list_backups() {
    [ -d "$BACKUP_ROOT" ] || { echo "(yedek yok)"; return; }
    printf "%-20s  %-20s  %-10s  %-4s  %s\n" "ETİKET" "TARİH" "COMMIT" "DB" "AÇIKLAMA"
    printf '%s\n' "────────────────────────────────────────────────────────────────────────────────────────"
    find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d | sort -r | while read -r d; do
        m="${d}/meta.txt"
        if [ -f "$m" ]; then
            printf "%-20s  %-20s  %-10s  %-4s  %s\n" \
                "$(grep '^timestamp=' "$m" | cut -d= -f2-)" \
                "$(grep '^date=' "$m" | cut -d= -f2- | cut -c1-19)" \
                "$(grep '^git_commit=' "$m" | cut -d= -f2- | cut -c1-8)" \
                "$(grep '^has_db=' "$m" | cut -d= -f2-)" \
                "$(grep '^git_subject=' "$m" | cut -d= -f2- | cut -c1-40)"
        else
            printf "%-20s  %s\n" "$(basename "$d")" "(meta.txt yok)"
        fi
    done
    echo ""
    echo "Toplam: $(du -sh "$BACKUP_ROOT" 2>/dev/null | cut -f1)"
}

case "${1:-}" in
    --list|-l) list_backups; exit 0 ;;
    --help|-h) sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --sha)
        # Sunucuda .git YOK — dosyalar GitHub Actions'tan rsync ile geliyor.
        # Bu mod yalnızca depo klonu olan bir makinede anlamlı.
        if [ ! -d "${REPO_ROOT}/.git" ]; then
            echo "❌ Bu sunucuda git deposu yok (dosyalar Actions'tan rsync ile geliyor)."
            echo ""
            echo "İki seçeneğin var:"
            echo "  1) Yedekten dön:    ./scripts/rollback.sh --list"
            echo "  2) GitHub'da revert et, push et — Actions eski hâli tekrar gönderir:"
            echo "       git revert <commit> && git push origin main"
            echo ""
            echo "Son başarılı dağıtımın commit'i: $(cat "$SHA_FILE" 2>/dev/null || echo 'bilinmiyor')"
            exit 1
        fi
        SHA="$(cat "$SHA_FILE" 2>/dev/null || true)"
        [ -n "$SHA" ] || die "Geri alma noktası yok (.last-deployed-sha)"
        echo "Son başarılı dağıtım: ${SHA}"
        read -r -p "Bu commit'e dönülsün mü? [e/H] " yn
        [[ "$yn" =~ ^[eEyY]$ ]] || exit 0
        git reset --hard "$SHA"
        exec "${REPO_ROOT}/scripts/deploy.sh"
        ;;
esac

STAMP="${1:-$(cat "${BACKUP_ROOT}/.last" 2>/dev/null || true)}"
[ -n "$STAMP" ] || { echo "Yedek belirtilmedi ve son yedek bulunamadı."; echo; list_backups; exit 1; }
DIR="${BACKUP_ROOT}/${STAMP}"
[ -d "$DIR" ] || { echo "❌ Yedek yok: ${STAMP}"; echo; list_backups; exit 1; }

WITH_DB=no
[ "${2:-}" = "--with-db" ] && WITH_DB=yes

echo "══════════════════════════════════════════════════════════════"
echo "⏪ GERİ ALMA"
echo "══════════════════════════════════════════════════════════════"
cat "${DIR}/meta.txt" 2>/dev/null | sed 's/^/   /'
echo ""
if [ "$WITH_DB" = "yes" ]; then
    echo "   ⚠️  VERİTABANI DA GERİ YÜKLENECEK."
    echo "   ⚠️  ${STAMP} anından SONRAKİ TÜM VERİ SİLİNİR."
else
    echo "   Veritabanına DOKUNULMAYACAK (sadece kod + .env)."
fi
echo ""
read -r -p "Onaylıyor musun? [e/H] " yn
[[ "$yn" =~ ^[eEyY]$ ]] || { info "İptal."; exit 0; }

# Geri almayı da geri alabilmek için mevcut hali yedekle
step "Mevcut hal yedekleniyor (geri almayı geri alabilmek için)"
PRE="${BACKUP_ROOT}/$(date '+%Y%m%d_%H%M%S')_prerollback"
mkdir -p "$PRE"
tar -czf "${PRE}/code.tar.gz" -C "$REPO_ROOT" \
    --exclude='backend/node_modules' --exclude='frontend/node_modules' \
    --exclude='backend/logs' --exclude='backend/uploads' \
    --exclude='_backups' --exclude='.git' \
    backend frontend/dist 2>/dev/null || true
[ -f "${BACKEND_DIR}/.env" ] && cp "${BACKEND_DIR}/.env" "${PRE}/backend.env" && chmod 600 "${PRE}/backend.env"
{
    echo "timestamp=$(basename "$PRE")"
    echo "date=$(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo "git_commit=$(cat "$SHA_FILE" 2>/dev/null || echo 'n/a')"
    echo "git_subject=${STAMP} yedeğine dönmeden önce"
    echo "has_db=no"
} > "${PRE}/meta.txt"
ok "$(basename "$PRE")"

step "Kod geri yükleniyor"
tar -xzf "${DIR}/code.tar.gz" -C "$REPO_ROOT"
ok "backend + frontend/dist"

if [ -f "${DIR}/backend.env" ]; then
    cp "${DIR}/backend.env" "${BACKEND_DIR}/.env"
    chmod 600 "${BACKEND_DIR}/.env"
    ok ".env (mod 600)"
fi

if [ "$WITH_DB" = "yes" ]; then
    [ -f "${DIR}/db.sql.gz" ] || die "Bu yedekte veritabanı dump'ı yok"
    step "⚠️  Veritabanı geri yükleniyor"
    DB_URL="$(grep -E '^DATABASE_URL=' "${BACKEND_DIR}/.env" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
    [ -n "$DB_URL" ] || die "DATABASE_URL okunamadı"
    gunzip -c "${DIR}/db.sql.gz" | psql "$DB_URL" >/dev/null
    ok "Veritabanı geri yüklendi"
fi

step "Bağımlılıklar ve Prisma"
cd "$BACKEND_DIR"
npm install --include=dev --no-audit --no-fund
set -a; . "${BACKEND_DIR}/.env"; set +a
npx prisma generate

step "PM2"
pm2 startOrReload ecosystem.config.cjs --update-env

for i in $(seq 1 12); do
    if curl -fsS --max-time 4 "$HEALTH_URL" >/dev/null 2>&1; then
        echo ""
        ok "Geri alma tamamlandı — sistem ayakta (${i}. deneme)"
        echo ""
        info "Bu işlemi geri almak için:  ./scripts/rollback.sh $(basename "$PRE")"
        exit 0
    fi
    echo "   ... ${i}/12"
    sleep 5
done
die "Geri alma sonrası sağlık kontrolü BAŞARISIZ — pm2 logs ${PM2_APP:-instomer} ile bak"

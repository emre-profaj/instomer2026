#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Instomer — Mac'ten ELLE yükleme
# ═══════════════════════════════════════════════════════════════
# Normal yol GitHub Actions'tır (docs/DEPLOYMENT.md). Bu script, Actions
# kurulmadan önce veya acil durumda Mac'ten doğrudan yüklemek için.
#
# Sunucuda çalışan mantık AYNI: scripts/deploy.sh. Burada sadece dosyalar
# gönderiliyor ve o script tetikleniyor — ikinci bir dağıtım mantığı YOK.
#
#   ./scripts/push-from-local.sh --discover   Sunucudaki uygulama dizinini bul
#   ./scripts/push-from-local.sh --dry-run    Ne gönderileceğini göster, gönderme
#   ./scripts/push-from-local.sh              Gönder ve dağıt
#   ./scripts/push-from-local.sh --list       Sunucudaki yedekleri listele
#   ./scripts/push-from-local.sh --rollback <etiket>
# ═══════════════════════════════════════════════════════════════
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TARGET_FILE="${REPO_ROOT}/scripts/.deploy-target"
[ -f "$TARGET_FILE" ] && . "$TARGET_FILE"

SSH_USER="${SSH_USER:-instomer-chatcrm}"
SSH_HOST="${SSH_HOST:-}"
SSH_PORT="${SSH_PORT:-22}"
APP_PATH="${APP_PATH:-}"

GRN=$'\033[0;32m'; YLW=$'\033[1;33m'; RED=$'\033[0;31m'; BLU=$'\033[0;34m'; NC=$'\033[0m'
ok()   { echo "${GRN}✅ $*${NC}"; }
info() { echo "${BLU}ℹ️  $*${NC}"; }
warn() { echo "${YLW}⚠️  $*${NC}"; }
die()  { echo "${RED}❌ $*${NC}" >&2; exit 1; }
hdr()  { echo ""; echo "${BLU}═══ $* ═══${NC}"; }

[ -n "$SSH_HOST" ] || die "SSH_HOST tanımlı değil. scripts/.deploy-target dosyasını oluştur (aşağıya bak) veya:
   SSH_HOST=<ip> APP_PATH=<yol> ./scripts/push-from-local.sh"

# ── Tek bağlantı paylaşımı: şifre BİR KEZ sorulur ────────────────
CTL_DIR="$(mktemp -d)"
CTL="${CTL_DIR}/cm-%r@%h:%p"
trap 'ssh -O exit -o ControlPath="$CTL" "${SSH_USER}@${SSH_HOST}" 2>/dev/null || true; rm -rf "$CTL_DIR"' EXIT

SSH_BASE=(-p "$SSH_PORT" -o ControlMaster=auto -o ControlPath="$CTL" -o ControlPersist=10m
          -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
[ -f "${HOME}/.ssh/instomer_deploy" ] && SSH_BASE+=(-i "${HOME}/.ssh/instomer_deploy")

rsh() { ssh "${SSH_BASE[@]}" "${SSH_USER}@${SSH_HOST}" "$@"; }
RSYNC_SHELL="ssh -p ${SSH_PORT} -o ControlMaster=auto -o ControlPath=${CTL} -o ControlPersist=10m -o StrictHostKeyChecking=accept-new"

# ─────────────────────────────────────────────────────────────
case "${1:-}" in
--discover)
    hdr "SUNUCUDAKİ UYGULAMA DİZİNİ ARANIYOR"
    warn "Şifre bir kez sorulacak."
    rsh 'bash -s' <<'REMOTE'
echo "Ev dizini : $HOME"
echo "Kullanıcı : $(whoami)"
echo ""
echo "── package.json içeren dizinler (derinlik 4) ──"
find "$HOME" -maxdepth 4 -name package.json -not -path '*/node_modules/*' 2>/dev/null \
  | sed 's|/package.json$||' | sort -u | head -20
echo ""
echo "── server.js nerede? ──"
find "$HOME" -maxdepth 4 -name server.js -not -path '*/node_modules/*' 2>/dev/null | head -10
echo ""
echo "── backend/.env nerede? ──"
find "$HOME" -maxdepth 5 -name '.env' -not -path '*/node_modules/*' 2>/dev/null | head -10
echo ""
echo "── git deposu ──"
find "$HOME" -maxdepth 4 -name .git -type d 2>/dev/null | head -5
echo ""
echo "── pm2 süreçleri ──"
pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{JSON.parse(d).forEach(p=>console.log(`  ${p.name}  cwd=${p.pm2_env.pm_cwd}  script=${p.pm2_env.pm_exec_path}`))}catch(e){console.log("  (okunamadı)")}})' 2>/dev/null || pm2 list 2>/dev/null || echo "  pm2 yok"
echo ""
echo "── htdocs ──"
ls -la "$HOME/htdocs" 2>/dev/null || echo "  ~/htdocs yok"
REMOTE
    echo ""
    info "Yukarıdaki 'server.js' yolunun BİR ÜSTÜ senin APP_PATH'in."
    info "Örn. server.js  /home/x/htdocs/app/backend/server.js  →  APP_PATH=/home/x/htdocs/app"
    echo ""
    echo "Sonra şu dosyayı oluştur:  ${TARGET_FILE}"
    exit 0
    ;;
--list)
    [ -n "$APP_PATH" ] || die "APP_PATH tanımlı değil — önce --discover çalıştır"
    rsh "cd '${APP_PATH}' && ./scripts/rollback.sh --list"
    exit 0
    ;;
--rollback)
    [ -n "$APP_PATH" ] || die "APP_PATH tanımlı değil"
    [ -n "${2:-}" ] || die "Kullanım: --rollback <etiket> [--with-db]"
    ssh -t "${SSH_BASE[@]}" "${SSH_USER}@${SSH_HOST}" \
        "cd '${APP_PATH}' && ./scripts/rollback.sh '$2' ${3:-}"
    exit 0
    ;;
--help|-h)
    awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "${BASH_SOURCE[0]}"
    exit 0
    ;;
esac

DRY=""
[ "${1:-}" = "--dry-run" ] && DRY="--dry-run"

[ -n "$APP_PATH" ] || die "APP_PATH tanımlı değil. Önce:  ./scripts/push-from-local.sh --discover"

# ── 1 · Yerel ön kontrol ─────────────────────────────────────
hdr "1/4 · YEREL ÖN KONTROL"
(cd backend && node scripts/verify-build.js) || die "Yerelde sözdizimi/import hatası — gönderim iptal"

# Randevu izin kapısı bütünlüğü (Actions'taki kontrolün aynısı)
LEAK=$(grep -rl "prisma\.appointment\.create" backend/controllers backend/services backend/utils backend/adapters backend/helpers 2>/dev/null \
       | grep -v "services/domain/appointment.domain.js" || true)
[ -z "$LEAK" ] || die "prisma.appointment.create domain katmanı dışında: $LEAK"
ok "Randevu oluşturma tek kapıdan geçiyor"

# ── 2 · Hedefi doğrula ───────────────────────────────────────
hdr "2/4 · HEDEF DOĞRULAMA"
warn "Şifre bir kez sorulacak (bağlantı sonraki adımlarda paylaşılacak)."
rsh "test -d '${APP_PATH}'" || die "Sunucuda dizin yok: ${APP_PATH}"
rsh "test -f '${APP_PATH}/backend/.env'" \
    || die "backend/.env yok: ${APP_PATH}/backend/.env — yanlış APP_PATH olabilir"
ok "${SSH_USER}@${SSH_HOST}:${APP_PATH}"

# ── 3 · Gönder ───────────────────────────────────────────────
hdr "3/4 · DOSYALAR GÖNDERİLİYOR"
[ -n "$DRY" ] && warn "DRY-RUN — hiçbir şey yazılmayacak"
rsync -az --delete ${DRY} --itemize-changes \
    -e "$RSYNC_SHELL" \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude '.env' \
    --exclude 'logs/' \
    --exclude 'uploads/' \
    --exclude 'htdocs/' \
    --exclude '_backups/' \
    --exclude '.last-deployed-sha' \
    --exclude '.DS_Store' \
    --exclude '*.zip' \
    ./ "${SSH_USER}@${SSH_HOST}:${APP_PATH}/"

if [ -n "$DRY" ]; then
    echo ""
    info "DRY-RUN bitti. Gerçekten göndermek için bayraksız çalıştır."
    exit 0
fi
ok "Dosyalar gönderildi"

# ── 4 · Sunucuda dağıt ───────────────────────────────────────
hdr "4/4 · SUNUCUDA DAĞITIM"
SHA="$(git rev-parse HEAD 2>/dev/null || echo 'manual')"
SUBJ="$(git log -1 --format=%s 2>/dev/null || echo 'elle yükleme')"

# -t: deploy.sh çıktısı canlı aksın
if ssh -t "${SSH_BASE[@]}" "${SSH_USER}@${SSH_HOST}" \
    "cd '${APP_PATH}' && chmod +x scripts/*.sh && DEPLOY_SHA='${SHA}' DEPLOY_SUBJECT='${SUBJ}' ${EXTRA_ENV:-} ./scripts/deploy.sh"; then
    echo ""
    ok "🎉 Elle yükleme tamamlandı"
    echo ""
    info "Geri almak için:  ./scripts/push-from-local.sh --list"
else
    echo ""
    die "Dağıtım başarısız. Yedekleri görmek için:  ./scripts/push-from-local.sh --list"
fi

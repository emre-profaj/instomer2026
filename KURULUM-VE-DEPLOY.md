# Instomer — Kurulum, Commit, Push ve Deploy Rehberi

Bu dosya yeni bir bilgisayarda (veya yeni bir Claude Code oturumunda) sıfırdan
kurulum yapıp canlıya çıkabilmek için yazıldı. Baştan sona okunacak; özellikle
**"Tuzaklar"** bölümü atlanmayacak — oradaki maddelerin her biri canlıda
yaşanmış bir olaydan geliyor.

---

## 0. Bir cümlede sistem

Instomer çok kiracılı (multi-tenant) bir CRM: WhatsApp, Facebook, Instagram,
e-posta, web widget ve AI telefon araması kanallarını tek gelen kutusunda
topluyor, konuşmaları AI ile sınıflandırıp takımlara dağıtıyor.

- **Backend:** Node.js (ESM) + Express + Prisma 5.22 + PostgreSQL
- **Frontend:** React + Vite
- **Canlı adres:** https://app.instomer.com
- **Süreç yöneticisi:** pm2, **cluster modunda 2 işçi**, root'un pm2'si altında

---

## 1. Yeni bilgisayarda kurulum

### 1.1 Depoyu al

```bash
git clone https://github.com/Profajai/instomerchat.git
cd instomerchat
```

İki uzak depo var ve `git push` **ikisine birden** gönderiyor:

```
instomerchat  → github.com/Profajai/instomerchat.git      (fetch + push)
              → github.com/emre-profaj/instomer2026.git   (push)
origin        → github.com/emre-profaj/instomer2026.git
```

Dal: `main`. Takip edilen uzak: `instomerchat/main`.

### 1.2 Depoda OLMAYAN, elle taşınacak dosyalar

Bunlar `.gitignore`'lu. Eski bilgisayardan veya sunucudan kopyalanacak:

| Dosya | Nereden | Ne işe yarar |
|---|---|---|
| `backend/.env` | Sunucudan: `/home/instomer-chatcrm/backend/.env` | DB adresi, JWT, Facebook anahtarları |
| `~/.ssh/instomer_deploy` | Eski bilgisayardan | Sunucuya SSH anahtarı |
| `scripts/.deploy-target` | Eski bilgisayardan | Deploy hedefi (opsiyonel) |

`backend/.env` içindeki değişkenler (canlıda 12 tane):

```
NODE_ENV  PORT  DATABASE_URL  JWT_SECRET  JWT_EXPIRE
FACEBOOK_APP_ID  FACEBOOK_APP_SECRET  FACEBOOK_CALLBACK_URL
FACEBOOK_VERIFY_TOKEN  FACEBOOK_ADMIN_ACCESS_TOKEN
FRONTEND_URL  FACEBOOK_GRAPH_API_VERSION
```

SSH anahtarının izni 600 olmalı:

```bash
chmod 600 ~/.ssh/instomer_deploy
```

### 1.3 Bağımlılıklar

```bash
cd backend  && npm install && npx prisma generate
cd ../frontend && npm install
```

### 1.4 Node sürümü — dikkat

Sunucuda **node v23.11.1**, npm 10.9.2, PostgreSQL 16.14.

Yerelde farklı bir sürüm varsa (ör. v25) `vite build` **farklı hash'li bundle**
üretebiliyor. Bu yaşandı: depodaki bundle ile yerelde derlenen aynı çıkmadı.
Sorun değil ama kural şu: **sunucuya her zaman kendi derlediğin bundle'ı gönder
ve `dist`'i de commit'le** — böylece depodaki ile canlıdaki aynı kalır.

---

## 2. Sunucu

```
Kullanıcı : instomer-chatcrm@69.62.117.112
Anahtar   : ~/.ssh/instomer_deploy
Backend   : /home/instomer-chatcrm/backend
Frontend  : /home/instomer-chatcrm/htdocs/chatcrm.instomer.com   (nginx kökü)
```

Yedek klasörleri (hepsi mevcut, kullan):

```
~/_backend_backups/<tarih>/     backend dosyaları
~/_frontend_backups/<tarih>/    index.html + bundle
~/_db_backups/<tarih>.sql       pg_dump --schema-only
```

**Canlı alan adı `app.instomer.com`.** `chatcrm.instomer.com` klasör adı olarak
kalmış ama dışarıdan cevap vermiyor.

**Widget script'i** `/api/ai/public/widget/script` adresinden servis ediliyor
(dosya: `backend/public/widget/widget.js`). Bu uç dosyayı **her istekte diskten
okuyor**, yani widget.js değişikliği yeniden başlatma beklemeden canlıya çıkar.
`/widget.js` adresi 404 döner, oraya bakma.

---

## 3. Deploy — sıralama önemli

Sıra **her zaman** şu: **SQL → backend dosyaları → prisma generate → doğrulama
→ frontend**. Ters sıra kesintiye yol açıyor.

### 3.1 Önce: veritabanı şeması

`backend/prisma/migrations` klasörü gitignore'lu, yani migration dosyaları
depoda yok. Gereken SQL'i Prisma'ya hesaplatıyoruz:

```bash
# 1) Şemayı sunucuya geçici olarak kopyala
scp -i ~/.ssh/instomer_deploy backend/prisma/schema.prisma \
    instomer-chatcrm@69.62.117.112:/tmp/ys.prisma

# 2) Sunucuda çalıştırılacak betiği hazırla (tek satır ssh KULLANMA, betik gönder)
cat > /tmp/sql.sh <<'EOF'
set -e
cd /home/instomer-chatcrm/backend
RAW=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"')
PSQL=${RAW%%\?*}                      # ?schema=public kırpılmazsa psql bağlanamaz
TS=$(date +%Y%m%d-%H%M%S); mkdir -p ~/_db_backups
pg_dump --schema-only "$PSQL" > ~/_db_backups/schema-$TS.sql
echo "yedek: schema-$TS.sql"
cd /tmp
/home/instomer-chatcrm/backend/node_modules/.bin/prisma migrate diff \
  --from-url "$RAW" --to-schema-datamodel /tmp/ys.prisma --script > /tmp/d.sql
echo "=== UYGULANACAK SQL ==="; cat /tmp/d.sql
psql "$PSQL" -v ON_ERROR_STOP=1 --single-transaction -f /tmp/d.sql
echo "=== KALAN FARK (boş olmalı) ==="
/home/instomer-chatcrm/backend/node_modules/.bin/prisma migrate diff \
  --from-url "$RAW" --to-schema-datamodel /tmp/ys.prisma --script
EOF
scp -i ~/.ssh/instomer_deploy /tmp/sql.sh instomer-chatcrm@69.62.117.112:/tmp/sql.sh
ssh -i ~/.ssh/instomer_deploy instomer-chatcrm@69.62.117.112 "bash /tmp/sql.sh"
```

Son çıktı **`-- This is an empty migration.`** olmalı. Değilse dur, bak.

Uygulanan SQL'i **commit mesajına yaz** — migration dosyası depoda olmadığı için
tek kayıt orası.

### 3.2 Sonra: backend dosyaları

Hangi dosyaların farklı olduğunu md5 ile bul. **`join` KULLANMA** (aşağıda
"Tuzaklar"da sebebi yazıyor); sözlük eşlemesi yap:

```bash
cd /path/to/instomerchat

git ls-files backend | grep -vE '\.env$|\.example$|schema\.prisma\.backup|\.zip$' > /tmp/liste.txt
(while read f; do [ -f "$f" ] && echo "$(md5 -q "$f")|$f"; done < /tmp/liste.txt) > /tmp/yerel.txt

scp -i ~/.ssh/instomer_deploy /tmp/liste.txt instomer-chatcrm@69.62.117.112:/tmp/liste.txt
ssh -i ~/.ssh/instomer_deploy instomer-chatcrm@69.62.117.112 \
  "cd /home/instomer-chatcrm; while read f; do p=\${f#backend/}; \
   if [ -f \"backend/\$p\" ]; then echo \"\$(md5sum \"backend/\$p\" | cut -d' ' -f1)|\$f\"; \
   else echo \"YOK|\$f\"; fi; done < /tmp/liste.txt" > /tmp/sunucu.txt

python3 - <<'PY'
L = dict(l.rstrip('\n').split('|',1)[::-1] for l in open('/tmp/yerel.txt'))
R = dict(l.rstrip('\n').split('|',1)[::-1] for l in open('/tmp/sunucu.txt'))
fark = sorted(f for f in L if R.get(f) != L[f] and not f.endswith('package-lock.json'))
print('karsilastirilan:', len(L), '| gonderilecek:', len(fark))
for f in fark: print('  ', f)
open('/tmp/gonder.txt','w').write('\n'.join(fark) + ('\n' if fark else ''))
PY
```

> `backend/package-lock.json` **kasıtlı olarak hariç**: sunucunun kendi
> `npm install` sonucunu yansıtıyor, üzerine yazma.

Yedekle ve gönder:

```bash
TS=$(date +%Y%m%d-%H%M%S)
scp -i ~/.ssh/instomer_deploy /tmp/gonder.txt instomer-chatcrm@69.62.117.112:/tmp/gonder.txt
ssh -i ~/.ssh/instomer_deploy instomer-chatcrm@69.62.117.112 \
  "cd /home/instomer-chatcrm; D=~/_backend_backups/$TS; mkdir -p \$D; \
   while read f; do p=\${f#backend/}; [ -f \"backend/\$p\" ] && \
     mkdir -p \"\$D/\$(dirname \$p)\" && cp \"backend/\$p\" \"\$D/\$p\"; done < /tmp/gonder.txt; \
   echo -n 'yedeklenen: '; find \$D -type f | wc -l"

while read f; do
  p=${f#backend/}
  scp -q -i ~/.ssh/instomer_deploy "$f" \
      "instomer-chatcrm@69.62.117.112:/home/instomer-chatcrm/backend/$p" || echo "HATA: $f"
done < /tmp/gonder.txt
```

Gönderim sonrası **md5'leri tekrar karşılaştır**, hepsi tutmalı.

### 3.3 Prisma istemcisi ve doğrulama

```bash
ssh -i ~/.ssh/instomer_deploy instomer-chatcrm@69.62.117.112 \
  "cd /home/instomer-chatcrm/backend && npx prisma generate 2>&1 | grep -i 'generated\|error'; \
   node scripts/verify-build.js 2>&1 | tail -1"
```

`verify-build.js` tüm dosyaların sözdizimini ve import yollarını denetliyor;
"Başarılı" yazmıyorsa deploy'u durdur.

### 3.4 En son: frontend

```bash
cd frontend && npx vite build && ls dist/assets/
```

Sıra **kesinti olmaması için** şöyle: önce yeni bundle, sonra `index.html`,
en son eski bundle'ın silinmesi.

```bash
cd frontend/dist
TS=$(date +%Y%m%d-%H%M%S)
H=/home/instomer-chatcrm/htdocs/chatcrm.instomer.com

# yedek
ssh -i ~/.ssh/instomer_deploy instomer-chatcrm@69.62.117.112 \
  "mkdir -p ~/_frontend_backups/$TS; cp $H/index.html ~/_frontend_backups/$TS/; \
   cp $H/assets/index-*.js ~/_frontend_backups/$TS/ 2>/dev/null; echo yedek-ok"

# 1) yeni dosyalar
scp -i ~/.ssh/instomer_deploy assets/index-YENI.js assets/index-YENI.css \
    instomer-chatcrm@69.62.117.112:$H/assets/
# 2) index.html
scp -i ~/.ssh/instomer_deploy index.html instomer-chatcrm@69.62.117.112:$H/index.html
# 3) izinler + eski bundle'ı sil
ssh -i ~/.ssh/instomer_deploy instomer-chatcrm@69.62.117.112 \
  "chmod 644 $H/assets/index-YENI.js $H/assets/index-YENI.css $H/index.html; \
   rm -f $H/assets/index-ESKI.js $H/assets/index-ESKI.css; \
   grep -E 'assets/index' $H/index.html"
```

**`chmod 644` unutulmayacak.** scp dosyaları `rw-r-----` bırakıyor, nginx
okuyamıyor ve sayfa **403** veriyor.

Doğrulama:

```bash
curl -s https://app.instomer.com/ | grep -E 'assets/index'
curl -s -o /dev/null -w "%{http_code}\n" https://app.instomer.com/assets/index-YENI.js
```

### 3.5 Son adım: pm2 reload — BU SENDE DEĞİL

Backend kodu **yeniden başlatılmadan devreye girmez**. Servisler `await import()`
ile dinamik yüklendiği için ESM önbelleği eski kodu tutuyor.

```bash
sudo pm2 reload all --update-env
```

`instomer-chatcrm` kullanıcısının **şifresiz sudo yetkisi yok**, pm2 root'un
altında çalışıyor. Bu komutu Emre'nin çalıştırması gerekiyor.

Çalıştığını doğrula — süreç başlangıcı, yüklenen dosyanın zamanından **sonra**
olmalı:

```bash
ssh -i ~/.ssh/instomer_deploy instomer-chatcrm@69.62.117.112 \
  "ps -eo lstart,etimes,cmd | grep 'backend/server.js' | grep -v grep; \
   ls -la --time-style=+%H:%M:%S /home/instomer-chatcrm/backend/server.js; \
   curl -s http://127.0.0.1:5008/health"
```

`etimes` (uptime) iki ölçümde artıyor olmalı — artmıyorsa çökme döngüsü var.

---

## 4. Commit ve push

```bash
git add -A
git commit -F - <<'EOF'
tur(kapsam): BASLIK BUYUK HARFLE, NE DEGISTI

Neyin bozuk olduğu ve neden. Kod ne yaptığını anlatır, commit mesajı
NİÇİN yapıldığını anlatır.

SQL (migrations klasoru gitignore'lu):
  ALTER TABLE ... ;

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
git push
```

`git push` iki depoya birden gider, ayrıca komut gerekmez.

**Pull:** dallar ayrışırsa `git pull --rebase` kullan — depo geçmişi düz,
merge commit'i istemiyoruz.

---

## 5. Veritabanına elle erişim

```bash
# Betiği scp ile gönder, tek satır ssh ile ÇALIŞTIRMA (tırnak kaçışları bozuluyor)
cat > /tmp/q.sh <<'EOF'
cd /home/instomer-chatcrm/backend
URL=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"')
URL=${URL%%\?*}
psql "$URL" -P pager=off -c "SELECT ... ;"
EOF
scp -i ~/.ssh/instomer_deploy /tmp/q.sh instomer-chatcrm@69.62.117.112:/tmp/q.sh
ssh -i ~/.ssh/instomer_deploy instomer-chatcrm@69.62.117.112 "bash /tmp/q.sh; rm -f /tmp/q.sh"
```

Prisma ile bir betik çalıştıracaksan **`backend` klasörünün içinden** çalıştır;
`/tmp`'den `@prisma/client` bulunamıyor:

```bash
scp ... /tmp/x.mjs
ssh ... "cp /tmp/x.mjs /home/instomer-chatcrm/backend/_tmp.mjs && \
         cd /home/instomer-chatcrm/backend && node _tmp.mjs; rm -f _tmp.mjs"
```

---

## 6. Loglar

```
/home/instomer-chatcrm/backend/logs/out.log
/home/instomer-chatcrm/backend/logs/error.log
/home/instomer-chatcrm/backend/logs/combined.log
```

Nginx access log'una erişim yok (sudo gerekiyor).

---

## 7. Tuzaklar — hepsi canlıda yaşandı

### 7.1 Depodaki deploy scriptleri BOZUK

`scripts/deploy.sh` ve `scripts/push-from-local.sh` **kullanılmayacak**.

- `push-from-local.sh` tanımsız `PROJECT_ROOT` ile çöküyor
- `deploy.sh` HTDOCS tespitinde `~/htdocs`'a düşüp **`rsync --delete` ile canlı
  site klasörünü ve SSL için gereken `.well-known`'ı silebiliyor**

Yukarıdaki elle sıra kullanılacak.

### 7.2 `schema.prisma`'yı tek başına göndermek tehlikeli

**Yaşanan olay (22.09.2026, ~2 saat kesinti):** Bir özellik için schema.prisma'nın
tamamı yüklendi. Dosya, başka birinin commit'lenmemiş `Case.leadSource` alanlarını
da taşıyordu. Sunucuda `prisma generate` çalıştı, üretilen istemci 4 yeni kolon
beklemeye başladı, ama `ALTER TABLE` yalnızca 2'si için çalıştırıldı. Sonuç:

```
P2022  The column `cases.leadSource` does not exist in the current database
```

**Her `prisma.case.*` çağrısı patladı.** 3.058 hata birikti, case listeleri boş
döndü, 87 yeni konuşmanın 86'sı case'siz kaldı. Belirti aldatıcıydı: sohbet
başlığındaki case rozeti konuşma kaydından geldiği için ekran normal görünüyordu.

**Kural:** `prisma generate` çalıştırdıktan sonra, süreçleri yeniden başlatmadan
önce şema/DB farkını **mutlaka** doğrula (3.1'deki "KALAN FARK" adımı). Ayrıca
göndermeden önce `git diff backend/prisma/schema.prisma` ile dosyanın yalnızca
kendi değişikliğini taşıdığını kontrol et.

### 7.3 `join` ile md5 karşılaştırma dosya atlıyor

macOS `sort` ile GNU `sort` farklı sıralıyor:

```
macOS : retell-webhook.controller.js → retell.controller.js → retellPhone.controller.js
Linux : retell.controller.js → retellPhone.controller.js → retell-webhook.controller.js
```

`join` girdilerin aynı düzende sıralı olmasını şart koşar; olmayınca eşleşmeyen
satırı **sessizce atar**. Bu yüzden bir dosya deploy edilmeden "hepsi aynı"
raporlandı. **Her zaman 3.2'deki sözlük eşlemesini kullan.**

### 7.4 Sistemde iki ayrı "şube" listesi var

- **Şubeler ekranı** (Ayarlar → Firma & Bilgi Bankası): adresleri
  `workspace_rules` içindeki `CLINIC_LOCATIONS` **JSON metnine** yazıyor
- **`appointment_branches` tablosu**: bot, katalog akışı ve widget burayı okuyor

Ayrıca `appointment_branches` çalışma alanına göre farklı anlam taşıyor: Fes
Spa'da gerçek şube, Metropol Hastanesi'nde **tıbbi branş** (Kardiyoloji,
Nöroloji…). Körü körüne veri taşıma yapma.

### 7.5 `ecosystem.config.cjs` yanıltıyor

`watch: false` yazıyor ama süreçlerin dosya değişiminde kendiliğinden yenilendiği
**varsayımı doğru değil**. Bazen yenileniyor, bazen 17 dakika sonra bile
yenilenmiyor. Her zaman süreç başlangıcını dosya zamanıyla karşılaştır.

### 7.6 `backend/Arşiv.zip`

1.1 MB'lık bir arşiv yanlışlıkla commit'lenmiş, takip ediliyor. Sunucuya
gönderme, gerek yok. Temizlenmesi iyi olur.

### 7.7 Başkasının yarım işi

Bu depoda birden fazla kişi çalışıyor ve commit'lenmemiş dosyalar sık sık duruyor.
Deploy öncesi `git status` boş olmalı. Değilse ne olduğunu anla, körü körüne
`git add -A` yapma.

---

## 8. Hızlı kontrol listesi

```
[ ] git status temiz
[ ] git pull --rebase yapıldı, çakışma yok
[ ] schema.prisma değiştiyse: SQL uygulandı, "empty migration" doğrulandı
[ ] backend dosya farkı sözlük eşlemesiyle bulundu (join DEĞİL)
[ ] farklı dosyalar yedeklendi ve gönderildi, md5'ler tuttu
[ ] npx prisma generate çalıştı
[ ] verify-build.js "Başarılı" dedi
[ ] frontend derlendi; yeni bundle → index.html → eski bundle silindi
[ ] chmod 644 yapıldı, canlı URL 200 dönüyor
[ ] commit mesajına SQL yazıldı, push edildi
[ ] Emre'ye söylendi: sudo pm2 reload all --update-env
[ ] reload sonrası süreç başlangıcı > dosya zamanı, uptime artıyor, health ok
```

---

## 9. Çalışma kuralları (Emre'nin tercihleri)

- **Sunucuya göndermeden önce sor.** Commit ve derleme serbest; scp, bundle
  değişimi ve canlı `ALTER TABLE` için açık onay ("gönder") gerekir.
- **Kod değişikliğinden önce teşhisi anlat.** Bir sorun bulduğunda önce ne
  olduğunu açıkla, "yap/düzelt/uygula" denmeden koda başlama.
- **AI botu yalnızca bilgi bankasından cevap verir.** İşletmeye özgü gerçekleri
  prompt'a gömme; bilgi yoksa bot yetkiliye aktarmalı.
- Tasarım işlerinde önce önizleme, beğenildikten sonra uygulama.

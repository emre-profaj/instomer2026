# Instomer — Kurulum, Commit, Push ve Deploy Kılavuzu

> Bu dosya yeni bir bilgisayarda sıfırdan kurulum yapıp canlıya çıkmak için
> yazıldı. Aynı zamanda **Claude Code'a verilecek bağlam dosyası**dır: yeni
> makinede oturumu açtıktan sonra "Bu dosyayı oku, buna göre çalış" demen
> yeterli. En sonda hazır prompt bloğu var.
>
> Tarih: 24.09.2026 · Depo: `Profajai/instomerchat` · Canlı: https://app.instomer.com

---

## 0. En kritik üç kural

1. **Sunucuya bir şey göndermeden önce Emre'ye sor.** Commit ve yerel derleme
   serbest; `scp`, bundle değişimi ve canlı `ALTER TABLE` izne bağlı.
2. **Sıra her zaman aynı: önce SQL, sonra backend, en son frontend.** Tersi
   yapılırsa yeni kod olmayan kolonu arar ve tüm istekler düşer (gerçek vaka:
   §7.3).
3. **`sudo pm2 reload all --update-env` komutunu yalnızca Emre çalıştırabilir.**
   `instomer-chatcrm` kullanıcısının şifresiz sudo yetkisi yok. Bu komut
   çalışmadan gönderilen backend kodu **devrede değildir**.

---

## 1. Yeni bilgisayarda kurulum

### 1.1 Gerekenler

| Araç | Yerel sürüm (çalışıyor) | Sunucu sürümü |
|---|---|---|
| Node | v25.2.1 | v23.11.1 |
| npm | 11.6.2 | 10.9.2 |
| git, ssh, curl | — | — |

Sürüm farkı sorun çıkarmıyor, ama **frontend derlemesi farklı hash üretebiliyor**
(§7.6). Derlemeyi hep aynı makinede yapmak en temizi.

### 1.2 Depoyu klonla

```bash
git clone https://github.com/Profajai/instomerchat.git
cd instomerchat
```

### 1.3 Depoda OLMAYAN dört şey — elle taşınacak

| Ne | Nereden alınır | Nereye |
|---|---|---|
| `backend/.env` | Sunucudan kopyala | `backend/.env` |
| SSH anahtarı | Eski bilgisayardan | `~/.ssh/instomer_deploy` (chmod 600) |
| `scripts/.deploy-target` | Eski bilgisayardan | `scripts/.deploy-target` |
| `node_modules` | `npm install` ile üretilir | — |

```bash
scp -i ~/.ssh/instomer_deploy \
  instomer-chatcrm@69.62.117.112:/home/instomer-chatcrm/backend/.env \
  backend/.env
chmod 600 ~/.ssh/instomer_deploy
```

### 1.4 Bağımlılıklar

```bash
cd backend  && npm install && npx prisma generate
cd ../frontend && npm install
```

`npx prisma generate` **şart** — `backend/.env` içindeki `DATABASE_URL` okunur,
istemci ondan üretilir. Bu adım atlanırsa hiçbir sorgu çalışmaz.

---

## 2. Depo yapısı ve git

### 2.1 Uzak depolar — iki adrese birden push edilir

```
instomerchat  fetch → github.com/Profajai/instomerchat.git
              push  → github.com/Profajai/instomerchat.git
              push  → github.com/emre-profaj/instomer2026.git

origin        fetch → github.com/emre-profaj/instomer2026.git
              push  → github.com/emre-profaj/instomer2026.git
              push  → github.com/Profajai/instomerchat.git
```

Yani **tek bir `git push` iki depoya birden yazar.** Dalın takip ettiği uzak
`instomerchat/main`. Bu bilinçli bir ayna kurulumu, bozma.

### 2.2 Dal ve geçmiş

- Tek dal: `main`. Geçmiş **düz** tutuluyor, merge commit yok.
- Ortak çalışma var (Armağan Bengi paralel commit atıyor), bu yüzden:

```bash
git pull --rebase        # merge DEĞİL
```

`git pull` çıplak çalıştırılırsa "divergent branches" hatası verir; `--rebase`
ekle. Çakışma çıkarsa çöz, `git rebase --continue`.

### 2.3 `.gitignore` — bilinmesi gereken maddeler

```
node_modules/            → yok
package-lock.json        → YOK (bilerek; her makine kendi kilidini üretir)
.env, .env.*             → yok
logs/, *.log             → yok
dist/                    → yok AMA...
!frontend/dist/          → ...frontend/dist TAKİP EDİLİYOR
!frontend/dist/**
*.cjs                    → yok
!backend/ecosystem.config.cjs → bu hariç
DEPLOYMENT*.md           → yok
backend/prisma/*.db      → yok
scripts/.deploy-target   → yok
```

İki sonucu var:

- **`frontend/dist` depoda.** Yeni bilgisayarda `npm install` yapmadan bile
  derlenmiş bundle elinde olur. Ama derleme yaparsan `dist`'i de commit et,
  yoksa depodaki bundle ile canlıdaki farklılaşır.
- **`backend/prisma/migrations` klasörünün çoğu gitignore'lu.** Şema
  değişikliğinde çalıştırdığın SQL'i **commit mesajına yaz**; başka türlü
  kaydı kalmıyor. Depoda yalnızca iki eski migration dosyası takipte.

### 2.4 Takipte olan tuhaf dosyalar

- `backend/Arşiv.zip` — 1.1 MB, yanlışlıkla commit'lenmiş. Sunucuya
  gönderilmiyor. Temizlenebilir.
- `scripts/deploy.sh`, `scripts/push-from-local.sh`, `scripts/rollback.sh` —
  **ÇALIŞMIYOR, kullanma.** Sebebi §7.1.

---

## 3. Sunucu haritası

```
Host        69.62.117.112
Kullanıcı   instomer-chatcrm
SSH         ssh -i ~/.ssh/instomer_deploy instomer-chatcrm@69.62.117.112
Alan adı    app.instomer.com   (chatcrm.instomer.com dışarıya cevap VERMİYOR)
```

| Yol | İçerik |
|---|---|
| `/home/instomer-chatcrm/backend/` | Node uygulaması (kaynak, `node_modules`, `.env`, `prisma/`) |
| `/home/instomer-chatcrm/backend/logs/` | `out.log`, `error.log`, `combined.log` |
| `/home/instomer-chatcrm/backend/public/widget/widget.js` | Web widget script'i |
| `/home/instomer-chatcrm/htdocs/chatcrm.instomer.com/` | Nginx kökü — frontend |
| `/home/instomer-chatcrm/htdocs/chatcrm.instomer.com/assets/` | `index-*.js`, `index-*.css` |
| `~/_backend_backups/<zaman>/` | Backend dosya yedekleri (şu an 50 klasör) |
| `~/_frontend_backups/<zaman>/` | Bundle + index.html yedekleri (64 klasör) |
| `~/_db_backups/schema-<zaman>.sql` | `pg_dump --schema-only` yedekleri (6 dosya) |

Disk: 193 GB'ın 110 GB'ı dolu, %57. Yedek klasörleri birikiyor, ara ara
temizlemek gerekebilir.

### 3.1 pm2 — dikkat

Backend **root'un pm2'si** altında, **cluster modunda iki işçi** olarak
çalışıyor (God Daemon `/root/.pm2`). `instomer-chatcrm` kullanıcısı pm2'yi
göremez. Yeniden başlatma:

```bash
sudo pm2 reload all --update-env      # bunu Emre çalıştırır
```

`--update-env` **şart**: `.env` değişikliği ancak bununla okunur.

`pm2 list`'te görünen `chatcrm` kaydı ölü bir artık (errored, 61 restart) —
gerçek süreç o değil.

### 3.2 Veritabanı erişimi

PostgreSQL sunucunun localhost'unda, `psql` kurulu. **Kritik ayrıntı:**
`DATABASE_URL` sonundaki `?schema=public` kırpılmadan psql bağlanmaz.

```bash
cd /home/instomer-chatcrm/backend
URL=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"')
URL=${URL%%\?*}          # ← ?schema=public kırpılıyor
psql "$URL" -P pager=off -c "SELECT 1;"
```

Uzak komutları **tek satır ssh ile yazma**; `scp` ile betik gönder, öyle
çalıştır. İç içe tırnaklar ve `$` kaçışları yerelde genişleyip boş adresle
bağlanmaya yol açıyor.

### 3.3 Backend `.env` — değişken adları

```
DATABASE_URL          FACEBOOK_APP_ID           JWT_SECRET
FRONTEND_URL          FACEBOOK_APP_SECRET       JWT_EXPIRE
NODE_ENV              FACEBOOK_CALLBACK_URL     PORT
                      FACEBOOK_VERIFY_TOKEN
                      FACEBOOK_GRAPH_API_VERSION
                      FACEBOOK_ADMIN_ACCESS_TOKEN
```

**Burada olmayan iki şey:**

- `SYSTEM_EMAIL_*` — sistem maili artık **süper admin panelinden** giriliyor
  (`global_settings` tablosu). `.env` yalnızca yedek yol.
- `ENCRYPTION_KEY` — tanımlı değil, `utils/encryption.js` fallback anahtara
  düşüyor ve her açılışta uyarı basıyor. **Sonradan eklenirse mevcut şifreli
  değerler (WooCommerce anahtarları, sistem maili şifresi/API anahtarı)
  çözülemez hale gelir.** Eklenecekse önce o değerlerin yeniden girilmesi
  planlanmalı.

### 3.4 Widget script'i nerede servis ediliyor

Müşterilere verilen gömme kodu şu adresi kullanıyor:

```
https://app.instomer.com/api/ai/public/widget/script
```

Bu uç dosyayı **her istekte diskten okuyor**. Yani
`backend/public/widget/widget.js` güncellendiği anda canlıya çıkar, pm2 reload
beklemez. (`/widget.js` adresi 404 döner, nginx oraya bakmıyor.)

---

## 4. Deploy — adım adım

### Adım 0 — Hazırlık

```bash
cd instomerchat
git status --porcelain          # temiz olmalı
git pull --rebase
node backend/scripts/verify-build.js     # "Başarılı! Toplam N dosya"
```

`verify-build.js` sözdizimi ve import yollarını denetler. **Kırmızıysa deploy
etme.**

### Adım 1 — SQL (şema değiştiyse)

Şema değişti mi:

```bash
git diff --stat <onceki_sha> HEAD -- backend/prisma/schema.prisma
```

Değiştiyse, gereken SQL'i **tahmin etme** — Prisma'ya hesaplat. Sunucuda:

```bash
# schema.prisma'yı /tmp'ye gönder, sonra:
cd /home/instomer-chatcrm/backend
RAW=$(grep -m1 '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"')
PSQL=${RAW%%\?*}
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p ~/_db_backups
pg_dump --schema-only "$PSQL" > ~/_db_backups/schema-$TS.sql     # 1. YEDEK

cd /tmp
/home/instomer-chatcrm/backend/node_modules/.bin/prisma migrate diff \
  --from-url "$RAW" --to-schema-datamodel /tmp/yeni_schema.prisma --script > /tmp/d.sql
cat /tmp/d.sql                                                    # 2. GÖR

psql "$PSQL" -v ON_ERROR_STOP=1 --single-transaction -f /tmp/d.sql   # 3. UYGULA

# 4. DOĞRULA — çıktı "This is an empty migration" olmalı
/home/instomer-chatcrm/backend/node_modules/.bin/prisma migrate diff \
  --from-url "$RAW" --to-schema-datamodel /tmp/yeni_schema.prisma --script
```

`--single-transaction`: ya hepsi geçer ya hiçbiri. Yarım kalmış şema olmaz.

Uyguladığın SQL'i **commit mesajına yaz** (migrations gitignore'lu).

### Adım 2 — Backend dosyaları

Hangi dosyalar farklı? **`join` kullanma** (§7.2), sözlük eşlemesi yap:

```bash
# yerelde
git ls-files backend | grep -vE '\.env$|\.example$|schema\.prisma\.backup|\.zip$' > /tmp/liste.txt
(while read f; do [ -f "$f" ] && echo "$(md5 -q "$f")|$f"; done < /tmp/liste.txt) > /tmp/L.txt

# sunucuda aynı liste için md5sum al → /tmp/R.txt
# sonra python ile sözlük karşılaştır:
python3 -c "
L=dict(l.rstrip().split('|',1)[::-1] for l in open('/tmp/L.txt'))
R=dict(l.rstrip().split('|',1)[::-1] for l in open('/tmp/R.txt'))
fark=sorted(f for f in L if R.get(f)!=L[f] and not f.endswith('package-lock.json'))
print(len(fark)); [print(' ',f) for f in fark]
"
```

`package-lock.json` **hariç tutulur** — sunucu kendi `npm install` sonucunu
yansıtır, üzerine yazmak yanlış.

Sonra: yedekle → gönder → **md5 ile doğrula**.

```bash
# yedek
D=~/_backend_backups/$(date +%Y%m%d-%H%M%S); mkdir -p $D
# her dosya için: mkdir -p "$D/$(dirname $p)" && cp "backend/$p" "$D/$p"

# gönder
scp -i ~/.ssh/instomer_deploy <dosya> instomer-chatcrm@69.62.117.112:/home/instomer-chatcrm/backend/<yol>

# doğrula: yerel md5 == sunucu md5sum
```

### Adım 3 — Prisma istemcisi ve bütünlük

```bash
cd /home/instomer-chatcrm/backend && npx prisma generate
node scripts/verify-build.js
```

### Adım 4 — Frontend

```bash
cd frontend && npx vite build
```

Yayına alma **sırası önemli** (kesintisiz olması için):

```bash
# 1) önce yeni asset'ler
scp assets/index-XXXX.js assets/index-YYYY.css → .../htdocs/chatcrm.instomer.com/assets/
# 2) sonra index.html
scp index.html → .../htdocs/chatcrm.instomer.com/index.html
# 3) izinler — ŞART
chmod 644 $H/assets/index-XXXX.js $H/assets/index-YYYY.css $H/index.html
# 4) en son eski bundle silinir
rm -f $H/assets/<eski>.js $H/assets/<eski>.css
```

Doğrulama:

```bash
curl -s https://app.instomer.com/ | grep -E 'assets/index'
curl -s -o /dev/null -w "%{http_code}\n" https://app.instomer.com/assets/index-XXXX.js
```

### Adım 5 — Reload (Emre)

```bash
sudo pm2 reload all --update-env
```

Sonra **doğrula** — süreç başlangıcı, yüklenen dosyanın zamanından SONRA olmalı:

```bash
ps -eo lstart,etimes,cmd | grep 'backend/server.js' | grep -v grep
ls -la --time-style=+%H:%M:%S /home/instomer-chatcrm/backend/services/<gonderilen>.js
curl -s http://127.0.0.1:5008/health
```

Uptime'ı **iki kez ölç** — artıyorsa çökme döngüsü yok.

### Adım 6 — Push

```bash
git add -A && git commit && git push      # iki depoya birden gider
```

---

## 5. Kontrol listesi (kopyala)

```
[ ] git pull --rebase, çalışma alanı temiz
[ ] verify-build.js başarılı
[ ] şema değiştiyse: pg_dump yedeği alındı
[ ] SQL prisma migrate diff ile üretildi, gözle görüldü
[ ] SQL --single-transaction ile uygulandı
[ ] kalan fark: "empty migration"
[ ] backend dosyaları md5 ile karşılaştırıldı (join DEĞİL)
[ ] farklılar yedeklendi ve gönderildi
[ ] gönderilenlerin md5'i tuttu
[ ] npx prisma generate çalıştı
[ ] verify-build.js sunucuda da başarılı
[ ] frontend derlendi
[ ] asset'ler → index.html → chmod 644 → eski bundle silindi
[ ] canlı index.html yeni bundle'ı gösteriyor, dosyalar 200
[ ] Emre pm2 reload çalıştırdı
[ ] süreç başlangıcı dosya zamanından sonra
[ ] uptime iki ölçümde artıyor, health ok
[ ] git push yapıldı
[ ] SQL commit mesajına yazıldı
```

---

## 6. Geri alma

| Ne bozuldu | Nasıl geri alınır |
|---|---|
| Backend dosyası | `~/_backend_backups/<zaman>/` altından geri kopyala, reload |
| Frontend | `~/_frontend_backups/<zaman>/` altındaki `index.html` + eski bundle |
| Şema | `~/_db_backups/schema-<zaman>.sql` **yalnızca şema yedeği** — veri yok. Kolon eklemeleri geri alınacaksa elle `ALTER TABLE ... DROP COLUMN` |

Şema yedeği veri içermez; veri kaybı riski olan bir işlem yapılacaksa önce tam
`pg_dump` alınmalı.

---

## 7. Gerçek vakalar — bunlara dikkat

### 7.1 Depodaki deploy scriptleri çalışmıyor

- `scripts/push-from-local.sh` — tanımsız `PROJECT_ROOT` ile çöküyor,
  `scripts/` klasörünü sunucuya hiç göndermiyor (sunucuda `~/scripts` yok).
- `scripts/deploy.sh` — HTDOCS otomatik tespitinde `~/htdocs`'a düşüp
  `rsync --delete` ile **canlı site klasörünü ve SSL için gereken
  `.well-known` dizinini silebiliyor**.

Düzeltilene kadar deploy elle yapılır.

### 7.2 macOS `sort` ile GNU `sort` aynı sıralamıyor

`join` girdilerin **aynı düzende** sıralı olmasını şart koşar; değilse
eşleşmeyen satırı **sessizce atar**.

```
macOS :  retell-webhook.controller.js → retell.controller.js → retellPhone...
sunucu:  retell.controller.js → retellPhone... → retell-webhook.controller.js
```

Bu yüzden bir kere `retell.controller.js` karşılaştırmadan düştü ve sunucuda
3 gün eski kaldı. **Karşılaştırmayı `join` ile değil, python sözlüğüyle yap.**

### 7.3 `schema.prisma`'yı tek başına göndermek tehlikeli

`schema.prisma` gönderilip `prisma generate` çalıştırıldı ama `ALTER TABLE`
unutuldu. Üretilen istemci olmayan kolonu aradı:

```
P2022 The column `cases.leadSource` does not exist in the current database
```

Sonuç: **her `prisma.case.*` çağrısı patladı**, 2 saat boyunca case listeleri
boş döndü, 87 konuşmanın 86'sı case'siz kaldı, error.log'da 3.058 hata birikti.
Belirti aldatıcıydı — ekran normal görünüyordu çünkü başlıktaki case rozeti
konuşma kaydından geliyordu.

**Kural:** `schema.prisma` gönderildikten sonra, süreçler yeniden başlamadan
önce şema/DB farkı mutlaka doğrulanır (Adım 1'in 4. maddesi).

Ayrıca: `schema.prisma` başkasının yarım işini taşıyor olabilir. Göndermeden
önce `git diff` ile dosyanın yalnızca senin değişikliğini taşıdığını doğrula.

### 7.4 Dosya değişimi süreçleri yeniden başlatmaz

`ecosystem.config.cjs` `watch: false` diyor ve gerçekten de yeniden başlatmıyor.
Servisler `await import()` ile dinamik yüklendiği için **ESM önbelleği yüzünden
yeni kod restart olmadan devreye girmez.**

"Gönderdim, canlıda" demeden önce süreç başlangıcını dosya mtime'ı ile
karşılaştır.

### 7.5 Frontend dosya izinleri

`scp` ile giden dosyalar `rw-r-----` olarak iniyor; nginx okuyamıyor ve **403**
veriyor. Her frontend yüklemesinden sonra `chmod 644`.

### 7.6 Derleme hash'i makineye göre değişebiliyor

Aynı kaynaktan farklı makinede derleme farklı `index-XXXX.js` üretebiliyor
(Node/vite sürüm farkı). Sunucuya **kaynağın derlemesi** gönderilir ve depodaki
`dist` de ona hizalanır; yoksa depodaki bundle ile canlıdaki farklılaşır.

### 7.7 Bilgi bankası dosyaları

Yüklenen dosyalar diskte **rastgele adla** duruyor. Kayıtta `fileUrl` alanı
sonradan eklendi; **o alandan önce yüklenmiş dosyalar bulunamıyor**, yeniden
yüklenmeleri gerekiyor.

---

## 8. Sık kullanılan tanılama komutları

```bash
# canlı sağlık
curl -s http://127.0.0.1:5008/health

# son hatalar
tail -50 /home/instomer-chatcrm/backend/logs/error.log

# belirli bir kişiyi/konuşmayı izle
grep '<contactId>' /home/instomer-chatcrm/backend/logs/combined.log | tail -20

# şema/DB farkı (boş olmalı)
cd /tmp && /home/instomer-chatcrm/backend/node_modules/.bin/prisma migrate diff \
  --from-url "$RAW" --to-schema-datamodel /home/instomer-chatcrm/backend/prisma/schema.prisma --script

# widget script'i canlıda güncel mi
curl -s https://app.instomer.com/api/ai/public/widget/script | wc -c
```

---

## 9. Claude Code'a verilecek prompt

Yeni bilgisayarda oturum açtıktan sonra şunu yapıştır:

```
Bu depo Instomer adlı çok kiracılı bir CRM. Çalışmaya başlamadan önce
docs/KURULUM-VE-DEPLOY.md dosyasını oku ve kurallarına uy.

Özetle:
- Sunucuya bir şey göndermeden önce bana sor. Commit ve yerel derleme serbest.
- Deploy sırası her zaman: önce SQL, sonra backend dosyaları, en son frontend.
- SQL'i tahmin etme; prisma migrate diff ile üret, pg_dump yedeği al,
  --single-transaction ile uygula, sonra farkın boş olduğunu doğrula.
- Dosya karşılaştırmasını join ile yapma (macOS/GNU sort farkı satır atlatıyor);
  md5 listelerini python sözlüğüyle karşılaştır.
- Gönderdiğin her dosyanın md5'ini sunucuda doğrula.
- pm2 reload komutunu sen çalıştıramazsın, bana söyle. Reload'dan sonra süreç
  başlangıcını dosya zamanıyla karşılaştırıp doğrula.
- scripts/deploy.sh ve scripts/push-from-local.sh BOZUK, kullanma.
- Bir sorunu teşhis ettiğinde önce anlat, kodlamaya ben onay verince başla.
- Bot yalnızca bilgi bankasından cevap verir; prompt'a işletmeye özgü bilgi gömme.

Kod yazarken açıklamaları Türkçe yaz ve "neden" sorusunu cevapla; kodun ne
yaptığı zaten okunuyor, neden öyle yapıldığı okunmuyor.
```

---

## 10. Bilinen açık konular (24.09.2026)

| Konu | Durum |
|---|---|
| Oran İnşaat Retell kredisi | Bitmiş, otomatik aramalar çıkmıyor |
| Park Avenue Denizli Retell | 106 arama `404` — ajan/numara ayarı bozuk |
| `backend/Arşiv.zip` | Depoda gereksiz duruyor, temizlenebilir |
| `ENCRYPTION_KEY` | `.env`'de yok, fallback anahtar kullanılıyor (§3.3) |
| DKIM (instomer.com) | Google selektöründe kayıt yok; SPF var |
| Depodaki deploy scriptleri | Bozuk (§7.1) |

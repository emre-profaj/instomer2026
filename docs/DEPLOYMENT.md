# Instomer — Commit → Push → Deploy

## 0. BU DOSYA SIR TAŞIMAZ — ve taşımamalı

Aşağıda parola, token, sunucu IP'si ya da özel anahtar **yok**. Bilerek yok:

- Depo (en azından bir gün) başkasının eline geçebilir; bir kez commit'lenen sır
  `git log`'ta kalır, dosyayı silmek onu geri almaz.
- Paylaşımlı bir VPS'in adresi tek başına saldırı yüzeyi.

Gerçek değerler **parola yöneticisinde** duruyor. Bu belge onların **nereye**
yazılacağını anlatır, **ne olduklarını** değil.

Parola yöneticisinde tutulacak not (depoya koyma):

| Anahtar | Nedir |
|---|---|
| `<VPS_IP>` | Sunucunun IP adresi |
| `<SITE_USER_PAROLA>` | `instomer-chatcrm` kullanıcısının şifresi |
| `<DB_PAROLA>` | PostgreSQL — `backend/.env` içindeki `DATABASE_URL` |
| `<GH_TOKEN>` | GitHub erişimi — **URL'e gömme**, deploy key kullan |
| `<OWNER_EPOSTA>` / `<OWNER_PAROLA>` | Panele ilk giriş |

> ⚠️ **Devralınan borç:** `git remote -v` çıktısında URL'in içinde `ghp_...`
> token'ı varsa bu token depoyu klonlayan herkese açıktır. GitHub'dan iptal et,
> remote'u temizle: `git remote set-url origin git@github.com:Profajai/instomerchat.git`

Bilinen sabitler (gizli değil, koda zaten gömülü):

| | |
|---|---|
| Alan adı | `app.instomer.com` |
| Site kullanıcısı | `instomer-chatcrm` |
| GitHub deposu | `Profajai/instomerchat` |
| pm2 süreç adı | `instomer` |
| API portu | `5008` (yalnızca `127.0.0.1`) |

---

## 1. ÜÇ SSH ANAHTARI, ÜÇ AYRI YÖN

"SSH giriş bilgileri" tek bir şey değil. Üç farklı anahtar var ve her biri
**farklı yöne** bakıyor. Birini diğerinin yerine koymak, hata mesajı vermeyen
ama çalışmayan bir kurulum üretiyor.

```
        ┌──────────────┐   (A) sunucu GitHub'dan ÇEKER       ┌──────────┐
        │              │ ─────────────────────────────────► │          │
        │   SUNUCU     │        deploy key (read-only)      │  GitHub  │
        │   <VPS_IP>   │                                    │          │
        │              │ ◄───────────────────────────────── │  Actions │
        └──────┬───────┘   (B) Actions sunucuya bağlanır    └──────────┘
               ▲                 VPS_SSH_KEY secret
               │                 ve "git pull + deploy.sh" tetikler
               │ (C) sen sunucuya bağlanırsın — elle dağıtım / teşhis
        ┌──────┴───────┐
        │  senin Mac   │
        └──────────────┘
```

| | Nerede ÜRETİLİR | ÖZEL yarısı nerede durur | AÇIK yarısı nereye yapıştırılır |
|---|---|---|---|
| **A · Sunucu → GitHub** | Sunucuda, `instomer-chatcrm` olarak | `~/.ssh/id_ed25519` (sunucu) · mod 600 | GitHub → depo → Settings → **Deploy keys**. **"Allow write access" İŞARETLEME** |
| **B · Actions → Sunucu** | Senin Mac'inde | GitHub → Settings → Secrets → `VPS_SSH_KEY` | Sunucuda `~/.ssh/authorized_keys` |
| **C · Sen → Sunucu** | Senin Mac'inde | `~/.ssh/instomer_deploy` | Sunucuda `~/.ssh/authorized_keys` |

**B için ayrı bir çift üret, C'yi kullanma.** Aynı anahtarı paylaşmak, GitHub'a
sızan bir secret'ın senin kişisel erişimini de vermesi demek; ayrıca B'yi iptal
etmek istediğinde kendi erişimini de kesiyorsun.

**A yazma izni almamalı.** Sunucunun deposu tek yönlü: çeker, yazmaz.
`scripts/deploy.sh` içinde `git push` **yok ve olmamalı** — sunucuda oluşan bir
commit (örneğin `.env` değişikliği) depoya sızarsa sırlar da sızar.

### Deploy key politikası — önkoşul

Profajai organizasyonu bir dönem deploy key'leri **politika ile kapatmıştı**
("Disabled by Profajai") ve kod sunucuya Actions'ın rsync'i ile gidiyordu.
Bu kurgu artık (A) yoluna döndü; **politikanın açık olması önkoşul.**

Org sahibi olarak: GitHub → organizasyon → Settings → Actions / Security →
deploy key kısıtlamasını kaldır. Kapalıyken sunucudaki `git fetch`
`Permission denied (publickey)` verir ve dağıtım o adımda durur — sessiz
başarısızlık değil, net hata.

**Neden token yerine deploy key:** token (PAT) sunucuda **hesabın tamamına**
erişen kalıcı bir kimlik bırakıyor; deploy key tek depoya bağlı ve read-only.
Bu depoda bir kez plaintext token sızması yaşandı (eski `origin` adresinin
içine gömülmüştü); aynı yüzeyi tekrar açmıyoruz.

## 2. NEYİ NEREYE KOYACAKSIN

### 2.1 Sunucuda

```
/home/instomer-chatcrm/
├── .ssh/
│   ├── id_ed25519            ← (A) özel · mod 600 · GitHub'a erişim
│   ├── id_ed25519.pub        ← (A) açık · GitHub Deploy keys'e yapıştırılan
│   └── authorized_keys       ← (B) ve (C) açık anahtarları · mod 600
└── htdocs/app.instomer.com/  ← UYGULAMA DİZİNİ = REPO KLONU. Dağıtım burada çalışır.
    ├── .git/                 ← origin: git@github.com:Profajai/instomerchat.git
    ├── backend/
    │   ├── .env              ← TEK .env · mod 600 · git'te YOK
    │   ├── logs/             ← git'te YOK
    │   ├── uploads/          ← MÜŞTERİ YÜKLEMELERİ · git'te YOK
    │   └── ecosystem.config.cjs
    ├── frontend/
    ├── scripts/deploy.sh     ← dağıtımın kendisi (depoda)
    ├── scripts/rollback.sh   ← geri alma (depoda)
    ├── .last-deployed-sha    ← geri alma noktası, deploy.sh yazıyor
    └── _backups/             ← her dağıtımda alınan yedekler
```

> **Dağıtımın silmemesi gereken dizinler.** Sunucudaki dağıtım
> `git reset --hard` + `git clean -fd` çalıştırıyor. `backend/.env`,
> `backend/logs/`, `backend/uploads/`, `_backups/` ve `.last-deployed-sha`
> **`.gitignore`'da** olduğu için `clean` onlara dokunmuyor (`-x` bilinçli
> olarak KULLANILMIYOR) — üstüne workflow bir de `-e` istisnası veriyor.
> `backend/uploads/` bu listeye sonradan eklendi: rsync döneminde onu
> `--exclude` koruyordu, git'e geçişte hiçbir kalıp kapsamıyordu ve ilk
> otomatik dağıtım bütün müşteri yüklemelerini silecekti.

> **`.env` konumu Instomer'da `backend/.env`** — şablondaki "depo kökünde tek
> `.env`" kuralından bilinçli sapma. Sebep: Instomer monorepo değil, tek Node
> uygulaması `backend/` altında ve `server.js` `.env`'i kendi dizininden açık
> path ile yüklüyor (`dotenv.config({ path: join(__envDir, '.env') })`).
> **İkinci bir `.env` doğduğu anda ikisi ayrışır** ve hangisinin okunduğunu
> yalnızca hata mesajı söyler — o da yanlış söyler. Tek dosya kalsın.

### 2.2 GitHub'da

**Settings → Secrets and variables → Actions:**

| Secret | Değer |
|---|---|
| `VPS_HOST` | `<VPS_IP>` |
| `VPS_USER` | `instomer-chatcrm` |
| `VPS_SSH_PORT` | `22` |
| `VPS_SSH_KEY` | (B) anahtarının **özel** yarısının tamamı — `-----BEGIN` / `-----END` satırları ve **sondaki boş satır dâhil** |
| `VPS_APP_PATH` | `/home/instomer-chatcrm/htdocs/app.instomer.com` |

**Settings → Deploy keys:** (A) anahtarının **açık** yarısı, **"Allow write
access" KAPALI**. Sunucu yalnızca çeker.

**Settings → Environments → `production`:** Required reviewers ekle. Müşteri
verisine dokunan bir sistemde bu, `main`'e yanlışlıkla push etmenin maliyetini
bir onay tıklamasına indiriyor.

### 2.3 Senin bilgisayarında

```
~/.ssh/instomer_deploy       ← (C) özel · sen sunucuya bağlanırken
~/.ssh/instomer_actions      ← (B) özel · GitHub secret'ına yapıştırılan
```

---

## 3. İLK KURULUM

| # | Kim | Ne |
|---|---|---|
| 1 | GitHub org sahibi | Deploy key politikasını **aç** (§1) |
| 2 | senin Mac | (B) ve (C) anahtarlarını üret, `ssh-copy-id` ile sunucuya kur |
| 3 | `instomer-chatcrm` | (A) anahtarını üret, açık yarısını GitHub Deploy keys'e ekle |
| 4 | `instomer-chatcrm` | Uygulama dizinini yerinde depoya dönüştür (aşağıda) |
| 5 | GitHub | 5 secret'ı gir, `production` environment'ına onaylayıcı ekle |
| 6 | `instomer-chatcrm` | `git pull && ./scripts/deploy.sh` ile ilk elle dağıtımı yap |

**(B) ve (C) — senin Mac'inde:**

```bash
ssh-keygen -t ed25519 -C "github-actions-instomer" -f ~/.ssh/instomer_actions -N ""
```

```bash
ssh-copy-id -i ~/.ssh/instomer_actions.pub instomer-chatcrm@<VPS_IP>
```

```bash
ssh-copy-id -i ~/.ssh/instomer_deploy.pub instomer-chatcrm@<VPS_IP>
```

```bash
ssh -i ~/.ssh/instomer_actions instomer-chatcrm@<VPS_IP> 'echo baglanti-ok'
```

`VPS_SSH_KEY` secret'ına yapıştırılacak metin (**`-----BEGIN` / `-----END`
satırları ve sondaki boş satır dâhil**):

```bash
cat ~/.ssh/instomer_actions
```

**(A) — sunucuda, `instomer-chatcrm` olarak:**

```bash
ssh-keygen -t ed25519 -C "instomer-vps" -f ~/.ssh/id_ed25519 -N "" && cat ~/.ssh/id_ed25519.pub
```

Çıkan açık anahtarı GitHub → depo → Settings → **Deploy keys** → Add key
(**"Allow write access" İŞARETLEME**). Sonra doğrula:

```bash
ssh -T git@github.com
```

`Hi Profajai/instomerchat! You've successfully authenticated` beklenir.
`Permission denied (publickey)` görüyorsan ya anahtar eklenmedi ya org
politikası hâlâ kapalı (§1).

**Uygulama dizinini yerinde depoya dönüştür.**

Dizin **boş değil** — içinde rsync ile gelmiş dosyalar, `backend/.env`,
loglar ve müşteri yüklemeleri var. Bu yüzden `git clone` kullanılamaz
(boş olmayan dizine klonlamayı reddeder); dizin yerinde depoya çevrilir.

Önce geri dönülebilir bir nokta — bu adım `deploy.sh`'tan ÖNCE çalıştığı için
onun kendi yedeği henüz yok:

```bash
cd ~/htdocs/app.instomer.com && tar -czf ~/pre-git-$(date +%F-%H%M).tar.gz --exclude=node_modules --exclude=_backups .
```

```bash
git init -b main && git remote add origin git@github.com:Profajai/instomerchat.git && git fetch origin main
```

```bash
git reset --hard origin/main && git branch --set-upstream-to=origin/main main
```

> `git reset --hard` **takipli dosyalardaki elle yapılmış değişiklikleri
> geri alır.** Sunucudaki dosyalar aynı deponun rsync kopyası olduğu için
> normalde fark çıkmaz; yine de elle düzenlenmiş bir dosya varsa kaybolur —
> yukarıdaki tar onun için. Takip dışı dosyalara (`.env`, loglar, yüklemeler)
> dokunmaz.

`.env` mod kontrolü:

```bash
ls -la backend/.env
```

Mod `600` değilse:

```bash
chmod 600 backend/.env
```

## 4. GÜNLÜK DÖNGÜ

### 4.1 Commit

Türkçe, **ne yapıldığını değil neden yapıldığını** anlatan gövde. Gövde asıl
değerli kısım: altı ay sonra `git log`'a bakan kişi "ne" olduğunu diff'ten
zaten görüyor, "neden" sadece orada yazıyor.

```
fix(randevu): İZİN ANAHTARI BEŞ YOLDAN YALNIZCA BİRİNİ KAPATIYORDU

Panelde "Randevu Talebi Algılama" kapatıldığında kural motoru duruyor ama
chat botu, sesli bot ve otomasyon randevu vermeye devam ediyordu — çünkü
randevu beş ayrı yerde oluşuyor ve WorkspaceRule'ü yalnızca biri okuyordu.
Hiçbiri hata vermiyor; belirti kullanıcının cümlesiyle "kapattım ama hâlâ
randevu veriyor".

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

### 4.2 Push

```bash
git push origin HEAD:main
```

**HTTP/2 ile push kopuyorsa** (`RPC failed ... Broken pipe`):

```bash
git config http.version HTTP/1.1
```

### 4.3 Push'tan sonra ne oluyor

**Push sunucuya DOKUNMAZ.** `main`'e push yalnızca `verify` işini çalıştırır:

`npm install --include=dev` → `prisma generate` → `verify-build.js` →
frontend build → **randevu izin kapısı bütünlük kontrolü**.

Bu iş runner'da koşar, sunucuya hiç bağlanmaz. Amacı tek: kodun derlenip
derlenmediğini söylemek. Kırmızıysa sunucuya bir şey gitmemiş olur çünkü
zaten gitmiyordu.

### 4.3.1 Dağıtım — senin onayınla

Sunucuya bir şey gitmesi için Actions sekmesinden **elle** tetiklemen gerekir:

1. GitHub → depo → **Actions** → sol menüden **Deploy**
2. Sağ üstte **Run workflow**
3. Açılan kutuda:

| Alan | Ne yazacaksın |
|---|---|
| **onay** | `dagit` — bunu yazmazsan dağıtım işi atlanır |
| **sema_degisti** | Prisma şeması değiştiyse işaretle (`db push` çalışır) |
| **not** | Kısa açıklama — sunucudaki yedek etiketinde görünür |

4. **Run workflow** → sırayla `verify` → `deploy` → `smoke` çalışır

`onay` kutusuna `dagit` yazılmazsa `deploy` ve `smoke` işleri **skipped**
görünür ve sunucuya hiçbir şey gitmez. Yanlışlıkla tetiklemenin maliyeti
sıfır.

**İkinci katman (opsiyonel):** Settings → Environments → `production`
altına Required reviewers eklersen, `Run workflow`'a bastıktan sonra bir de
onay bekler. Bu özellik özel depolarda GitHub Pro/Team gerektirir; yoksa
`onay` kutusu tek başına yeterli koruma.

**Eşzamanlılık:** `cancel-in-progress` **kasıtlı olarak `false`.** Yarıda
kesilen bir dağıtım, şeması güncellenmiş ama kodu derlenmemiş bir sunucu
bırakabiliyor.

### 4.4 Elle dağıtım — ASIL YOL

Günlük kullanımda dağıtımı **sen** başlatıyorsun. Push'tan sonra sunucuya
bağlan ve iki komut:

```bash
ssh instomer-chatcrm@<VPS_IP>
```

```bash
cd ~/htdocs/app.instomer.com && git pull && ./scripts/deploy.sh
```

Şema değiştiyse (`backend/prisma/schema.prisma`):

```bash
cd ~/htdocs/app.instomer.com && git pull && ALLOW_DB_PUSH=true ./scripts/deploy.sh
```

> **`root` ile çalıştırma.** `deploy.sh` ilk adımda reddediyor; sebebi §7'de.
> Root ile `git pull` de yapma — çekilen dosyalar root'a ait kalır ve bir
> sonraki dağıtım "Permission denied" verir.

`git pull` çakışma verirse (sunucuda takipli bir dosya elle düzenlenmiş):

```bash
git fetch origin main && git reset --hard origin/main
```

Actions üzerinden tetikleme (§4.3.1) aynı script'i çalıştırıyor; ikisi
birbirinin yerine kullanılabilir, iki ayrı dağıtım mantığı **yok**.

---

## 5. `scripts/deploy.sh` ne yapıyor — ve neden bu sırada

Dağıtım mantığı **workflow YAML'ında değil, depodaki script'te**. Sebebi:
sunucuda elle çalıştırılabiliyor, git geçmişinde izlenebiliyor, arıza anında
adım adım debug edilebiliyor. YAML içindeki mantığı yalnızca Actions
çalıştırabilir; sen gece yarısı çalıştıramazsın.

| Adım | Neden burada |
|---|---|
| **1 · Root reddi** | Paylaşımlı sunucuda root'un pm2'si başka sitelerin süreçlerini yönetiyor. Root olarak `pm2 save` root'un dump'ına yazarsa, sunucu yeniden başladığında **diğer siteler kalkmaz**. |
| **2 · nvm PATH** | GitHub Actions SSH ile non-interactive shell açıyor; orada `node` bulunamıyor. Script içinde açıkça `. "$NVM_DIR/nvm.sh"`. |
| **3 · `.env` shell-güvenlik taraması** | `.env` aşağıda `. ./.env` ile okunuyor. Tırnaksız bir değerdeki boşluk shell için değerin BİTTİĞİ yer: `SMTP_PASS=abcd efgh` satırı `efgh`yi KOMUT sanıyor. Geriye kalan tek iz `./.env: line 97: efgh: command not found`. Kontrol `npm install`'dan ÖNCE. **Değer asla yazdırılmıyor** — dağıtım çıktısı ekran görüntüsüyle paylaşılıyor. |
| **4 · Yedek** | Kod + `.env` + PostgreSQL dump. Son 10 tanesi `_backups/` altında. **Migration geri alınamadığı için DB yedeği tek gerçek geri dönüş yolu.** |
| **5 · `npm install --include=dev`** | ZORUNLU: `prisma` CLI devDependency ve derleme sunucuda yapılıyor. Bayrak olmazsa npm kararı `NODE_ENV`e bakıyor ve `.env` içindeki `NODE_ENV=production` kabuğa sızdığında `prisma: not found` ile düşüyor. |
| **6 · `verify-build.js`** | Sözdizimi/import hatası varsa pm2'ye HİÇ dokunulmuyor; canlı sistem eski kodla ayakta kalıyor. |
| **7 · Prisma** | `set -a; . .env; set +a` — Prisma CLI kendi dizinindeki `.env`i yüklüyor; ortam değişkeni dosyadan önce geldiği için export etmek tek doğruluk kaynağını dayatıyor. |
| **8 · Frontend → htdocs** | Vite build, sonra `rsync --delete`. `VITE_*` değişkenleri bu adımda koda **gömülüyor**. |
| **9 · `pm2 startOrReload --update-env`** | Süreç yoksa başlatır, varsa sıfır kesintiyle yeniler. `--update-env` olmazsa `.env` değişiklikleri görünmüyor. Ardından `/health` 60 sn boyunca bekleniyor. |
| **`.last-deployed-sha`** | Geri alma noktası — **yalnızca her şey başarılıysa** yazılıyor. Hata anında `trap` bu SHA'yı ve geri alma komutunu ekrana basıyor. |

### Şema değişiklikleri — Instomer'a özel uyarı

`prisma/migrations` altında **gerçek migration geçmişi yok**, yalnızca manuel
SQL dosyaları var. Bu yüzden `migrate deploy` boş geçiyor ve şema `db push` ile
senkronlanıyor. `db push` veri kaybettirebildiği için **bilinçli bir bayrak
olmadan çalışmıyor**:

```bash
ALLOW_DB_PUSH=true ./scripts/deploy.sh
```

Bayrak verilmezse şema değiştirilmez ve dağıtım uyarı basarak devam eder.
Kalıcı çözüm migration geçmişini baseline'lamak — ayrı bir iş.

---

## 6. Geri alma

```bash
cd ~/htdocs/app.instomer.com && ./scripts/rollback.sh --list
```

```bash
./scripts/rollback.sh 20260915_143022
```

Sadece **git** ile son çalışan commit'e dönmek:

```bash
./scripts/rollback.sh --sha
```

Davranış:

- Geri almadan önce **mevcut hal de yedekleniyor** (`*_prerollback`) — geri
  almayı da geri alabilirsin
- Varsayılan olarak **veritabanına dokunulmuyor**, sadece kod + `.env` dönüyor
- Veritabanını da geri yüklemek: `./scripts/rollback.sh <etiket> --with-db`
  ⚠️ O yedek anından **sonraki tüm veriyi siler**. Sadece şema bozulduğunda.

> Kod geri alma migration'ları geri almıyor. Bu yüzden şema değişikliklerini
> **geriye uyumlu** yaz: kolon silmek yerine önce kullanımdan kaldır, bir
> sonraki sürümde sil.

---

## 7. Paylaşımlı sunucu — ihlal edilmeyecek kurallar

Makinede başka canlı siteler var.

- **Dosya işlemleri yalnızca `/home/instomer-chatcrm/**` altında.**
- **Sistem geneli hiçbir şey değiştirilmez**: `/usr/bin/node`, `redis.conf`,
  `postgresql.conf`, `systemctl restart`, `npm install -g`, UFW kuralları.
  Eksik bir bileşen varsa **bildir ve dur**, kendi başına kurma.
- **pm2**: yalnızca `instomer-chatcrm` olarak, yalnızca `instomer` süreci. Root
  altında **asla** `pm2 save`, `pm2 kill`, `pm2 delete all`.

  > **AÇIK SORUN — 2026-09-18 itibarıyla bu kural ihlal edilmiş durumda.**
  > Canlı süreç `root`'un kendi pm2 daemon'u (`/root/.pm2`) altında koşuyor;
  > site kullanıcısının pm2'sinde ise `htdocs/chatcrm.instomer.com` dizinine
  > bakan, sürekli çöken eski bir `chatcrm` kaydı duruyor. Yani kurgunun
  > varsaydığı sahiplik ile gerçek sahiplik ayrışmış.
  >
  > **Etkisi:** `instomer-chatcrm` olarak `./scripts/deploy.sh` çalıştırmak,
  > root'un hâlen 5008 portunu dinleyen süreciyle yarışan **ikinci bir
  > instance** başlatır. Dağıtım "başarılı" görünüp canlıya yansımayabilir.
  >
  > **Çözüm** (kesinti gerektirir, bu yüzden bekletiliyor): root'un pm2'sindeki
  > süreç durdurulur, site kullanıcısı olarak
  > `pm2 startOrReload backend/ecosystem.config.cjs --update-env` ile yeniden
  > başlatılır, `pm2 save` **site kullanıcısı olarak** çalıştırılır ve
  > `pm2 startup` birimi o kullanıcı için kurulur. Ayrıca site kullanıcısının
  > pm2'sindeki ölü `chatcrm` kaydı `pm2 delete chatcrm` ile temizlenir.
- **Dağıtım asla root ile yapılmaz** — `git pull` dâhil. Root ile çekilen
  dosyalar root'a ait kalıyor ve sonraki dağıtım "Permission denied" veriyor.
- **Redis paylaşılıyor.** Socket.IO adapter'ı `redis://localhost:6379`
  kullanıyor. Kendi db numaranı al ve **kendi önekini** kullan. Hedef db boş
  değilse ve anahtarlar senin önekinle başlamıyorsa **DUR**.
- **Portlar dışarı kapalı.** API yalnızca `127.0.0.1:5008` dinliyor; dışarıya
  açılan tek şey Nginx.

---

## 8. Bedeli ödenmiş tuzaklar

Hiçbiri hata mesajıyla kendini anlatmıyor; hepsinin belirtisi "çalışmıyor".

- **Anahtarsız boş `with:` iş akışını tamamen öldürüyor.** YAML'da `null`
  oluşuyor, GitHub "Invalid workflow file" sayıyor: **hiçbir job çalışmıyor**,
  Actions sekmesinde kırmızı bir koşum bile yok.
- **nvm, non-interactive shell'de PATH'e girmiyor.** İki çözüm birlikte: sistem
  geneli Node ve script içinde açıkça `. "$NVM_DIR/nvm.sh"`.
- **`.env` içindeki `NODE_ENV=production` kabuğa sızarsa bir sonraki dağıtım
  düşüyor** (`prisma: not found`). Tuzak kendi dosyamızın içinde.
- **Gmail uygulama şifresi boşluklu gösteriliyor** (`abcd efgh ijkl mnop`).
  Olduğu gibi yapıştırılırsa `.env` shell için bozuluyor. Boşlukları sil, sonra
  tırnağa al. (deploy.sh adım 3 bunu yakalıyor.)
- **`git clean` `.env`i siler.** İstisna listesi olmadan ilk otomatik dağıtım
  sunucunun bütün sırlarını götürüyor.
- **`VITE_*` build anında gömülüyor.** Değeri dağıtımdan sonra değiştirmek
  hiçbir şey yapmıyor; yeniden derlemek gerekiyor.
- **`JWT_SECRET` değiştirmek** tüm oturumları düşürüyor — kullanıcılar yeniden
  giriş yapıyor, veri kaybı olmuyor. Güvenle döndürülebilir.
- **Yedekleri sunucu dışına kopyala.** `_backups/` aynı diskte; disk arızasına
  karşı koruma sağlamıyor.
- **pm2 logları sınırsız büyüyor.** `pm2 install pm2-logrotate` ilk günde.
- **`prisma.appointment.create` domain katmanı dışında kullanılırsa** randevu
  izin kapısı atlanır. Actions'ta `verify` işi bunu kontrol ediyor ve dağıtımı
  durduruyor.

---

## 9. İlk kurulum kontrol listesi

- [ ] `dig +short app.instomer.com` → `<VPS_IP>` dönüyor
- [ ] Eski `ghp_` token'ı GitHub'dan **iptal edildi** ve remote URL'den temizlendi
- [ ] Sunucu şifresi değiştirildi (sohbette düz metin paylaşılmıştı)
- [ ] Organizasyonda **deploy key politikası açık** (§1)
- [ ] (A) anahtarı sunucuda üretildi, açık yarısı Deploy keys'te, **yazma izni kapalı**
- [ ] `ssh -T git@github.com` sunucuda başarılı
- [ ] Uygulama dizini depoya dönüştürüldü; `git status` temiz, `git log -1` doğru commit'i gösteriyor
- [ ] Dönüştürmeden önce `~/pre-git-*.tar.gz` yedeği alındı
- [ ] `backend/.env` mod `600`, tek kopya
- [ ] `backend/uploads/` ve `backend/logs/` `git status`'ta **görünmüyor** (ignore ediliyor)
- [ ] SSL sertifikası geçerli
- [ ] (B) ve (C) anahtarları üretildi, `ssh-copy-id` yapıldı, şifresiz bağlanılıyor
- [ ] 5 GitHub secret girildi (`VPS_APP_PATH` sunucudaki gerçek yol)
- [ ] `production` environment'ına onaylayıcı eklendi
- [ ] İlk **elle** dağıtım yapıldı: `git pull && ./scripts/deploy.sh` yeşil
- [ ] İlk **Actions** dağıtımı `dagit` ile tetiklendi ve üç iş de yeşil
- [ ] `https://app.instomer.com/login` açılıyor, giriş yapılabiliyor
- [ ] `./scripts/rollback.sh --list` yedeği gösteriyor
- [ ] Yedekler **sunucu dışına** kopyalanıyor
- [ ] `pm2-logrotate` kuruldu
- [ ] pm2 sahipliği çözüldü: canlı süreç `instomer-chatcrm` kullanıcısının pm2'sinde (bkz. §7)

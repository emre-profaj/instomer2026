# Hostinger VPS CloudPanel'e Kurulum Rehberi

Bu rehber, Chatinstomer uygulamasını Hostinger VPS'e CloudPanel kullanarak nasıl kuracağınızı adım adım anlatır.

## Ön Hazırlık

### Gereksinimler
- ✅ Hostinger VPS hesabı
- ✅ CloudPanel kurulu VPS (Ubuntu 22.04 önerilir)
- ✅ Domain adı (örn: app.instomer.com)
- ✅ Facebook Developer hesabı
- ✅ SSH erişimi

---

## Adım 1: VPS'e Bağlanma

### SSH ile Bağlanın
```bash
ssh root@your-vps-ip
```

CloudPanel'in kurulu olduğundan emin olun:
```bash
clpctl --version
```

> [!NOTE]
> CloudPanel kurulu değilse, [CloudPanel Kurulum Dokümantasyonu](https://www.cloudpanel.io/docs/v2/getting-started/installation/) takip edin.

---

## Adım 2: Node.js Kurulumu

CloudPanel varsayılan olarak PHP için optimize edilmiştir. Node.js uygulaması için ek kurulum gerekir.

### Node.js 20.x Kurulumu
```bash
# NodeSource repository ekle
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Node.js kur
apt-get install -y nodejs

# Versiyonu kontrol et
node --version
npm --version
```

### PM2 Kurulumu (Process Manager)
```bash
npm install -g pm2

# PM2'yi sistem başlangıcında otomatik başlat
pm2 startup systemd
```

---

## Adım 3: PostgreSQL Kurulumu

### PostgreSQL Kur
```bash
# PostgreSQL kur
apt-get install -y postgresql postgresql-contrib

# PostgreSQL servisini başlat
systemctl start postgresql
systemctl enable postgresql

# Versiyonu kontrol et
psql --version
```

### Veritabanı ve Kullanıcı Oluştur
```bash
# PostgreSQL kullanıcısına geç
sudo -u postgres psql

# PostgreSQL komut satırında:
CREATE DATABASE chatinstomer;
CREATE USER chatinstomer_user WITH PASSWORD 'güçlü_şifre_buraya';
GRANT ALL PRIVILEGES ON DATABASE chatinstomer TO chatinstomer_user;
\q
```

---

## Adım 4: Uygulama Dosyalarını Yükleme

### Dizin Oluştur
```bash
# Uygulama dizini oluştur
mkdir -p /home/cloudpanel/htdocs/chatinstomer
cd /home/cloudpanel/htdocs/chatinstomer
```

### Dosyaları Yükle

**Seçenek 1: Git ile (Önerilen)**
```bash
# Git kurulu değilse
apt-get install -y git

# Repository'yi clone et (kendi repo'nuz varsa)
git clone https://github.com/your-username/chatinstomer.git .
```

**Seçenek 2: SFTP/SCP ile**
```bash
# Lokal bilgisayarınızdan:
scp -r /Users/emre/Desktop/chatinstomer/* root@your-vps-ip:/home/cloudpanel/htdocs/chatinstomer/
```

---

## Adım 5: Backend Kurulumu

### Backend Dizinine Git
```bash
cd /home/cloudpanel/htdocs/chatinstomer/backend
```

### Bağımlılıkları Kur
```bash
npm install --production
```

### .env Dosyasını Oluştur
```bash
nano .env
```

Aşağıdaki içeriği yapıştırın ve düzenleyin:
```env
NODE_ENV=production
PORT=5008

# Database - PostgreSQL bilgilerinizi girin
DATABASE_URL="postgresql://chatinstomer_user:güçlü_şifre_buraya@localhost:5432/chatinstomer"

# JWT - Güçlü bir secret oluşturun
JWT_SECRET=çok_güçlü_ve_uzun_bir_secret_key_buraya_123456789
JWT_EXPIRE=7d

# Facebook OAuth - Facebook Developer Console'dan alın
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
FACEBOOK_CALLBACK_URL=https://app.instomer.com/api/auth/facebook/callback
FACEBOOK_VERIFY_TOKEN=chatinstomer_webhook_verify_token_123

# Frontend URL - Kendi domain'iniz
FRONTEND_URL=https://app.instomer.com

# Facebook Graph API
FACEBOOK_GRAPH_API_VERSION=v18.0
```

Kaydet: `Ctrl+X`, `Y`, `Enter`

### Prisma Migration
```bash
# Prisma client oluştur
npx prisma generate

# Migration çalıştır
npx prisma migrate deploy
```

### PM2 ile Backend'i Başlat
```bash
# PM2 ile başlat
pm2 start server.js --name chatinstomer-backend

# Otomatik başlatmayı kaydet
pm2 save

# Logları kontrol et
pm2 logs chatinstomer-backend
```

---

## Adım 6: Frontend Build ve Kurulum

### Frontend Dizinine Git
```bash
cd /home/cloudpanel/htdocs/chatinstomer/frontend
```

### .env Dosyasını Oluştur
```bash
nano .env
```

İçerik:
```env
VITE_API_URL=https://app.instomer.com/api
VITE_FACEBOOK_APP_ID=your_facebook_app_id
```

### Build Al
```bash
# Bağımlılıkları kur
npm install

# Production build
npm run build
```

Build dosyaları `dist/` klasöründe oluşacak.

---

## Adım 7: CloudPanel'de Site Oluşturma

### CloudPanel'e Giriş Yapın
1. Tarayıcıda `https://your-vps-ip:8443` adresine gidin
2. CloudPanel admin bilgilerinizle giriş yapın

### Backend için Site Oluştur (app.instomer.com)

1. **Sites** > **Add Site** tıklayın
2. Ayarlar:
   - **Domain Name**: `app.instomer.com`
   - **Site Type**: `Node.js`
   - **Node.js Version**: `20.x`
   - **Document Root**: `/home/cloudpanel/htdocs/chatinstomer/backend`
   - **Application Port**: `5000`

3. **Create** tıklayın

### Frontend için Site Oluştur (app.instomer.com)

1. **Sites** > **Add Site** tıklayın
2. Ayarlar:
   - **Domain Name**: `app.instomer.com`
   - **Site Type**: `Static HTML`
   - **Document Root**: `/home/cloudpanel/htdocs/chatinstomer/frontend/dist`

3. **Create** tıklayın

---

## Adım 8: Nginx Reverse Proxy Ayarları

CloudPanel otomatik Nginx konfigürasyonu oluşturur, ancak Node.js için ek ayar gerekebilir.

### Backend Nginx Ayarı
```bash
nano /etc/nginx/sites-enabled/app.instomer.com.conf
```

Aşağıdaki konfigürasyonu ekleyin/düzenleyin:
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name app.instomer.com;

    location / {
        proxy_pass http://localhost:5008;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Nginx'i yeniden başlat:
```bash
nginx -t
systemctl reload nginx
```

---

## Adım 9: SSL Sertifikası (Let's Encrypt)

CloudPanel'de SSL otomatik kurulabilir.

### CloudPanel'den SSL Kur

1. **Sites** > `app.instomer.com` seçin
2. **SSL/TLS** sekmesine gidin
3. **Let's Encrypt** seçin
4. **Install** tıklayın

Aynı işlemi `app.instomer.com` için tekrarlayın.

### Manuel SSL Kurulumu (Alternatif)
```bash
# Certbot kur
apt-get install -y certbot python3-certbot-nginx

# SSL sertifikası al
certbot --nginx -d app.instomer.com
certbot --nginx -d app.instomer.com
```

---

## Adım 10: Domain DNS Ayarları

Hostinger veya domain sağlayıcınızın DNS ayarlarına gidin:

### A Kayıtları Ekleyin
```
Type: A
Name: @
Value: your-vps-ip
TTL: 3600

Type: A
Name: api
Value: your-vps-ip
TTL: 3600
```

DNS yayılması 5-30 dakika sürebilir.

---

## Adım 11: Facebook Webhook Ayarları

### Facebook Developer Console

1. [Facebook Developers](https://developers.facebook.com/) gidin
2. Uygulamanızı seçin
3. **Messenger** > **Settings** gidin
4. **Webhooks** bölümünde:
   - **Callback URL**: `https://app.instomer.com/api/facebook/webhook`
   - **Verify Token**: `.env` dosyasındaki `FACEBOOK_VERIFY_TOKEN`
   - **Subscription Fields**: `messages`, `messaging_postbacks`, `messaging_optins`

5. **Verify and Save** tıklayın

### OAuth Redirect URL

1. **Facebook Login** > **Settings**
2. **Valid OAuth Redirect URIs**:
   ```
   https://app.instomer.com/api/auth/facebook/callback
   https://app.instomer.com/auth/callback
   ```

---

## Adım 12: Test ve Doğrulama

### Backend Test
```bash
# Backend çalışıyor mu?
curl https://app.instomer.com/health

# Logları kontrol et
pm2 logs chatinstomer-backend
```

### Frontend Test
Tarayıcıda `https://app.instomer.com` açın.

### Veritabanı Bağlantısı Test
```bash
cd /home/cloudpanel/htdocs/chatinstomer/backend
npx prisma studio
```

---

## Adım 13: Güvenlik ve Optimizasyon

### Firewall Ayarları
```bash
# UFW kur ve aktif et
apt-get install -y ufw

# Gerekli portları aç
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 8443/tcp  # CloudPanel

# Firewall'u aktif et
ufw enable
```

### PM2 Monitoring
```bash
# PM2 monitoring
pm2 monit

# Otomatik restart ayarı
pm2 start server.js --name chatinstomer-backend --max-memory-restart 500M
pm2 save
```

### Log Rotation
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## Güncelleme ve Bakım

### Uygulama Güncellemesi
```bash
cd /home/cloudpanel/htdocs/chatinstomer

# Git ile güncelle
git pull origin main

# Backend güncelle
cd backend
npm install --production
npx prisma migrate deploy
pm2 restart chatinstomer-backend

# Frontend güncelle
cd ../frontend
npm install
npm run build
```

### Veritabanı Yedekleme
```bash
# Otomatik yedekleme scripti oluştur
nano /root/backup-db.sh
```

İçerik:
```bash
#!/bin/bash
BACKUP_DIR="/root/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

pg_dump -U chatinstomer_user chatinstomer > $BACKUP_DIR/chatinstomer_$DATE.sql

# 7 günden eski yedekleri sil
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
```

Çalıştırılabilir yap ve cron ekle:
```bash
chmod +x /root/backup-db.sh

# Crontab düzenle
crontab -e

# Her gün saat 02:00'de yedek al
0 2 * * * /root/backup-db.sh
```

---

## Sorun Giderme

### Backend Çalışmıyor
```bash
# PM2 durumunu kontrol et
pm2 status

# Logları incele
pm2 logs chatinstomer-backend --lines 100

# Yeniden başlat
pm2 restart chatinstomer-backend
```

### Veritabanı Bağlantı Hatası
```bash
# PostgreSQL çalışıyor mu?
systemctl status postgresql

# Bağlantıyı test et
psql -U chatinstomer_user -d chatinstomer -h localhost
```

### Nginx Hatası
```bash
# Nginx konfigürasyonunu test et
nginx -t

# Nginx loglarını kontrol et
tail -f /var/log/nginx/error.log
```

### SSL Sertifikası Yenileme
```bash
# Manuel yenileme
certbot renew

# Otomatik yenileme testi
certbot renew --dry-run
```

---

## Faydalı Komutlar

```bash
# PM2 komutları
pm2 list                    # Tüm process'leri listele
pm2 restart all             # Tümünü yeniden başlat
pm2 stop chatinstomer-backend    # Durdur
pm2 delete chatinstomer-backend  # Sil

# Sistem kaynakları
htop                        # Sistem monitörü
df -h                       # Disk kullanımı
free -m                     # RAM kullanımı

# Log izleme
tail -f /var/log/nginx/access.log
journalctl -u postgresql -f
```

---

## Özet Checklist

- [ ] VPS'e SSH bağlantısı
- [ ] Node.js 20.x kurulumu
- [ ] PostgreSQL kurulumu ve veritabanı oluşturma
- [ ] Uygulama dosyalarını yükleme
- [ ] Backend .env yapılandırması
- [ ] Prisma migration
- [ ] PM2 ile backend başlatma
- [ ] Frontend build alma
- [ ] CloudPanel'de site oluşturma
- [ ] Nginx reverse proxy ayarları
- [ ] SSL sertifikası kurulumu
- [ ] DNS A kayıtları ekleme
- [ ] Facebook webhook yapılandırması
- [ ] Güvenlik ayarları (firewall)
- [ ] Yedekleme sistemi kurulumu

---

## Destek ve Kaynaklar

- [CloudPanel Dokümantasyonu](https://www.cloudpanel.io/docs/)
- [Node.js Deployment Guide](https://nodejs.org/en/docs/guides/deployment/)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [Prisma Deployment](https://www.prisma.io/docs/guides/deployment)
- [Facebook Messenger Platform](https://developers.facebook.com/docs/messenger-platform)

Başarılar! 🚀

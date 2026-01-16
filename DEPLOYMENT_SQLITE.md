# Hostinger VPS CloudPanel Kurulum Rehberi (SQLite)

SQLite versiyonu ile daha kolay kurulum. PostgreSQL kurulumuna gerek yok!

## Ön Hazırlık

### Gereksinimler
- ✅ Hostinger VPS hesabı
- ✅ CloudPanel kurulu VPS (Ubuntu 22.04)
- ✅ Domain adı (örn: app.instomer.com)
- ✅ Facebook Developer hesabı
- ✅ SSH erişimi

---

## Adım 1: VPS'e Bağlanma

```bash
ssh root@your-vps-ip
```

---

## Adım 2: Node.js Kurulumu

```bash
# NodeSource repository ekle
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Node.js kur
apt-get install -y nodejs

# Versiyonu kontrol et
node --version  # v20.x.x
npm --version   # 10.x.x
```

### PM2 Kurulumu
```bash
npm install -g pm2
pm2 startup systemd
```

---

## Adım 3: Uygulama Dosyalarını Yükleme

```bash
# Uygulama dizini oluştur
mkdir -p /home/cloudpanel/htdocs/chatinstomer
cd /home/cloudpanel/htdocs/chatinstomer

# Dosyaları yükle (Git veya SFTP ile)
# Git ile:
git clone https://github.com/your-username/chatinstomer.git .

# SFTP ile (lokal bilgisayardan):
# scp -r /Users/emre/Desktop/chatinstomer/* root@your-vps-ip:/home/cloudpanel/htdocs/chatinstomer/
```

---

## Adım 4: Backend Kurulumu

```bash
cd /home/cloudpanel/htdocs/chatinstomer/backend

# Bağımlılıkları kur
npm install --production
```

### .env Dosyası Oluştur
```bash
nano .env
```

İçerik:
```env
NODE_ENV=production
PORT=5008

# Database (SQLite - Otomatik oluşturulacak)
DATABASE_URL="file:./database.db"

# JWT Secret (güçlü bir key oluşturun)
JWT_SECRET=super_guclu_secret_key_buraya_123456789abcdef
JWT_EXPIRE=7d

# Facebook OAuth
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
FACEBOOK_CALLBACK_URL=https://app.instomer.com/api/auth/facebook/callback
FACEBOOK_VERIFY_TOKEN=chatinstomer_webhook_verify_123

# Frontend URL
FRONTEND_URL=https://app.instomer.com

# Facebook Graph API
FACEBOOK_GRAPH_API_VERSION=v18.0
```

Kaydet: `Ctrl+X`, `Y`, `Enter`

### Veritabanını Oluştur
```bash
# Prisma client oluştur
npx prisma generate

# Migration çalıştır (SQLite database otomatik oluşturulur)
npx prisma migrate dev --name init

# Veritabanı dosyası oluşturuldu: database.db
ls -lh database.db
```

### PM2 ile Başlat
```bash
pm2 start server.js --name chatinstomer-api
pm2 save
pm2 logs chatinstomer-api
```

---

## Adım 5: Frontend Build

```bash
cd /home/cloudpanel/htdocs/chatinstomer/frontend

# .env dosyası
nano .env
```

İçerik:
```env
VITE_API_URL=https://app.instomer.com/api
VITE_FACEBOOK_APP_ID=your_facebook_app_id
```

```bash
# Build
npm install
npm run build
```

---

## Adım 6: CloudPanel'de Site Oluşturma

### Backend (app.instomer.com)

CloudPanel'e giriş: `https://your-vps-ip:8443`

1. **Sites** > **Add Site**
2. Ayarlar:
   - **Domain**: `app.instomer.com`
   - **Type**: `Node.js` (yoksa `Generic` seç)
   - **Document Root**: `/home/cloudpanel/htdocs/chatinstomer/backend`

### Frontend (app.instomer.com)

1. **Sites** > **Add Site**
2. Ayarlar:
   - **Domain**: `app.instomer.com`
   - **Type**: `Static HTML`
   - **Document Root**: `/home/cloudpanel/htdocs/chatinstomer/frontend/dist`

---

## Adım 7: Nginx Reverse Proxy (Backend)

```bash
nano /etc/nginx/sites-enabled/app.instomer.com.conf
```

İçerik:
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

```bash
nginx -t
systemctl reload nginx
```

---

## Adım 8: SSL Sertifikası

```bash
apt-get install -y certbot python3-certbot-nginx

# SSL al
certbot --nginx -d app.instomer.com
certbot --nginx -d app.instomer.com

# Otomatik yenileme
certbot renew --dry-run
```

---

## Adım 9: DNS Ayarları

Domain sağlayıcınızda A kayıtları ekleyin:

```
Type: A, Name: @, Value: your-vps-ip
Type: A, Name: api, Value: your-vps-ip
```

---

## Adım 10: Facebook Webhook

[Facebook Developers](https://developers.facebook.com/):

1. Uygulamanızı seçin
2. **Messenger** > **Settings** > **Webhooks**
3. **Callback URL**: `https://app.instomer.com/api/facebook/webhook`
4. **Verify Token**: `.env` dosyasındaki token
5. **Fields**: `messages`, `messaging_postbacks`, `messaging_optins`

---

## Adım 11: Güvenlik

```bash
# Firewall
apt-get install -y ufw
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8443/tcp
ufw enable
```

---

## Veritabanı Yedekleme (SQLite)

```bash
# Yedekleme scripti
nano /root/backup-db.sh
```

İçerik:
```bash
#!/bin/bash
BACKUP_DIR="/root/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# SQLite veritabanını kopyala
cp /home/cloudpanel/htdocs/chatinstomer/backend/database.db \
   $BACKUP_DIR/database_$DATE.db

# 7 günden eski yedekleri sil
find $BACKUP_DIR -name "*.db" -mtime +7 -delete
```

```bash
chmod +x /root/backup-db.sh

# Crontab - Her gün 02:00
crontab -e
# Ekle: 0 2 * * * /root/backup-db.sh
```

---

## Test

```bash
# Backend test
curl https://app.instomer.com/health

# PM2 kontrol
pm2 status
pm2 logs chatinstomer-api

# Frontend test
# Tarayıcıda: https://app.instomer.com
```

---

## Güncelleme

```bash
cd /home/cloudpanel/htdocs/chatinstomer

# Güncelle
git pull origin main

# Backend
cd backend
npm install --production
npx prisma migrate deploy
pm2 restart chatinstomer-api

# Frontend
cd ../frontend
npm install
npm run build
```

---

## Sorun Giderme

### Backend çalışmıyor
```bash
pm2 logs chatinstomer-api --lines 50
pm2 restart chatinstomer-api
```

### Veritabanı hatası
```bash
cd /home/cloudpanel/htdocs/chatinstomer/backend
ls -lh database.db  # Dosya var mı?
npx prisma studio   # Veritabanını görüntüle
```

### Nginx hatası
```bash
nginx -t
tail -f /var/log/nginx/error.log
```

---

## SQLite Avantajları

✅ **Kolay Kurulum**: PostgreSQL kurulumuna gerek yok  
✅ **Tek Dosya**: Tüm veri tek dosyada  
✅ **Kolay Yedekleme**: Sadece .db dosyasını kopyala  
✅ **Düşük Kaynak**: Minimal RAM/CPU kullanımı  
✅ **Taşınabilir**: Dosyayı kopyala, başka yerde çalıştır  

## SQLite Limitasyonları

⚠️ **Eşzamanlı Yazma**: Aynı anda çok fazla yazma işlemi sınırlı  
⚠️ **Büyük Veri**: 100GB+ için PostgreSQL önerilir  
⚠️ **Network Erişim**: Uzaktan bağlantı yok (sadece lokal)  

**Önerilen Kullanım**: Küçük-orta ölçekli projeler (< 10,000 kullanıcı)

---

## Özet Checklist

- [ ] VPS'e SSH bağlan
- [ ] Node.js 20.x kur
- [ ] Dosyaları yükle
- [ ] Backend .env yapılandır
- [ ] `npx prisma migrate dev` çalıştır (SQLite otomatik oluşur)
- [ ] PM2 ile backend başlat
- [ ] Frontend build al
- [ ] CloudPanel'de site oluştur
- [ ] Nginx reverse proxy ayarla
- [ ] SSL kur
- [ ] DNS ayarla
- [ ] Facebook webhook yapılandır
- [ ] Firewall aktif et
- [ ] Yedekleme kur

Başarılar! 🚀

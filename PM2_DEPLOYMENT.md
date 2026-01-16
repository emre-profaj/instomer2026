# PM2 ile Deployment

## Ecosystem Dosyası

`backend/ecosystem.config.js` dosyası oluşturuldu.

## Kullanım

### 1. PM2 Kurulumu (Sunucuda)
```bash
npm install -g pm2
```

### 2. Ecosystem Dosyasını Düzenle

`backend/ecosystem.config.js` dosyasında `cwd` yolunu güncelle:
```javascript
cwd: '/home/your-username/chatinstomer/backend',
```

Gerçek sunucu yolunu yaz, örneğin:
```javascript
cwd: '/home/emre/chatinstomer/backend',
```

### 3. Backend'i Başlat

```bash
cd /home/emre/chatinstomer/backend

# Ecosystem ile başlat
pm2 start ecosystem.config.js

# veya direkt
pm2 start server.js --name chatcrm-api
```

### 4. PM2 Komutları

```bash
# Status kontrol
pm2 status

# Logları görüntüle
pm2 logs chatcrm-api

# Yeniden başlat
pm2 restart chatcrm-api

# Durdur
pm2 stop chatcrm-api

# Sil
pm2 delete chatcrm-api

# Otomatik başlatma (sunucu reboot)
pm2 startup
pm2 save
```

### 5. Log Klasörü Oluştur

```bash
cd /home/emre/chatinstomer/backend
mkdir -p logs
```

### 6. Monitoring

```bash
# Real-time monitoring
pm2 monit

# Web dashboard
pm2 plus
```

## Ecosystem Özellikleri

- ✅ **Auto-restart**: Crash durumunda otomatik yeniden başlar
- ✅ **Memory limit**: 500MB üzerinde restart
- ✅ **Logs**: Ayrı error, output ve combined loglar
- ✅ **Production mode**: NODE_ENV=production
- ✅ **Port**: 5008

## Güncelleme Sonrası

```bash
# Kodu güncelle (git pull vb.)
cd /home/emre/chatinstomer/backend
git pull

# Dependencies güncelle
npm install

# Prisma migrate
npx prisma migrate deploy

# PM2 restart
pm2 restart chatcrm-api
```

## Sorun Giderme

### Uygulama başlamıyor
```bash
# Logları kontrol et
pm2 logs chatcrm-api --lines 100

# Manuel başlat (test için)
node server.js
```

### Port zaten kullanımda
```bash
# Port 5008'i kullanan process'i bul
lsof -i :5008

# Kill et
kill -9 <PID>
```

### .env dosyası okunmuyor
- Ecosystem'da `cwd` yolunun doğru olduğundan emin ol
- `.env` dosyasının `backend/` klasöründe olduğunu kontrol et

---

Başarılar! 🚀

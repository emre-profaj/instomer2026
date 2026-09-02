# PM2 ile Sıfır Kesinti (Zero-Downtime) Deployment

Bu doküman, Instomer ChatCRM backend'ini canlı sunucuda **0 saniye kesinti** ile çalıştırmak ve güncellemek için gerekli adımları içerir.

---

## 1. Sunucu Ön Hazırlığı (Redis & PM2)

Sunucunuza SSH ile bağlanın ve şu komutları çalıştırın:

```bash
# Redis Kurulumu (Cluster modunda kopya senkronizasyonu için)
sudo apt update && sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Redis Testi (PONG cevabı dönmelidir)
redis-cli ping

# PM2 Kurulumu (Daha önce kurulmadıysa)
npm install -g pm2
```

---

## 2. İlk Kurulum ve Başlatma

```bash
cd /home/emre/chatinstomer/backend

# Paketleri yükle (@socket.io/redis-adapter ve redis dahil)
npm install

# Prisma şemalarını senkronize et
npx prisma generate
npx prisma migrate deploy

# Log klasörünü oluştur
mkdir -p logs

# PM2 Cluster ile başlat
pm2 delete chatcrm-api || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 3. Güncellemeler Nasıl Yapılır? (Sıfır Kesinti / Zero-Downtime)

Kodlarda değişiklik yapıp sunucuya attıktan sonra **kesintisiz** güncellemek için:

```bash
cd /home/emre/chatinstomer/backend

# Kodu çek
git pull

# Yeni paketler varsa yükle
npm install --omit=dev

# SIFIR KESİNTİ İLE YENİLE (pm2 restart DEĞİL, pm2 reload kullanılır!)
pm2 reload ecosystem.config.js --update-env
```

> 💡 **İpucu:** Tüm bu adımları tek komutta yapmak için `backend/deploy.sh` scriptini de çalıştırabilirsiniz:
> ```bash
> chmod +x deploy.sh
> ./deploy.sh
> ```

---

## 4. PM2 Komutları

```bash
# Durum kontrolü (2 adet online kopya görünmelidir)
pm2 status

# Canlı log takibi
pm2 logs chatcrm-api

# Sıfır kesintili yenileme
pm2 reload chatcrm-api --update-env
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

# Node.js Hosting'e Deployment Rehberi

Bu rehber, Chatinstomer uygulamasını Node.js hosting sağlayıcılarına (Heroku, Railway, Render, Vercel, vb.) nasıl deploy edeceğinizi anlatır.

## Desteklenen Platformlar

- ✅ **Railway** (Önerilen - Kolay ve ücretsiz plan)
- ✅ **Render** (Ücretsiz plan mevcut)
- ✅ **Heroku** (Ücretli)
- ✅ **Vercel** (Frontend için)
- ✅ **Fly.io**

---

## Seçenek 1: Railway (Önerilen)

### Backend Deployment

1. **Railway'e Git**: https://railway.app/
2. **GitHub ile Giriş Yap**
3. **New Project** > **Deploy from GitHub repo**
4. Repository'nizi seçin
5. **Add variables** (Environment Variables):

```bash
NODE_ENV=production
PORT=5008
DATABASE_URL=file:./prisma/database.db
JWT_SECRET=super-guclu-secret-key-buraya
JWT_EXPIRE=7d
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
FACEBOOK_CALLBACK_URL=https://your-backend.railway.app/api/auth/facebook/callback
FACEBOOK_VERIFY_TOKEN=webhook_verify_token
FACEBOOK_ADMIN_ACCESS_TOKEN=your_admin_token
FRONTEND_URL=https://your-frontend.vercel.app
FACEBOOK_GRAPH_API_VERSION=v18.0
```

6. **Root Directory**: `backend`
7. **Build Command**: `npm install && npx prisma generate && npx prisma migrate deploy`
8. **Start Command**: `node server.js`
9. **Deploy**

Railway otomatik URL verecek: `https://chatcrm-backend.railway.app`

### Frontend Deployment (Vercel)

1. **Vercel'e Git**: https://vercel.com/
2. **Import Project** > GitHub repo seçin
3. **Framework Preset**: Vite
4. **Root Directory**: `frontend`
5. **Environment Variables**:

```bash
VITE_API_URL=https://chatcrm-backend.railway.app/api
VITE_FACEBOOK_APP_ID=your_facebook_app_id
```

6. **Deploy**

Vercel otomatik URL verecek: `https://chatcrm.vercel.app`

---

## Seçenek 2: Render (Tek Platform)

### Backend (Web Service)

1. **Render'a Git**: https://render.com/
2. **New** > **Web Service**
3. GitHub repo bağla
4. **Settings**:
   - **Name**: chatcrm-backend
   - **Root Directory**: `backend`
   - **Environment**: Node
   - **Build Command**: `npm install && npx prisma generate && npx prisma migrate deploy`
   - **Start Command**: `node server.js`

5. **Environment Variables** ekle (yukarıdaki gibi)
6. **Create Web Service**

### Frontend (Static Site)

1. **New** > **Static Site**
2. **Settings**:
   - **Name**: chatcrm-frontend
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`

3. **Environment Variables** ekle
4. **Create Static Site**

---

## Seçenek 3: Heroku

### Backend

```bash
# Heroku CLI kur
npm install -g heroku

# Login
heroku login

# Backend dizinine git
cd backend

# Heroku app oluştur
heroku create chatcrm-backend

# Environment variables ekle
heroku config:set NODE_ENV=production
heroku config:set DATABASE_URL="file:./database.db"
heroku config:set JWT_SECRET="your-secret"
heroku config:set FACEBOOK_APP_ID="your-app-id"
heroku config:set FACEBOOK_APP_SECRET="your-secret"
heroku config:set FACEBOOK_CALLBACK_URL="https://chatcrm-backend.herokuapp.com/api/auth/facebook/callback"
heroku config:set FRONTEND_URL="https://chatcrm-frontend.vercel.app"

# Deploy
git push heroku main

# Prisma migrate
heroku run npx prisma migrate deploy
```

---

## Önemli Notlar

### 1. SQLite Sınırlamaları

⚠️ **Railway/Render'da SQLite geçici!**
- Container yeniden başladığında veriler silinir
- Production için **PostgreSQL** kullanın

**PostgreSQL'e Geçiş (Railway):**
1. Railway Dashboard > **New** > **Database** > **PostgreSQL**
2. `DATABASE_URL` otomatik oluşturulur
3. `schema.prisma` dosyasını güncelle:

```prisma
datasource db {
  provider = "postgresql"  // sqlite yerine
  url      = env("DATABASE_URL")
}
```

4. Redeploy

### 2. Facebook Webhook URL

Facebook Developer Console'da webhook URL'i güncelle:
```
https://your-backend.railway.app/api/facebook/webhook
```

### 3. Facebook OAuth Callback

```
https://your-backend.railway.app/api/auth/facebook/callback
https://your-frontend.vercel.app/auth/callback
```

### 4. CORS Ayarları

Backend `server.js` dosyasında CORS zaten ayarlı:
```javascript
const corsOptions = {
  origin: process.env.FRONTEND_URL,
  credentials: true
};
app.use(cors(corsOptions));
```

---

## Custom Domain Bağlama

### Railway'de

1. **Settings** > **Domains**
2. **Custom Domain** > `app.instomer.com` ekle
3. DNS'de CNAME kaydı:
   ```
   Type: CNAME
   Name: chatcrm
   Value: your-app.railway.app
   ```

### Vercel'de

1. **Settings** > **Domains**
2. Domain ekle: `app.instomer.com`
3. DNS'de A kaydı veya CNAME:
   ```
   Type: A
   Name: @
   Value: 76.76.21.21 (Vercel IP)
   ```

---

## Deployment Checklist

### Backend
- [ ] Railway/Render hesabı oluştur
- [ ] GitHub repo bağla
- [ ] Environment variables ekle
- [ ] Build ve start komutları ayarla
- [ ] Deploy
- [ ] Prisma migrate çalıştır
- [ ] Health check: `https://your-backend.railway.app/api/health`

### Frontend
- [ ] Vercel hesabı oluştur
- [ ] GitHub repo bağla
- [ ] Environment variables ekle (VITE_API_URL)
- [ ] Deploy
- [ ] Test: `https://your-frontend.vercel.app`

### Facebook
- [ ] Webhook URL güncelle
- [ ] OAuth callback URL güncelle
- [ ] Admin access token ekle

### Database
- [ ] SQLite → PostgreSQL geçişi (production için)
- [ ] Backup stratejisi

---

## Hızlı Başlangıç (Railway + Vercel)

```bash
# 1. Railway'e backend deploy et
# Dashboard'dan GitHub repo bağla, environment variables ekle

# 2. Vercel'e frontend deploy et
# Dashboard'dan GitHub repo bağla, VITE_API_URL ekle

# 3. URL'leri güncelle
# Backend .env: FRONTEND_URL=https://chatcrm.vercel.app
# Frontend .env: VITE_API_URL=https://chatcrm-backend.railway.app/api

# 4. Facebook Developer Console'da URL'leri güncelle
# Webhook: https://chatcrm-backend.railway.app/api/facebook/webhook
# OAuth: https://chatcrm-backend.railway.app/api/auth/facebook/callback

# 5. Test et!
```

---

## Maliyet

| Platform | Backend | Frontend | Database | Toplam/Ay |
|----------|---------|----------|----------|-----------|
| Railway + Vercel | $5 | Ücretsiz | Ücretsiz | $5 |
| Render | Ücretsiz* | Ücretsiz | Ücretsiz | $0 |
| Heroku | $7 | - | $9 | $16 |

*Render ücretsiz plan 750 saat/ay (yeterli)

---

## Sorun Giderme

### Backend çalışmıyor
```bash
# Railway logs
railway logs

# Render logs
Dashboard > Logs sekmesi
```

### Database bağlantı hatası
- `DATABASE_URL` doğru mu kontrol et
- PostgreSQL kullanıyorsan connection string formatı:
  ```
  postgresql://user:pass@host:5432/dbname
  ```

### CORS hatası
- `FRONTEND_URL` environment variable doğru mu?
- Frontend URL'i `https://` ile başlıyor mu?

---

Başarılar! 🚀

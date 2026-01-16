# Chatinstomer

Chatwoot tarzında modern bir müşteri iletişim platformu. Facebook Messenger entegrasyonu ile workspace tabanlı çalışır.

## Özellikler

- 🔐 Kullanıcı kimlik doğrulama (Email/Password + Facebook OAuth)
- 🏢 Workspace yönetimi (Multi-tenant)
- 💬 Facebook Messenger entegrasyonu
- 👥 Takım üyesi yönetimi
- 📱 Sohbet yönetimi ve mesajlaşma
- ⚙️ Ayarlar paneli

## Teknoloji Stack

### Backend
- Node.js + Express
- Prisma ORM + SQLite
- JWT Authentication
- Passport.js (Facebook OAuth)
- Facebook Graph API

### Frontend
- React 19
- React Router
- Axios
- Lucide Icons
- Vite

## Kurulum

### Gereksinimler
- Node.js 18+
- Facebook Developer Account

### Backend Kurulumu

```bash
cd backend

# Bağımlılıkları yükle
npm install

# .env dosyasını oluştur
cp .env.example .env

# .env dosyasını düzenle ve gerekli bilgileri gir
# - DATABASE_URL (varsayılan: file:./database.db)
# - JWT_SECRET
# - FACEBOOK_APP_ID
# - FACEBOOK_APP_SECRET

# Prisma'yı başlat
npx prisma generate
npx prisma migrate dev --name init

# Sunucuyu başlat
npm run dev
```

Backend `http://localhost:5008` adresinde çalışacak.

### Frontend Kurulumu

```bash
cd frontend

# Bağımlılıkları yükle
npm install

# .env dosyasını oluştur
cp .env.example .env

# .env dosyasını düzenle
# - VITE_API_URL=http://localhost:5008/api
# - VITE_FACEBOOK_APP_ID=your-facebook-app-id

# Geliştirme sunucusunu başlat
npm run dev
```

Frontend `http://localhost:5173` adresinde çalışacak.

## Facebook Webhook Kurulumu

1. Facebook Developer Console'da webhook URL'ini ayarla:
   - Webhook URL: `https://your-domain.com/api/facebook/webhook`
   - Verify Token: `.env` dosyasındaki `FACEBOOK_VERIFY_TOKEN`

2. Aşağıdaki webhook alanlarını abone ol:
   - `messages`
   - `messaging_postbacks`
   - `messaging_optins`

## Kullanım

### İlk Kullanıcı Oluşturma

1. `http://localhost:5173/login` adresine git
2. "Kayıt Ol" butonuna tıkla
3. Email, şifre ve adını gir
4. Veya Facebook ile giriş yap

### Workspace Oluşturma

İlk giriş yaptığında otomatik olarak bir workspace oluşturulacak veya mevcut workspace'lere erişim sağlanacak.

### Facebook Sayfası Bağlama

1. Ayarlar > Facebook sekmesine git
2. "Sayfa Bağla" butonuna tıkla
3. Facebook'tan gerekli izinleri ver
4. Bağlamak istediğin sayfayı seç

## API Endpoints

### Authentication
- `POST /api/auth/register` - Kullanıcı kaydı
- `POST /api/auth/login` - Giriş
- `GET /api/auth/facebook` - Facebook OAuth
- `GET /api/auth/me` - Mevcut kullanıcı

### Workspaces
- `POST /api/workspaces` - Workspace oluştur
- `GET /api/workspaces` - Workspace listesi
- `GET /api/workspaces/:id` - Workspace detayı
- `POST /api/workspaces/:id/members` - Üye ekle

### Facebook
- `POST /api/facebook/pages/connect` - Sayfa bağla
- `GET /api/facebook/pages/:workspaceId` - Bağlı sayfalar
- `GET /api/facebook/webhook` - Webhook doğrulama
- `POST /api/facebook/webhook` - Webhook handler

### Conversations
- `GET /api/conversations/:workspaceId` - Sohbet listesi
- `GET /api/conversations/:workspaceId/:id` - Sohbet detayı
- `POST /api/conversations/:workspaceId/:id/messages` - Mesaj gönder
- `PUT /api/conversations/:workspaceId/:id/assign` - Agent ata
- `PUT /api/conversations/:workspaceId/:id/status` - Durum güncelle

## Proje Yapısı

```
chatinstomer/
├── backend/
│   ├── config/          # Passport ve diğer konfigürasyonlar
│   ├── controllers/     # İş mantığı
│   ├── middleware/      # Auth ve diğer middleware'ler
│   ├── prisma/          # Database schema
│   ├── routes/          # API route'ları
│   └── server.js        # Ana sunucu dosyası
│
└── frontend/
    ├── src/
    │   ├── components/  # Layout ve yeniden kullanılabilir bileşenler
    │   ├── context/     # React Context (Auth)
    │   ├── pages/       # Sayfa bileşenleri
    │   ├── services/    # API servisleri
    │   └── App.jsx      # Ana uygulama
    └── package.json
```

## Lisans

MIT

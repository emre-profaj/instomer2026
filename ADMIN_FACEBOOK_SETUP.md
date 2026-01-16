# Admin Facebook Sayfası Bağlama Rehberi

## Admin Access Token Alma

### 1. Facebook Developer Console'a Git
https://developers.facebook.com/

### 2. Uygulamanızı Seçin
Facebook App ID'niz ile oluşturduğunuz uygulamayı seçin.

### 3. Graph API Explorer'a Git
https://developers.facebook.com/tools/explorer/

### 4. Access Token Oluştur

1. **User or Page** seçeneğini "User Token" olarak seçin
2. **Permissions** ekleyin:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_metadata`
   - `pages_messaging`

3. **Generate Access Token** butonuna tıklayın
4. Facebook ile giriş yapın ve izinleri onaylayın

### 5. Long-Lived Token'a Çevir

Kısa ömürlü token'ı uzun ömürlü token'a çevirmek için:

```bash
curl -i -X GET "https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=SHORT_LIVED_TOKEN"
```

Veya Graph API Explorer'da:
1. Token'ın yanındaki "i" ikonuna tıklayın
2. "Open in Access Token Tool" seçin
3. "Extend Access Token" butonuna tıklayın

### 6. Token'ı .env Dosyasına Ekle

```bash
FACEBOOK_ADMIN_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Kullanım

### Admin Olarak Giriş Yap

1. Sisteme admin hesabı ile giriş yapın
2. **Ayarlar** > **Facebook** sekmesine gidin
3. **"Tüm Sayfalarımı Gör (Admin)"** butonuna tıklayın

### Sayfaları Görüntüle ve Bağla

- Facebook Developer hesabınızdaki tüm sayfalar listelenecek
- Bağlı sayfalar "Bağlı" badge'i ile gösterilir
- Bağlanmamış sayfalar için "Bağla" butonu görünür
- Bir sayfayı bağlamak için "Bağla" butonuna tıklayın

### Normal Kullanıcılar

Normal kullanıcılar:
- Sadece kendi Facebook hesaplarını OAuth ile bağlayabilir
- "OAuth ile Bağla" butonunu kullanır
- Admin sayfalarını göremez

---

## Token Yenileme

Long-lived token'lar yaklaşık 60 gün geçerlidir. Süre dolmadan önce:

1. Graph API Explorer'da yeni token oluşturun
2. Long-lived token'a çevirin
3. `.env` dosyasını güncelleyin
4. Backend'i yeniden başlatın: `pm2 restart chatinstomer-api`

---

## Güvenlik Notları

⚠️ **ÖNEMLİ:**
- Admin access token'ı **asla** frontend'e göndermeyin
- Token'ı `.env` dosyasında saklayın
- `.env` dosyasını `.gitignore`'a ekleyin
- Token'ı düzenli olarak yenileyin
- Sadece gerekli izinleri verin

---

## Sorun Giderme

### "Admin Facebook token not configured" Hatası
- `.env` dosyasında `FACEBOOK_ADMIN_ACCESS_TOKEN` tanımlı mı kontrol edin
- Backend'i yeniden başlatın

### "Failed to fetch Facebook pages" Hatası
- Token'ın süresi dolmuş olabilir, yeni token oluşturun
- İzinlerin doğru verildiğinden emin olun
- Facebook App'in "Live" modda olduğunu kontrol edin

### Sayfalar Görünmüyor
- Token'ın sayfaları yönetme iznine sahip olduğundan emin olun
- Facebook hesabınızın sayfa yöneticisi olduğunu kontrol edin

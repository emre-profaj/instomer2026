# Domain Konfigürasyonu (Güncellenmiş - Subdomain Yok)

## Güncel Domain Bilgileri

**Ana Domain (Hem Frontend Hem Backend):**
- URL: `https://app.instomer.com`
- Frontend: Ana sayfa
- Backend API: `/api` path'i altında

## DNS Ayarları

Hostinger veya domain sağlayıcınızda sadece tek A kaydı:

```
Type: A
Name: chatcrm
Value: [VPS-IP-ADRESINIZ]
TTL: 3600
```

## Environment Variables

### Backend (.env)
```bash
PORT=5000
FRONTEND_URL=https://app.instomer.com
FACEBOOK_CALLBACK_URL=https://app.instomer.com/api/auth/facebook/callback
```

### Frontend (.env)
```bash
VITE_API_URL=https://app.instomer.com/api
```

## Facebook Developer Console

### Webhook URL
```
https://app.instomer.com/api/facebook/webhook
```

### OAuth Redirect URIs
```
https://app.instomer.com/api/auth/facebook/callback
https://app.instomer.com/auth/callback
```

## CloudPanel/Nginx Yapılandırması

### Tek Site - Hem Frontend Hem Backend

**Document Root**: `/home/cloudpanel/htdocs/chatinstomer/frontend/dist`

**Nginx Reverse Proxy** (`/etc/nginx/sites-enabled/app.instomer.com.conf`):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name app.instomer.com;

    # SSL configuration (Let's Encrypt will add this)
    
    root /home/cloudpanel/htdocs/chatinstomer/frontend/dist;
    index index.html;

    # API requests -> Node.js backend
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend - React Router (SPA)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static files
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## SSL Sertifikası

```bash
certbot --nginx -d app.instomer.com
```

## PM2 Backend Başlatma

```bash
cd /home/cloudpanel/htdocs/chatinstomer/backend
pm2 start server.js --name chatcrm-api
pm2 save
```

---

## Avantajlar

✅ **Tek Domain**: Daha basit DNS yönetimi  
✅ **CORS Yok**: Aynı domain, CORS problemi yok  
✅ **Tek SSL**: Tek sertifika yeterli  
✅ **Kolay Kurulum**: Tek Nginx konfigürasyonu  

---

**Not:** Tüm deployment dosyaları bu yapıya göre güncellenmiştir.

# Multi-Tenant Otomatik Workspace Sistemi

## Nasıl Çalışır?

### Yeni Kullanıcı Kaydı
1. Kullanıcı kayıt olur (email/password veya Facebook OAuth)
2. **Otomatik** kendi workspace'i oluşturulur
3. Kullanıcı workspace'in **OWNER**'ı olur
4. Workspace adı: `{Kullanıcı Adı}'s Workspace`
5. Slug: `{kullanici-adi}-{timestamp}` (benzersiz)

### Giriş Yapma
1. Kullanıcı giriş yapar
2. **Otomatik** kendi workspace'i seçilir
3. Sadece kendi verilerini görür:
   - Kendi Facebook sayfaları
   - Kendi sohbetleri
   - Kendi takım üyeleri (eklemişse)

### Tam İzolasyon
- ✅ Her kullanıcı/firma kendi workspace'inde çalışır
- ✅ Başka kullanıcıların verilerini göremez
- ✅ Facebook sayfaları workspace'e bağlı
- ✅ Sohbetler workspace'e bağlı
- ✅ Takım üyeleri workspace'e bağlı

## Örnek Senaryo

### Firma A (Kullanıcı: Ahmet)
```
Kayıt → "Ahmet's Workspace" oluşturulur
Facebook sayfası bağlar → Sadece Firma A'nın sayfası
Sohbetler → Sadece Firma A'nın müşterileri
```

### Firma B (Kullanıcı: Ayşe)
```
Kayıt → "Ayşe's Workspace" oluşturulur
Facebook sayfası bağlar → Sadece Firma B'nin sayfası
Sohbetler → Sadece Firma B'nin müşterileri
```

**Ahmet ve Ayşe birbirlerini görmez!** ✅

## Teknik Detaylar

### Backend (auth.controller.js)
```javascript
// Kayıt sırasında otomatik workspace oluştur
workspaceMembers: {
  create: {
    role: 'OWNER',
    workspace: {
      create: {
        name: `${name}'s Workspace`,
        slug: `${createSlug(name)}-${Date.now()}`
      }
    }
  }
}
```

### Frontend (AuthContext.jsx)
```javascript
// Login/Register sonrası otomatik workspace seç
if (workspace) {
  setCurrentWorkspace(workspace);
  localStorage.setItem('currentWorkspace', JSON.stringify(workspace));
}
```

## Avantajlar

1. **Sıfır Konfigürasyon**: Kullanıcı hiçbir şey yapmadan hazır
2. **Tam İzolasyon**: Her firma kendi alanında
3. **Ölçeklenebilir**: Binlerce firma destekler
4. **Güvenli**: Workspace bazlı erişim kontrolü
5. **Basit UX**: Kullanıcı workspace kavramını bilmek zorunda değil

## İleride Eklenebilecekler (Opsiyonel)

- [ ] Workspace adını değiştirme
- [ ] Birden fazla workspace oluşturma
- [ ] Workspace'ler arası geçiş
- [ ] Workspace silme
- [ ] Workspace istatistikleri

Şu an için: **Her kullanıcı = 1 workspace = Tam izolasyon** ✅

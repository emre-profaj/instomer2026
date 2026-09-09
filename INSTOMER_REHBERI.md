# 🚀 İnstomer — Kapsamlı Sistem & Mimari Rehberi

> **İnstomer Nedir?**  
> İnstomer; çok kanallı (omnichannel) müşteri iletişimini, yapay zekâ destekli sesli ve yazılı botları, vaka (case) odaklı modern CRM yapısını ve satış/otomasyon süreçlerini tek bir çatı altında birleştiren yeni nesil bir **İletişim & Müşteri Operasyonları Platformudur**.

---

## 📌 İçindekiler
1. [Genel Bakış ve Temel Amaç](#1-genel-bakış-ve-temel-amaç)
2. [Sistemde Neler Var? (Modüller ve Yetenekler)](#2-sistemde-neler-var-modüller-ve-yetenekler)
   - 2.1 [Evrensel Inbox (Omnichannel İletişim)](#21-evrensel-inbox-omnichannel-iletişim)
   - 2.2 [AI & Sesli Asistanlar (Voice & Chat AI)](#22-ai--sesli-asistanlar-voice--chat-ai)
   - 2.3 [Kişiler & Çoklu Vaka (Case) CRM Sistemi](#23-kişiler--çoklu-vaka-case-crm-sistemi)
   - 2.4 [Otomasyonlar Hub & Akış Yöneticisi](#24-otomasyonlar-hub--akış-yöneticisi)
   - 2.5 [Base (Bilgi Bankası & RAG Altyapısı)](#25-base-bilgi-bankası--rag-altyapısı)
   - 2.6 [Satış, Sipariş & Finans (Pipeline & Fatura)](#26-satış-sipariş--finans-pipeline--fatura)
   - 2.7 [Aktivite, Görev & Randevu Takvimi](#27-aktivite-görev--randevu-takvimi)
   - 2.8 [Raporlama & Analitik (CEO Dashboard)](#28-raporlama--analitik-ceo-dashboard)
3. [Sistem Nasıl Çalışıyor? (Uçtan Uca İşleyiş)](#3-sistem-nasıl-çalışıyor-uçtan-uca-işleyiş)
   - [Senaryo A: Yeni Lead & Akıllı Yönlendirme](#senaryo-a-yeni-lead--akıllı-yönlendirme)
   - [Senaryo B: Hibrit AI + İnsan Temsilci Deneyimi](#senaryo-b-hibrit-ai--insan-temsilci-deneyimi)
   - [Senaryo C: Sesli AI Araması ve WhatsApp Entegrasyonu](#senaryo-c-sesli-ai-araması-ve-whatsapp-entegrasyonu)
4. [Teknik Mimari ve Altyapı](#4-teknik-mimari-ve-altyapı)
   - [Veri Tabanı & Çoklu Kiracılık (Multi-Tenant)](#veri-tabanı--çoklu-kiracılık-multi-tenant)
   - [Backend Katmanı](#backend-katmanı)
   - [Frontend & Kullanıcı Deneyimi](#frontend--kullanıcı-deneyimi)
   - [Harici Entegrasyonlar](#harici-entegrasyonlar)

---

## 1. Genel Bakış ve Temel Amaç

Geleneksel işletmelerde müşteri iletişimi şu nedenlerle parçalanır:
- WhatsApp telefonda kalır, Instagram DM'leri sosyal medya yöneticisinde kaybolur.
- Web formları e-postaya düşer ve saatler sonra yanıtlanır.
- Reklamdan (Google / Meta) gelen müşterinin hangi reklamdan geldiği (attribution) bilinemez.
- Temsilciler müşteriyi takip edemez veya aramayı unutur.

**İnstomer bu problemleri şöyle çözer:**
1. **Tek Bir Ekran:** Tüm kanalları (WhatsApp, Instagram, Messenger, Formlar, E-posta, Çağrılar) tek bir ortak gelen kutusuna (Inbox) toplar.
2. **Otonom Yapay Zekâ:** Gelen mesajları ve formları saniyeler içinde anlar, bilgi bankasını kullanarak yanıtlar, gerekirse telefonla arar (Voice AI).
3. **Gerçek CRM Entegrasyonu:** Her müşteriyi ve onun farklı taleplerini (**Case/Vaka**) ayrı ayrı takip eder; temsilcilere otomatik görev atar.
4. **Reklam ROI / Kaynak Takibi:** Her görüşmenin arkasındaki `gclid`, `fbclid`, kampanya ve UTM parametrelerini kaydederek hangi reklamın satış getirdiğini gösterir.

---

## 2. Sistemde Neler Var? (Modüller ve Yetenekler)

### 2.1 Evrensel Inbox (Omnichannel İletişim)
* **Desteklenen Kanallar:**
  * **WhatsApp:** Resmi Meta Cloud API entegrasyonu ile metin, ses, görsel, doküman ve interaktif şablon mesajlar.
  * **Instagram:** DM mesajları ve gönderi yorumlarına otomatik yanıt/mesajlaşma.
  * **Facebook Messenger & Sayfa Yorumları:** Sayfaya gelen mesaj ve yorum takibi.
  * **Web Widget & Formlar:** Web sitesine yerleştirilen canlı sohbet ve WordPress/Elementor webhook formları.
  * **E-posta:** Gelen kutusuyla entegre çift yönlü e-posta iletişimi.
  * **Meta Lead Ads:** Reklam formlarının anlık olarak görüşmeye ve CRM kaydına dönüşmesi.
* **Inbox Yetenekleri:**
  * Socket.io ile **anlık canlı akış** (sayfa yenilemeye gerek kalmaz).
  * **Toplu İşlemler:** Çoklu temsilci atama, tek tıkla çözüldü yapma veya silme.
  * **Dahili Notlar:** Müşterinin görmediği, temsilcilerin kendi arasında konuştuğu sarı renkli iç notlar.
  * **Konuşma Transferi:** Temsilciler veya departmanlar arası konuşma devretme.
  * **Akıllı Filtreleme:** Şube, Akış, Kanal, Temsilci, Tarih ve Durum bazlı hızlı filtreleme.

---

### 2.2 AI & Sesli Asistanlar (Voice & Chat AI)
* **Retell AI Sesli Arama Motoru:**
  * Doğal insan sesiyle konuşan, Türkçe dahil çok dilli telefon asistanları.
  * **Gelen Çağrı (Inbound):** Müşteri aradığında telefonu karşılar, bilgi verir, randevu oluşturur.
  * **Giden Çağrı (Outbound):** Yeni gelen bir lead veya form sonrasında müşteriyi otomatik arar.
  * **Konuşma Sırasında WhatsApp Aksiyonu:** Sesli bot konuşurken *"Size hastane konumunu ve fiyat listesini WhatsApp'tan gönderdim"* diyerek anında ilgili dosyayı müşteriye iletir (`RetellAction`).
* **Sohbet Botları (Chat AI):**
  * Firmanın kendi Bilgi Bankası (Base) ile eğitilen GPT/Claude/Gemini tabanlı botlar.
  * Yetkisiz veya şirket dışı konularda uydurma cevap (hallucination) vermez; doğrudan Base verisini referans alır.
* **Universal Classifier (Evrensel Sınıflandırıcı):**
  * Müşterinin yazdığı mesajı arka planda analiz eder: Satın alma niyeti mi, fiyat sorgusu mu, şikayet mi, yoksa *"beni arayın"* talebi mi?
  * Niyete göre vakanın pipeline aşamasını otomatik günceller ve ilgili takıma çağrı/görev açar.

---

### 2.3 Kişiler & Çoklu Vaka (Case) CRM Sistemi
* **Müşteri 360 Görünümü (Contact Profile):**
  * İsim, telefon, e-posta, şehir, ülke, dil, özel alanlar, etiketler ve notlar.
  * **Kaynak & Reklam Bilgileri (Attribution):** Meta Ad ID, Kampanya adı, Google gclid, landing page URL'si.
  * **Zaman Çizelgesi (Timeline):** Müşteriyle yapılan tüm geçmiş yazışmalar, aramalar, randevular ve aşama değişiklikleri tek bir akışta kronolojik listelenir.
* **Çoklu Vaka (Case) Mimarisi:**
  * Bir kişi birden fazla kez iletişime geçebilir. Örneğin bir sağlık kuruluşunda aynı hasta hem *"Diş Tedavisi"* hem de *"Saç Ekimi"* talebinde bulunabilir.
  * İnstomer'da her talep bağımsız bir **Case** olarak açılır; her vakanın kendi aşaması, atanan doktoru/temsilcisi, ürünleri ve cirosu ayrı takip edilir.
* **Akıllı Segmentler (Smart Segments):**
  * Sistem dinamik kurallarla müşterileri etiketler: `Sıcak Leadler`, `Hiç Aranmamış`, `30 Gündür Sessiz`, `Aktif Case'i Var`, `WhatsApp'tan Gelenler` vb.

---

### 2.4 Otomasyonlar Hub & Akış Yöneticisi
* **Görsel Akış Tasarımcısı (Flow Builder):**
  * Düğüm tabanlı (node-based) akışlar: Müşteri bir butona bastığında veya belirli bir mesaj attığında hangi adımın çalışacağını belirler.
* **Kural Motoru (Trigger -> Condition -> Action):**
  * *Tetikleyiciler:* Yeni mesaj, form dolduruldu, aşama değişti, etiket eklendi, temsilci atandı.
  * *Eylemler:* WhatsApp şablonu gönder, görev oluştur, aşama değiştir, bildirim fırlat, webhook çağır.
* **Kanal & Temsilci Yönlendirme:**
  * Mesai saatlerine göre otomatik karşılama mesajları.
  * Temsilciler arasında adil yük dağılımı (Round-Robin veya En Az Meşgul Olan).

---

### 2.5 Base (Bilgi Bankası & RAG Altyapısı)
* **İçerik Kaynakları:**
  * **Şirket & Şubeler:** Firma tanıtımı, şube adresleri, çalışma saatleri.
  * **Kategori & Ürünler:** Satışa sunulan ürün/hizmet kalemleri, fiyatlar, açıklamalar.
  * **Dokümanlar & Dosyalar:** PDF broşürler, Word belgeleri, sözleşmeler.
  * **Web Sitesi Tarayıcı (URL Crawler):** Web sitesindeki sayfaları tarayarak içeriği otomatik indeksler.
* **Kullanım Amacı:**
  * Hem yapay zekâ asistanlarının müşterilere doğru yanıt vermesini sağlar hem de insan temsilcilerin sohbet anında tek tıkla arayıp müşteriye gönderebileceği bilgi kütüphanesidir.

---

### 2.6 Satış, Sipariş & Finans (Pipeline & Fatura)
* **Pipeline / Funnel (Satış Hunisi):**
  * Kanban görünümüyle lead'lerin aşamaları (`Yeni Talep` ➔ `Ulaşıldı` ➔ `Teklif Verildi` ➔ `Kazanıldı / Kaybedildi`).
* **Satış Belgeleri:**
  * **Teklifler (Quotes):** Müşteriye özel kalemler, indirimler ve geçerlilik tarihiyle teklif oluşturma.
  * **Siparişler (Orders):** Onaylanan tekliflerin siparişe dönüştürülmesi.
  * **Faturalar (Invoices):** Ödeme takibi ve tahsilat durumu.

---

### 2.7 Aktivite, Görev & Randevu Takvimi
* **Randevu & Doktor/Kaynak Takvimi:**
  * Şube, bölüm, doktor veya toplantı odası bazında takvim planlama.
  * Müşteriye otomatik randevu teyit ve hatırlatma mesajları.
* **Google Calendar Çift Yönlü Entegrasyon:**
  * Temsilcilerin kişisel Google Takvimi ile sistem randevuları anlık senkronize olur.
* **Fallback to AI (İnsan Yapmazsa AI Devralsın):**
  * Bir temsilciye arama görevi atanır. Eğer temsilci belirlenen sürede (örn. 30 dk) aramayı gerçekleştirmezse, sistem görevi iptal etmeden otomatik olarak **Retell AI botuna devreder** ve bot müşteriyi arar.

---

### 2.8 Raporlama & Analitik (CEO Dashboard)
* **CEO & Yönetici Raporları:**
  * Günlük, haftalık, aylık yeni lead hacmi, kanal dağılımı ve yanıt hızları.
* **Temsilci Performans Analizi:**
  * Hangi temsilci kaç görüşme yaptı, ilk yanıt süresi (FRT) ne kadar, kaç satışı kapattı?
* **Arama & Sesli Bot Analitiği:**
  * AI botlarının konuşma başarı oranları, konuşma süreleri, ulaşılamayan aramalar ve müşteri duygu durumu dağılımı.

---

## 3. Sistem Nasıl Çalışıyor? (Uçtan Uca İşleyiş)

```
[Müşteri Teması: WhatsApp / Instagram / Form / Arama]
                   │
                   ▼
       [Kanal Webhook Alıcısı]
                   │
                   ▼
     [Evrensel Normalizasyon Katmanı]
                   │
                   ▼
     [Kişi & Vaka Eşleme / Oluşturma]
                   │
                   ▼
   [Attribution: UTM & Reklam Kaydı]
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
[AI Bot Aktif mi?]      [Doğrudan Temsilci]
  │                      │
  ├─ Evet ──> Base RAG   │
  │           Sorgusu    ▼
  │                      [Round-Robin Atama]
  ▼                      │
[Niyet Analizi]          ▼
  │                      [Canlı Inbox Görüşmesi]
  ├─ "Beni Arayın" ──> Görev Aç (Call) ──> [İnsan / Retell AI]
  └─ Bilgi Talebi  ──> Anında Cevapla
```

### Senaryo A: Yeni Lead & Akıllı Yönlendirme
1. Müşteri Facebook reklamına tıklar ve form doldurur.
2. Webhook saniyesinde İnstomer'a ulaşır; müşterinin reklam bilgileri (`fb_ad_id`, kampanya adı) kaydedilir.
3. Universal Classifier mesajı sınıflandırır, ilgili departmana (**Örn: Estetik Ekibi**) vaka açar.
4. Temsilcinin ekranına anlık sesli ve görsel bildirim düşer; aynı anda müşteriye WhatsApp'tan otomatik karşılama şablonu iletilir.

### Senaryo B: Hibrit AI + İnsan Temsilci Deneyimi
1. Gece 02:00'de web sitesindeki widget'tan müşteri soru sorar.
2. Temsilciler mesai dışı olduğundan AI Bot devreye girer; firmanın Bilgi Bankası'nı (Base) tarayarak ürün fiyatını ve özelliklerini eksiksiz açıklar.
3. Müşteri *"Yarın için randevu almak istiyorum"* dediğinde bot uygun saatleri sunar ve randevuyu takvime işler.
4. Sabah temsilci işe geldiğinde randevuyu hazır bulur.

### Senaryo C: Sesli AI Araması ve WhatsApp Entegrasyonu
1. Müşteri web formunda telefonunu bırakır.
2. Retell AI entegrasyonu 15 saniye içinde müşterinin telefonunu çaldırır.
3. Bot kendini tanıtır ve müşterinin ihtiyacını dinler.
4. Görüşme bittiğinde görüşmenin ses kaydı ve transkripti müşterinin vaka detayına işlenir; görüşme sonucu olumluysa satış hunisinde *"Sıcak Fırsat"* aşamasına taşınır.

---

## 4. Teknik Mimari ve Altyapı

### Veri Tabanı & Çoklu Kiracılık (Multi-Tenant)
* **Veri Tabanı:** SQLite (yerel/hafif kurulum) veya PostgreSQL (üretim/ölçeklenebilir).
* **ORM:** Prisma ORM.
* **Workspace İzolasyonu:** Her firma/organizasyon bir `Workspace` altında yaşar. Kullanıcılar, kontaklar, kanallar, şablonlar ve ayarlar workspace ID'si ile kesin olarak izole edilir.
* **Roller & Yetkiler:** `SUPER_ADMIN`, `OWNER`, `ADMIN`, `AGENT` yetkilendirme katmanı.

### Backend Katmanı
* **Çatı:** Node.js & Express.
* **Gerçek Zamanlı İletişim:** `Socket.io` (bağlı temsilcilere anlık mesaj ve bildirim iletimi).
* **Görev Zamanlayıcı:** `node-cron` (planlı aramalar, geciken görevlerin AI'a devri, takip kontrolleri).
* **Kimlik Doğrulama:** JWT (JSON Web Tokens) + Bcrypt parola şifreleme + Passport.js (Facebook Login).

### Frontend & Kullanıcı Deneyimi
* **Çatı:** React 19 + Vite.
* **Tasarım Dili:** Apple macOS / iOS estetiğinde (minimalist, modern, yüksek kontrastlı, yumuşak köşeli, segmented control ve floating card yapıları).
* **İkonografi:** Lucide React.
* **Tarih & UI:** React Datepicker, modern popover dropdownlar ve responsive düzenler.

### Harici Entegrasyonlar
| Servis / API | Kullanım Amacı |
|---|---|
| **Meta Graph API** | WhatsApp Cloud API, Facebook Messenger, Instagram Graph API, Lead Ads |
| **Retell AI** | İki yönlü sesli yapay zekâ telefon görüşmeleri |
| **Google Generative AI / OpenAI** | RAG yanıtları, sohbet botları ve niyet sınıflandırma |
| **Google Calendar API** | Randevuların temsilci takvimleriyle çift yönlü eşitlenmesi |
| **SMTP / IMAP / PubSub** | E-posta alıp gönderme altyapısı |

---

## 5. Özet

İnstomer; klasik bir canlı destek aracından çok daha fazlasıdır. İletişimi yalnızca cevaplanan bir mesaj olarak değil; **reklam kaynağından başlayıp satış, randevu, fatura ve sesli aramayla sonuçlanan eksiksiz bir müşteri yolculuğu** olarak ele alan entegre bir iş işletim sistemidir.

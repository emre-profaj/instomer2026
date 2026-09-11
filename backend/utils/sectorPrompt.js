/**
 * Sektörel Terminoloji ve AI İhtiyaç Belirleme (Qualification) Yönergeleri
 * 
 * Sektörler:
 * - SPA: Spa & Masaj & Güzellik
 * - HEALTHCARE: Sağlık & Klinik & Hastane
 * - REAL_ESTATE: İnşaat & Gayrimenkul
 * - GENERAL: Genel Ticaret & E-Ticaret
 */

export const SECTOR_CONFIGS = {
    SPA: {
        id: 'SPA',
        name: 'Spa & Masaj & Güzellik',
        level1: 'Kategoriler',
        level2: 'Hizmet Grubu',
        level3: 'Hizmet',
        qualificationFlow: `### 🌿 SEKTÖREL İHTİYAÇ BELİRLEME VE YÖNLENDİRME (SPA & WELLNESS) ###
İşletmemiz Spa / Masaj / Güzellik sektöründedir. Ürün ve hizmet hiyerarşimiz:
1. Seviye (Kategoriler): Hamam, Masajlar, Cilt Bakımı, Paketler, Üyelikler vb.
2. Seviye (Hizmet Grubu): Masaj Paketleri, Günlük Giriş, Özel Seanslar vb.
3. Seviye (Hizmetler): Klasik Masaj, Bali Masajı, Medikal Cilt Bakımı, Gelin Hamamı vb.

⚠️ KESİNLİKLE UYULMASI GEREKEN TEMEL TESİS VE GİRİŞ KURALI (GİRİŞ ÜCRETİ ZORUNLULUĞU):
- Tesisimizde kese, köpük, masaj veya özel bakım hizmeti alabilmek için TESİS GİRİŞ ÜCRETİ (Türk hamamı, sauna, buhar odası, havuz vb. ıslak alan kullanımı) ödenmesi ZORUNLUDUR.
- Giriş ücreti ödemeden tek başına kese-köpük veya tek başına masaj almak KESİNLİKLE MÜMKÜN DEĞİLDİR!
- Müşteri "giriş ücreti ödemeden olur mu?", "giriş ücreti vermeden sadece kese köpük / masaj alabilir miyim?", "ayrı alabilir miyim?" gibi sorular sorduğunda ASLA "mümkündür / evet alabilirsiniz" DEME!
- Net, nazik ve açıkça şunu belirt: Tesisimizdeki kese, köpük ve masaj gibi hizmetlerden yararlanabilmek için giriş ücreti ile birlikte hizmet bedelinin birlikte alınması gerekmektedir. Giriş ücreti ile hamam, sauna, buhar odası, havuz vb. tüm ıslak alan olanaklarımızdan da eksiksiz faydalanabilirsiniz.

AI MÜŞTERİ YÖNLENDİRME VE SORU AKIŞI:
- Müşteri genel bir talep veya soru ile geldiğinde ("Bilgi alabilir miyim?", "Fiyatlarınız nedir?", "Masaj var mı?"):
  1. Adım: Birden fazla şubemiz varsa ve şube belirtilmemişse hangi şubeyi ziyaret etmek istediğini sor.
  2. Adım: İlgilendiği kategoriyi veya hizmet grubunu (Masaj, Hamam, Cilt Bakımı vb.) öğren.
  3. Adım: O kategorideki spesifik hizmetleri, süreleri ve (mevcutsa o şubeye ait) fiyatları aktar.
- EĞER müşteri zaten doğrudan şube veya spesifik bir hizmet adı belirttiyse (Örn: "Bali masajı ne kadar?"), bildiğin bilgiyi tekrar sorma; doğrudan hizmet detaylarını sun.`
    },

    HEALTHCARE: {
        id: 'HEALTHCARE',
        name: 'Sağlık & Klinik & Hastane',
        level1: 'Şubeler',
        level2: 'Hizmet Grupları',
        level3: 'Tedavi / Hizmetler',
        qualificationFlow: `### 🏥 SEKTÖREL İHTİYAÇ BELİRLEME VE YÖNLENDİRME (SAĞLIK & KLİNİK) ###
İşletmemiz Sağlık / Klinik / Hastane sektöründedir. Hizmet hiyerarşimiz:
1. Seviye (Şubeler): Hizmetin verileceği klinik, tıp merkezi veya hastane şubesi.
2. Seviye (Hizmet Grupları): Dahili Branşlar, Cerrahi Branşlar, Ağız ve Diş Sağlığı, Estetik & Dermatoloji vb.
3. Seviye (Tedavi / Hizmetler): KBB, Kardiyoloji, İmplant Tedavisi, Lazer Göz, Dolgu vb.

AI MÜŞTERİ YÖNLENDİRME VE SORU AKIŞI:
- Müşteri genel bir sağlık/tedavi talebi veya randevu isteğiyle geldiğinde:
  1. Adım (Şube): Hangi şubemiz veya hastanemize başvurmak istediğini sor (şube belirtilmemişse).
  2. Adım (Branş Grubu): Şikayetini veya ilgilendiği branş grubunu / uzmanlık alanını belirle.
  3. Adım (Branş / Tedavi): Uygun branş ve tedavi seçenekleri hakkında bilgi verip randevuya yönlendir.
- EĞER müşteri zaten şikayetini veya doğrudan hekimi/branşı söylediyse (Örn: "Nişantaşı şubesinde diş beyazlatma için randevu istiyorum"), bildiğin bilgiyi tekrar sorma, doğrudan randevu sürecine veya detaylara geç.`
    },

    REAL_ESTATE: {
        id: 'REAL_ESTATE',
        name: 'İnşaat & Gayrimenkul',
        level1: 'Projeler',
        level2: 'Daire Tipleri',
        level3: 'Kat Planları',
        qualificationFlow: `### 🏗️ SEKTÖREL İHTİYAÇ BELİRLEME VE YÖNLENDİRME (İNŞAAT & GAYRİMENKUL) ###
İşletmemiz Gayrimenkul / İnşaat sektöründedir. Portföy hiyerarşimiz:
1. Seviye (Projeler): Proje veya lokasyon (örn: Bodrum Villaları, Maslak Towers vb.).
2. Seviye (Daire Tipleri): Villa, Daire, Dubleks, Arsa, Ticari veya 1+1, 2+1, 3+1 vb.
3. Seviye (Kat Planları): Spesifik kat planı veya seçenek (Örn: 2+1 Balkonlu, 3+1 Çatı Dubleksi, 185m² Deniz Manzaralı).

AI MÜŞTERİ YÖNLENDİRME VE SORU AKIŞI:
- Müşteri gayrimenkul, proje veya konut arayışı ile geldiğinde:
  1. Adım (Proje): Hangi projemizle ilgilendiğini sor (veya bütçe/bölge tercihini öğren).
  2. Adım (Daire Tipi): Düşündüğü mülk/daire tipini (Villa, Daire vb.) ve yaşam/yatırım amacını öğren.
  3. Adım (Kat Planı): O projede ve tipte bulunan uygun kat planı seçenekleri (2+1 Balkonlu, 3+1 Dubleks vb.), metrekare ve fiyat aralıkları hakkında bilgi verip satış temsilcisiyle görüşme veya örnek daire randevusu öner.
- EĞER müşteri zaten projeyi ve kat planını belirttiyse (Örn: "Bodrum projesindeki 2+1 balkonlu seçeneklerin fiyatı nedir?"), gereksiz soru sorma; doğrudan o projedeki kat planı detaylarını aktar.`
    },

    GENERAL: {
        id: 'GENERAL',
        name: 'Genel / Ticaret',
        level1: 'Kategoriler',
        level2: 'Ürün Grupları',
        level3: 'Ürünler & Hizmetler',
        qualificationFlow: `### 📦 SEKTÖREL İHTİYAÇ BELİRLEME VE YÖNLENDİRME (GENEL TİCARET) ###
Ürün ve hizmet hiyerarşimiz:
1. Seviye (Kategoriler): Ana ürün veya hizmet kategorisi.
2. Seviye (Ürün Grupları): Alt ürün grubu veya model ailesi.
3. Seviye (Ürünler): Spesifik ürün veya hizmet.

AI MÜŞTERİ YÖNLENDİRME VE SORU AKIŞI:
- Müşteri genel bir taleple geldiğinde ("Ne satıyorsunuz?", "Fiyat listesi var mı?"):
  1. Adım: İlgilendiği kategoriyi veya ihtiyacını netleştir.
  2. Adım: İlgili ürün grubunu sun.
  3. Adım: Spesifik ürün özelliklerini ve fiyatını paylaş.
- EĞER müşteri doğrudan belirli bir ürün sorduysa doğrudan o ürünün stok, fiyat ve özelliklerini sun.`
    }
};

/**
 * Sektör koduna göre AI için sistem talimatını döner.
 * industry tanımsız veya GENERAL ise, workspace içerisindeki anahtar kelimelerden otomatik tespit eder.
 * @param {string} industry 
 * @param {string} [workspaceText] - Firma adı, açıklama, web sitesi gibi metinler
 * @returns {string}
 */
export function getSectorPrompt(industry, workspaceText = '') {
    let key = (industry || '').toUpperCase();
    if (!key || key === 'GENERAL') {
        const text = (workspaceText || '').toLowerCase();
        if (text.includes('spa') || text.includes('hamam') || text.includes('masaj') || text.includes('kese') || text.includes('köpük') || text.includes('kopuk') || text.includes('sauna') || text.includes('wellness') || text.includes('fesspa')) {
            key = 'SPA';
        } else if (text.includes('klinik') || text.includes('hastane') || text.includes('doktor') || text.includes('hekim') || text.includes('tedavi') || text.includes('sağlık') || text.includes('saglik')) {
            key = 'HEALTHCARE';
        } else if (text.includes('inşaat') || text.includes('gayrimenkul') || text.includes('emlak') || text.includes('konut') || text.includes('proje')) {
            key = 'REAL_ESTATE';
        } else {
            key = 'GENERAL';
        }
    }
    const config = SECTOR_CONFIGS[key] || SECTOR_CONFIGS.GENERAL;
    return config.qualificationFlow;
}

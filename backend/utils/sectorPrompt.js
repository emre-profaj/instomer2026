/**
 * Sektörel Terminoloji ve AI İhtiyaç Belirleme (Qualification) Yönergeleri
 * 
 * Sektörler:
 * - REAL_ESTATE: Gayrimenkul & İnşaat (Şube ve Projeler -> Kategori -> Tip -> Daire ve Üniteler)
 * - HEALTHCARE: Sağlık & Klinik & Hastane (Merkez ve Şubeler -> Branş ve Bölümler -> İşlem Grubu -> Hizmet ve İşlemler)
 * - SPA: Spa ve Spor Salonu (Merkez ve Şubeler -> Bölümler -> Hizmet ve Ürün Grubu -> Hizmet ve İşlemler)
 * - GENERAL: Genel / Ticaret (Şubeler -> Kategoriler -> Ürün Grupları -> Ürünler & Hizmetler)
 */

export const SECTOR_CONFIGS = {
    REAL_ESTATE: {
        id: 'REAL_ESTATE',
        name: 'İnşaat & Gayrimenkul',
        level1: 'Şube ve Projeler',
        level2: 'Kategori (Arsa, Villa, Daire, Ticari, Dükkan)',
        level3: 'Tip (2+1, 3+1, Büyük Tip 3+1)',
        level4: 'Daire ve Üniteler (Örn: 27 Numaralı 4+1 Villa, Arsa)',
        qualificationFlow: `### 🏗️ SEKTÖREL İHTİYAÇ BELİRLEME VE YÖNLENDİRME (İNŞAAT & GAYRİMENKUL) ###
İşletmemiz Gayrimenkul / İnşaat sektöründedir. Portföy hiyerarşimiz:
1. Seviye (Şube ve Projeler): Proje veya satış ofisi lokasyonu (örn: Urla Deryası Villa Projesi, Merkez Satış Ofisi vb.).
2. Seviye (Kategori): Arsa, Villa, Daire, Ticari, Dükkan vb. mülk kategorileri.
3. Seviye (Tip): 2+1, 3+1, Büyük Tip 3+1, Çatı Dubleksi vb. ünite tipleri.
4. Seviye (Daire ve Üniteler): Spesifik bağımsız bölüm (Örn: 27 Numaralı 4+1 Villa, A Blok No:12 Daire, 500m² Köşe Parsel Arsa).

AI MÜŞTERİ YÖNLENDİRME VE SORU AKIŞI:
- Müşteri gayrimenkul, proje veya konut arayışı ile geldiğinde:
  1. Adım (Şube ve Proje): Hangi projemiz veya lokasyonla ilgilendiğini sor (veya bütçe/bölge tercihini öğren).
  2. Adım (Kategori): Aradığı mülk türünü (Villa, Daire, Arsa, Ticari vb.) öğren.
  3. Adım (Tip): Düşündüğü daire/ünite tipini (2+1, 3+1, Büyük Tip 3+1 vb.) ve kullanım/yatırım amacını belirle.
  4. Adım (Daire ve Ünite): Uygun bağımsız ünite seçenekleri (metrekare, kat/blok, cephe, fiyat ve ödeme planı) hakkında bilgi verip satış ofisi veya örnek daire randevusu öner.
- EĞER müşteri zaten projeyi ve daire/üniteyi belirttiyse (Örn: "Urla projesindeki 27 numaralı villanın fiyatı nedir?"), gereksiz soru sorma; doğrudan o üniteye ait detayları aktar.`
    },

    HEALTHCARE: {
        id: 'HEALTHCARE',
        name: 'Sağlık & Klinik & Hastane',
        level1: 'Merkez ve Şubeler',
        level2: 'Branş ve Bölümler',
        level3: 'İşlem Grubu (Ameliyat, Muayene vb.)',
        level4: 'Hizmet ve İşlemler',
        qualificationFlow: `### 🏥 SEKTÖREL İHTİYAÇ BELİRLEME VE YÖNLENDİRME (SAĞLIK & KLİNİK) ###
İşletmemiz Sağlık / Klinik / Hastane sektöründedir. Hizmet hiyerarşimiz:
1. Seviye (Merkez ve Şubeler): Hizmetin verileceği merkez klinik, hastane veya poliklinik şubesi.
2. Seviye (Branş ve Bölümler): Tıbbi uzmanlık alanları (Ağız ve Diş Sağlığı, KBB, Kardiyoloji, Dermatoloji, Göz vb.).
3. Seviye (İşlem Grubu): Ameliyat, Muayene, Cerrahi Müdahale, Teşhis & Tetkik vb.
4. Seviye (Hizmet ve İşlemler): İmplant Tedavisi, 20'lik Diş Çekimi, Rinoplasti, Genel Muayene, Lazer vb.

AI MÜŞTERİ YÖNLENDİRME VE SORU AKIŞI:
- Müşteri genel bir sağlık/tedavi talebi veya randevu isteğiyle geldiğinde:
  1. Adım (Merkez / Şube): Hangi merkez veya şubemize başvurmak istediğini sor (şube belirtilmemişse).
  2. Adım (Branş ve Bölüm): Şikayetini veya ilgilendiği branş ve bölümü / uzmanlık alanını belirle.
  3. Adım (İşlem Grubu & İşlem): Yapılacak işlem grubunu (Muayene, Ameliyat vb.) ve spesifik hizmeti netleştirip randevu oluşturmaya yönlendir.
- EĞER müşteri zaten şikayetini veya doğrudan hekimi/branşı söylediyse (Örn: "Nişantaşı şubesinde diş beyazlatma için randevu istiyorum"), bildiğin bilgiyi tekrar sorma, doğrudan randevu sürecine veya detaylara geç.`
    },

    SPA: {
        id: 'SPA',
        name: 'Spa ve Spor Salonu',
        level1: 'Merkez ve Şubeler',
        level2: 'Bölümler',
        level3: 'Hizmet ve Ürün Grubu',
        level4: 'Hizmet ve İşlemler',
        qualificationFlow: `### 🌿 SEKTÖREL İHTİYAÇ BELİRLEME VE YÖNLENDİRME (SPA VE SPOR SALONU) ###
İşletmemiz Spa ve Spor Salonu sektöründedir. Hizmet ve portföy hiyerarşimiz:
1. Seviye (Merkez ve Şubeler): Hizmetin verileceği tesis merkezi veya şube (örn: Alsancak Şubesi, Merkez Tesis).
2. Seviye (Bölümler): Hamam Alanı, Masaj Odaları, Fitness Salonu, Pilates Stüdyosu, Havuz vb.
3. Seviye (Hizmet ve Ürün Grubu): Masaj Paketleri, Hamam & Giriş, Aylık Üyelikler, Özel PT Seansları, Takviye Ürünler vb.
4. Seviye (Hizmet ve İşlemler): Kafa Masajı, Kese-Köpük, 1 Aylık Gold Üyelik, 10 Seans PT, Medikal Masaj vb.

⚠️ GİRİŞ ÜCRETİ, PAKET VE KOŞULLAR — YALNIZCA BİLGİ BANKASINDAN:
- Giriş ücreti zorunluluğu, paket kapsamı ve bir hizmetin tek başına alınıp alınamayacağı işletmeden işletmeye ve hizmetten hizmete DEĞİŞİR. Bu koşulları SADECE Bilgi Bankası ve İşletme Talimatları'nda açıkça yazdığı şekilde, yazan hizmet için aktar.
- Bir hizmet için yazan koşulu BAŞKA bir hizmete GENELLEME. Örneğin bir hizmet için giriş ücreti zorunluysa, bu diğer hizmetler için de zorunlu olduğu ANLAMINA GELMEZ.
- Müşteri "giriş ücreti ödemeden olur mu?", "ayrı alabilir miyim?" gibi bir koşulu sorduğunda: Bilgi Bankasında o hizmet için açık bir hüküm VARSA aynen onu aktar. YOKSA ne "mümkündür" ne "mümkün değildir" deme; konuyu yetkiliye aktaracağını belirt.

AI MÜŞTERİ YÖNLENDİRME VE SORU AKIŞI:
- Müşteri genel bir talep veya soru ile geldiğinde ("Bilgi alabilir miyim?", "Fiyatlarınız nedir?", "Masaj var mı?"):
  1. Adım (Merkez / Şube): Birden fazla merkez/şube varsa ve şube belirtilmemişse hangi merkez veya şubeyi ziyaret etmek istediğini sor.
  2. Adım (Bölüm & Hizmet Grubu): İlgilendiği bölümü veya hizmet grubunu (Masaj, Hamam, Fitness, Üyelik vb.) öğren.
  3. Adım (Hizmet ve İşlem): O gruptaki spesifik hizmet ve işlemleri, seans sürelerini ve (o şubeye ait) fiyatları aktar.
- EĞER müşteri zaten doğrudan merkez/şube veya spesifik bir işlem belirttiyse (Örn: "Bali masajı ne kadar?"), bildiğin bilgiyi tekrar sorma; doğrudan işlem detaylarını sun.`
    },

    GENERAL: {
        id: 'GENERAL',
        name: 'Genel / Ticaret',
        level1: 'Şubeler',
        level2: 'Kategoriler',
        level3: 'Ürün Grupları',
        level4: 'Ürünler & Hizmetler',
        qualificationFlow: `### 📦 SEKTÖREL İHTİYAÇ BELİRLEME VE YÖNLENDİRME (GENEL TİCARET) ###
Ürün ve hizmet hiyerarşimiz:
1. Seviye (Şubeler): Şube veya mağaza lokasyonu.
2. Seviye (Kategoriler): Ana ürün veya hizmet kategorisi.
3. Seviye (Ürün Grupları): Alt ürün grubu veya model ailesi.
4. Seviye (Ürünler & Hizmetler): Spesifik ürün veya hizmet.

AI MÜŞTERİ YÖNLENDİRME VE SORU AKIŞI:
- Müşteri genel bir taleple geldiğinde ("Ne satıyorsunuz?", "Fiyat listesi var mı?"):
  1. Adım (Şube): Birden fazla şube varsa hangi şubeden alışveriş yapacağını teyit et.
  2. Adım (Kategori): İlgilendiği kategoriyi veya ihtiyacını netleştir.
  3. Adım (Ürün Grubu): İlgili ürün grubunu sun.
  4. Adım (Ürün & Hizmet): Spesifik ürün özelliklerini, stok ve fiyatını paylaş.
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
    const raw = String(industry || '').toUpperCase().replace(/[\s\-_]/g, '');
    let key = 'GENERAL';

    if (raw.includes('REALESTATE') || raw.includes('INSAAT') || raw.includes('GAYRIMENKUL') || raw.includes('EMLAK') || raw.includes('CONSTRUCT')) {
        key = 'REAL_ESTATE';
    } else if (raw.includes('HEALTH') || raw.includes('SAGLIK') || raw.includes('CLINIC') || raw.includes('HOSPITAL') || raw.includes('HASTANE') || raw.includes('MEDIC')) {
        key = 'HEALTHCARE';
    } else if (raw.includes('SPA') || raw.includes('WELLNESS') || raw.includes('FITNESS') || raw.includes('SPOR') || raw.includes('GYM') || raw.includes('BEAUTY') || raw.includes('GUZELLIK') || raw.includes('MASAJ')) {
        key = 'SPA';
    } else if (!raw || raw === 'GENERAL') {
        const text = (workspaceText || '').toLowerCase();
        if (text.includes('spa') || text.includes('hamam') || text.includes('masaj') || text.includes('kese') || text.includes('köpük') || text.includes('kopuk') || text.includes('sauna') || text.includes('wellness') || text.includes('fitness') || text.includes('spor') || text.includes('fesspa')) {
            key = 'SPA';
        } else if (text.includes('klinik') || text.includes('hastane') || text.includes('doktor') || text.includes('hekim') || text.includes('tedavi') || text.includes('sağlık') || text.includes('saglik')) {
            key = 'HEALTHCARE';
        } else if (text.includes('inşaat') || text.includes('gayrimenkul') || text.includes('emlak') || text.includes('konut') || text.includes('proje') || text.includes('villa') || text.includes('daire')) {
            key = 'REAL_ESTATE';
        } else {
            key = 'GENERAL';
        }
    } else {
        key = SECTOR_CONFIGS[raw] ? raw : 'GENERAL';
    }

    const config = SECTOR_CONFIGS[key] || SECTOR_CONFIGS.GENERAL;
    return config.qualificationFlow;
}

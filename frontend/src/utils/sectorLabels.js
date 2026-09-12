/**
 * Sektörel Terminoloji Sözlüğü & Etiket Yöneticisi
 * 
 * Sektörler:
 * - REAL_ESTATE: Gayrimenkul & İnşaat (Şube ve Projeler -> Kategoriler -> Tipler -> Daire ve Üniteler)
 * - HEALTHCARE: Sağlık & Klinik & Hastane (Merkez ve Şubeler -> Branş ve Bölümler -> İşlem Grubu -> Hizmet ve İşlemler)
 * - SPA: Spa ve Spor Salonu (Merkez ve Şubeler -> Bölümler -> Hizmet ve Ürün Grubu -> Hizmet ve İşlemler)
 * - GENERAL: Genel / Ticaret (Şubeler -> Kategoriler -> Ürün Grupları -> Ürünler & Hizmetler)
 */

export const SECTORS = {
    GENERAL: {
        id: 'GENERAL',
        name: 'Genel / Ticaret',
        description: 'Standart şube, kategori, ürün grubu ve ürün terminolojisi',
        icon: '📦',

        // 1. Kademe: Şubeler
        branchesTab: 'Şubeler',
        branchSingle: 'Şube',
        branchPlural: 'Şubeler',
        newBranch: 'Yeni Şube Ekle',
        allBranches: 'Tüm Şubeler',
        branchesDesc: 'Şubelerinizi ve mağazalarınızı yönetin.',
        branchPlaceholder: 'Örn: Merkez Şube, Kadıköy Şubesi',

        // 2. Kademe: Kategoriler
        categoriesTab: 'Kategoriler',
        categorySingle: 'Kategori',
        categoryPlural: 'Kategoriler',
        newCategory: 'Yeni Kategori Ekle',
        allCategories: 'Tüm Kategoriler',
        selectCategory: 'Kategori Seçin',
        uncategorized: 'Kategorisiz',
        categoriesDesc: 'Ürün ve hizmet kategorilerini yönetin.',
        categoryPlaceholder: 'Örn: Elektronik, Giyim, Aksesuar',
        
        // 3. Kademe: Ürün Grupları
        productGroupsTab: 'Ürün Grupları',
        groupSingle: 'Ürün Grubu',
        groupPlural: 'Ürün Grupları',
        newGroup: 'Yeni Grup Ekle',
        allGroups: 'Tüm Gruplar',
        selectGroup: 'Grup Seçin',
        ungrouped: 'Grupsuz',
        emptyGroupsTitle: 'Henüz ürün grubu bulunmuyor',
        emptyGroupsDesc: 'Ürünlerinizi alt gruplara ayırmak için yeni bir grup ekleyin.',
        groupPlaceholder: 'Örn: Akıllı Telefonlar, Dizüstü Bilgisayarlar',
        
        // 4. Kademe: Ürünler
        productsTab: 'Ürünler & Hizmetler',
        productSingle: 'Ürün / Hizmet',
        productPlural: 'Ürünler & Hizmetler',
        productName: 'Ürün Adı',
        newProduct: 'Yeni Ürün Ekle',
        allProducts: 'Tüm Ürünler',
        searchPlaceholder: 'Ürün ara...',
        emptyProductsTitle: 'Ürün Bulunamadı',
        emptyProductsDesc: 'Henüz ürün/hizmet eklenmemiş veya filtrelere uygun sonuç yok.'
    },

    REAL_ESTATE: {
        id: 'REAL_ESTATE',
        name: 'İnşaat & Gayrimenkul',
        description: 'Şube ve Projeler, Kategoriler, Tipler ve Daire/Üniteler hiyerarşisi',
        icon: '🏗️',

        // 1. Kademe: Şubeler = Şube ve Projeler
        branchesTab: 'Şube ve Projeler',
        branchSingle: 'Şube / Proje',
        branchPlural: 'Şube ve Projeler',
        newBranch: 'Yeni Şube / Proje Ekle',
        allBranches: 'Tüm Şube ve Projeler',
        branchesDesc: 'Şubelerinizi ve konut/gayrimenkul projelerinizi yönetin.',
        branchPlaceholder: 'Örn: Urla Deryası Villa Projesi, Merkez Satış Ofisi',

        // 2. Kademe: Kategoriler = Kategori (Arsa, Villa, Daire, Ticari, Dükkan)
        categoriesTab: 'Kategoriler',
        categorySingle: 'Kategori',
        categoryPlural: 'Kategoriler',
        newCategory: 'Yeni Kategori Ekle',
        allCategories: 'Tüm Kategoriler',
        selectCategory: 'Kategori Seçin',
        uncategorized: 'Kategorisiz',
        categoriesDesc: 'Gayrimenkul türlerini (Arsa, Villa, Daire, Ticari, Dükkan vb.) kategorize edin.',
        categoryPlaceholder: 'Örn: Arsa, Villa, Daire, Ticari, Dükkan',

        // 3. Kademe: Ürün Grubu = Tip (2+1, 3+1, Büyük Tip 3+1)
        productGroupsTab: 'Tipler',
        groupSingle: 'Tip',
        groupPlural: 'Tipler',
        newGroup: 'Yeni Tip Ekle',
        allGroups: 'Tüm Tipler',
        selectGroup: 'Tip Seçin',
        ungrouped: 'Tiplendirilmemiş',
        emptyGroupsTitle: 'Henüz tip bulunmuyor',
        emptyGroupsDesc: 'Daire ve ünite tiplerini (2+1, 3+1, Büyük Tip 3+1 vb.) tanımlamak için yeni tip ekleyin.',
        groupPlaceholder: 'Örn: 2+1, 3+1, Büyük Tip 3+1, Çatı Dubleksi',

        // 4. Kademe: Ürün = Daire ve Üniteler (Örn 27 Numaralı 4+1 Villa, Arsa)
        productsTab: 'Daire ve Üniteler',
        productSingle: 'Daire / Ünite',
        productPlural: 'Daire ve Üniteler',
        productName: 'Daire / Ünite Adı',
        newProduct: 'Yeni Daire / Ünite Ekle',
        allProducts: 'Tüm Daire ve Üniteler',
        searchPlaceholder: 'Daire / ünite ara (örn: 27 Numaralı 4+1 Villa, Arsa, A Blok No:12)...',
        emptyProductsTitle: 'Daire / Ünite Bulunamadı',
        emptyProductsDesc: 'Henüz satılık veya kiralık daire/ünite eklenmemiş veya filtrelere uygun sonuç yok.'
    },

    HEALTHCARE: {
        id: 'HEALTHCARE',
        name: 'Sağlık & Klinik & Hastane',
        description: 'Merkez ve Şubeler, Branş ve Bölümler, İşlem Grupları ve Hizmet/İşlemler hiyerarşisi',
        icon: '🏥',

        // 1. Kademe: Şubeler = Merkez ve Şubeler
        branchesTab: 'Merkez ve Şubeler',
        branchSingle: 'Merkez / Şube',
        branchPlural: 'Merkez ve Şubeler',
        newBranch: 'Yeni Merkez / Şube Ekle',
        allBranches: 'Tüm Merkez ve Şubeler',
        branchesDesc: 'Merkez klinik, hastane ve poliklinik şubelerinizi yönetin.',
        branchPlaceholder: 'Örn: Kadıköy Şubesi, Nişantaşı Tıp Merkezi',

        // 2. Kademe: Kategori = Branş ve Bölümler
        categoriesTab: 'Branş ve Bölümler',
        categorySingle: 'Branş / Bölüm',
        categoryPlural: 'Branş ve Bölümler',
        newCategory: 'Yeni Branş / Bölüm Ekle',
        allCategories: 'Tüm Branş ve Bölümler',
        selectCategory: 'Branş / Bölüm Seçin',
        uncategorized: 'Bölümsüz',
        categoriesDesc: 'Tıbbi uzmanlık alanlarını ve poliklinik bölümlerini (Ağız ve Diş, KBB, Dermatoloji, Göz vb.) yönetin.',
        categoryPlaceholder: 'Örn: Ağız ve Diş Sağlığı, Kardiyoloji, Göz Hastalıkları',

        // 3. Kademe: Ürün Grubu = İşlem Grubu (Ameliyat, Muayene)
        productGroupsTab: 'İşlem Grupları',
        groupSingle: 'İşlem Grubu',
        groupPlural: 'İşlem Grupları',
        newGroup: 'Yeni İşlem Grubu Ekle',
        allGroups: 'Tüm İşlem Grupları',
        selectGroup: 'İşlem Grubu Seçin',
        ungrouped: 'Grupsuz',
        emptyGroupsTitle: 'Henüz işlem grubu bulunmuyor',
        emptyGroupsDesc: 'Tıbbi işlemleri (Ameliyat, Muayene, Cerrahi vb.) ayırmak için yeni işlem grubu ekleyin.',
        groupPlaceholder: 'Örn: Ameliyat, Muayene, Cerrahi Müdahale, Teşhis & Tetkik',

        // 4. Kademe: Ürün = Hizmet ve İşlemler
        productsTab: 'Hizmet ve İşlemler',
        productSingle: 'Hizmet / İşlem',
        productPlural: 'Hizmet ve İşlemler',
        productName: 'Hizmet / İşlem Adı',
        newProduct: 'Yeni Hizmet / İşlem Ekle',
        allProducts: 'Tüm Hizmet ve İşlemler',
        searchPlaceholder: 'Hizmet veya işlem ara (örn: İmplant, Dolgu, Rinoplasti, Muayene)...',
        emptyProductsTitle: 'Hizmet / İşlem Bulunamadı',
        emptyProductsDesc: 'Henüz tedavi, muayene veya ameliyat işlemi eklenmemiş veya filtrelere uygun sonuç yok.'
    },

    SPA: {
        id: 'SPA',
        name: 'Spa ve Spor Salonu',
        description: 'Merkez ve Şubeler, Bölümler, Hizmet ve Ürün Grubu ve Hizmet/İşlemler hiyerarşisi',
        icon: '🌿',

        // 1. Kademe: Şubeler = Merkez ve Şubeler
        branchesTab: 'Merkez ve Şubeler',
        branchSingle: 'Merkez / Şube',
        branchPlural: 'Merkez ve Şubeler',
        newBranch: 'Yeni Merkez / Şube Ekle',
        allBranches: 'Tüm Merkez ve Şubeler',
        branchesDesc: 'Tesis merkezlerinizi ve spor salonu / spa şubelerinizi yönetin.',
        branchPlaceholder: 'Örn: Alsancak Şubesi, Merkez Tesis',

        // 2. Kademe: Kategori = Bölümler
        categoriesTab: 'Bölümler',
        categorySingle: 'Bölüm',
        categoryPlural: 'Bölümler',
        newCategory: 'Yeni Bölüm Ekle',
        allCategories: 'Tüm Bölümler',
        selectCategory: 'Bölüm Seçin',
        uncategorized: 'Bölümsüz',
        categoriesDesc: 'Tesis bölümlerini (Hamam, Masaj Alanı, Fitness Salonu, Havuz vb.) yönetin.',
        categoryPlaceholder: 'Örn: Hamam Alanı, Masaj Odaları, Fitness Salonu, Pilates Stüdyosu',

        // 3. Kademe: Ürün Grubu = Hizmet ve Ürün Grubu
        productGroupsTab: 'Hizmet ve Ürün Grupları',
        groupSingle: 'Hizmet ve Ürün Grubu',
        groupPlural: 'Hizmet ve Ürün Grupları',
        newGroup: 'Yeni Hizmet ve Ürün Grubu Ekle',
        allGroups: 'Tüm Hizmet ve Ürün Grupları',
        selectGroup: 'Hizmet ve Ürün Grubu Seçin',
        ungrouped: 'Grupsuz',
        emptyGroupsTitle: 'Henüz hizmet ve ürün grubu bulunmuyor',
        emptyGroupsDesc: 'Hizmet ve ürünlerinizi gruplara ayırmak için (örn: Masaj Paketleri, Islak Alan Kullanımı, Aylık Üyelikler) yeni grup ekleyin.',
        groupPlaceholder: 'Örn: Masaj Paketleri, Hamam & Giriş, Aylık Üyelikler, Takviye Ürünler',

        // 4. Kademe: Ürün = Hizmet ve İşlemler
        productsTab: 'Hizmet ve İşlemler',
        productSingle: 'Hizmet / İşlem',
        productPlural: 'Hizmet ve İşlemler',
        productName: 'Hizmet / İşlem Adı',
        newProduct: 'Yeni Hizmet / İşlem Ekle',
        allProducts: 'Tüm Hizmet ve İşlemler',
        searchPlaceholder: 'Hizmet veya işlem ara (örn: Kafa Masajı, Kese-Köpük, PT Seansı, Hamam Girişi)...',
        emptyProductsTitle: 'Hizmet / İşlem Bulunamadı',
        emptyProductsDesc: 'Henüz hizmet veya işlem eklenmemiş veya filtrelere uygun sonuç yok.'
    }
};

/**
 * Workspace sektör koduna göre etiket nesnesini döndürür.
 * Türkçe ve alternatif sektör kodlarını (örn: INSAAT, GAYRIMENKUL, SAGLIK, FITNESS) otomatik algılar.
 * @param {string} industry 
 * @returns {Object} SECTORS config
 */
export const getSectorLabels = (industry) => {
    if (!industry) return SECTORS.GENERAL;
    const key = String(industry).toUpperCase().replace(/[\s\-_]/g, '');
    if (key.includes('REALESTATE') || key.includes('INSAAT') || key.includes('GAYRIMENKUL') || key.includes('EMLAK') || key.includes('CONSTRUCT')) {
        return SECTORS.REAL_ESTATE;
    }
    if (key.includes('HEALTH') || key.includes('SAGLIK') || key.includes('CLINIC') || key.includes('HOSPITAL') || key.includes('HASTANE') || key.includes('MEDIC')) {
        return SECTORS.HEALTHCARE;
    }
    if (key.includes('SPA') || key.includes('WELLNESS') || key.includes('FITNESS') || key.includes('SPOR') || key.includes('GYM') || key.includes('BEAUTY') || key.includes('GUZELLIK') || key.includes('MASAJ')) {
        return SECTORS.SPA;
    }
    return SECTORS[String(industry).toUpperCase()] || SECTORS.GENERAL;
};

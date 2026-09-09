/**
 * Sektörel Terminoloji Sözlüğü & Etiket Yöneticisi
 * 
 * Sektörler:
 * - SPA: Spa, Masaj, Güzellik, Wellness
 * - HEALTHCARE: Sağlık, Klinik, Hastane, Tıp Merkezi
 * - REAL_ESTATE: İnşaat, Gayrimenkul, Konut Projeleri
 * - GENERAL: Genel, E-Ticaret, Perakende, Ticaret
 */

export const SECTORS = {
    GENERAL: {
        id: 'GENERAL',
        name: 'Genel / Ticaret',
        description: 'Standart ürün ve kategori terminolojisi',
        icon: '📦',
        categoriesTab: 'Kategoriler',
        categorySingle: 'Kategori',
        categoryPlural: 'Kategoriler',
        newCategory: 'Yeni Kategori',
        allCategories: 'Tüm Kategoriler',
        selectCategory: 'Kategori Seçin',
        uncategorized: 'Kategorisiz',
        
        productGroupsTab: 'Ürün Grupları',
        groupSingle: 'Grup',
        groupPlural: 'Ürün Grupları',
        newGroup: 'Yeni Grup',
        allGroups: 'Tüm Gruplar',
        selectGroup: 'Grup Seçin',
        ungrouped: 'Grupsuz',
        
        productsTab: 'Ürünler & Hizmetler',
        productSingle: 'Ürün / Hizmet',
        productPlural: 'Ürünler & Hizmetler',
        productName: 'Ürün Adı',
        newProduct: 'Yeni Ürün Ekle',
        allProducts: 'Tüm Ürünler',
        searchPlaceholder: 'Ürün ara...',
        emptyProductsTitle: 'Ürün Bulunamadı',
        emptyProductsDesc: 'Henüz ürün/hizmet eklenmemiş veya filtrelere uygun sonuç yok.',
        emptyGroupsTitle: 'Henüz ürün grubu bulunmuyor',
        emptyGroupsDesc: 'Ürünlerinizi alt gruplara ayırmak için yeni bir grup ekleyin.'
    },

    SPA: {
        id: 'SPA',
        name: 'Spa & Masaj & Güzellik',
        description: 'Kategoriler, Hizmet Grupları ve Hizmetler hiyerarşisi',
        icon: '🌿',
        categoriesTab: 'Kategoriler',
        categorySingle: 'Kategori',
        categoryPlural: 'Kategoriler',
        newCategory: 'Yeni Kategori',
        allCategories: 'Tüm Kategoriler',
        selectCategory: 'Kategori Seçin',
        uncategorized: 'Kategorisiz',
        
        productGroupsTab: 'Hizmet Grupları',
        groupSingle: 'Hizmet Grubu',
        groupPlural: 'Hizmet Grupları',
        newGroup: 'Yeni Hizmet Grubu',
        allGroups: 'Tüm Hizmet Grupları',
        selectGroup: 'Hizmet Grubu Seçin',
        ungrouped: 'Grupsuz',
        
        productsTab: 'Hizmetler',
        productSingle: 'Hizmet',
        productPlural: 'Hizmetler',
        productName: 'Hizmet Adı',
        newProduct: 'Yeni Hizmet Ekle',
        allProducts: 'Tüm Hizmetler',
        searchPlaceholder: 'Hizmet ara (örn: Kafa masajı, Hamam)...',
        emptyProductsTitle: 'Hizmet Bulunamadı',
        emptyProductsDesc: 'Henüz hizmet eklenmemiş veya filtrelere uygun sonuç yok.',
        emptyGroupsTitle: 'Henüz hizmet grubu bulunmuyor',
        emptyGroupsDesc: 'Hizmetlerinizi gruplara ayırmak için (örn: Masajlar, Hamam) yeni bir grup ekleyin.'
    },

    HEALTHCARE: {
        id: 'HEALTHCARE',
        name: 'Sağlık & Klinik & Hastane',
        description: 'Bölümler, Hizmet Grupları ve Tedavi / Hizmetler hiyerarşisi',
        icon: '🏥',
        categoriesTab: 'Bölümler',
        categorySingle: 'Bölüm',
        categoryPlural: 'Bölümler',
        newCategory: 'Yeni Bölüm',
        allCategories: 'Tüm Bölümler',
        selectCategory: 'Bölüm Seçin',
        uncategorized: 'Bölümsüz',
        
        productGroupsTab: 'Hizmet Grubu',
        groupSingle: 'Hizmet Grubu',
        groupPlural: 'Hizmet Grupları',
        newGroup: 'Yeni Hizmet Grubu',
        allGroups: 'Tüm Hizmet Grupları',
        selectGroup: 'Hizmet Grubu Seçin',
        ungrouped: 'Grupsuz',
        
        productsTab: 'Tedavi / Hizmetler',
        productSingle: 'Tedavi / Hizmet',
        productPlural: 'Tedavi / Hizmetler',
        productName: 'Tedavi / Hizmet Adı',
        newProduct: 'Yeni Tedavi / Hizmet Ekle',
        allProducts: 'Tüm Tedavi / Hizmetler',
        searchPlaceholder: 'Tedavi veya hizmet ara (örn: İmplant, Dolgu, Check-up)...',
        emptyProductsTitle: 'Tedavi / Hizmet Bulunamadı',
        emptyProductsDesc: 'Henüz tedavi veya hizmet eklenmemiş veya filtrelere uygun sonuç yok.',
        emptyGroupsTitle: 'Henüz hizmet grubu bulunmuyor',
        emptyGroupsDesc: 'Tedavi ve hizmetlerinizi gruplara ayırmak için yeni hizmet grubu ekleyin.'
    },

    REAL_ESTATE: {
        id: 'REAL_ESTATE',
        name: 'İnşaat & Gayrimenkul',
        description: 'Projeler, Daire Tipleri ve Kat Planları hiyerarşisi',
        icon: '🏗️',
        categoriesTab: 'Projeler',
        categorySingle: 'Proje',
        categoryPlural: 'Projeler',
        newCategory: 'Yeni Proje Ekle',
        allCategories: 'Tüm Projeler',
        selectCategory: 'Proje Seçin',
        uncategorized: 'Projesiz',
        
        productGroupsTab: 'Daire Tipleri',
        groupSingle: 'Daire Tipi',
        groupPlural: 'Daire Tipleri',
        newGroup: 'Yeni Daire Tipi',
        allGroups: 'Tüm Daire Tipleri',
        selectGroup: 'Daire Tipi Seçin',
        ungrouped: 'Tiplendirilmemiş',
        
        productsTab: 'Kat Planları',
        productSingle: 'Kat Planı',
        productPlural: 'Kat Planları',
        productName: 'Kat Planı Adı',
        newProduct: 'Yeni Kat Planı Ekle',
        allProducts: 'Tüm Kat Planları',
        searchPlaceholder: 'Kat planı ara (örn: 2+1 Balkonlu, 3+1 Dubleks)...',
        emptyProductsTitle: 'Kat Planı Bulunamadı',
        emptyProductsDesc: 'Henüz kat planı eklenmemiş veya filtrelere uygun sonuç yok.',
        emptyGroupsTitle: 'Henüz daire tipi bulunmuyor',
        emptyGroupsDesc: 'Daire tiplerinizi (Villa, Daire, Dubleks vb.) tanımlamak için yeni tip ekleyin.'
    }
};

/**
 * Workspace sektör koduna göre etiket nesnesini döndürür.
 * @param {string} industry 
 * @returns {Object} SECTORS config
 */
export const getSectorLabels = (industry) => {
    if (!industry) return SECTORS.GENERAL;
    const key = String(industry).toUpperCase();
    return SECTORS[key] || SECTORS.GENERAL;
};

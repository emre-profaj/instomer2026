/**
 * Akıllı field eşleştirme - form field adlarını CRM field'larına otomatik eşleştirir
 */
export const smartFieldMatcher = {
    // Her CRM field için olası form field adları (küçük harfe çevrilmiş)
    patterns: {
        name: [
            'name', 'isim', 'ad', 'adsoyad', 'ad_soyad', 'fullname', 'full_name',
            'isim_soyisim', 'isimsoyisim', 'isim soyisim', 'ad soyad',
            'your_name', 'yourname', 'customer_name', 'user_name', 'username',
            'first_name', 'firstname', 'last_name', 'lastname', 'nameandsurname',
            'field_1', 'field_name', 'field_ad', 'field_isim' // Elementor default IDs
        ],
        email: [
            'email', 'e-mail', 'e_mail', 'mail', 'eposta', 'e-posta', 'e_posta',
            'your_email', 'youremail', 'customer_email', 'user_email',
            'email_address', 'emailaddress', 'e-mail_address', 'email_adresi',
            'field_2', 'field_email', 'field_mail', 'field_eposta' // Elementor
        ],
        phone: [
            'phone', 'telefon', 'tel', 'telephone', 'mobile', 'mobil', 'gsm',
            'phone_number', 'phonenumber', 'telefon_no', 'telefon_numarasi',
            'your_phone', 'yourphone', 'customer_phone', 'user_phone',
            'cell', 'cellphone', 'cep', 'cep_telefonu',
            'field_3', 'field_phone', 'field_tel', 'field_telefon' // Elementor
        ],
        company: [
            'company', 'sirket', 'şirket', 'firma', 'kurum', 'organization',
            'company_name', 'companyname', 'sirket_adi', 'şirket_adı',
            'firma_adi', 'organization_name', 'business', 'business_name'
        ],
        message: [
            'message', 'mesaj', 'msg', 'description', 'aciklama', 'açıklama',
            'your_message', 'yourmessage', 'comment', 'comments', 'yorum',
            'note', 'notes', 'notlar', 'details', 'detaylar', 'text',
            'content', 'icerik', 'içerik', 'inquiry', 'talep',
            'field_4', 'field_message', 'field_mesaj', 'field_textarea' // Elementor
        ],
        subject: [
            'subject', 'konu', 'baslik', 'başlık', 'title', 'topic',
            'your_subject', 'message_subject', 'inquiry_type'
        ],
        product: [
            'product', 'urun', 'ürün', 'service', 'hizmet', 'category',
            'kategori', 'product_name', 'urun_adi', 'service_type',
            'hizmet_turu', 'interest', 'ilgi_alani', 'urun_secimi'
        ],
        city: [
            'city', 'sehir', 'şehir', 'il', 'location', 'konum', 'lokasyon'
        ],
        address: [
            'address', 'adres', 'your_address', 'street', 'sokak'
        ]
    },

    /**
     * Form field adını normalize et (küçük harf, boşluk/tire temizle)
     */
    normalize(fieldName) {
        return fieldName
            .toLowerCase()
            .trim()
            .replace(/[_\-\s]+/g, '') // Alt çizgi, tire ve boşlukları kaldır
            .replace(/[ıİ]/g, 'i')    // Türkçe karakterleri normalize et
            .replace(/[şŞ]/g, 's')
            .replace(/[ğĞ]/g, 'g')
            .replace(/[üÜ]/g, 'u')
            .replace(/[öÖ]/g, 'o')
            .replace(/[çÇ]/g, 'c');
    },

    /**
     * Bir form field'ını CRM field'ına eşleştir
     */
    matchField(formFieldName) {
        const normalized = this.normalize(formFieldName);
        
        // Her CRM field için kontrol et
        for (const [crmField, patterns] of Object.entries(this.patterns)) {
            for (const pattern of patterns) {
                const normalizedPattern = this.normalize(pattern);
                
                // Tam eşleşme
                if (normalized === normalizedPattern) {
                    return crmField;
                }
                
                // Kısmi eşleşme (field adı pattern'i içeriyor)
                if (normalized.includes(normalizedPattern) || normalizedPattern.includes(normalized)) {
                    return crmField;
                }
            }
        }
        
        return null; // Eşleşme bulunamadı
    },

    /**
     * Tüm form data'sını otomatik eşleştir
     */
    autoMap(formData) {
        const mapped = {
            name: null,
            email: null,
            phone: null,
            company: null,
            message: null,
            subject: null,
            product: null,
            city: null,
            address: null,
            unmapped: {} // Eşleşmeyen field'lar
        };

        for (const [fieldName, value] of Object.entries(formData)) {
            // Internal field'ları atla
            if (fieldName.startsWith('_')) continue;
            
            const crmField = this.matchField(fieldName);
            
            if (crmField && mapped.hasOwnProperty(crmField)) {
                // İlk eşleşmeyi kullan (zaten dolu değilse)
                if (!mapped[crmField]) {
                    mapped[crmField] = value;
                }
            } else {
                // Eşleşmeyen field'ı sakla
                mapped.unmapped[fieldName] = value;
            }
        }

        return mapped;
    },

    /**
     * Confidence score hesapla (eşleşme kalitesi)
     */
    getConfidenceScore(formData) {
        const mapped = this.autoMap(formData);
        const totalFields = Object.keys(formData).filter(k => !k.startsWith('_')).length;
        const mappedCount = Object.values(mapped).filter(v => v !== null && typeof v !== 'object').length;
        
        return {
            score: totalFields > 0 ? (mappedCount / totalFields) * 100 : 0,
            mapped: mappedCount,
            total: totalFields,
            confidence: mappedCount >= 2 ? 'high' : mappedCount === 1 ? 'medium' : 'low'
        };
    }
};


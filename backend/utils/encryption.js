import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

// Kullanılacak algoritma
const ALGORITHM = 'aes-256-gcm';

// 32 byte (256 bit) key gerekli
// .env dosyasında ENCRYPTION_KEY tanımlıysa onu kullan, yoksa fallback bir key oluştur (ÖNEMLİ: Prod ortamında mutlaka ENCRYPTION_KEY tanımlanmalı!)
const getEncryptionKey = () => {
    const envKey = process.env.ENCRYPTION_KEY;
    if (envKey) {
        // Eğer env key 32 karakterden uzunsa 32'ye kes, kısaysa pad et
        return crypto.createHash('sha256').update(envKey).digest();
    }
    // Geliştirme ortamı için fallback (uyarı ile)
    console.warn('⚠️ ENCRYPTION_KEY is not defined in .env! Using fallback key. DO NOT USE IN PRODUCTION.');
    return crypto.createHash('sha256').update('instomer_fallback_secret_key_123!').digest();
};

const KEY = getEncryptionKey();

/**
 * Metni şifreler
 * @param {string} text - Şifrelenecek metin
 * @returns {string|null} - Şifrelenmiş veri (hex formatında) veya null
 */
export const encrypt = (text) => {
    if (!text) return null;
    try {
        const iv = crypto.randomBytes(12); // GCM için önerilen IV boyutu 12 byte
        const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag().toString('hex');
        
        // Format: iv:authTag:encryptedData
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (error) {
        console.error('Encryption error:', error);
        return null;
    }
};

/**
 * Şifrelenmiş metni çözer
 * @param {string} encryptedText - Şifrelenmiş veri (hex formatında)
 * @returns {string|null} - Çözülmüş metin veya null
 */
export const decrypt = (encryptedText) => {
    if (!encryptedText) return null;
    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 3) return encryptedText; // Düz metin girildiyse olduğu gibi dön (geriye dönük uyumluluk)
        
        const [ivHex, authTagHex, encryptedDataHex] = parts;
        
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        
        const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error);
        return null;
    }
};

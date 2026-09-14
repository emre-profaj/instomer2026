import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Belirtilen URL'den içeriği çeker.
 * Eğer HTML ise gereksiz tag'leri temizleyerek sadece okunabilir metni döndürür.
 * Eğer JSON (API Feed) ise bunu okunabilir bir düz metne (Key: Value) dönüştürür.
 * 
 * @param {string} url - Taranacak web adresi veya API endpointi
 * @returns {Promise<{title: string, content: string, type: string}>}
 */
export const scrapeUrlContent = async (url) => {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"macOS"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 15000 // 15 saniye zaman aşımı
        });

        const contentType = response.headers['content-type'] || '';

        // Eğer JSON ise (Dinamik Feed)
        if (contentType.includes('application/json')) {
            const jsonData = response.data;
            const parsedText = parseJsonToText(jsonData);
            
            return {
                title: extractFeedTitle(url),
                content: parsedText,
                type: 'FEED'
            };
        } 
        
        // Eğer HTML ise (Web Scraping)
        if (contentType.includes('text/html')) {
            const html = response.data;
            const $ = cheerio.load(html);

            // Gereksiz alanları kaldır
            $('script, style, noscript, iframe, svg, nav, footer, header, .header, .footer, .nav, .menu').remove();

            // Başlığı al
            let title = $('title').text().trim() || $('h1').first().text().trim() || url;

            // Metin içeriğini çıkar (P, H1-H6, LI, TD alanları değerlidir)
            let contentParts = [];
            $('h1, h2, h3, h4, p, li').each((_, element) => {
                const text = $(element).text().replace(/\s+/g, ' ').trim();
                if (text.length > 10) { // Çok kısa, anlamsız metinleri atla
                    contentParts.push(text);
                }
            });

            // Eğer spesifik etiketlerden yeterli veri gelmediyse fallback olarak body textini al
            let finalContent = contentParts.join('\n\n');
            if (finalContent.length < 100) {
                finalContent = $('body').text().replace(/\s+/g, ' ').trim();
            }

            return {
                title: title.substring(0, 100),
                content: finalContent,
                type: 'URL'
            };
        }

        // Bilinmeyen formatlar için düz metin
        return {
            title: url,
            content: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
            type: 'UNKNOWN'
        };

    } catch (error) {
        console.error(`Scrape Error for URL ${url}:`, error.message);
        if (error.response?.status === 403) {
            throw new Error('Bu web sitesi güvenlik/bot koruması (403 Forbidden) nedeniyle otomatik taranmaya izin vermiyor. Lütfen metinleri kopyalayıp "Manuel Ekle" kutusuna yapıştırınız.');
        }
        if (error.response?.status === 404) {
            throw new Error('Belirtilen web sayfası bulunamadı (404 Not Found). Lütfen URL adresini kontrol ediniz.');
        }
        throw new Error(`Web sitesi taranamadı veya ulaşılamadı: ${error.message}`);
    }
};

/**
 * JSON Feed datasını yapay zekanın anlayabileceği "Key: Value" düz metnine çevirir.
 */
function parseJsonToText(obj, prefix = '') {
    if (typeof obj !== 'object' || obj === null) {
        return String(obj);
    }

    let text = '';
    
    if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
            text += `\n--- [Kayıt ${index + 1}] ---\n`;
            text += parseJsonToText(item);
            text += `\n`;
        });
    } else {
        for (const [key, value] of Object.entries(obj)) {
            // Sadece anlamlı (obje/array olmayan basit) değerleri direkt yaz
            if (typeof value !== 'object' || value === null) {
                text += `${prefix}${key}: ${value}\n`;
            } else {
                text += `\n${prefix}[${key}]:\n`;
                text += parseJsonToText(value, prefix + '  ');
            }
        }
    }
    
    return text.trim();
}

/**
 * Feed URL'sinden mantıklı bir başlık çıkarmaya çalışır
 */
function extractFeedTitle(url) {
    try {
        const urlObj = new URL(url);
        let pathName = urlObj.pathname.split('/').pop() || urlObj.hostname;
        return `Data Feed: ${pathName}`;
    } catch {
        return 'Data Feed';
    }
}

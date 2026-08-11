/**
 * Disao CRM Service
 * 
 * Disao CRM API ile iletişim kurar:
 * 1. Login (email + password) → accessToken
 * 2. Customer Add → Bearer token ile müşteri gönder
 * 
 * Token cache'lenir ve expiresIn süresine göre otomatik yenilenir.
 */
import axios from 'axios';
import prisma from '../lib/prisma.js';

const DISAO_BASE_URL = 'https://disao.net/service/api';

class DisaoCrmService {

  constructor() {
    // Token cache: { workspaceId: { token, expiresAt, userId } }
    this.tokenCache = new Map();
  }

  /**
   * Workspace'in Disao CRM ayarlarını getir
   */
  async getSettings(workspaceId) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { disaoCrmEnabled: true, disaoCrmSettings: true }
    });

    if (!workspace?.disaoCrmEnabled) return null;
    if (!workspace.disaoCrmSettings) return null;

    try {
      return typeof workspace.disaoCrmSettings === 'string'
        ? JSON.parse(workspace.disaoCrmSettings)
        : workspace.disaoCrmSettings;
    } catch (e) {
      console.error('[DisaoCRM] Settings parse error:', e);
      return null;
    }
  }

  /**
   * Disao CRM'e login olup token al
   */
  async login(email, password) {
    try {
      const response = await axios.post(`${DISAO_BASE_URL}/login`, {
        email,
        password
      }, {
        headers: { 'Content-Type': 'application/json', 'lang': '2' },
        timeout: 15000
      });

      const data = response.data;

      if (!data.token || !data.result) {
        throw new Error(data.resultMessage || 'Login başarısız');
      }

      return {
        accessToken: data.token,
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: {
          id: data.idUser,
          username: data.name || data.email,
          name: data.name,
          surname: data.surname,
          email: data.email,
          idBuilder: data.idBuilder
        }
      };

    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const msg = error.response.data?.message || error.response.data?.error || 'Bilinmeyen hata';
        throw new Error(`Disao login hatası (${status}): ${msg}`);
      }
      throw new Error(`Disao bağlantı hatası: ${error.message}`);
    }
  }

  /**
   * Cache'deki token'ı al veya yeniden login yap
   */
  async getToken(workspaceId) {
    // Cache kontrol
    const cached = this.tokenCache.get(workspaceId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }

    // Yeni token al
    const settings = await this.getSettings(workspaceId);
    if (!settings?.email || !settings?.password) {
      throw new Error('Disao CRM ayarları eksik (email/password)');
    }

    const loginResult = await this.login(settings.email, settings.password);

    // Cache'e kaydet (expire süresi - 60 saniye güvenlik payı)
    const tokenData = {
      token: loginResult.accessToken,
      expiresAt: Date.now() + ((loginResult.expiresIn - 60) * 1000),
      userId: loginResult.user?.id || null
    };
    this.tokenCache.set(workspaceId, tokenData);

    return tokenData;
  }

  /**
   * Token cache'ini temizle (force re-login)
   */
  clearToken(workspaceId) {
    this.tokenCache.delete(workspaceId);
  }

  /**
   * Kişi verisini Disao formatına dönüştür
   */
  mapContactToDisao(contact, settings, userId) {
    // Ad-soyad ayırma
    const fullName = contact.name || '';
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Telefon numarasını temizle (sadece rakamlar)
    let rawPhone = contact.phone || '';
    let phoneCode = '+90'; // varsayılan

    // Telefon kodunu parse et
    if (rawPhone.startsWith('+')) {
      // +90 5XX... formatı
      if (rawPhone.startsWith('+90')) {
        phoneCode = '+90';
        rawPhone = rawPhone.substring(3);
      } else if (rawPhone.startsWith('+1')) {
        phoneCode = '+1';
        rawPhone = rawPhone.substring(2);
      } else {
        // Diğer ülke kodları (+XX veya +XXX)
        const match = rawPhone.match(/^\+(\d{1,3})/);
        if (match) {
          phoneCode = '+' + match[1];
          rawPhone = rawPhone.substring(match[0].length);
        }
      }
    }

    // Sadece rakamları al
    const phoneNumber = rawPhone.replace(/[^0-9]/g, '');

    return {
      name: firstName,
      surname: lastName,
      phoneNumber,
      mail: contact.email || '',
      job: '',
      idAdvice: settings.idAdvice ? parseInt(settings.idAdvice) : null,
      note: `Kaynak: Instomer | ID: ${contact.id}`,
      phoneCode,
      nationality: 1,
      recordType: 2,
      idProject: settings.idProject ? parseInt(settings.idProject) : null,
      housingUnitType: '',
      customerStatus: 1,
      idUser: userId || null
    };
  }

  /**
   * Müşteriyi Disao CRM'e gönder
   */
  async sendCustomer(workspaceId, contact, source = 'UNKNOWN') {
    try {
      const settings = await this.getSettings(workspaceId);
      if (!settings) {
        console.log('[DisaoCRM] CRM devre dışı veya ayarlar eksik, atlanıyor');
        return null;
      }

      // Token al
      let tokenData = await this.getToken(workspaceId);

      // Veriyi hazırla
      const customerData = this.mapContactToDisao(contact, settings, tokenData.userId);

      // Not alanına kaynak bilgisi ekle
      customerData.note = `Kaynak: ${source} | Instomer ID: ${contact.id} | Tarih: ${new Date().toISOString()}`;

      console.log(`[DisaoCRM] Müşteri gönderiliyor: ${contact.name || contact.phone} (kaynak: ${source})`);

      // API çağrısı
      let response;
      try {
        response = await this.callCustomerAdd(tokenData.token, customerData);
      } catch (error) {
        // 401 ise token yenile ve tekrar dene
        if (error.response?.status === 401) {
          console.log('[DisaoCRM] Token expired, yenileniyor...');
          this.clearToken(workspaceId);
          tokenData = await this.getToken(workspaceId);
          customerData.idUser = tokenData.userId;
          response = await this.callCustomerAdd(tokenData.token, customerData);
        } else {
          throw error;
        }
      }

      console.log(`[DisaoCRM] ✅ Müşteri başarıyla gönderildi: ${contact.name || contact.phone} → ID: ${response.data?.id || 'N/A'}`);

      // Activity log kaydet
      try {
        const conversation = await prisma.conversation.findFirst({
          where: { contactId: contact.id, workspaceId },
          orderBy: { updatedAt: 'desc' }
        });

        if (conversation) {
          await prisma.conversationEvent.create({
            data: {
              conversationId: conversation.id,
              contactId: contact.id,
              workspaceId,
              eventType: 'DISAO_CRM_SYNC',
              title: 'Disao CRM Senkronizasyonu',
              details: JSON.stringify({
                disaoCustomerId: response.data?.id,
                source,
                sentAt: new Date().toISOString(),
                status: 'SUCCESS'
              }),
              actorType: 'SYSTEM'
            }
          });
        }
      } catch (logErr) {
        console.error('[DisaoCRM] Activity log error:', logErr);
      }

      return response.data;

    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      // 409 Conflict = müşteri zaten var — logla ama hata fırlatma
      if (status === 409) {
        console.log(`[DisaoCRM] ⚠️ Müşteri zaten mevcut: ${contact.name || contact.phone}`);
        return { duplicate: true, message };
      }

      console.error(`[DisaoCRM] ❌ Müşteri gönderilemedi (${status || 'N/A'}): ${message}`);
      throw error;
    }
  }

  /**
   * Disao customer/add API çağrısı
   */
  async callCustomerAdd(accessToken, customerData) {
    return axios.post(`${DISAO_BASE_URL}/customer/add`, customerData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'lang': '2'
      },
      timeout: 15000
    });
  }

  /**
   * Bağlantı testi — login yapıp sonucu döndür
   */
  async testConnection(email, password) {
    try {
      const result = await this.login(email, password);
      return {
        success: true,
        message: 'Bağlantı başarılı',
        user: result.user
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }
}

export default new DisaoCrmService();

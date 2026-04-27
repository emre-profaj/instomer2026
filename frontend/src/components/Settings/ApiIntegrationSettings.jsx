import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { apiIntegrationAPI } from '../../services/api';
import { Key, Plus, Trash2, Edit2, Lock, Link as LinkIcon, Check, X } from 'lucide-react';
import './ApiIntegrationSettings.css';

const ApiIntegrationSettings = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    
    const [integrations, setIntegrations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingIntegration, setEditingIntegration] = useState(null);
    
    const [formData, setFormData] = useState({
        name: '',
        baseUrl: '',
        authType: 'NONE',
        authToken: '',
        apiKey: '',
        apiSecret: ''
    });

    useEffect(() => {
        if (currentWorkspace) {
            fetchIntegrations();
        }
    }, [currentWorkspace]);

    const fetchIntegrations = async () => {
        try {
            setLoading(true);
            const res = await apiIntegrationAPI.getAll(currentWorkspace.id);
            // OAUTH_PASSWORD tipli entegrasyonlar (Sağlık Sistemi vs.) ayrı bir modal/ekran üzerinden yönetildiği için 
            // genel Harici Sistem API'leri listesinden gizliyoruz.
            const filteredIntegrations = (res.data.integrations || []).filter(int => int.authType !== 'OAUTH_PASSWORD');
            setIntegrations(filteredIntegrations);
        } catch (error) {
            console.error('Error fetching integrations:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (integration = null) => {
        if (integration) {
            setEditingIntegration(integration);
            setFormData({
                name: integration.name || '',
                baseUrl: integration.baseUrl || '',
                authType: integration.authType || 'NONE',
                authToken: integration.authToken ? '********' : '',
                apiKey: integration.apiKey ? '********' : '',
                apiSecret: integration.apiSecret ? '********' : ''
            });
        } else {
            setEditingIntegration(null);
            setFormData({
                name: '',
                baseUrl: '',
                authType: 'NONE',
                authToken: '',
                apiKey: '',
                apiSecret: ''
            });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingIntegration) {
                await apiIntegrationAPI.update(currentWorkspace.id, editingIntegration.id, formData);
            } else {
                await apiIntegrationAPI.create(currentWorkspace.id, formData);
            }
            setShowModal(false);
            fetchIntegrations();
        } catch (error) {
            console.error('Save error:', error);
            alert('Entegrasyon kaydedilirken bir hata oluştu.');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Bu API entegrasyonunu silmek istediğinizden emin misiniz? Buna bağlı bot özellikleri çalışmayabilir.')) return;
        try {
            await apiIntegrationAPI.delete(currentWorkspace.id, id);
            fetchIntegrations();
        } catch (error) {
            console.error('Delete error:', error);
            alert('Silinirken bir hata oluştu.');
        }
    };

    return (
        <div className="api-integrations-section">
            <div className="api-integrations-header">
                <div className="section-title">
                    <Key size={20} className="text-primary" />
                    <h3>Harici Sistem API Bağlantıları</h3>
                </div>
                <button className="btn-primary-sm" onClick={() => handleOpenModal()}>
                    <Plus size={16} /> Yeni Ekle
                </button>
            </div>
            
            <p className="section-description">
                Yapay zeka botlarınızın harici sistemlere (örn: Kargo, Randevu vb.) istek atabilmesi için API bağlantı profilleri oluşturun.
            </p>

            {loading ? (
                <div className="loading">Yükleniyor...</div>
            ) : integrations.length === 0 ? (
                <div className="empty-state-small">
                    <LinkIcon size={32} />
                    <p>Henüz bir API bağlantısı tanımlanmamış.</p>
                </div>
            ) : (
                <div className="integrations-grid">
                    {integrations.map(integration => (
                        <div key={integration.id} className="integration-card">
                            <div className="integration-info">
                                <h4>{integration.name}</h4>
                                <span className="integration-url">{integration.baseUrl}</span>
                                <div className="integration-badges">
                                    <span className={`badge auth-${integration.authType.toLowerCase()}`}>
                                        <Lock size={12} /> {integration.authType}
                                    </span>
                                </div>
                            </div>
                            <div className="integration-actions">
                                <button className="btn-icon-sm" onClick={() => handleOpenModal(integration)}>
                                    <Edit2 size={16} />
                                </button>
                                <button className="btn-icon-sm text-danger" onClick={() => handleDelete(integration.id)}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2>{editingIntegration ? 'API Bağlantısını Düzenle' : 'Yeni API Bağlantısı Ekle'}</h2>
                            <button className="btn-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-form">
                            <div className="form-group">
                                <label>Bağlantı Adı (Örn: MNG Kargo API)</label>
                                <input 
                                    type="text" 
                                    value={formData.name} 
                                    onChange={e => setFormData({...formData, name: e.target.value})} 
                                    required 
                                />
                            </div>
                            <div className="form-group">
                                <label>Base URL (Örn: https://api.mngkargo.com.tr)</label>
                                <input 
                                    type="url" 
                                    value={formData.baseUrl} 
                                    onChange={e => setFormData({...formData, baseUrl: e.target.value})} 
                                    required 
                                />
                            </div>
                            <div className="form-group">
                                <label>Kimlik Doğrulama Tipi</label>
                                <select 
                                    value={formData.authType} 
                                    onChange={e => setFormData({...formData, authType: e.target.value})}
                                >
                                    <option value="NONE">Yok (Açık API)</option>
                                    <option value="BEARER">Bearer Token</option>
                                    <option value="BASIC">Basic Auth</option>
                                    <option value="API_KEY">API Key (X-API-Key)</option>
                                </select>
                            </div>

                            {formData.authType === 'BEARER' && (
                                <div className="form-group">
                                    <label>Token (Şifreli saklanacaktır)</label>
                                    <input 
                                        type="password" 
                                        placeholder={editingIntegration && formData.authToken === '********' ? 'Değiştirmek için yeni token girin...' : 'Bearer Token girin...'}
                                        value={formData.authToken} 
                                        onChange={e => setFormData({...formData, authToken: e.target.value})} 
                                    />
                                </div>
                            )}

                            {formData.authType === 'BASIC' && (
                                <>
                                    <div className="form-group">
                                        <label>Kullanıcı Adı (Şifreli saklanacaktır)</label>
                                        <input 
                                            type="password" 
                                            value={formData.authToken} 
                                            onChange={e => setFormData({...formData, authToken: e.target.value})} 
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Şifre (Şifreli saklanacaktır)</label>
                                        <input 
                                            type="password" 
                                            value={formData.apiSecret} 
                                            onChange={e => setFormData({...formData, apiSecret: e.target.value})} 
                                        />
                                    </div>
                                </>
                            )}

                            {formData.authType === 'API_KEY' && (
                                <div className="form-group">
                                    <label>API Key (Şifreli saklanacaktır)</label>
                                    <input 
                                        type="password" 
                                        value={formData.apiKey} 
                                        onChange={e => setFormData({...formData, apiKey: e.target.value})} 
                                    />
                                </div>
                            )}

                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>İptal</button>
                                <button type="submit" className="btn-primary">
                                    {editingIntegration ? 'Güncelle' : 'Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ApiIntegrationSettings;

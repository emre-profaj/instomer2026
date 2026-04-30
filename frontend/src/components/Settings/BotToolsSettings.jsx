import React, { useState, useEffect } from 'react';
import { apiIntegrationAPI } from '../../services/api';
import { Wrench, Plus, Trash2, Edit2, Link as LinkIcon, Check, X } from 'lucide-react';
import './ApiIntegrationSettings.css'; // Aynı CSS'i kullanabiliriz

const BotToolsSettings = ({ workspaceId }) => {
    const [tools, setTools] = useState([]);
    const [integrations, setIntegrations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingTool, setEditingTool] = useState(null);

    const [formData, setFormData] = useState({
        apiIntegrationId: '',
        name: '',
        description: '',
        method: 'GET',
        endpoint: '',
        parametersSchema: '',
        isActive: true
    });

    useEffect(() => {
        if (workspaceId) {
            fetchData();
        }
    }, [workspaceId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [toolsRes, integrationsRes] = await Promise.all([
                apiIntegrationAPI.getBotTools(workspaceId),
                apiIntegrationAPI.getAll(workspaceId)
            ]);
            setTools(toolsRes.data.tools || []);
            setIntegrations(integrationsRes.data.integrations || []);
        } catch (error) {
            console.error('Error fetching bot tools:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (tool = null) => {
        if (tool) {
            setEditingTool(tool);
            setFormData({
                apiIntegrationId: tool.apiIntegrationId || '',
                name: tool.name || '',
                description: tool.description || '',
                method: tool.method || 'GET',
                endpoint: tool.endpoint || '',
                parametersSchema: tool.parametersSchema || '',
                isActive: tool.isActive !== false
            });
        } else {
            setEditingTool(null);
            setFormData({
                apiIntegrationId: integrations.length > 0 ? integrations[0].id : '',
                name: '',
                description: '',
                method: 'GET',
                endpoint: '',
                parametersSchema: '{\n  "type": "object",\n  "properties": {\n    "param_name": {\n      "type": "string",\n      "description": "Açıklama"\n    }\n  }\n}',
                isActive: true
            });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // Şemayı validate et
            if (formData.parametersSchema) {
                try {
                    JSON.parse(formData.parametersSchema);
                } catch (err) {
                    alert('Parametre şeması geçerli bir JSON değil.');
                    return;
                }
            }

            if (editingTool) {
                await apiIntegrationAPI.updateBotTool(workspaceId, editingTool.id, formData);
            } else {
                await apiIntegrationAPI.createBotTool(workspaceId, formData);
            }
            setShowModal(false);
            fetchData();
        } catch (error) {
            console.error('Save error:', error);
            alert('Araç kaydedilirken bir hata oluştu.');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Bu aracı silmek istediğinizden emin misiniz?')) return;
        try {
            await apiIntegrationAPI.deleteBotTool(workspaceId, id);
            fetchData();
        } catch (error) {
            console.error('Delete error:', error);
            alert('Silinirken bir hata oluştu.');
        }
    };

    return (
        <div className="bot-settings-section">
            <div className="section-header-toggle">
                <div className="section-title-group">
                    <Wrench size={18} />
                    <span>Akıllı Özellikler (Tools)</span>
                </div>
                <button className="btn-modern btn-primary" onClick={() => handleOpenModal()} style={{ padding: '4px 8px', fontSize: '12px' }}>
                    <Plus size={14} /> Yeni Ekle
                </button>
            </div>
            
            <div className="section-content">
                <p className="section-description">
                    Botunuza harici sistemlerde işlem yapabilmesi için yetenekler (araçlar) ekleyin. 
                    Örneğin: Kargo Durumu Sorgulama, Randevu Oluşturma.
                </p>

                {loading ? (
                    <div className="loading" style={{ fontSize: '12px' }}>Yükleniyor...</div>
                ) : tools.length === 0 ? (
                    <p className="text-muted" style={{ fontSize: '13px' }}>Henüz araca tanımlı değil.</p>
                ) : (
                    <div className="integrations-grid">
                        {tools.map(tool => (
                            <div key={tool.id} className="integration-card" style={{ padding: '0.75rem' }}>
                                <div className="integration-info">
                                    <h4 style={{ fontSize: '14px', marginBottom: '4px' }}>
                                        {tool.name} 
                                        {!tool.isActive && <span style={{ color: 'red', fontSize: '10px', marginLeft: '4px' }}>(Pasif)</span>}
                                    </h4>
                                    <span className="integration-url" style={{ fontSize: '11px', marginBottom: '4px' }}>
                                        {tool.method} {tool.apiIntegration?.name} {tool.endpoint}
                                    </span>
                                    <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                                        {tool.description}
                                    </p>
                                </div>
                                <div className="integration-actions">
                                    <button className="btn-icon-sm" onClick={() => handleOpenModal(tool)}>
                                        <Edit2 size={14} />
                                    </button>
                                    <button className="btn-icon-sm text-danger" onClick={() => handleDelete(tool.id)}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '600px' }}>
                        <div className="modal-header">
                            <h2>{editingTool ? 'Aracı Düzenle' : 'Yeni Araç Ekle'}</h2>
                            <button type="button" className="btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-form" style={{ padding: '1rem', maxHeight: '70vh', overflowY: 'auto' }}>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label className="form-label-sm">API Bağlantısı (Nereye istek atılacak?)</label>
                                <select 
                                    className="input-modern"
                                    value={formData.apiIntegrationId} 
                                    onChange={e => setFormData({...formData, apiIntegrationId: e.target.value})}
                                    required
                                >
                                    <option value="">-- API Bağlantısı Seçin --</option>
                                    {integrations.map(integ => (
                                        <option key={integ.id} value={integ.id}>{integ.name} ({integ.baseUrl})</option>
                                    ))}
                                </select>
                                {integrations.length === 0 && (
                                    <small style={{ color: 'red', marginTop: '4px', display: 'block' }}>
                                        Önce "Kanallar" sayfasından API Bağlantısı oluşturmalısınız!
                                    </small>
                                )}
                            </div>

                            <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label-sm">Araç Adı (İngilizce ve boşluksuz önerilir)</label>
                                    <input 
                                        type="text" 
                                        className="input-modern"
                                        placeholder="örn: get_cargo_status"
                                        value={formData.name} 
                                        onChange={e => setFormData({...formData, name: e.target.value})} 
                                        required 
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label-sm">Durum</label>
                                    <select 
                                        className="input-modern"
                                        value={formData.isActive ? 'true' : 'false'} 
                                        onChange={e => setFormData({...formData, isActive: e.target.value === 'true'})}
                                    >
                                        <option value="true">Aktif</option>
                                        <option value="false">Pasif</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label className="form-label-sm">Açıklama (Bot bu aracı ne zaman kullanacağını buradan anlar)</label>
                                <textarea 
                                    className="input-modern"
                                    rows="2"
                                    placeholder="Kargo takip numarası ile kargonun durumunu sorgular."
                                    value={formData.description} 
                                    onChange={e => setFormData({...formData, description: e.target.value})} 
                                    required 
                                />
                            </div>

                            <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label-sm">Metod</label>
                                    <select 
                                        className="input-modern"
                                        value={formData.method} 
                                        onChange={e => setFormData({...formData, method: e.target.value})}
                                    >
                                        <option value="GET">GET</option>
                                        <option value="POST">POST</option>
                                        <option value="PUT">PUT</option>
                                        <option value="DELETE">DELETE</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label-sm">Endpoint (Bağlantı Base URL'inin sonuna eklenir)</label>
                                    <input 
                                        type="text" 
                                        className="input-modern"
                                        placeholder="örn: /api/v1/cargo-status"
                                        value={formData.endpoint} 
                                        onChange={e => setFormData({...formData, endpoint: e.target.value})} 
                                        required 
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label-sm">Parametre Şeması (JSON Schema - Opsiyonel ama önerilir)</label>
                                <textarea 
                                    className="input-modern"
                                    rows="6"
                                    style={{ fontFamily: 'monospace', fontSize: '12px' }}
                                    value={formData.parametersSchema} 
                                    onChange={e => setFormData({...formData, parametersSchema: e.target.value})} 
                                />
                                <small style={{ color: '#6b7280', display: 'block', marginTop: '4px' }}>
                                    Gemini API'nin beklediği 'parameters' JSON formatıdır.
                                </small>
                            </div>

                            <div className="modal-actions" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" className="btn-modern btn-secondary" onClick={() => setShowModal(false)}>İptal</button>
                                <button type="submit" className="btn-modern btn-primary" disabled={integrations.length === 0}>
                                    {editingTool ? 'Güncelle' : 'Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BotToolsSettings;

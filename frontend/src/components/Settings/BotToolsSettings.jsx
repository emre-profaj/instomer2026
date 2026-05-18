import React, { useState, useEffect } from 'react';
import { apiIntegrationAPI } from '../../services/api';
import { Wrench, Plus, Trash2, Edit2, Check, X, Zap, Globe, FlaskConical, ChevronDown, ChevronUp } from 'lucide-react';
import './ApiIntegrationSettings.css';

// ─── Probel dahili fonksiyonlar ──────────────────────────────────────────────
const PROBEL_BUILT_IN_TOOLS = [
    {
        name: 'probel_list_branches',
        label: 'Branş Listele',
        description: 'Hastanedeki tüm aktif branşları (bölümleri) Probel sisteminden listeler.',
        method: 'BUILTIN',
        endpoint: '__builtin__',
        parametersSchema: JSON.stringify({ type: 'object', properties: {}, required: [] }, null, 2)
    },
    {
        name: 'probel_list_doctors',
        label: 'Doktor Listele',
        description: 'Belirli bir branştaki doktorları Probel sisteminden listeler.',
        method: 'BUILTIN',
        endpoint: '__builtin__',
        parametersSchema: JSON.stringify({
            type: 'object',
            properties: {
                branch_name: { type: 'string', description: 'Branş adı (ör: Kardiyoloji)' },
                brans_kodu: { type: 'string', description: 'Branş kodu (opsiyonel, varsa daha hızlı)' }
            },
            required: ['branch_name']
        }, null, 2)
    },
    {
        name: 'probel_check_doctor',
        label: 'Doktor Kontrol Et',
        description: 'Belirtilen isimde bir doktorun sistemde çalışıp çalışmadığını kontrol eder.',
        method: 'BUILTIN',
        endpoint: '__builtin__',
        parametersSchema: JSON.stringify({
            type: 'object',
            properties: {
                doctor_name: { type: 'string', description: 'Doktor adı (ör: Dr. Ahmet Yılmaz veya sadece Ahmet)' }
            },
            required: ['doctor_name']
        }, null, 2)
    }
];

const BotToolsSettings = ({ workspaceId }) => {
    const [tools, setTools] = useState([]);
    const [integrations, setIntegrations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingTool, setEditingTool] = useState(null);
    const [probelExpanded, setProbelExpanded] = useState(true);
    const [customExpanded, setCustomExpanded] = useState(true);

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
        if (workspaceId) fetchData();
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

    // Probel built-in tool aktif mi?
    const isProbelToolActive = (toolName) => tools.some(t => t.name === toolName && t.isActive);
    const getProbelTool = (toolName) => tools.find(t => t.name === toolName);

    const toggleProbelTool = async (builtIn) => {
        const existing = getProbelTool(builtIn.name);
        try {
            if (existing) {
                // Toggle aktif/pasif
                await apiIntegrationAPI.updateBotTool(workspaceId, existing.id, {
                    isActive: !existing.isActive
                });
            } else {
                // Yeni oluştur
                await apiIntegrationAPI.createBotTool(workspaceId, {
                    apiIntegrationId: null,
                    name: builtIn.name,
                    description: builtIn.description,
                    method: builtIn.method,
                    endpoint: builtIn.endpoint,
                    parametersSchema: builtIn.parametersSchema,
                    isActive: true
                });
            }
            fetchData();
        } catch (error) {
            console.error('Toggle probel tool error:', error);
            alert('İşlem sırasında bir hata oluştu.');
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
                parametersSchema: '{\n  "type": "object",\n  "properties": {\n    "param_name": {\n      "type": "string",\n      "description": "Parametre açıklaması"\n    }\n  }\n}',
                isActive: true
            });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (formData.parametersSchema) {
                try {
                    JSON.parse(formData.parametersSchema);
                } catch {
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
        if (!window.confirm('Bu fonksiyonu silmek istediğinizden emin misiniz?')) return;
        try {
            await apiIntegrationAPI.deleteBotTool(workspaceId, id);
            fetchData();
        } catch (error) {
            console.error('Delete error:', error);
            alert('Silinirken bir hata oluştu.');
        }
    };

    // Probel tool'larını hariç tut (custom listedeyken)
    const customTools = tools.filter(t => !PROBEL_BUILT_IN_TOOLS.some(p => p.name === t.name));

    return (
        <div className="bot-settings-section">

            {/* ─── PROBEL BÖLÜMÜ ─── */}
            <div className="tool-section-block">
                <div
                    className="tool-section-header"
                    onClick={() => setProbelExpanded(v => !v)}
                    style={{ cursor: 'pointer' }}
                >
                    <div className="section-title-group">
                        <Zap size={18} style={{ color: '#8b5cf6' }} />
                        <span>Probel Sağlık Sistemi Fonksiyonları</span>
                        <span className="badge-pill badge-purple">Dahili</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>
                            {PROBEL_BUILT_IN_TOOLS.filter(t => isProbelToolActive(t.name)).length}/{PROBEL_BUILT_IN_TOOLS.length} aktif
                        </span>
                        {probelExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                </div>

                {probelExpanded && (
                    <div className="tool-section-body">
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 12px 0' }}>
                            Asistan, müşteri "doktor var mı?", "hangi branşlar var?" gibi sorular sorduğunda
                            bu fonksiyonları otomatik olarak Probel HBYS sistemine çağırır.
                        </p>
                        <div className="probel-tools-grid">
                            {PROBEL_BUILT_IN_TOOLS.map(builtIn => {
                                const existing = getProbelTool(builtIn.name);
                                const active = existing?.isActive;
                                return (
                                    <div
                                        key={builtIn.name}
                                        className={`probel-tool-card ${active ? 'active' : ''}`}
                                    >
                                        <div className="probel-tool-info">
                                            <div className="probel-tool-name">
                                                <Zap size={14} />
                                                {builtIn.label}
                                            </div>
                                            <p className="probel-tool-desc">{builtIn.description}</p>
                                            <code className="probel-tool-code">{builtIn.name}</code>
                                        </div>
                                        <button
                                            className={`toggle-btn ${active ? 'toggle-on' : 'toggle-off'}`}
                                            onClick={() => toggleProbelTool(builtIn)}
                                        >
                                            {active ? <Check size={14} /> : <Plus size={14} />}
                                            {active ? 'Aktif' : 'Etkinleştir'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* ─── ÖZEL API FONKSİYONLARI ─── */}
            <div className="tool-section-block" style={{ marginTop: '16px' }}>
                <div
                    className="tool-section-header"
                    onClick={() => setCustomExpanded(v => !v)}
                    style={{ cursor: 'pointer' }}
                >
                    <div className="section-title-group">
                        <Globe size={18} style={{ color: '#3b82f6' }} />
                        <span>Özel API Fonksiyonları</span>
                        <span className="badge-pill badge-blue">Dış API</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                            className="btn-modern btn-primary"
                            onClick={(e) => { e.stopPropagation(); handleOpenModal(); }}
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                        >
                            <Plus size={14} /> Yeni Fonksiyon
                        </button>
                        {customExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                </div>

                {customExpanded && (
                    <div className="tool-section-body">
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 12px 0' }}>
                            Kargo takip, ürün fiyat kontrolü, stok sorgulama gibi dış API kaynaklarınıza
                            bağlanan özel fonksiyonlar tanımlayın. Asistan bu fonksiyonları gerektiğinde otomatik çağırır.
                        </p>

                        {loading ? (
                            <div className="loading" style={{ fontSize: '12px' }}>Yükleniyor...</div>
                        ) : customTools.length === 0 ? (
                            <div className="empty-state-small">
                                <FlaskConical size={24} style={{ color: '#d1d5db', marginBottom: '8px' }} />
                                <p>Henüz özel fonksiyon tanımlanmadı.</p>
                                <small>Önce "API Bağlantıları" sekmesinden kaynak ekleyin, ardından buradan fonksiyon tanımlayın.</small>
                            </div>
                        ) : (
                            <div className="integrations-grid">
                                {customTools.map(tool => (
                                    <div key={tool.id} className="integration-card" style={{ padding: '0.75rem' }}>
                                        <div className="integration-info">
                                            <h4 style={{ fontSize: '14px', marginBottom: '4px' }}>
                                                {tool.name}
                                                {!tool.isActive && <span style={{ color: 'red', fontSize: '10px', marginLeft: '4px' }}>(Pasif)</span>}
                                            </h4>
                                            <span className="integration-url" style={{ fontSize: '11px', marginBottom: '4px' }}>
                                                {tool.method} · {tool.apiIntegration?.name || 'API Bağlantısı Yok'} · {tool.endpoint}
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
                )}
            </div>

            {/* ─── MODAL ─── */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '600px' }}>
                        <div className="modal-header">
                            <h2>{editingTool ? 'Fonksiyonu Düzenle' : 'Yeni Özel Fonksiyon'}</h2>
                            <button type="button" className="btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-form" style={{ padding: '1rem', maxHeight: '70vh', overflowY: 'auto' }}>

                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label className="form-label-sm">API Bağlantısı (Bu fonksiyonun çağıracağı sistem)</label>
                                <select
                                    className="input-modern"
                                    value={formData.apiIntegrationId}
                                    onChange={e => setFormData({ ...formData, apiIntegrationId: e.target.value })}
                                    required
                                >
                                    <option value="">-- API Bağlantısı Seçin --</option>
                                    {integrations.map(integ => (
                                        <option key={integ.id} value={integ.id}>{integ.name} ({integ.baseUrl})</option>
                                    ))}
                                </select>
                                {integrations.length === 0 && (
                                    <small style={{ color: '#ef4444', marginTop: '4px', display: 'block' }}>
                                        Önce "1. API Bağlantıları" sekmesinden bir bağlantı oluşturun.
                                    </small>
                                )}
                            </div>

                            <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label-sm">Fonksiyon Adı (snake_case önerilir)</label>
                                    <input
                                        type="text"
                                        className="input-modern"
                                        placeholder="örn: check_cargo_status"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label-sm">Durum</label>
                                    <select
                                        className="input-modern"
                                        value={formData.isActive ? 'true' : 'false'}
                                        onChange={e => setFormData({ ...formData, isActive: e.target.value === 'true' })}
                                    >
                                        <option value="true">Aktif</option>
                                        <option value="false">Pasif</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label className="form-label-sm">Açıklama (Asistan bu açıklamaya göre fonksiyonu ne zaman kullanacağını anlar)</label>
                                <textarea
                                    className="input-modern"
                                    rows="2"
                                    placeholder="örn: Kargo takip numarası ile kargonun güncel durumunu sorgular."
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label-sm">Metod</label>
                                    <select
                                        className="input-modern"
                                        value={formData.method}
                                        onChange={e => setFormData({ ...formData, method: e.target.value })}
                                    >
                                        <option value="GET">GET</option>
                                        <option value="POST">POST</option>
                                        <option value="PUT">PUT</option>
                                        <option value="DELETE">DELETE</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label-sm">Endpoint (Base URL'ine eklenir)</label>
                                    <input
                                        type="text"
                                        className="input-modern"
                                        placeholder="örn: /api/v1/cargo/track"
                                        value={formData.endpoint}
                                        onChange={e => setFormData({ ...formData, endpoint: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label-sm">Parametre Şeması (JSON Schema — asistanın hangi bilgileri toplayacağını belirtir)</label>
                                <textarea
                                    className="input-modern"
                                    rows="6"
                                    style={{ fontFamily: 'monospace', fontSize: '12px' }}
                                    value={formData.parametersSchema}
                                    onChange={e => setFormData({ ...formData, parametersSchema: e.target.value })}
                                />
                                <small style={{ color: '#6b7280', display: 'block', marginTop: '4px' }}>
                                    Gemini Function Calling formatı. Boş bırakılabilir.
                                </small>
                            </div>

                            <div className="modal-actions" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" className="btn-modern btn-secondary" onClick={() => setShowModal(false)}>İptal</button>
                                <button type="submit" className="btn-modern btn-primary" disabled={!formData.apiIntegrationId}>
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

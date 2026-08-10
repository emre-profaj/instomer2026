import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
    getIntegrations, createIntegration, updateIntegration, deleteIntegration,
    getBotTools, createBotTool, updateBotTool, deleteBotTool
} from '../../services/apiIntegration.api';
import './Integrations.css';

const Integrations = () => {
    const { currentWorkspace } = useAuth();
    const workspaceId = currentWorkspace?.id;
    
    const [activeTab, setActiveTab] = useState('API'); // API, TOOLS, WEBHOOKS
    const [integrations, setIntegrations] = useState([]);
    const [tools, setTools] = useState([]);
    const [loading, setLoading] = useState(false);
    
    const [showApiForm, setShowApiForm] = useState(false);
    const [editApiId, setEditApiId] = useState(null);
    const [apiForm, setApiForm] = useState({
        name: '', baseUrl: '', authType: 'NONE', authToken: '', apiKey: '', apiSecret: '', headers: '', assignedBotId: ''
    });

    const [showToolForm, setShowToolForm] = useState(false);
    const [editToolId, setEditToolId] = useState(null);
    const [toolForm, setToolForm] = useState({
        name: '', description: '', method: 'GET', endpoint: '', parametersSchema: '', apiIntegrationId: ''
    });

    useEffect(() => {
        if (workspaceId) {
            fetchData();
        }
    }, [workspaceId, activeTab]);

    const fetchData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'API' || activeTab === 'TOOLS') {
                const apiRes = await getIntegrations(workspaceId);
                setIntegrations(apiRes.integrations || []);
            }
            if (activeTab === 'TOOLS') {
                const toolsRes = await getBotTools(workspaceId);
                setTools(toolsRes.tools || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // --- API Integrations ---
    const handleApiSave = async (e) => {
        e.preventDefault();
        try {
            const data = { ...apiForm };
            if (data.headers) {
                try { JSON.parse(data.headers); } catch(e) { return alert('Headers geçerli bir JSON olmalıdır.'); }
            }
            
            if (editApiId) {
                await updateIntegration(workspaceId, editApiId, data);
            } else {
                await createIntegration(workspaceId, data);
            }
            setShowApiForm(false);
            setEditApiId(null);
            fetchData();
        } catch (err) {
            alert('Hata oluştu: ' + err.message);
        }
    };

    const handleApiEdit = (item) => {
        setApiForm({
            name: item.name || '',
            baseUrl: item.baseUrl || '',
            authType: item.authType || 'NONE',
            authToken: item.authToken || '',
            apiKey: item.apiKey || '',
            apiSecret: item.apiSecret || '',
            headers: item.headers || '',
            assignedBotId: item.assignedBotId || ''
        });
        setEditApiId(item.id);
        setShowApiForm(true);
    };

    const handleApiDelete = async (id) => {
        if (!window.confirm('Bu API bağlantısını silmek istediğinize emin misiniz?')) return;
        try {
            await deleteIntegration(workspaceId, id);
            fetchData();
        } catch (err) {
            console.error(err);
        }
    };

    // --- Bot Tools ---
    const handleToolSave = async (e) => {
        e.preventDefault();
        try {
            const data = { ...toolForm };
            if (data.parametersSchema) {
                try { JSON.parse(data.parametersSchema); } catch(e) { return alert('Parametreler geçerli bir JSON Schema olmalıdır.'); }
            }
            
            if (editToolId) {
                await updateBotTool(workspaceId, editToolId, data);
            } else {
                await createBotTool(workspaceId, data);
            }
            setShowToolForm(false);
            setEditToolId(null);
            fetchData();
        } catch (err) {
            alert('Hata oluştu: ' + err.message);
        }
    };

    const handleToolEdit = (item) => {
        setToolForm({
            name: item.name || '',
            description: item.description || '',
            method: item.method || 'GET',
            endpoint: item.endpoint || '',
            parametersSchema: item.parametersSchema || '',
            apiIntegrationId: item.apiIntegrationId || ''
        });
        setEditToolId(item.id);
        setShowToolForm(true);
    };

    const handleToolDelete = async (id) => {
        if (!window.confirm('Bu bot aracını silmek istediğinize emin misiniz?')) return;
        try {
            await deleteBotTool(workspaceId, id);
            fetchData();
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="integrations-page">
            <div className="integrations-header">
                <div>
                    <h1>Entegrasyonlar ve Bot Araçları</h1>
                    <p>Dış sistem bağlantılarınızı ve AI botlarınızın kullanacağı araçları (fonksiyonları) yönetin.</p>
                </div>
                {activeTab === 'API' && !showApiForm && (
                    <button onClick={() => { setEditApiId(null); setApiForm({name:'', baseUrl:'', authType:'NONE', authToken:'', apiKey:'', apiSecret:'', headers:'', assignedBotId:''}); setShowApiForm(true); }} className="btn-add-integration">
                        + Yeni API Bağlantısı
                    </button>
                )}
                {activeTab === 'TOOLS' && !showToolForm && (
                    <button onClick={() => { setEditToolId(null); setToolForm({name:'', description:'', method:'GET', endpoint:'', parametersSchema:'', apiIntegrationId:''}); setShowToolForm(true); }} className="btn-add-integration">
                        + Yeni Bot Aracı
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="integrations-tabs">
                <button onClick={() => { setActiveTab('API'); setShowApiForm(false); setShowToolForm(false); }} className={`integration-tab-btn ${activeTab === 'API' ? 'active' : ''}`}>
                    API Bağlantıları
                </button>
                <button onClick={() => { setActiveTab('TOOLS'); setShowApiForm(false); setShowToolForm(false); }} className={`integration-tab-btn ${activeTab === 'TOOLS' ? 'active' : ''}`}>
                    Bot Araçları (Fonksiyonlar)
                </button>
                <button disabled className="integration-tab-btn disabled" title="Yakında!">
                    Giden Webhooklar (Yakında)
                </button>
            </div>

            {/* API FORM */}
            {showApiForm && activeTab === 'API' && (
                <form onSubmit={handleApiSave} className="integration-form-card">
                    <h3>{editApiId ? 'API Bağlantısını Düzenle' : 'Yeni API Bağlantısı Ekle'}</h3>
                    <div className="form-grid">
                        <div className="form-field">
                            <label>Bağlantı Adı</label>
                            <input required type="text" value={apiForm.name} onChange={e => setApiForm({...apiForm, name: e.target.value})} className="form-input" placeholder="Örn: Hastane CRM API" />
                        </div>
                        <div className="form-field">
                            <label>Base URL</label>
                            <input required type="text" value={apiForm.baseUrl} onChange={e => setApiForm({...apiForm, baseUrl: e.target.value})} className="form-input" placeholder="https://api.hastane.com/v1" />
                        </div>
                        <div className="form-field">
                            <label>Kimlik Doğrulama Tipi</label>
                            <select value={apiForm.authType} onChange={e => setApiForm({...apiForm, authType: e.target.value})} className="form-select">
                                <option value="NONE">Yok</option>
                                <option value="BEARER">Bearer Token</option>
                                <option value="API_KEY">API Key</option>
                                <option value="BASIC">Basic Auth (Base64)</option>
                            </select>
                        </div>
                        {apiForm.authType === 'BEARER' && (
                            <div className="form-field">
                                <label>Bearer Token</label>
                                <input type="password" value={apiForm.authToken} onChange={e => setApiForm({...apiForm, authToken: e.target.value})} className="form-input" placeholder="eyJhbGci..." />
                            </div>
                        )}
                        {apiForm.authType === 'API_KEY' && (
                            <>
                                <div className="form-field">
                                    <label>API Key Header / Param Adı</label>
                                    <input type="text" value={apiForm.apiKey} onChange={e => setApiForm({...apiForm, apiKey: e.target.value})} className="form-input" placeholder="x-api-key" />
                                </div>
                                <div className="form-field">
                                    <label>API Key Değeri</label>
                                    <input type="password" value={apiForm.apiSecret} onChange={e => setApiForm({...apiForm, apiSecret: e.target.value})} className="form-input" placeholder="secret_key_123" />
                                </div>
                            </>
                        )}
                        <div className="form-field full-width">
                            <label>Sabit Başlıklar (Headers - JSON)</label>
                            <textarea rows={3} value={apiForm.headers} onChange={e => setApiForm({...apiForm, headers: e.target.value})} className="form-textarea" placeholder='{"Content-Type": "application/json"}' />
                        </div>
                    </div>
                    <div className="form-actions">
                        <button type="button" onClick={() => setShowApiForm(false)} className="btn-cancel">İptal</button>
                        <button type="submit" className="btn-save">Kaydet</button>
                    </div>
                </form>
            )}

            {/* TOOL FORM */}
            {showToolForm && activeTab === 'TOOLS' && (
                <form onSubmit={handleToolSave} className="integration-form-card">
                    <h3>{editToolId ? 'Bot Aracını Düzenle' : 'Yeni Bot Aracı Ekle'}</h3>
                    <div className="form-grid">
                        <div className="form-field">
                            <label>Fonksiyon Adı (snake_case olmalı)</label>
                            <input required type="text" value={toolForm.name} onChange={e => setToolForm({...toolForm, name: e.target.value})} className="form-input" placeholder="randevu_sorgula" />
                        </div>
                        <div className="form-field">
                            <label>Bağlı API Entegrasyonu</label>
                            <select required value={toolForm.apiIntegrationId} onChange={e => setToolForm({...toolForm, apiIntegrationId: e.target.value})} className="form-select">
                                <option value="">API Bağlantısı Seçin...</option>
                                {integrations.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                            </select>
                        </div>
                        <div className="form-field">
                            <label>HTTP Metodu</label>
                            <select value={toolForm.method} onChange={e => setToolForm({...toolForm, method: e.target.value})} className="form-select">
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                                <option value="DELETE">DELETE</option>
                            </select>
                        </div>
                        <div className="form-field">
                            <label>Endpoint Yolu</label>
                            <input required type="text" value={toolForm.endpoint} onChange={e => setToolForm({...toolForm, endpoint: e.target.value})} className="form-input" placeholder="/appointments/check" />
                        </div>
                        <div className="form-field full-width">
                            <label>Açıklama (AI Botun aracı ne zaman çağıracağını anlaması için)</label>
                            <textarea required rows={2} value={toolForm.description} onChange={e => setToolForm({...toolForm, description: e.target.value})} className="form-textarea" placeholder="Müşterinin kimlik numarasıyla mevcut randevularını sorgular." />
                        </div>
                        <div className="form-field full-width">
                            <label>Parametre Şeması (JSON Schema)</label>
                            <textarea rows={5} value={toolForm.parametersSchema} onChange={e => setToolForm({...toolForm, parametersSchema: e.target.value})} className="form-textarea" placeholder='{"type": "object", "properties": {"tckn": {"type": "string", "description": "11 haneli TCKN"}}, "required": ["tckn"]}' />
                        </div>
                    </div>
                    <div className="form-actions">
                        <button type="button" onClick={() => setShowToolForm(false)} className="btn-cancel">İptal</button>
                        <button type="submit" className="btn-save">Kaydet</button>
                    </div>
                </form>
            )}

            {/* CONTENT LISTS */}
            {loading ? (
                <div className="empty-state">Yükleniyor...</div>
            ) : activeTab === 'API' ? (
                integrations.length === 0 ? (
                    <div className="empty-state">
                        <p>Henüz tanımlanmış bir API bağlantısı bulunmuyor.</p>
                    </div>
                ) : (
                    <div className="integrations-grid">
                        {integrations.map(item => (
                            <div key={item.id} className="integration-card">
                                <div>
                                    <div className="card-header">
                                        <h3 className="integration-title">{item.name}</h3>
                                        <div className="card-actions">
                                            <button onClick={() => handleApiEdit(item)} className="icon-btn" title="Düzenle">✏️</button>
                                            <button onClick={() => handleApiDelete(item.id)} className="icon-btn" title="Sil">🗑️</button>
                                        </div>
                                    </div>
                                    <div className="integration-url">{item.baseUrl}</div>
                                    <span className="auth-badge">Auth: {item.authType}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : activeTab === 'TOOLS' ? (
                tools.length === 0 ? (
                    <div className="empty-state">
                        <p>Henüz tanımlanmış bir bot aracı (fonksiyon) bulunmuyor.</p>
                    </div>
                ) : (
                    <div className="integrations-grid">
                        {tools.map(item => (
                            <div key={item.id} className="integration-card">
                                <div>
                                    <div className="card-header">
                                        <h3 className="integration-title">
                                            <span className={`method-badge ${item.method.toLowerCase()}`}>{item.method}</span> {item.name}
                                        </h3>
                                        <div className="card-actions">
                                            <button onClick={() => handleToolEdit(item)} className="icon-btn" title="Düzenle">✏️</button>
                                            <button onClick={() => handleToolDelete(item.id)} className="icon-btn" title="Sil">🗑️</button>
                                        </div>
                                    </div>
                                    <div className="integration-url">{item.endpoint}</div>
                                    <p className="integration-desc">{item.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : null}
        </div>
    );
};

export default Integrations;

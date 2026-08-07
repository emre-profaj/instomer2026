import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
    getIntegrations, createIntegration, updateIntegration, deleteIntegration,
    getBotTools, createBotTool, updateBotTool, deleteBotTool
} from '../../services/apiIntegration.api';

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
                try { JSON.parse(data.parametersSchema); } catch(e) { return alert('Parametre şeması geçerli bir JSON olmalıdır.'); }
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

    const renderApiForm = () => (
        <form onSubmit={handleApiSave} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6 grid grid-cols-2 gap-4">
            <div className="col-span-2 border-b pb-2 mb-2">
                <h3 className="font-semibold text-gray-800 text-lg">{editApiId ? 'API Düzenle' : 'Yeni API Bağlantısı'}</h3>
            </div>
            
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bağlantı Adı</label>
                <input required type="text" value={apiForm.name} onChange={e => setApiForm({...apiForm, name: e.target.value})} className="w-full p-2 border rounded" placeholder="Örn: Muhasebe Sistemi" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                <input required type="url" value={apiForm.baseUrl} onChange={e => setApiForm({...apiForm, baseUrl: e.target.value})} className="w-full p-2 border rounded" placeholder="https://api.example.com/v1" />
            </div>
            
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Yetkilendirme Tipi (Auth Type)</label>
                <select value={apiForm.authType} onChange={e => setApiForm({...apiForm, authType: e.target.value})} className="w-full p-2 border rounded">
                    <option value="NONE">Yok</option>
                    <option value="BEARER">Bearer Token</option>
                    <option value="API_KEY">API Key</option>
                    <option value="BASIC">Basic Auth</option>
                </select>
            </div>
            
            {apiForm.authType === 'BEARER' && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Token (Şifrelenerek saklanır)</label>
                    <input type="password" value={apiForm.authToken} onChange={e => setApiForm({...apiForm, authToken: e.target.value})} className="w-full p-2 border rounded" placeholder={editApiId ? '********' : 'Token'} />
                </div>
            )}
            
            {(apiForm.authType === 'API_KEY' || apiForm.authType === 'BASIC') && (
                <>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">API Key / Username</label>
                        <input type="text" value={apiForm.apiKey} onChange={e => setApiForm({...apiForm, apiKey: e.target.value})} className="w-full p-2 border rounded" placeholder={editApiId ? '********' : 'Key'} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">API Secret / Password</label>
                        <input type="password" value={apiForm.apiSecret} onChange={e => setApiForm({...apiForm, apiSecret: e.target.value})} className="w-full p-2 border rounded" placeholder={editApiId ? '********' : 'Secret'} />
                    </div>
                </>
            )}

            <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Ekstra Headers (JSON Formatında)</label>
                <textarea rows={3} value={apiForm.headers} onChange={e => setApiForm({...apiForm, headers: e.target.value})} className="w-full p-2 border rounded font-mono text-sm" placeholder='{"X-Custom-Header": "value"}' />
            </div>

            <div className="col-span-2 flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => setShowApiForm(false)} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">İptal</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Kaydet</button>
            </div>
        </form>
    );

    const renderToolForm = () => (
        <form onSubmit={handleToolSave} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6 grid grid-cols-2 gap-4">
            <div className="col-span-2 border-b pb-2 mb-2">
                <h3 className="font-semibold text-gray-800 text-lg">{editToolId ? 'Araç Düzenle' : 'Yeni Bot Aracı (Function/Tool)'}</h3>
            </div>
            
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Araç (Fonksiyon) Adı</label>
                <input required type="text" value={toolForm.name} onChange={e => setToolForm({...toolForm, name: e.target.value})} className="w-full p-2 border rounded font-mono text-sm" placeholder="örn: check_invoice_status" />
                <p className="text-xs text-gray-500 mt-1">Botun çağıracağı fonksiyon ismi (Boşluksuz)</p>
            </div>
            
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hangi API Bağlantısı?</label>
                <select value={toolForm.apiIntegrationId} onChange={e => setToolForm({...toolForm, apiIntegrationId: e.target.value})} className="w-full p-2 border rounded">
                    <option value="">Bağlantı Yok (Local / Dummy)</option>
                    {integrations.map(api => (
                        <option key={api.id} value={api.id}>{api.name} ({api.baseUrl})</option>
                    ))}
                </select>
            </div>

            <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama (Botun bu aracı ne zaman kullanacağını anlaması için)</label>
                <input required type="text" value={toolForm.description} onChange={e => setToolForm({...toolForm, description: e.target.value})} className="w-full p-2 border rounded" placeholder="Müşterinin fatura durumunu sorgulamak için kullanılır." />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HTTP Metodu</label>
                <select value={toolForm.method} onChange={e => setToolForm({...toolForm, method: e.target.value})} className="w-full p-2 border rounded">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint (Path)</label>
                <input required type="text" value={toolForm.endpoint} onChange={e => setToolForm({...toolForm, endpoint: e.target.value})} className="w-full p-2 border rounded font-mono text-sm" placeholder="/v1/invoices" />
                <p className="text-xs text-gray-500 mt-1">Base URL üzerine eklenecek yol.</p>
            </div>

            <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Parametre Şeması (JSON Schema)</label>
                <textarea rows={5} value={toolForm.parametersSchema} onChange={e => setToolForm({...toolForm, parametersSchema: e.target.value})} className="w-full p-2 border rounded font-mono text-sm" placeholder='{ "type": "object", "properties": { "invoice_id": { "type": "string" } }, "required": ["invoice_id"] }' />
            </div>

            <div className="col-span-2 flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => setShowToolForm(false)} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">İptal</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Kaydet</button>
            </div>
        </form>
    );

    return (
        <div className="p-6 h-[calc(100vh-64px)] overflow-y-auto bg-gray-50">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Entegrasyonlar ve Bot Araçları</h1>
                    <p className="text-gray-500 text-sm mt-1">Dış sistem bağlantılarınızı ve AI botlarınızın kullanacağı araçları (fonksiyonları) yönetin.</p>
                </div>
                
                {activeTab === 'API' && !showApiForm && (
                    <button onClick={() => { setEditApiId(null); setApiForm({name:'', baseUrl:'', authType:'NONE', authToken:'', apiKey:'', apiSecret:'', headers:'', assignedBotId:''}); setShowApiForm(true); }} className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 transition">
                        + Yeni API Bağlantısı
                    </button>
                )}
                {activeTab === 'TOOLS' && !showToolForm && (
                    <button onClick={() => { setEditToolId(null); setToolForm({name:'', description:'', method:'GET', endpoint:'', parametersSchema:'', apiIntegrationId:''}); setShowToolForm(true); }} className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 transition">
                        + Yeni Bot Aracı
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-gray-200 mb-6 bg-white p-2 rounded-t-lg shadow-sm">
                {[
                    { id: 'API', label: 'API Bağlantıları' },
                    { id: 'TOOLS', label: 'Bot Araçları (Fonksiyonlar)' },
                    { id: 'WEBHOOKS', label: 'Giden Webhooklar (Yakında)' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setShowApiForm(false); setShowToolForm(false); }}
                        className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === tab.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'} ${tab.id === 'WEBHOOKS' ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={tab.id === 'WEBHOOKS'}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content API */}
            {activeTab === 'API' && (
                <>
                    {showApiForm && renderApiForm()}
                    {loading ? <div className="text-center p-8">Yükleniyor...</div> : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {integrations.map(api => (
                                <div key={api.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-semibold text-lg text-gray-800">{api.name}</h3>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleApiEdit(api)} className="text-gray-400 hover:text-blue-600">✏️</button>
                                            <button onClick={() => handleApiDelete(api.id)} className="text-gray-400 hover:text-red-600">🗑️</button>
                                        </div>
                                    </div>
                                    <div className="text-sm text-gray-600 mb-1 font-mono break-all">{api.baseUrl}</div>
                                    <div className="text-xs inline-block px-2 py-1 bg-gray-100 rounded text-gray-600 font-medium">Auth: {api.authType}</div>
                                </div>
                            ))}
                            {integrations.length === 0 && !showApiForm && (
                                <div className="col-span-2 text-center p-12 text-gray-500 bg-white border border-dashed rounded">API Bağlantısı bulunmuyor.</div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* Content TOOLS */}
            {activeTab === 'TOOLS' && (
                <>
                    {showToolForm && renderToolForm()}
                    {loading ? <div className="text-center p-8">Yükleniyor...</div> : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {tools.map(tool => (
                                <div key={tool.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-semibold text-blue-700 text-lg font-mono">{tool.name}</h3>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleToolEdit(tool)} className="text-gray-400 hover:text-blue-600">✏️</button>
                                            <button onClick={() => handleToolDelete(tool.id)} className="text-gray-400 hover:text-red-600">🗑️</button>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-700 mb-3">{tool.description}</p>
                                    
                                    <div className="bg-gray-50 p-2 rounded text-sm mb-2 border border-gray-100 flex items-center gap-2">
                                        <span className={`font-bold ${tool.method === 'GET' ? 'text-green-600' : tool.method === 'POST' ? 'text-blue-600' : 'text-orange-600'}`}>{tool.method}</span>
                                        <span className="font-mono text-gray-600 truncate">{tool.endpoint}</span>
                                    </div>
                                    
                                    {tool.apiIntegration && (
                                        <div className="text-xs text-gray-500 flex items-center gap-1">
                                            <span>🔌 Bağlantı:</span> <span className="font-medium text-gray-700">{tool.apiIntegration.name}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {tools.length === 0 && !showToolForm && (
                                <div className="col-span-2 text-center p-12 text-gray-500 bg-white border border-dashed rounded">Bot Aracı bulunmuyor.</div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default Integrations;

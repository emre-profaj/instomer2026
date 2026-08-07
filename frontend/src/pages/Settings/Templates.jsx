import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '../../services/template.api';

const Templates = () => {
    const { currentWorkspace } = useAuth();
    const workspaceId = currentWorkspace?.id;
    
    const [activeTab, setActiveTab] = useState('WHATSAPP'); // WHATSAPP, EMAIL, SMS, QUICK_REPLY
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(false);
    
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [formData, setFormData] = useState({ name: '', subject: '', bodyText: '', bodyHtml: '', shortcut: '', message: '' });

    useEffect(() => {
        if (workspaceId) {
            fetchTemplates();
        }
    }, [workspaceId, activeTab]);

    const fetchTemplates = async () => {
        setLoading(true);
        try {
            const res = await getTemplates(workspaceId, activeTab);
            setTemplates(res.data || []);
        } catch (err) {
            console.error('Error fetching templates:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            const data = { ...formData, type: activeTab };
            if (editId) {
                await updateTemplate(workspaceId, editId, data);
            } else {
                await createTemplate(workspaceId, data);
            }
            setShowForm(false);
            setEditId(null);
            fetchTemplates();
        } catch (err) {
            console.error(err);
            alert('Kaydedilirken hata oluştu.');
        }
    };

    const handleEdit = (t) => {
        setFormData({
            name: t.name || '',
            subject: t.subject || '',
            bodyText: t.bodyText || '',
            bodyHtml: t.bodyHtml || '',
            shortcut: t.shortcut || '',
            message: t.message || ''
        });
        setEditId(t.id);
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Bu şablonu silmek istediğinize emin misiniz?')) return;
        try {
            await deleteTemplate(workspaceId, id, activeTab);
            fetchTemplates();
        } catch (err) {
            console.error(err);
        }
    };

    const renderForm = () => {
        return (
            <form onSubmit={handleSave} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-col gap-4">
                <h3 className="font-semibold text-gray-800 text-lg border-b pb-2">
                    {editId ? 'Şablonu Düzenle' : 'Yeni Şablon Ekle'}
                </h3>
                
                {activeTab === 'QUICK_REPLY' ? (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Kısayol (/ile başlar)</label>
                            <input required type="text" value={formData.shortcut} onChange={e => setFormData({...formData, shortcut: e.target.value})} className="w-full p-2 border rounded" placeholder="/merhaba" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Mesaj İçeriği</label>
                            <textarea required rows={4} value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})} className="w-full p-2 border rounded" placeholder="Merhaba, size nasıl yardımcı olabilirim?" />
                        </div>
                    </>
                ) : (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Şablon Adı (Sistem İçi)</label>
                            <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border rounded" placeholder="Örn: Hoşgeldin Mesajı" />
                        </div>
                        
                        {activeTab === 'EMAIL' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">E-posta Konusu</label>
                                <input required type="text" value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} className="w-full p-2 border rounded" placeholder="Örn: Talebiniz Alındı" />
                            </div>
                        )}
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Mesaj İçeriği (Değişkenler: {'{{ad}}'}, {'{{firma}}'})</label>
                            <textarea required rows={6} value={formData.bodyText} onChange={e => setFormData({...formData, bodyText: e.target.value})} className="w-full p-2 border rounded" placeholder="Merhaba {{ad}}, ..." />
                        </div>
                    </>
                )}
                
                <div className="flex justify-end gap-2 mt-2">
                    <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">İptal</button>
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Kaydet</button>
                </div>
            </form>
        );
    };

    return (
        <div className="p-6 h-[calc(100vh-64px)] overflow-y-auto bg-gray-50">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Şablonlar</h1>
                    <p className="text-gray-500 text-sm mt-1">E-posta, SMS, WhatsApp ve Hızlı Yanıt şablonlarınızı yönetin.</p>
                </div>
                {!showForm && (
                    <button onClick={() => { setEditId(null); setFormData({name:'', subject:'', bodyText:'', bodyHtml:'', shortcut:'', message:''}); setShowForm(true); }} className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 transition">
                        + Yeni Şablon
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-gray-200 mb-6 bg-white p-2 rounded-t-lg shadow-sm">
                {[
                    { id: 'WHATSAPP', label: 'WhatsApp' },
                    { id: 'EMAIL', label: 'E-Posta' },
                    { id: 'SMS', label: 'SMS' },
                    { id: 'QUICK_REPLY', label: 'Hızlı Yanıtlar' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setShowForm(false); }}
                        className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === tab.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {showForm && renderForm()}

            {/* List */}
            {loading ? (
                <div className="text-center p-12 text-gray-500">Yükleniyor...</div>
            ) : templates.length === 0 ? (
                <div className="text-center p-12 bg-white rounded-lg border border-gray-200 border-dashed text-gray-500">
                    <p>Bu kategoride henüz bir şablon bulunmuyor.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {templates.map(t => (
                        <div key={t.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition group">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-semibold text-gray-800 truncate" title={activeTab === 'QUICK_REPLY' ? t.shortcut : t.name}>
                                    {activeTab === 'QUICK_REPLY' ? <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{t.shortcut}</span> : t.name}
                                </h3>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                                    <button onClick={() => handleEdit(t)} className="text-gray-400 hover:text-blue-600">✏️</button>
                                    <button onClick={() => handleDelete(t.id)} className="text-gray-400 hover:text-red-600">🗑️</button>
                                </div>
                            </div>
                            
                            {activeTab === 'EMAIL' && t.subject && (
                                <div className="text-xs text-gray-500 mb-2 font-medium">Konu: {t.subject}</div>
                            )}
                            
                            <p className="text-sm text-gray-600 line-clamp-4 whitespace-pre-wrap">
                                {activeTab === 'QUICK_REPLY' ? t.message : t.bodyText}
                            </p>
                            
                            <div className="mt-4 text-xs text-gray-400">
                                {new Date(t.createdAt).toLocaleDateString('tr-TR')}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Templates;

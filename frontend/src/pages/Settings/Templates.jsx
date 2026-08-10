import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '../../services/template.api';
import './Templates.css';

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
            <form onSubmit={handleSave} className="template-form-card">
                <h3>{editId ? 'Şablonu Düzenle' : 'Yeni Şablon Ekle'}</h3>
                
                {activeTab === 'QUICK_REPLY' ? (
                    <>
                        <div className="form-field">
                            <label>Kısayol (/ ile başlar)</label>
                            <input required type="text" value={formData.shortcut} onChange={e => setFormData({...formData, shortcut: e.target.value})} className="form-input" placeholder="/merhaba" />
                        </div>
                        <div className="form-field">
                            <label>Mesaj İçeriği</label>
                            <textarea required rows={4} value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})} className="form-textarea" placeholder="Merhaba, size nasıl yardımcı olabilirim?" />
                        </div>
                    </>
                ) : (
                    <>
                        <div className="form-field">
                            <label>Şablon Adı (Sistem İçi)</label>
                            <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="form-input" placeholder="Örn: Hoşgeldin Mesajı" />
                        </div>
                        
                        {activeTab === 'EMAIL' && (
                            <div className="form-field">
                                <label>E-posta Konusu</label>
                                <input required type="text" value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} className="form-input" placeholder="Örn: Talebiniz Alındı" />
                            </div>
                        )}
                        
                        <div className="form-field">
                            <label>Mesaj İçeriği (Değişkenler: {'{{ad}}'}, {'{{firma}}'})</label>
                            <textarea required rows={6} value={formData.bodyText} onChange={e => setFormData({...formData, bodyText: e.target.value})} className="form-textarea" placeholder="Merhaba {{ad}}, ..." />
                        </div>
                    </>
                )}
                
                <div className="form-actions">
                    <button type="button" onClick={() => setShowForm(false)} className="btn-cancel">İptal</button>
                    <button type="submit" className="btn-save">Kaydet</button>
                </div>
            </form>
        );
    };

    return (
        <div className="templates-page">
            <div className="templates-header">
                <div>
                    <h1>Şablonlar</h1>
                    <p>E-posta, SMS, WhatsApp ve Hızlı Yanıt şablonlarınızı yönetin.</p>
                </div>
                {!showForm && (
                    <button onClick={() => { setEditId(null); setFormData({name:'', subject:'', bodyText:'', bodyHtml:'', shortcut:'', message:''}); setShowForm(true); }} className="btn-add-template">
                        + Yeni Şablon
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="templates-tabs">
                {[
                    { id: 'WHATSAPP', label: 'WhatsApp' },
                    { id: 'EMAIL', label: 'E-Posta' },
                    { id: 'SMS', label: 'SMS' },
                    { id: 'QUICK_REPLY', label: 'Hızlı Yanıtlar' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setShowForm(false); }}
                        className={`template-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {showForm && renderForm()}

            {/* List */}
            {loading ? (
                <div className="empty-state">Yükleniyor...</div>
            ) : templates.length === 0 ? (
                <div className="empty-state">
                    <p>Bu kategoride henüz bir şablon bulunmuyor.</p>
                </div>
            ) : (
                <div className="templates-grid">
                    {templates.map(t => (
                        <div key={t.id} className="template-card">
                            <div>
                                <div className="card-header">
                                    <h3 className="template-title">
                                        {activeTab === 'QUICK_REPLY' ? <span className="shortcut-badge">{t.shortcut}</span> : t.name}
                                    </h3>
                                    <div className="card-actions">
                                        <button onClick={() => handleEdit(t)} className="icon-btn" title="Düzenle">✏️</button>
                                        <button onClick={() => handleDelete(t.id)} className="icon-btn" title="Sil">🗑️</button>
                                    </div>
                                </div>
                                
                                {activeTab === 'EMAIL' && t.subject && (
                                    <div className="template-subject">Konu: {t.subject}</div>
                                )}
                                
                                <div className="template-body">
                                    {activeTab === 'QUICK_REPLY' ? t.message : t.bodyText}
                                </div>
                            </div>
                            
                            <div className="template-footer">
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

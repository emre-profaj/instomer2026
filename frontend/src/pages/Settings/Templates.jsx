import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '../../services/template.api';
import api, { automationAPI, contactAPI } from '../../services/api';
import {
    Plus, Trash2, Edit2, Send, RefreshCw,
    CheckCircle, Clock, XCircle, Globe, Search, X,
    Smartphone
} from 'lucide-react';
import './Templates.css';

const Templates = () => {
    const { currentWorkspace } = useAuth();
    const workspaceId = currentWorkspace?.id;
    
    const [activeTab, setActiveTab] = useState('WHATSAPP');
    const [loading, setLoading] = useState(false);

    // --- Simple templates state (EMAIL, SMS, QUICK_REPLY) ---
    const [simpleTemplates, setSimpleTemplates] = useState([]);
    const [showSimpleForm, setShowSimpleForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [formData, setFormData] = useState({ name: '', subject: '', bodyText: '', bodyHtml: '', shortcut: '', message: '' });

    // --- WhatsApp Meta templates state ---
    const [waTemplates, setWaTemplates] = useState([]);
    const [syncing, setSyncing] = useState(false);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const [templateForm, setTemplateForm] = useState({
        name: '', language: 'tr', category: 'MARKETING', status: 'PENDING',
        headerType: '', headerContent: '', headerHandle: '', headerMediaUrl: '',
        bodyText: '', footerText: '', buttons: []
    });

    // --- Send Modal state ---
    const [showSendModal, setShowSendModal] = useState(false);
    const [sendingTemplate, setSendingTemplate] = useState(null);
    const [contactSearch, setContactSearch] = useState('');
    const [contactResults, setContactResults] = useState([]);
    const [selectedContact, setSelectedContact] = useState(null);
    const [phoneNumber, setPhoneNumber] = useState('');
    const [templateVariables, setTemplateVariables] = useState([]);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (workspaceId) {
            if (activeTab === 'WHATSAPP') {
                fetchWaTemplates();
            } else {
                fetchSimpleTemplates();
            }
        }
    }, [workspaceId, activeTab]);

    // ==================== Simple Template Functions ====================
    const fetchSimpleTemplates = async () => {
        setLoading(true);
        try {
            const res = await getTemplates(workspaceId, activeTab);
            setSimpleTemplates(res.data || []);
        } catch (err) {
            console.error('Error fetching templates:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSimpleSave = async (e) => {
        e.preventDefault();
        try {
            const data = { ...formData, type: activeTab };
            if (editId) {
                await updateTemplate(workspaceId, editId, data);
            } else {
                await createTemplate(workspaceId, data);
            }
            setShowSimpleForm(false);
            setEditId(null);
            fetchSimpleTemplates();
        } catch (err) {
            console.error(err);
            alert('Kaydedilirken hata oluştu.');
        }
    };

    const handleSimpleEdit = (t) => {
        setFormData({
            name: t.name || '', subject: t.subject || '', bodyText: t.bodyText || '',
            bodyHtml: t.bodyHtml || '', shortcut: t.shortcut || '', message: t.message || ''
        });
        setEditId(t.id);
        setShowSimpleForm(true);
    };

    const handleSimpleDelete = async (id) => {
        if (!window.confirm('Bu şablonu silmek istediğinize emin misiniz?')) return;
        try {
            await deleteTemplate(workspaceId, id, activeTab);
            fetchSimpleTemplates();
        } catch (err) {
            console.error(err);
        }
    };

    // ==================== WhatsApp Meta Template Functions ====================
    const fetchWaTemplates = async () => {
        setLoading(true);
        try {
            const res = await automationAPI.getTemplates(workspaceId);
            const data = res.data ?? res;
            setWaTemplates(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Error fetching WA templates:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSyncTemplates = async () => {
        setSyncing(true);
        try {
            const response = await automationAPI.syncTemplates(workspaceId);
            const { message, syncedCount, errors } = response.data;
            if (errors && errors.length > 0) {
                const errMsgs = errors.map(e => `${e.phone}: ${e.error}`).join('\n');
                alert(`${message}\n\n⚠️ Hatalar:\n${errMsgs}`);
            } else {
                alert(message || 'Şablonlar senkronize edildi');
            }
            fetchWaTemplates();
        } catch (error) {
            console.error('Sync error:', error);
            alert(error.response?.data?.error || 'Senkronizasyon hatası');
        } finally {
            setSyncing(false);
        }
    };

    const handleSaveWaTemplate = async () => {
        try {
            if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(templateForm.headerType) && !templateForm.headerHandle && !templateForm.headerMediaUrl) {
                alert('Lütfen bir medya dosyası seçip yüklenmesini bekleyin.');
                return;
            }
            if (editingTemplate) {
                await automationAPI.updateTemplate(workspaceId, editingTemplate.id, templateForm);
            } else {
                await automationAPI.createTemplate(workspaceId, templateForm);
            }
            setShowTemplateModal(false);
            setEditingTemplate(null);
            resetTemplateForm();
            fetchWaTemplates();
        } catch (error) {
            console.error('Save template error:', error);
            alert(error.response?.data?.error || 'Şablon kaydedilemedi');
        }
    };

    const handleDeleteWaTemplate = async (templateId) => {
        if (!confirm('Bu şablonu silmek istediğinize emin misiniz?')) return;
        try {
            await automationAPI.deleteTemplate(workspaceId, templateId);
            fetchWaTemplates();
        } catch (error) {
            console.error('Delete error:', error);
            alert('Şablon silinemedi');
        }
    };

    const openEditTemplate = (template) => {
        setEditingTemplate(template);
        setTemplateForm({
            name: template.name, language: template.language, category: template.category,
            status: template.status, bodyText: template.bodyText,
            headerType: template.headerType || '', headerContent: template.headerContent || '',
            footerText: template.footerText || '',
            buttons: template.buttons ? (typeof template.buttons === 'string' ? JSON.parse(template.buttons) : template.buttons) : []
        });
        setShowTemplateModal(true);
    };

    const resetTemplateForm = () => {
        setTemplateForm({
            name: '', language: 'tr', category: 'MARKETING', status: 'PENDING',
            headerType: '', headerContent: '', headerHandle: '', headerMediaUrl: '',
            bodyText: '', footerText: '', buttons: []
        });
    };

    // ==================== Send Template Functions ====================
    const openSendModal = (template) => {
        setSendingTemplate(template);
        setSelectedContact(null);
        setPhoneNumber('');
        setContactSearch('');
        setContactResults([]);
        const matches = template.bodyText.match(/\{\{(\d+)\}\}/g) || [];
        const uniqueVars = [...new Set(matches)].map((v) => ({ placeholder: v, value: '' }));
        setTemplateVariables(uniqueVars);
        setShowSendModal(true);
    };

    const handleContactSearch = async (query) => {
        setContactSearch(query);
        if (query.length < 2) { setContactResults([]); return; }
        try {
            const response = await contactAPI.getAll(workspaceId, { search: query });
            const contacts = response.data.contacts || [];
            setContactResults(contacts.filter(c => c.phone));
        } catch (error) {
            console.error('Search error:', error);
        }
    };

    const handleSendTemplate = async () => {
        if (!selectedContact && !phoneNumber) {
            alert('Lütfen bir kişi seçin veya telefon numarası girin');
            return;
        }
        setSending(true);
        try {
            const variables = templateVariables.map(v => v.value);
            await automationAPI.sendTemplate(workspaceId, {
                templateId: sendingTemplate.id,
                contactId: selectedContact?.id,
                phoneNumber: phoneNumber || undefined,
                variables: variables.length > 0 ? variables : undefined
            });
            alert('Şablon mesajı gönderildi!');
            setShowSendModal(false);
        } catch (error) {
            console.error('Send error:', error);
            alert(error.response?.data?.error || 'Mesaj gönderilemedi');
        } finally {
            setSending(false);
        }
    };

    // ==================== Helper ====================
    const getStatusIcon = (status) => {
        switch (status) {
            case 'APPROVED': return <CheckCircle size={14} style={{ marginRight: '4px', color: '#22c55e' }} />;
            case 'PENDING': return <Clock size={14} style={{ marginRight: '4px', color: '#f59e0b' }} />;
            case 'REJECTED': return <XCircle size={14} style={{ marginRight: '4px', color: '#ef4444' }} />;
            default: return null;
        }
    };

    // ==================== Simple Form Render ====================
    const renderSimpleForm = () => (
        <form onSubmit={handleSimpleSave} className="template-form-card">
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
                <button type="button" onClick={() => setShowSimpleForm(false)} className="btn-cancel">İptal</button>
                <button type="submit" className="btn-save">Kaydet</button>
            </div>
        </form>
    );

    // ==================== RENDER ====================
    return (
        <div className="templates-page">
            {/* Header */}
            <div className="templates-header">
                <div>
                    <h1>Şablonlar</h1>
                    <p>E-posta, SMS, WhatsApp ve Hızlı Yanıt şablonlarınızı yönetin.</p>
                </div>
                <div className="templates-header-actions">
                    {activeTab === 'WHATSAPP' ? (
                        <>
                            <button onClick={handleSyncTemplates} disabled={syncing} className="btn-sync">
                                <RefreshCw size={16} className={syncing ? 'spin' : ''} />
                                {syncing ? 'Eşitleniyor...' : 'Şablonları Eşitle'}
                            </button>
                            <button onClick={() => { resetTemplateForm(); setEditingTemplate(null); setShowTemplateModal(true); }} className="btn-add-template">
                                <Plus size={16} /> Şablon Ekle
                            </button>
                        </>
                    ) : (
                        !showSimpleForm && (
                            <button onClick={() => { setEditId(null); setFormData({name:'', subject:'', bodyText:'', bodyHtml:'', shortcut:'', message:''}); setShowSimpleForm(true); }} className="btn-add-template">
                                + Yeni Şablon
                            </button>
                        )
                    )}
                </div>
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
                        onClick={() => { setActiveTab(tab.id); setShowSimpleForm(false); }}
                        className={`template-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                    >
                        {tab.label}
                        {tab.id === 'WHATSAPP' && waTemplates.length > 0 && <span className="tab-count">{waTemplates.length}</span>}
                    </button>
                ))}
            </div>

            {/* ==================== WhatsApp Tab ==================== */}
            {activeTab === 'WHATSAPP' && (
                loading ? (
                    <div className="empty-state">Yükleniyor...</div>
                ) : waTemplates.length === 0 ? (
                    <div className="empty-state">
                        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📝</div>
                        <h3>Henüz WhatsApp şablonu yok</h3>
                        <p>Meta onaylı WhatsApp şablonları oluşturmak için "Şablon Ekle" butonuna tıklayın.</p>
                        <button className="btn-add-template" style={{ marginTop: '16px' }} onClick={() => { resetTemplateForm(); setEditingTemplate(null); setShowTemplateModal(true); }}>
                            <Plus size={16} /> Şablon Ekle
                        </button>
                    </div>
                ) : (
                    <div className="templates-grid">
                        {waTemplates.map(template => (
                            <div key={template.id} className="template-card wa-card">
                                <div>
                                    <div className="card-header">
                                        <div>
                                            <h3 className="template-title">{template.name}</h3>
                                            <div className="template-id">{template.templateId}</div>
                                        </div>
                                        <span className={`template-status ${template.status?.toLowerCase()}`}>
                                            {getStatusIcon(template.status)}
                                            {template.status === 'APPROVED' ? 'ONAYLI' : template.status === 'PENDING' ? 'BEKLİYOR' : template.status === 'REJECTED' ? 'REDDEDİLDİ' : template.status}
                                        </span>
                                    </div>

                                    <div className="template-tags">
                                        <span className="template-tag">
                                            {template.category === 'MARKETING' ? 'PAZARLAMA' : template.category === 'UTILITY' ? 'HİZMET' : template.category === 'AUTHENTICATION' ? 'DOĞRULAMA' : template.category}
                                        </span>
                                        {template.headerType && (
                                            <span className="template-tag media">
                                                {template.headerType === 'IMAGE' && '🖼️ Resim'}
                                                {template.headerType === 'VIDEO' && '🎬 Video'}
                                                {template.headerType === 'DOCUMENT' && '📄 Döküman'}
                                            </span>
                                        )}
                                    </div>

                                    <div className="template-body">
                                        <p>{template.bodyText}</p>
                                    </div>

                                    <div className="template-meta">
                                        <span><Globe size={14} /> {template.language}</span>
                                        {template.whatsappPhoneNumber && (
                                            <span><Smartphone size={14} /> {template.whatsappPhoneNumber.displayPhoneNumber}</span>
                                        )}
                                    </div>
                                </div>

                                <div className="wa-card-actions">
                                    <button className="btn-wa-action send" onClick={() => openSendModal(template)}>
                                        <Send size={14} /> Gönder
                                    </button>
                                    <button className="btn-wa-action edit" onClick={() => openEditTemplate(template)}>
                                        <Edit2 size={14} />
                                    </button>
                                    <button className="btn-wa-action delete" onClick={() => handleDeleteWaTemplate(template.id)}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}

            {/* ==================== Simple Tabs (EMAIL, SMS, QUICK_REPLY) ==================== */}
            {activeTab !== 'WHATSAPP' && (
                <>
                    {showSimpleForm && renderSimpleForm()}
                    {loading ? (
                        <div className="empty-state">Yükleniyor...</div>
                    ) : simpleTemplates.length === 0 ? (
                        <div className="empty-state">
                            <p>Bu kategoride henüz bir şablon bulunmuyor.</p>
                        </div>
                    ) : (
                        <div className="templates-grid">
                            {simpleTemplates.map(t => (
                                <div key={t.id} className="template-card">
                                    <div>
                                        <div className="card-header">
                                            <h3 className="template-title">
                                                {activeTab === 'QUICK_REPLY' ? <span className="shortcut-badge">{t.shortcut}</span> : t.name}
                                            </h3>
                                            <div className="card-actions">
                                                <button onClick={() => handleSimpleEdit(t)} className="icon-btn" title="Düzenle">✏️</button>
                                                <button onClick={() => handleSimpleDelete(t.id)} className="icon-btn" title="Sil">🗑️</button>
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
                </>
            )}

            {/* ==================== WhatsApp Template Create/Edit Modal ==================== */}
            {showTemplateModal && (
                <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
                    <div className="wa-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="wa-modal-header">
                            <h2>{editingTemplate ? 'Şablonu Düzenle' : 'Yeni WhatsApp Şablonu'}</h2>
                            <button className="modal-close-btn" onClick={() => setShowTemplateModal(false)}>×</button>
                        </div>
                        <div className="wa-modal-body">
                            <div className="form-info-note">
                                ℹ️ Şablonunuz kaydedildiğinde Meta'ya gönderilecek ve onay sürecine (PENDING) girecektir. Meta onayladığında otomatik olarak ONAYLI statüsüne geçer.
                            </div>

                            <div className="form-row">
                                <div className="form-field" style={{ flex: 1 }}>
                                    <label>Şablon Adı *</label>
                                    <input type="text" className="form-input" value={templateForm.name}
                                        onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                                        placeholder="örn: lead_welcome" />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-field">
                                    <label>Dil</label>
                                    <select className="form-input" value={templateForm.language}
                                        onChange={(e) => setTemplateForm({ ...templateForm, language: e.target.value })}>
                                        <option value="tr">Türkçe</option>
                                        <option value="en">English</option>
                                        <option value="en_US">English (US)</option>
                                    </select>
                                </div>
                                <div className="form-field">
                                    <label>Kategori</label>
                                    <select className="form-input" value={templateForm.category}
                                        onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}>
                                        <option value="MARKETING">Marketing</option>
                                        <option value="UTILITY">Utility</option>
                                        <option value="AUTHENTICATION">Authentication</option>
                                    </select>
                                </div>
                            </div>

                            {/* Header Type */}
                            <div className="form-row">
                                <div className="form-field">
                                    <label>Header Tipi</label>
                                    <select className="form-input" value={templateForm.headerType}
                                        onChange={(e) => setTemplateForm({ ...templateForm, headerType: e.target.value })}>
                                        <option value="">Yok (Sadece Metin)</option>
                                        <option value="IMAGE">🖼️ Resim</option>
                                        <option value="VIDEO">🎬 Video</option>
                                        <option value="DOCUMENT">📄 Döküman</option>
                                    </select>
                                </div>
                                {templateForm.headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(templateForm.headerType) && (
                                    <div className="form-field">
                                        <label>Medya Dosyası (Zorunlu)</label>
                                        <input type="file" className="form-input"
                                            accept={
                                                templateForm.headerType === 'IMAGE' ? 'image/jpeg,image/png' :
                                                templateForm.headerType === 'VIDEO' ? 'video/mp4' : '.pdf'
                                            }
                                            disabled={isUploadingMedia}
                                            onChange={async (e) => {
                                                const file = e.target.files[0];
                                                if (!file) return;
                                                const maxSize = templateForm.headerType === 'IMAGE' ? 5 : templateForm.headerType === 'VIDEO' ? 16 : 100;
                                                if (file.size > maxSize * 1024 * 1024) {
                                                    alert(`Dosya boyutu en fazla ${maxSize}MB olabilir.`);
                                                    return;
                                                }
                                                setIsUploadingMedia(true);
                                                const fd = new FormData();
                                                fd.append('file', file);
                                                try {
                                                    const res = await api.post(`/automations/${workspaceId}/templates/upload-media`, fd, {
                                                        headers: { 'Content-Type': 'multipart/form-data' }
                                                    });
                                                    setTemplateForm({
                                                        ...templateForm,
                                                        headerMediaUrl: res.data.mediaUrl,
                                                        headerHandle: res.data.headerHandle,
                                                        headerContent: res.data.mediaUrl
                                                    });
                                                } catch (error) {
                                                    console.error('Media upload error:', error);
                                                    alert('Medya yüklenirken bir hata oluştu: ' + (error.response?.data?.error || error.message));
                                                } finally {
                                                    setIsUploadingMedia(false);
                                                }
                                            }}
                                        />
                                        <small className="form-hint">
                                            Maksimum boyut: {templateForm.headerType === 'IMAGE' ? '5 MB' : templateForm.headerType === 'VIDEO' ? '16 MB' : '100 MB'}
                                        </small>
                                        {isUploadingMedia && <span className="upload-status loading">⏳ Yükleniyor...</span>}
                                        {!isUploadingMedia && templateForm.headerMediaUrl && (
                                            <div className="upload-status success">
                                                ✅ Yüklendi!
                                                {templateForm.headerType === 'IMAGE' && (
                                                    <img src={templateForm.headerMediaUrl} alt="Preview" style={{ display: 'block', marginTop: '10px', maxHeight: '100px', borderRadius: '8px' }} />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="form-field">
                                <label>Şablon Metni *</label>
                                <textarea className="form-textarea" value={templateForm.bodyText}
                                    onChange={(e) => setTemplateForm({ ...templateForm, bodyText: e.target.value })}
                                    placeholder="Merhaba {{1}}, talebiniz için teşekkürler. Size en kısa sürede dönüş yapacağız."
                                    rows={4} />
                                <small className="form-hint">Değişkenler için {'{{1}}'}, {'{{2}}'} gibi yer tutucular kullanın</small>
                            </div>

                            <div className="form-field">
                                <label>Footer (Opsiyonel)</label>
                                <input type="text" className="form-input" value={templateForm.footerText}
                                    onChange={(e) => setTemplateForm({ ...templateForm, footerText: e.target.value })}
                                    placeholder="örn: Yanıt vermek için EVET yazın" />
                            </div>

                            {/* Buttons */}
                            <div className="form-field">
                                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    Eylem Düğmeleri (Opsiyonel)
                                    {templateForm.buttons.length < 3 && (
                                        <button type="button" className="btn-add-button"
                                            onClick={() => setTemplateForm({
                                                ...templateForm,
                                                buttons: [...templateForm.buttons, { type: 'URL', text: '', url: '' }]
                                            })}>
                                            <Plus size={14} /> Düğme Ekle
                                        </button>
                                    )}
                                </label>
                                {templateForm.buttons.map((btn, idx) => (
                                    <div key={idx} className="button-row">
                                        <select className="form-input" value={btn.type}
                                            onChange={(e) => {
                                                const newBtns = [...templateForm.buttons];
                                                const newType = e.target.value;
                                                newBtns[idx] = { type: newType, text: btn.text };
                                                if (newType === 'URL') newBtns[idx].url = '';
                                                if (newType === 'PHONE_NUMBER') newBtns[idx].phone_number = '';
                                                setTemplateForm({ ...templateForm, buttons: newBtns });
                                            }}
                                            style={{ flex: '1', minWidth: '130px' }}>
                                            <option value="URL">🌐 Site Ziyareti (URL)</option>
                                            <option value="PHONE_NUMBER">📞 Telefonla Ara</option>
                                            <option value="QUICK_REPLY">💬 Hızlı Yanıt (Metin)</option>
                                        </select>
                                        <input className="form-input" placeholder="Düğme Yazısı" value={btn.text}
                                            onChange={(e) => {
                                                const newBtns = [...templateForm.buttons];
                                                newBtns[idx].text = e.target.value;
                                                setTemplateForm({ ...templateForm, buttons: newBtns });
                                            }}
                                            style={{ flex: '1' }} maxLength={20} />
                                        {btn.type === 'URL' && (
                                            <input className="form-input" placeholder="https://..." value={btn.url || ''}
                                                onChange={(e) => {
                                                    const newBtns = [...templateForm.buttons];
                                                    newBtns[idx].url = e.target.value;
                                                    setTemplateForm({ ...templateForm, buttons: newBtns });
                                                }}
                                                style={{ flex: '1.5' }} />
                                        )}
                                        {btn.type === 'PHONE_NUMBER' && (
                                            <input className="form-input" placeholder="+90555..." value={btn.phone_number || ''}
                                                onChange={(e) => {
                                                    const newBtns = [...templateForm.buttons];
                                                    newBtns[idx].phone_number = e.target.value;
                                                    setTemplateForm({ ...templateForm, buttons: newBtns });
                                                }}
                                                style={{ flex: '1.5' }} />
                                        )}
                                        <button type="button" className="btn-remove-button"
                                            onClick={() => {
                                                const newBtns = templateForm.buttons.filter((_, i) => i !== idx);
                                                setTemplateForm({ ...templateForm, buttons: newBtns });
                                            }}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                                {templateForm.buttons.length > 0 && (
                                    <small className="form-hint">* Maksimum 3 buton eklenebilir. (Meta kuralları gereği)</small>
                                )}
                            </div>
                        </div>
                        <div className="wa-modal-footer">
                            <button className="btn-cancel" onClick={() => setShowTemplateModal(false)}>İptal</button>
                            <button className="btn-save" onClick={handleSaveWaTemplate}>
                                {editingTemplate ? 'Güncelle' : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ==================== Send Template Modal ==================== */}
            {showSendModal && sendingTemplate && (
                <div className="modal-overlay" onClick={() => setShowSendModal(false)}>
                    <div className="wa-modal send-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="wa-modal-header">
                            <h2>📨 Şablon Gönder: {sendingTemplate.name}</h2>
                            <button className="modal-close-btn" onClick={() => setShowSendModal(false)}>×</button>
                        </div>
                        <div className="wa-modal-body">
                            <div className="template-body" style={{ marginBottom: '20px', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                                <p>{sendingTemplate.bodyText}</p>
                            </div>

                            {selectedContact ? (
                                <div className="selected-contact">
                                    <div>
                                        <strong>{selectedContact.name}</strong>
                                        <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{selectedContact.phone}</div>
                                    </div>
                                    <button className="btn-remove-button" onClick={() => setSelectedContact(null)}>
                                        <X size={18} />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="form-field">
                                        <label>Kişi Ara</label>
                                        <div style={{ position: 'relative' }}>
                                            <input type="text" className="form-input" value={contactSearch}
                                                onChange={(e) => handleContactSearch(e.target.value)}
                                                placeholder="İsim veya telefon ile ara..." />
                                            {contactResults.length > 0 && (
                                                <div className="contact-results">
                                                    {contactResults.map(contact => (
                                                        <div key={contact.id} className="contact-result-item"
                                                            onClick={() => { setSelectedContact(contact); setContactSearch(''); setContactResults([]); }}>
                                                            <span>{contact.name}</span>
                                                            <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{contact.phone}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'center', color: '#94a3b8', margin: '16px 0' }}>veya</div>
                                    <div className="form-field">
                                        <label>Telefon Numarası</label>
                                        <input type="text" className="form-input" value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                            placeholder="905551234567" />
                                        <small className="form-hint">Ülke kodu ile birlikte girin (+ işareti olmadan)</small>
                                    </div>
                                </>
                            )}

                            {templateVariables.length > 0 && (
                                <div className="variables-section">
                                    <h4>Değişkenler</h4>
                                    {templateVariables.map((v, idx) => (
                                        <div key={idx} className="variable-input">
                                            <label>{v.placeholder}</label>
                                            <input type="text" className="form-input" value={v.value}
                                                onChange={(e) => {
                                                    const newVars = [...templateVariables];
                                                    newVars[idx].value = e.target.value;
                                                    setTemplateVariables(newVars);
                                                }}
                                                placeholder={`Değer ${idx + 1}`} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="wa-modal-footer">
                            <button className="btn-cancel" onClick={() => setShowSendModal(false)}>İptal</button>
                            <button className="btn-save" onClick={handleSendTemplate}
                                disabled={sending || (!selectedContact && !phoneNumber)}>
                                {sending ? 'Gönderiliyor...' : '📨 Gönder'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Templates;

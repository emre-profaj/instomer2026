import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { automationAPI, contactAPI, whatsappAPI } from '../../services/api';
import {
    MessageSquare, Zap, Plus, Trash2, Edit2, Send, RefreshCw,
    CheckCircle, Clock, XCircle, Globe, ArrowRight, Search, X,
    Smartphone
} from 'lucide-react';
import './Automations.css';

const Automations = () => {
    const { currentWorkspace } = useAuth();
    const [activeTab, setActiveTab] = useState('templates');
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);

    // Templates
    const [templates, setTemplates] = useState([]);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [templateForm, setTemplateForm] = useState({
        templateId: '',
        name: '',
        language: 'tr',
        category: 'MARKETING',
        status: 'APPROVED',
        bodyText: '',
        headerType: '',
        headerContent: '',
        footerText: ''
    });

    // Automations
    const [automations, setAutomations] = useState([]);
    const [showAutomationModal, setShowAutomationModal] = useState(false);
    const [editingAutomation, setEditingAutomation] = useState(null);
    const [automationForm, setAutomationForm] = useState({
        name: '',
        description: '',
        trigger: 'NEW_LEAD',
        triggerChannel: 'ALL',
        // Multiple actions support
        selectedActions: ['SEND_TEMPLATE'], // Array of selected action types
        actionLogic: 'AND', // AND = all execute, OR = first matching
        // Legacy single action (for compatibility)
        action: 'SEND_TEMPLATE',
        templateId: '',
        messageContent: '',
        delayMinutes: 0,
        // Email fields
        emailChannelId: '',
        emailSubject: '',
        emailBody: '',
        emailIsHtml: false
    });

    // Send Template Modal
    const [showSendModal, setShowSendModal] = useState(false);
    const [sendingTemplate, setSendingTemplate] = useState(null);
    const [contactSearch, setContactSearch] = useState('');
    const [contactResults, setContactResults] = useState([]);
    const [selectedContact, setSelectedContact] = useState(null);
    const [phoneNumber, setPhoneNumber] = useState('');
    const [templateVariables, setTemplateVariables] = useState([]);
    const [sending, setSending] = useState(false);

    // Email channels for SEND_EMAIL action
    const [emailChannels, setEmailChannels] = useState([]);

    useEffect(() => {
        if (currentWorkspace?.id) {
            loadData();
        }
    }, [currentWorkspace]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [templatesRes, automationsRes, emailRes] = await Promise.all([
                automationAPI.getTemplates(currentWorkspace.id),
                automationAPI.getAutomations(currentWorkspace.id),
                fetch(`/api/email/${currentWorkspace.id}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                }).then(r => r.json()).catch(() => ({ emailChannels: [] }))
            ]);
            setTemplates(templatesRes.data.templates || []);
            setAutomations(automationsRes.data.automations || []);
            setEmailChannels(emailRes.emailChannels || []);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Sync templates from WhatsApp
    const handleSyncTemplates = async () => {
        setSyncing(true);
        try {
            const response = await automationAPI.syncTemplates(currentWorkspace.id);
            alert(response.data.message || 'Şablonlar senkronize edildi');
            loadData();
        } catch (error) {
            console.error('Sync error:', error);
            alert(error.response?.data?.error || 'Senkronizasyon hatası');
        } finally {
            setSyncing(false);
        }
    };

    // Template CRUD
    const handleSaveTemplate = async () => {
        try {
            if (editingTemplate) {
                await automationAPI.updateTemplate(currentWorkspace.id, editingTemplate.id, templateForm);
            } else {
                await automationAPI.createTemplate(currentWorkspace.id, templateForm);
            }
            setShowTemplateModal(false);
            setEditingTemplate(null);
            resetTemplateForm();
            loadData();
        } catch (error) {
            console.error('Save template error:', error);
            alert(error.response?.data?.error || 'Şablon kaydedilemedi');
        }
    };

    const handleDeleteTemplate = async (templateId) => {
        if (!confirm('Bu şablonu silmek istediğinize emin misiniz?')) return;
        try {
            await automationAPI.deleteTemplate(currentWorkspace.id, templateId);
            loadData();
        } catch (error) {
            console.error('Delete error:', error);
            alert('Şablon silinemedi');
        }
    };

    const openEditTemplate = (template) => {
        setEditingTemplate(template);
        setTemplateForm({
            templateId: template.templateId,
            name: template.name,
            language: template.language,
            category: template.category,
            status: template.status,
            bodyText: template.bodyText,
            headerType: template.headerType || '',
            headerContent: template.headerContent || '',
            footerText: template.footerText || ''
        });
        setShowTemplateModal(true);
    };

    const resetTemplateForm = () => {
        setTemplateForm({
            templateId: '',
            name: '',
            language: 'tr',
            category: 'MARKETING',
            status: 'APPROVED',
            bodyText: '',
            headerType: '',
            headerContent: '',
            footerText: ''
        });
    };

    // Automation CRUD
    const handleSaveAutomation = async () => {
        try {
            // Prepare data with actions JSON
            const dataToSave = {
                ...automationForm,
                // Convert selectedActions array to JSON string for storage
                actions: JSON.stringify(automationForm.selectedActions || []),
                // Keep first selected action for legacy compatibility
                action: automationForm.selectedActions?.[0] || 'SEND_TEMPLATE'
            };
            // Remove selectedActions from data as it's not a DB field
            delete dataToSave.selectedActions;

            if (editingAutomation) {
                await automationAPI.updateAutomation(currentWorkspace.id, editingAutomation.id, dataToSave);
            } else {
                await automationAPI.createAutomation(currentWorkspace.id, dataToSave);
            }
            setShowAutomationModal(false);
            setEditingAutomation(null);
            resetAutomationForm();
            loadData();
        } catch (error) {
            console.error('Save automation error:', error);
            alert(error.response?.data?.error || 'Otomasyon kaydedilemedi');
        }
    };

    const handleDeleteAutomation = async (automationId) => {
        if (!confirm('Bu otomasyonu silmek istediğinize emin misiniz?')) return;
        try {
            await automationAPI.deleteAutomation(currentWorkspace.id, automationId);
            loadData();
        } catch (error) {
            console.error('Delete error:', error);
            alert('Otomasyon silinemedi');
        }
    };

    const handleToggleAutomation = async (automation) => {
        try {
            await automationAPI.toggleAutomation(currentWorkspace.id, automation.id, !automation.isActive);
            loadData();
        } catch (error) {
            console.error('Toggle error:', error);
        }
    };

    const openEditAutomation = (automation) => {
        setEditingAutomation(automation);
        // Parse actions from JSON if available, otherwise use legacy single action
        let selectedActions = [];
        try {
            selectedActions = automation.actions ? JSON.parse(automation.actions) : [automation.action];
        } catch (e) {
            selectedActions = [automation.action];
        }
        setAutomationForm({
            name: automation.name,
            description: automation.description || '',
            trigger: automation.trigger,
            triggerChannel: automation.triggerChannel || 'ALL',
            selectedActions,
            actionLogic: automation.actionLogic || 'AND',
            action: automation.action,
            templateId: automation.templateId || '',
            messageContent: automation.messageContent || '',
            delayMinutes: automation.delayMinutes || 0,
            emailChannelId: automation.emailChannelId || '',
            emailSubject: automation.emailSubject || '',
            emailBody: automation.emailBody || '',
            emailIsHtml: automation.emailIsHtml || false
        });
        setShowAutomationModal(true);
    };

    const resetAutomationForm = () => {
        setAutomationForm({
            name: '',
            description: '',
            trigger: 'NEW_LEAD',
            triggerChannel: 'ALL',
            selectedActions: ['SEND_TEMPLATE'],
            actionLogic: 'AND',
            action: 'SEND_TEMPLATE',
            templateId: '',
            messageContent: '',
            delayMinutes: 0,
            emailChannelId: '',
            emailSubject: '',
            emailBody: '',
            emailIsHtml: false
        });
    };

    // Send Template
    const openSendModal = (template) => {
        setSendingTemplate(template);
        setSelectedContact(null);
        setPhoneNumber('');
        setContactSearch('');
        setContactResults([]);

        // Parse variables from template body
        const matches = template.bodyText.match(/\{\{(\d+)\}\}/g) || [];
        const uniqueVars = [...new Set(matches)].map((v) => ({
            placeholder: v,
            value: ''
        }));
        setTemplateVariables(uniqueVars);

        setShowSendModal(true);
    };

    const handleContactSearch = async (query) => {
        setContactSearch(query);
        if (query.length < 2) {
            setContactResults([]);
            return;
        }
        try {
            const response = await contactAPI.getAll(currentWorkspace.id, { search: query });
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
            await automationAPI.sendTemplate(currentWorkspace.id, {
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

    // Status helpers
    const getStatusIcon = (status) => {
        switch (status) {
            case 'APPROVED': return <CheckCircle size={14} />;
            case 'PENDING': return <Clock size={14} />;
            case 'REJECTED': return <XCircle size={14} />;
            default: return null;
        }
    };

    const getTriggerLabel = (trigger) => {
        switch (trigger) {
            case 'NEW_LEAD': return '🎯 Yeni Lead';
            case 'NEW_MESSAGE': return '💬 Yeni Mesaj';
            case 'NEW_CONVERSATION': return '📱 Yeni Sohbet';
            default: return trigger;
        }
    };

    const getActionLabel = (action) => {
        switch (action) {
            case 'SEND_TEMPLATE': return '📨 Şablon Gönder';
            case 'SEND_MESSAGE': return '💬 Mesaj Gönder';
            case 'SEND_EMAIL': return '📧 E-posta Gönder';
            case 'ASSIGN_AGENT': return '👤 Temsilci Ata';
            default: return action;
        }
    };

    if (loading) {
        return (
            <div className="automations-page">
                <div className="loading-container">
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="automations-page">
            {/* Header */}
            <div className="automations-header">
                <h1>
                    <Zap size={24} />
                    Otomasyonlar
                </h1>
                <div className="header-actions">
                    {activeTab === 'templates' && (
                        <>
                            <button className="btn btn-secondary" onClick={handleSyncTemplates} disabled={syncing}>
                                <RefreshCw size={16} className={syncing ? 'spinning' : ''} />
                                {syncing ? 'Senkronize ediliyor...' : 'WhatsApp\'tan Senkronize Et'}
                            </button>
                            <button className="btn btn-primary" onClick={() => { resetTemplateForm(); setEditingTemplate(null); setShowTemplateModal(true); }}>
                                <Plus size={16} />
                                Şablon Ekle
                            </button>
                        </>
                    )}
                    {activeTab === 'automations' && (
                        <button className="btn btn-primary" onClick={() => { resetAutomationForm(); setEditingAutomation(null); setShowAutomationModal(true); }}>
                            <Plus size={16} />
                            Otomasyon Ekle
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="automations-tabs">
                <button
                    className={`tab-btn ${activeTab === 'templates' ? 'active' : ''}`}
                    onClick={() => setActiveTab('templates')}
                >
                    <MessageSquare size={18} />
                    WhatsApp Şablonları ({templates.length})
                </button>
                <button
                    className={`tab-btn ${activeTab === 'automations' ? 'active' : ''}`}
                    onClick={() => setActiveTab('automations')}
                >
                    <Zap size={18} />
                    Otomasyonlar ({automations.length})
                </button>
            </div>

            {/* Content */}
            <div className="automations-content">
                {/* Templates Tab */}
                {activeTab === 'templates' && (
                    <div className="templates-grid">
                        {templates.length === 0 ? (
                            <div className="empty-state">
                                <div className="icon">📝</div>
                                <h3>Henüz şablon yok</h3>
                                <p>WhatsApp şablonlarını senkronize edin veya manuel ekleyin</p>
                                <button className="btn btn-primary" onClick={handleSyncTemplates}>
                                    <RefreshCw size={18} />
                                    Şablonları Senkronize Et
                                </button>
                            </div>
                        ) : (
                            templates.map(template => (
                                <div key={template.id} className="template-card">
                                    <div className="template-header">
                                        <div className="template-info">
                                            <h3 className="template-name">{template.name}</h3>
                                            <div className="template-id">{template.templateId}</div>
                                        </div>
                                        <span className={`template-status ${template.status.toLowerCase()}`}>
                                            {getStatusIcon(template.status)}
                                            {template.status}
                                        </span>
                                    </div>

                                    <div className="template-tags">
                                        <span className="template-tag">{template.category}</span>
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

                                    <div className="template-actions">
                                        <button className="btn btn-success btn-sm" onClick={() => openSendModal(template)}>
                                            <Send size={14} /> Gönder
                                        </button>
                                        <button className="btn btn-secondary btn-sm btn-icon" onClick={() => openEditTemplate(template)}>
                                            <Edit2 size={14} />
                                        </button>
                                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDeleteTemplate(template.id)}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* Automations Tab */}
                {activeTab === 'automations' && (
                    <div className="automations-grid">
                        {automations.length === 0 ? (
                            <div className="empty-state">
                                <div className="icon">⚡</div>
                                <h3>Henüz otomasyon yok</h3>
                                <p>Lead'lere otomatik mesaj göndermek için otomasyon oluşturun</p>
                                <button className="btn btn-primary" onClick={() => { resetAutomationForm(); setShowAutomationModal(true); }}>
                                    <Plus size={18} /> Otomasyon Oluştur
                                </button>
                            </div>
                        ) : (
                            automations.map(automation => (
                                <div key={automation.id} className={`automation-card ${!automation.isActive ? 'inactive' : ''}`}>
                                    <div className="automation-header">
                                        <h3 className="automation-name">{automation.name}</h3>
                                        <div
                                            className={`automation-toggle ${automation.isActive ? 'active' : ''}`}
                                            onClick={() => handleToggleAutomation(automation)}
                                        />
                                    </div>

                                    <div className="automation-flow">
                                        <span className="flow-item trigger">
                                            {getTriggerLabel(automation.trigger)}
                                        </span>
                                        <ArrowRight className="flow-arrow" size={20} />
                                        <span className="flow-item action">
                                            {getActionLabel(automation.action)}
                                        </span>
                                    </div>

                                    {automation.description && (
                                        <p className="automation-description">{automation.description}</p>
                                    )}

                                    <div className="automation-actions">
                                        <button className="btn btn-secondary btn-sm" onClick={() => openEditAutomation(automation)}>
                                            <Edit2 size={14} /> Düzenle
                                        </button>
                                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDeleteAutomation(automation.id)}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Template Modal */}
            {showTemplateModal && (
                <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingTemplate ? 'Şablon Düzenle' : 'Şablon Ekle'}</h2>
                            <button className="modal-close" onClick={() => setShowTemplateModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Şablon ID *</label>
                                    <input
                                        type="text"
                                        value={templateForm.templateId}
                                        onChange={(e) => setTemplateForm({ ...templateForm, templateId: e.target.value })}
                                        placeholder="Meta'dan alınan şablon ID"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Şablon Adı *</label>
                                    <input
                                        type="text"
                                        value={templateForm.name}
                                        onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                                        placeholder="örn: lead_welcome"
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Dil</label>
                                    <select
                                        value={templateForm.language}
                                        onChange={(e) => setTemplateForm({ ...templateForm, language: e.target.value })}
                                    >
                                        <option value="tr">Türkçe</option>
                                        <option value="en">English</option>
                                        <option value="en_US">English (US)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Kategori</label>
                                    <select
                                        value={templateForm.category}
                                        onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}
                                    >
                                        <option value="MARKETING">Marketing</option>
                                        <option value="UTILITY">Utility</option>
                                        <option value="AUTHENTICATION">Authentication</option>
                                    </select>
                                </div>
                            </div>

                            {/* Header Type Selection */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Header Tipi</label>
                                    <select
                                        value={templateForm.headerType}
                                        onChange={(e) => setTemplateForm({ ...templateForm, headerType: e.target.value })}
                                    >
                                        <option value="">Yok (Sadece Metin)</option>
                                        <option value="IMAGE">🖼️ Resim</option>
                                        <option value="VIDEO">🎬 Video</option>
                                        <option value="DOCUMENT">📄 Döküman</option>
                                    </select>
                                </div>
                                {templateForm.headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(templateForm.headerType) && (
                                    <div className="form-group">
                                        <label>Varsayılan Medya URL (Opsiyonel)</label>
                                        <input
                                            type="url"
                                            value={templateForm.headerContent}
                                            onChange={(e) => setTemplateForm({ ...templateForm, headerContent: e.target.value })}
                                            placeholder="https://example.com/media.jpg"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="form-group">
                                <label>Şablon Metni *</label>
                                <textarea
                                    value={templateForm.bodyText}
                                    onChange={(e) => setTemplateForm({ ...templateForm, bodyText: e.target.value })}
                                    placeholder="Merhaba {{1}}, talebiniz için teşekkürler. Size en kısa sürede dönüş yapacağız."
                                    rows={4}
                                />
                                <div className="form-hint">Değişkenler için {`{{1}}`}, {`{{2}}`} gibi yer tutucular kullanın</div>
                            </div>

                            <div className="form-group">
                                <label>Footer (Opsiyonel)</label>
                                <input
                                    type="text"
                                    value={templateForm.footerText}
                                    onChange={(e) => setTemplateForm({ ...templateForm, footerText: e.target.value })}
                                    placeholder="örn: Yanıt vermek için EVET yazın"
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowTemplateModal(false)}>
                                İptal
                            </button>
                            <button className="btn btn-primary" onClick={handleSaveTemplate}>
                                {editingTemplate ? 'Güncelle' : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Automation Modal */}
            {showAutomationModal && (
                <div className="modal-overlay" onClick={() => setShowAutomationModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingAutomation ? 'Otomasyon Düzenle' : 'Otomasyon Oluştur'}</h2>
                            <button className="modal-close" onClick={() => setShowAutomationModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Otomasyon Adı *</label>
                                <input
                                    type="text"
                                    value={automationForm.name}
                                    onChange={(e) => setAutomationForm({ ...automationForm, name: e.target.value })}
                                    placeholder="örn: Lead Karşılama Mesajı"
                                />
                            </div>

                            <div className="form-group">
                                <label>Açıklama</label>
                                <textarea
                                    value={automationForm.description}
                                    onChange={(e) => setAutomationForm({ ...automationForm, description: e.target.value })}
                                    placeholder="Bu otomasyon ne yapar?"
                                    rows={2}
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Tetikleyici</label>
                                    <select
                                        value={automationForm.trigger}
                                        onChange={(e) => setAutomationForm({ ...automationForm, trigger: e.target.value })}
                                    >
                                        <option value="NEW_LEAD">🎯 Yeni Lead Geldiğinde</option>
                                        <option value="NEW_MESSAGE">💬 Yeni Mesaj Geldiğinde</option>
                                        <option value="NEW_CONVERSATION">📱 Yeni Sohbet Başladığında</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Kanal</label>
                                    <select
                                        value={automationForm.triggerChannel}
                                        onChange={(e) => setAutomationForm({ ...automationForm, triggerChannel: e.target.value })}
                                    >
                                        <option value="ALL">Tümü</option>
                                        <option value="WHATSAPP">WhatsApp</option>
                                        <option value="FACEBOOK">Facebook</option>
                                        <option value="INSTAGRAM">Instagram</option>
                                    </select>
                                </div>
                            </div>

                            {/* Aksiyonlar - Tam Genişlik */}
                            <div className="form-group full-width">
                                <label>Aksiyonlar</label>
                                <div className="action-cards">
                                    <label className={`action-card ${automationForm.selectedActions?.includes('SEND_TEMPLATE') ? 'selected' : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={automationForm.selectedActions?.includes('SEND_TEMPLATE')}
                                            onChange={(e) => {
                                                const actions = automationForm.selectedActions || [];
                                                if (e.target.checked) {
                                                    setAutomationForm({ ...automationForm, selectedActions: [...actions, 'SEND_TEMPLATE'] });
                                                } else {
                                                    setAutomationForm({ ...automationForm, selectedActions: actions.filter(a => a !== 'SEND_TEMPLATE') });
                                                }
                                            }}
                                        />
                                        <span className="action-icon">📨</span>
                                        <span className="action-label">WhatsApp Şablon</span>
                                    </label>
                                    <label className={`action-card ${automationForm.selectedActions?.includes('SEND_MESSAGE') ? 'selected' : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={automationForm.selectedActions?.includes('SEND_MESSAGE')}
                                            onChange={(e) => {
                                                const actions = automationForm.selectedActions || [];
                                                if (e.target.checked) {
                                                    setAutomationForm({ ...automationForm, selectedActions: [...actions, 'SEND_MESSAGE'] });
                                                } else {
                                                    setAutomationForm({ ...automationForm, selectedActions: actions.filter(a => a !== 'SEND_MESSAGE') });
                                                }
                                            }}
                                        />
                                        <span className="action-icon">💬</span>
                                        <span className="action-label">Mesaj Gönder</span>
                                    </label>
                                    <label className={`action-card ${automationForm.selectedActions?.includes('SEND_EMAIL') ? 'selected' : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={automationForm.selectedActions?.includes('SEND_EMAIL')}
                                            onChange={(e) => {
                                                const actions = automationForm.selectedActions || [];
                                                if (e.target.checked) {
                                                    setAutomationForm({ ...automationForm, selectedActions: [...actions, 'SEND_EMAIL'] });
                                                } else {
                                                    setAutomationForm({ ...automationForm, selectedActions: actions.filter(a => a !== 'SEND_EMAIL') });
                                                }
                                            }}
                                        />
                                        <span className="action-icon">📧</span>
                                        <span className="action-label">E-posta Gönder</span>
                                    </label>
                                </div>
                                {automationForm.selectedActions?.length > 1 && (
                                    <div className="action-logic-row">
                                        <span className="logic-label">Çoklu aksiyon:</span>
                                        <div className="action-logic-toggle compact">
                                            <button
                                                type="button"
                                                className={`logic-btn ${automationForm.actionLogic === 'AND' ? 'active' : ''}`}
                                                onClick={() => setAutomationForm({ ...automationForm, actionLogic: 'AND' })}
                                            >
                                                Hepsini çalıştır
                                            </button>
                                            <button
                                                type="button"
                                                className={`logic-btn ${automationForm.actionLogic === 'OR' ? 'active' : ''}`}
                                                onClick={() => setAutomationForm({ ...automationForm, actionLogic: 'OR' })}
                                            >
                                                İlkini çalıştır
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Gecikme (dakika)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={automationForm.delayMinutes}
                                        onChange={(e) => setAutomationForm({ ...automationForm, delayMinutes: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                            </div>

                            {automationForm.selectedActions?.includes('SEND_TEMPLATE') && (
                                <div className="form-group">
                                    <label>Gönderilecek Şablon</label>
                                    <select
                                        value={automationForm.templateId}
                                        onChange={(e) => setAutomationForm({ ...automationForm, templateId: e.target.value })}
                                    >
                                        <option value="">Şablon seçin...</option>
                                        {templates.filter(t => t.status === 'APPROVED').map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {automationForm.selectedActions?.includes('SEND_MESSAGE') && (
                                <div className="form-group">
                                    <label>Mesaj İçeriği</label>
                                    <textarea
                                        value={automationForm.messageContent}
                                        onChange={(e) => setAutomationForm({ ...automationForm, messageContent: e.target.value })}
                                        placeholder="Gönderilecek mesaj..."
                                        rows={3}
                                    />
                                </div>
                            )}

                            {automationForm.selectedActions?.includes('SEND_EMAIL') && (
                                <>
                                    <div className="form-group">
                                        <label>E-posta Kanalı *</label>
                                        <select
                                            value={automationForm.emailChannelId}
                                            onChange={(e) => setAutomationForm({ ...automationForm, emailChannelId: e.target.value })}
                                        >
                                            <option value="">E-posta kanalı seçin...</option>
                                            {emailChannels.map(ch => (
                                                <option key={ch.id} value={ch.id}>{ch.email}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>E-posta Konusu</label>
                                        <input
                                            type="text"
                                            value={automationForm.emailSubject}
                                            onChange={(e) => setAutomationForm({ ...automationForm, emailSubject: e.target.value })}
                                            placeholder="Merhaba {{name}}"
                                        />
                                        <div className="form-hint">Dinamik değişkenler: {'{{name}}'}, {'{{phone}}'}, {'{{email}}'}</div>
                                    </div>
                                    <div className="form-group">
                                        <label>E-posta İçeriği</label>
                                        <textarea
                                            value={automationForm.emailBody}
                                            onChange={(e) => setAutomationForm({ ...automationForm, emailBody: e.target.value })}
                                            placeholder="Merhaba {{name}}, talebiniz alınmıştır..."
                                            rows={5}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="checkbox-label">
                                            <input
                                                type="checkbox"
                                                checked={automationForm.emailIsHtml}
                                                onChange={(e) => setAutomationForm({ ...automationForm, emailIsHtml: e.target.checked })}
                                            />
                                            HTML olarak gönder
                                        </label>
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowAutomationModal(false)}>
                                İptal
                            </button>
                            <button className="btn btn-primary" onClick={handleSaveAutomation}>
                                {editingAutomation ? 'Güncelle' : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            )
            }

            {/* Send Template Modal */}
            {
                showSendModal && sendingTemplate && (
                    <div className="modal-overlay" onClick={() => setShowSendModal(false)}>
                        <div className="modal send-template-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>📨 Şablon Gönder: {sendingTemplate.name}</h2>
                                <button className="modal-close" onClick={() => setShowSendModal(false)}>×</button>
                            </div>
                            <div className="modal-body">
                                {/* Template Preview */}
                                <div className="template-body" style={{ marginBottom: '20px' }}>
                                    <p>{sendingTemplate.bodyText}</p>
                                </div>

                                {/* Selected Contact */}
                                {selectedContact ? (
                                    <div className="selected-contact">
                                        <div>
                                            <strong>{selectedContact.name}</strong>
                                            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{selectedContact.phone}</div>
                                        </div>
                                        <button className="remove-btn" onClick={() => setSelectedContact(null)}>
                                            <X size={18} />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {/* Contact Search */}
                                        <div className="form-group contact-search">
                                            <label>Kişi Ara</label>
                                            <div style={{ position: 'relative' }}>
                                                <input
                                                    type="text"
                                                    value={contactSearch}
                                                    onChange={(e) => handleContactSearch(e.target.value)}
                                                    placeholder="İsim veya telefon ile ara..."
                                                />
                                                {contactResults.length > 0 && (
                                                    <div className="contact-results">
                                                        {contactResults.map(contact => (
                                                            <div
                                                                key={contact.id}
                                                                className="contact-result-item"
                                                                onClick={() => {
                                                                    setSelectedContact(contact);
                                                                    setContactSearch('');
                                                                    setContactResults([]);
                                                                }}
                                                            >
                                                                <span>{contact.name}</span>
                                                                <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{contact.phone}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ textAlign: 'center', color: '#94a3b8', margin: '16px 0' }}>veya</div>

                                        {/* Direct Phone Number */}
                                        <div className="form-group">
                                            <label>Telefon Numarası</label>
                                            <input
                                                type="text"
                                                value={phoneNumber}
                                                onChange={(e) => setPhoneNumber(e.target.value)}
                                                placeholder="905551234567"
                                            />
                                            <div className="form-hint">Ülke kodu ile birlikte girin (+ işareti olmadan)</div>
                                        </div>
                                    </>
                                )}

                                {/* Template Variables */}
                                {templateVariables.length > 0 && (
                                    <div className="variables-section">
                                        <h4>Değişkenler</h4>
                                        {templateVariables.map((v, idx) => (
                                            <div key={idx} className="variable-input">
                                                <label>{v.placeholder}</label>
                                                <input
                                                    type="text"
                                                    value={v.value}
                                                    onChange={(e) => {
                                                        const newVars = [...templateVariables];
                                                        newVars[idx].value = e.target.value;
                                                        setTemplateVariables(newVars);
                                                    }}
                                                    placeholder={`Değer ${idx + 1}`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setShowSendModal(false)}>
                                    İptal
                                </button>
                                <button
                                    className="btn btn-success"
                                    onClick={handleSendTemplate}
                                    disabled={sending || (!selectedContact && !phoneNumber)}
                                >
                                    {sending ? 'Gönderiliyor...' : 'Gönder'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Automations;


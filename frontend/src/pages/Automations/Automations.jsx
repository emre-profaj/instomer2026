import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import api, { automationAPI, rulesAPI, teamAPI, emailAPI, funnelAPI, retellAPI, contactAPI, flowAPI } from '../../services/api';
import {
    MessageSquare, Zap, Plus, Trash2, Edit2, Send, RefreshCw,
    CheckCircle, Clock, XCircle, Globe, Search, X,
    Smartphone, Settings, Shield, Tag, ChevronDown, ChevronUp, GitBranch
} from 'lucide-react';
import './Automations.css';
import FlowBuilder from './FlowBuilder';

const Automations = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const [activeTab, setActiveTab] = useState('templates');
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);

    // Templates
    const [templates, setTemplates] = useState([]);
    const [showContactModal, setShowContactModal] = useState(false);
    const [automationModalMode, setAutomationModalMode] = useState('add');
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [templateForm, setTemplateForm] = useState({
        name: '',
        language: 'tr',
        category: 'MARKETING',
        status: 'PENDING',
        headerType: '',
        headerContent: '',
        headerHandle: '',
        headerMediaUrl: '',
        bodyText: '',
        footerText: '',
        buttons: []
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
        emailIsHtml: false,
        // New actions
        targetTeamId: '',
        targetFlowId: '',
        reminderMessage: '',
        reminderDelayMin: 60,
        callAgentId: '',
        appointmentType: 'GENERAL',
        marketingTplId: ''
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

    // Data for new actions
    const [funnels, setFunnels] = useState([]);
    const [flows, setFlows] = useState([]);
    const [flowDropdownOpen, setFlowDropdownOpen] = useState(false);
    const flowDropdownRef = useRef(null);
    const [retellAgents, setRetellAgents] = useState([]);

    // --- Rules (Rules) state ---
    const [rules, setRules] = useState([]);
    const [teams, setTeams] = useState([]);
    const [rulesLoading, setRulesLoading] = useState(false);
    const [rulesSaving, setRulesSaving] = useState({});
    // Keyword editing
    const [newKeyword, setNewKeyword] = useState('');
    const [expandedRules, setExpandedRules] = useState({ HOT_KEYWORD: true, HOT_OPPORT_EMAIL: true });



    // Close flow dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (flowDropdownRef.current && !flowDropdownRef.current.contains(e.target)) {
                setFlowDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        if (currentWorkspace?.id) {
            loadData();
        }
    }, [currentWorkspace]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [templatesRes, automationsRes, emailRes, rulesRes, teamsRes, funnelsRes, agentsRes, flowsRes] = await Promise.all([
                automationAPI.getTemplates(currentWorkspace.id),
                automationAPI.getAutomations(currentWorkspace.id),
                emailAPI.getChannels(currentWorkspace.id).catch(() => ({ data: { emailChannels: [] } })),
                rulesAPI.getAll(currentWorkspace.id).catch(() => ({ data: { rules: [] } })),
                teamAPI.getWorkspaceTeams(currentWorkspace.id).catch(() => ({ data: { teams: [] } })),
                funnelAPI.getAll(currentWorkspace.id).catch(() => ({ data: { funnels: [] } })),
                retellAPI.getAgents(currentWorkspace.id).catch(() => ({ data: { agents: [] } })),
                flowAPI.getAll(currentWorkspace.id).catch(() => ({ data: { flows: [] } }))
            ]);
            setTemplates(templatesRes.data.templates || []);
            setAutomations(automationsRes.data.automations || []);
            setEmailChannels(emailRes.data?.emailChannels || []);
            setRules(rulesRes.data.rules || []);
            setTeams(teamsRes.data.teams || []);
            setFunnels(funnelsRes.data.funnels || []);
            setRetellAgents(agentsRes.data.agents || []);
            setFlows(flowsRes.data.flows || []);


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
            const { message, syncedCount, errors } = response.data;
            if (errors && errors.length > 0) {
                const errMsgs = errors.map(e => `${e.phone}: ${e.error}`).join('\n');
                alert(`${message}\n\n⚠️ Hatalar:\n${errMsgs}`);
            } else {
                alert(message || 'Şablonlar senkronize edildi');
            }
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
            if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(templateForm.headerType) && !templateForm.headerHandle && !templateForm.headerMediaUrl) {
                alert('Lütfen bir medya dosyası seçip yüklenmesini bekleyin.');
                return;
            }

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
        if (!confirm('Are you sure you want to delete this template?')) return;
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
            name: template.name,
            language: template.language,
            category: template.category,
            status: template.status,
            bodyText: template.bodyText,
            headerType: template.headerType || '',
            headerContent: template.headerContent || '',
            footerText: template.footerText || '',
            buttons: template.buttons ? (typeof template.buttons === 'string' ? JSON.parse(template.buttons) : template.buttons) : []
        });
        setShowTemplateModal(true);
    };

    const resetTemplateForm = () => {
        setTemplateForm({
            name: '',
            language: 'tr',
            category: 'MARKETING',
            status: 'PENDING',
            headerType: '',
            headerContent: '',
            headerHandle: '',
            headerMediaUrl: '',
            bodyText: '',
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
        if (!confirm('Are you sure you want to delete this automation?')) return;
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
            emailIsHtml: automation.emailIsHtml || false,
            targetTeamId: automation.targetTeamId || '',
            targetFlowId: automation.targetFlowId || '',
            reminderMessage: automation.reminderMessage || '',
            reminderDelayMin: automation.reminderDelayMin || 60,
            callAgentId: automation.callAgentId || '',
            appointmentType: automation.appointmentType || 'GENERAL',
            marketingTplId: automation.marketingTplId || ''
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
            emailIsHtml: false,
            targetTeamId: '',
            targetFlowId: '',
            reminderMessage: '',
            reminderDelayMin: 60,
            callAgentId: '',
            appointmentType: 'GENERAL',
            marketingTplId: ''
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
            alert('Template message sent!');
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
            case 'NEW_WEBFORM': return '📋 Yeni Web Form';
            case 'RETELL_COMPLETED_SUCCESS': return '📞 AI Call: Başarılı Görüşme';
            case 'RETELL_COMPLETED_FAIL': return '📞 AI Call: Başarısız Görüşme';
            default: return trigger;
        }
    };

    const getActionLabel = (action) => {
        switch (action) {
            case 'SEND_TEMPLATE': return '📨 Şablon Gönder';
            case 'SEND_MESSAGE': return '💬 Mesaj Gönder';
            case 'SEND_EMAIL': return '📧 E-posta Gönder';
            case 'ASSIGN_AGENT': return '👤 Temsilci Ata';
            case 'ASSIGN_TEAM': return '👥 Takıma Ata';
            case 'SCHEDULE_APPOINTMENT': return '🗓️ Randevu Oluştur';
            case 'START_CALL': return '📞 Arama Başlat';
            case 'SEND_MARKETING': return '📢 Pazarlama Mesajı';
            case 'CHANGE_FLOW': return '🔀 Akış Değiştir';
            case 'SEND_REMINDER': return '🔔 Hatırlatma Gönder';
            default: return action;
        }
    };

    // ============================================
    // Rules helpers
    // ============================================
    const getRule = (ruleType) => rules.find(r => r.ruleType === ruleType) || { isActive: false, config: {} };

    const saveRule = async (ruleType, updates) => {
        setRulesSaving(s => ({ ...s, [ruleType]: true }));
        try {
            const current = getRule(ruleType);
            const payload = { ...updates };
            const res = await rulesAPI.upsert(currentWorkspace.id, ruleType, payload);
            setRules(prev => prev.map(r => r.ruleType === ruleType ? res.data.rule : r)
                .concat(prev.some(r => r.ruleType === ruleType) ? [] : [res.data.rule]));
        } catch (err) {
            alert(err.response?.data?.error || 'Kural kaydedilemedi');
        } finally {
            setRulesSaving(s => ({ ...s, [ruleType]: false }));
        }
    };

    const toggleRule = (ruleType) => {
        const current = getRule(ruleType);
        saveRule(ruleType, { isActive: !current.isActive, config: current.config });
    };

    const addKeyword = () => {
        const kw = newKeyword.trim().toLowerCase();
        if (!kw) return;
        const rule = getRule('HOT_KEYWORD');
        const keywords = rule.config?.keywords || [];
        if (keywords.includes(kw)) { setNewKeyword(''); return; }
        const updatedConfig = { ...rule.config, keywords: [...keywords, kw] };
        saveRule('HOT_KEYWORD', { isActive: rule.isActive, config: updatedConfig });
        setNewKeyword('');
    };

    const removeKeyword = (kw) => {
        const rule = getRule('HOT_KEYWORD');
        const keywords = (rule.config?.keywords || []).filter(k => k !== kw);
        saveRule('HOT_KEYWORD', { isActive: rule.isActive, config: { ...rule.config, keywords } });
    };

    const updateRule3Config = (field, value) => {
        const rule = getRule('HOT_OPPORT_EMAIL');
        const updatedConfig = { ...rule.config, [field]: value };
        saveRule('HOT_OPPORT_EMAIL', { isActive: rule.isActive, config: updatedConfig });
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
                    Şablonlar ({templates.length})
                </button>
                <button
                    className={`tab-btn ${activeTab === 'automations' ? 'active' : ''}`}
                    onClick={() => setActiveTab('automations')}
                >
                    <Zap size={18} />
                    Basit Otomasyonlar ({automations.length})
                </button>
                <button
                    className={`tab-btn ${activeTab === 'flows' ? 'active' : ''}`}
                    onClick={() => setActiveTab('flows')}
                >
                    <GitBranch size={18} />
                    Dinamik Otomasyonlar
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
                                <p>{t('automations.addTemplateDesc') || "Yeni bir şablon oluşturmak için Şablon Ekle butonuna tıklayın."}</p>
                                <button className="btn btn-primary" onClick={() => { resetTemplateForm(); setEditingTemplate(null); setShowTemplateModal(true); }}>
                                    <Plus size={18} />
                                    Şablon Ekle
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

                {/* Basit Otomasyonlar Tab (Automations + Rules merged) */}
                {activeTab === 'automations' && (
                    <div>
                        <div className="table-responsive" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    <tr>
                                        <th style={{ padding: '16px 24px', fontWeight: 600, color: '#4b5563', fontSize: '0.85rem' }}>Otomasyon Adı</th>
                                        <th style={{ padding: '16px 24px', fontWeight: 600, color: '#4b5563', fontSize: '0.85rem' }}>Durum</th>
                                        <th style={{ padding: '16px 24px', fontWeight: 600, color: '#4b5563', fontSize: '0.85rem' }}>Tetikleyici</th>
                                        <th style={{ padding: '16px 24px', fontWeight: 600, color: '#4b5563', fontSize: '0.85rem' }}>Aksiyon</th>
                                        <th style={{ padding: '16px 24px', fontWeight: 600, color: '#4b5563', fontSize: '0.85rem', textAlign: 'right' }}>İşlemler</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {automations.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" style={{ padding: '60px 24px', textAlign: 'center' }}>
                                                <div className="empty-state" style={{ border: 'none', background: 'transparent' }}>
                                                    <div className="icon">⚡</div>
                                                    <h3>Henüz otomasyon yok</h3>
                                                    <p style={{ color: '#6b7280', marginTop: '8px' }}>Tetikleyici ve aksiyon seçerek ilk otomasyonunuzu oluşturun.</p>
                                                    <button className="btn btn-primary" style={{ marginTop: '20px' }} onClick={() => { resetAutomationForm(); setShowAutomationModal(true); }}>
                                                        <Plus size={18} /> Otomasyon Oluştur
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        automations.map(automation => (
                                            <tr key={automation.id} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                <td style={{ padding: '16px 24px', color: '#111827', fontWeight: 500, fontSize: '0.9rem' }}>
                                                    {automation.name}
                                                    {automation.description && (
                                                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 4, fontWeight: 400 }}>{automation.description}</div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '16px 24px' }}>
                                                    <span style={{ 
                                                        fontSize: '0.7rem', fontWeight: 600, padding: '4px 10px', borderRadius: '6px',
                                                        backgroundColor: automation.isActive ? '#dcfce7' : '#f3f4f6',
                                                        color: automation.isActive ? '#16a34a' : '#6b7280',
                                                        letterSpacing: '0.5px'
                                                    }}>
                                                        {automation.isActive ? 'AKTİF' : 'PASİF'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '16px 24px', color: '#4b5563', fontSize: '0.9rem' }}>
                                                    {getTriggerLabel(automation.trigger)}
                                                </td>
                                                <td style={{ padding: '16px 24px', color: '#4b5563', fontSize: '0.9rem' }}>
                                                    {getActionLabel(automation.action)}
                                                </td>
                                                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                        <button className="btn btn-icon" onClick={() => openEditAutomation(automation)} style={{ color: '#6b7280', padding: '6px', background: 'transparent', border: 'none', cursor: 'pointer' }} title="Düzenle">
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button className="btn btn-icon" onClick={() => handleDeleteAutomation(automation.id)} style={{ color: '#ef4444', padding: '6px', background: 'transparent', border: 'none', cursor: 'pointer' }} title="Sil">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>


                    </div>
                )}

                {/* Dinamik Otomasyonlar Tab */}
                {activeTab === 'flows' && (
                    <FlowBuilder workspaceId={currentWorkspace?.id} />
                )}


                {/* Template Modal */}
                {showTemplateModal && (
                    <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{editingTemplate ? 'Edit Template' : 'Add Template'}</h2>
                                <button className="modal-close" onClick={() => setShowTemplateModal(false)}>×</button>
                            </div>
                            <div className="modal-body">
                                <div className="form-info-note">
                                    ℹ️ Şablonunuz kaydedildiğinde Meta'ya gönderilecek ve onay sürecine (PENDING) girecektir. Meta onayladığında otomatik olarak ONAYLI statüsüne geçer.
                                </div>
                                <div className="form-row">
                                    <div className="form-group" style={{ flex: 1 }}>
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
                                            <label>Medya Dosyası (Zorunlu)</label>
                                            <input
                                                type="file"
                                                accept={
                                                    templateForm.headerType === 'IMAGE' ? 'image/jpeg,image/png' :
                                                    templateForm.headerType === 'VIDEO' ? 'video/mp4' :
                                                    '.pdf'
                                                }
                                                disabled={isUploadingMedia}
                                                onChange={async (e) => {
                                                    const file = e.target.files[0];
                                                    if (!file) return;

                                                    // Validate size
                                                    const maxSize = templateForm.headerType === 'IMAGE' ? 5 : templateForm.headerType === 'VIDEO' ? 16 : 100;
                                                    if (file.size > maxSize * 1024 * 1024) {
                                                        alert(`Dosya boyutu en fazla ${maxSize}MB olabilir.`);
                                                        return;
                                                    }

                                                    setIsUploadingMedia(true);
                                                    const formData = new FormData();
                                                    formData.append('file', file);

                                                    try {
                                                        const res = await api.post(`/automations/${currentWorkspace.id}/templates/upload-media`, formData, {
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
                                        className="form-control"
                                        value={templateForm.footerText}
                                        onChange={(e) => setTemplateForm({ ...templateForm, footerText: e.target.value })}
                                        placeholder="örn: Yanıt vermek için EVET yazın"
                                    />
                                </div>

                                <div className="form-group">
                                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        Eylem Düğmeleri (Opsiyonel)
                                        {templateForm.buttons.length < 3 && (
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                style={{ padding: '4px 8px', fontSize: '12px' }}
                                                onClick={() => {
                                                    setTemplateForm({
                                                        ...templateForm,
                                                        buttons: [...templateForm.buttons, { type: 'URL', text: '', url: '' }]
                                                    });
                                                }}
                                            >
                                                <Plus size={14} style={{ marginRight: '4px' }} /> Düğme Ekle
                                            </button>
                                        )}
                                    </label>
                                    
                                    {templateForm.buttons.map((btn, idx) => (
                                        <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px', background: '#f9fafb', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', alignItems: 'center' }}>
                                            <select
                                                className="form-control"
                                                value={btn.type}
                                                onChange={(e) => {
                                                    const newBtns = [...templateForm.buttons];
                                                    const newType = e.target.value;
                                                    newBtns[idx] = { type: newType, text: btn.text };
                                                    if (newType === 'URL') newBtns[idx].url = '';
                                                    if (newType === 'PHONE_NUMBER') newBtns[idx].phone_number = '';
                                                    setTemplateForm({ ...templateForm, buttons: newBtns });
                                                }}
                                                style={{ flex: '1', minWidth: '130px' }}
                                            >
                                                <option value="URL">🌐 Site Ziyareti (URL)</option>
                                                <option value="PHONE_NUMBER">📞 Telefonla Ara</option>
                                                <option value="QUICK_REPLY">💬 Hızlı Yanıt (Metin)</option>
                                            </select>
                                            
                                            <input
                                                className="form-control"
                                                placeholder="Düğme Yazısı (Örn: İncele)"
                                                value={btn.text}
                                                onChange={(e) => {
                                                    const newBtns = [...templateForm.buttons];
                                                    newBtns[idx].text = e.target.value;
                                                    setTemplateForm({ ...templateForm, buttons: newBtns });
                                                }}
                                                style={{ flex: '1' }}
                                                maxLength={20}
                                            />
                                            
                                            {btn.type === 'URL' && (
                                                <input
                                                    className="form-control"
                                                    placeholder="https://..."
                                                    value={btn.url || ''}
                                                    onChange={(e) => {
                                                        const newBtns = [...templateForm.buttons];
                                                        newBtns[idx].url = e.target.value;
                                                        setTemplateForm({ ...templateForm, buttons: newBtns });
                                                    }}
                                                    style={{ flex: '1.5' }}
                                                />
                                            )}
                                            
                                            {btn.type === 'PHONE_NUMBER' && (
                                                <input
                                                    className="form-control"
                                                    placeholder="+90555..."
                                                    value={btn.phone_number || ''}
                                                    onChange={(e) => {
                                                        const newBtns = [...templateForm.buttons];
                                                        newBtns[idx].phone_number = e.target.value;
                                                        setTemplateForm({ ...templateForm, buttons: newBtns });
                                                    }}
                                                    style={{ flex: '1.5' }}
                                                />
                                            )}
                                            
                                            <button
                                                type="button"
                                                className="btn btn-danger btn-icon"
                                                onClick={() => {
                                                    const newBtns = templateForm.buttons.filter((_, i) => i !== idx);
                                                    setTemplateForm({ ...templateForm, buttons: newBtns });
                                                }}
                                                style={{ flex: 'none', padding: '6px' }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                    {templateForm.buttons.length > 0 && (
                                        <small style={{ color: '#6b7280', display: 'block', marginTop: '5px' }}>
                                            * Maksimum 3 buton eklenebilir. (Meta kuralları gereği)
                                        </small>
                                    )}
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
                                <h2>{editingAutomation ? 'Otomasyonu Düzenle' : 'Otomasyon Oluştur'}</h2>
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
                                    <label>{t('teams.descriptionLabel')}</label>
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
                                            <option value="NEW_WEBFORM">📋 Yeni Web Form Geldiğinde</option>
                                            <option value="RETELL_COMPLETED_SUCCESS">📞 AI Call Konuşması Başarılı Olduğunda</option>
                                            <option value="RETELL_COMPLETED_FAIL">📞 AI Call Konuşması Başarısız Olduğunda</option>
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
                                        <label className={`action-card ${automationForm.selectedActions?.includes('ASSIGN_TEAM') ? 'selected' : ''}`}>
                                            <input
                                                type="checkbox"
                                                checked={automationForm.selectedActions?.includes('ASSIGN_TEAM')}
                                                onChange={(e) => {
                                                    const actions = automationForm.selectedActions || [];
                                                    if (e.target.checked) {
                                                        setAutomationForm({ ...automationForm, selectedActions: [...actions, 'ASSIGN_TEAM'] });
                                                    } else {
                                                        setAutomationForm({ ...automationForm, selectedActions: actions.filter(a => a !== 'ASSIGN_TEAM') });
                                                    }
                                                }}
                                            />
                                            <span className="action-icon">👥</span>
                                            <span className="action-label">Takıma Ata</span>
                                        </label>
                                        <label className={`action-card ${automationForm.selectedActions?.includes('SCHEDULE_APPOINTMENT') ? 'selected' : ''}`}>
                                            <input
                                                type="checkbox"
                                                checked={automationForm.selectedActions?.includes('SCHEDULE_APPOINTMENT')}
                                                onChange={(e) => {
                                                    const actions = automationForm.selectedActions || [];
                                                    if (e.target.checked) {
                                                        setAutomationForm({ ...automationForm, selectedActions: [...actions, 'SCHEDULE_APPOINTMENT'] });
                                                    } else {
                                                        setAutomationForm({ ...automationForm, selectedActions: actions.filter(a => a !== 'SCHEDULE_APPOINTMENT') });
                                                    }
                                                }}
                                            />
                                            <span className="action-icon">🗓️</span>
                                            <span className="action-label">Randevu Oluştur</span>
                                        </label>
                                        <label className={`action-card ${automationForm.selectedActions?.includes('START_CALL') ? 'selected' : ''}`}>
                                            <input
                                                type="checkbox"
                                                checked={automationForm.selectedActions?.includes('START_CALL')}
                                                onChange={(e) => {
                                                    const actions = automationForm.selectedActions || [];
                                                    if (e.target.checked) {
                                                        setAutomationForm({ ...automationForm, selectedActions: [...actions, 'START_CALL'] });
                                                    } else {
                                                        setAutomationForm({ ...automationForm, selectedActions: actions.filter(a => a !== 'START_CALL') });
                                                    }
                                                }}
                                            />
                                            <span className="action-icon">📞</span>
                                            <span className="action-label">Arama Başlat</span>
                                        </label>
                                        <label className={`action-card ${automationForm.selectedActions?.includes('SEND_MARKETING') ? 'selected' : ''}`}>
                                            <input
                                                type="checkbox"
                                                checked={automationForm.selectedActions?.includes('SEND_MARKETING')}
                                                onChange={(e) => {
                                                    const actions = automationForm.selectedActions || [];
                                                    if (e.target.checked) {
                                                        setAutomationForm({ ...automationForm, selectedActions: [...actions, 'SEND_MARKETING'] });
                                                    } else {
                                                        setAutomationForm({ ...automationForm, selectedActions: actions.filter(a => a !== 'SEND_MARKETING') });
                                                    }
                                                }}
                                            />
                                            <span className="action-icon">📢</span>
                                            <span className="action-label">Pazarlama Mesajı</span>
                                        </label>
                                        <label className={`action-card ${automationForm.selectedActions?.includes('CHANGE_FLOW') ? 'selected' : ''}`}>
                                            <input
                                                type="checkbox"
                                                checked={automationForm.selectedActions?.includes('CHANGE_FLOW')}
                                                onChange={(e) => {
                                                    const actions = automationForm.selectedActions || [];
                                                    if (e.target.checked) {
                                                        setAutomationForm({ ...automationForm, selectedActions: [...actions, 'CHANGE_FLOW'] });
                                                    } else {
                                                        setAutomationForm({ ...automationForm, selectedActions: actions.filter(a => a !== 'CHANGE_FLOW') });
                                                    }
                                                }}
                                            />
                                            <span className="action-icon">🔀</span>
                                            <span className="action-label">Akış Değiştir</span>
                                        </label>
                                        <label className={`action-card ${automationForm.selectedActions?.includes('SEND_REMINDER') ? 'selected' : ''}`}>
                                            <input
                                                type="checkbox"
                                                checked={automationForm.selectedActions?.includes('SEND_REMINDER')}
                                                onChange={(e) => {
                                                    const actions = automationForm.selectedActions || [];
                                                    if (e.target.checked) {
                                                        setAutomationForm({ ...automationForm, selectedActions: [...actions, 'SEND_REMINDER'] });
                                                    } else {
                                                        setAutomationForm({ ...automationForm, selectedActions: actions.filter(a => a !== 'SEND_REMINDER') });
                                                    }
                                                }}
                                            />
                                            <span className="action-icon">🔔</span>
                                            <span className="action-label">Hatırlatma</span>
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
                                </div>

                                {automationForm.selectedActions?.includes('SEND_MESSAGE') && (
                                    <div className="form-group">
                                        <label>Mesaj İçeriği</label>
                                        <textarea
                                            value={automationForm.messageContent}
                                            onChange={(e) => setAutomationForm({ ...automationForm, messageContent: e.target.value })}
                                            placeholder="Sendilecek mesaj..."
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

                                {automationForm.selectedActions?.includes('ASSIGN_TEAM') && (
                                    <div className="form-group">
                                        <label>Hedef Takım *</label>
                                        <select
                                            value={automationForm.targetTeamId}
                                            onChange={(e) => setAutomationForm({ ...automationForm, targetTeamId: e.target.value })}
                                        >
                                            <option value="">Takım seçin...</option>
                                            {teams.map(t => (
                                                <option key={t.id} value={t.id}>{t.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {automationForm.selectedActions?.includes('SCHEDULE_APPOINTMENT') && (
                                    <div className="form-group">
                                        <label>Randevu Tipi *</label>
                                        <select
                                            value={automationForm.appointmentType}
                                            onChange={(e) => setAutomationForm({ ...automationForm, appointmentType: e.target.value })}
                                        >
                                            <option value="GENERAL">Genel</option>
                                            <option value="SALES">Satış / Fırsat</option>
                                            <option value="SUPPORT">Destek / Şikayet</option>
                                        </select>
                                    </div>
                                )}

                                {automationForm.selectedActions?.includes('START_CALL') && (
                                    <div className="form-group">
                                        <label>Arama Yapacak AI Agent *</label>
                                        <select
                                            value={automationForm.callAgentId}
                                            onChange={(e) => setAutomationForm({ ...automationForm, callAgentId: e.target.value })}
                                        >
                                            <option value="">Agent seçin...</option>
                                            {retellAgents.map(a => (
                                                <option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>
                                            ))}
                                        </select>
                                        {retellAgents.length === 0 && (
                                            <div className="form-hint" style={{color: '#e74c3c'}}>Kayıtlı sesli asistan bulunamadı. Lütfen sesli asistan oluşturun.</div>
                                        )}
                                    </div>
                                )}

                                {automationForm.selectedActions?.includes('SEND_MARKETING') && (
                                    <div className="form-group">
                                        <label>Pazarlama Şablonu *</label>
                                        <select
                                            value={automationForm.marketingTplId}
                                            onChange={(e) => setAutomationForm({ ...automationForm, marketingTplId: e.target.value })}
                                        >
                                            <option value="">Şablon seçin...</option>
                                            {templates.filter(t => t.category === 'MARKETING' && t.status === 'APPROVED').map(t => (
                                                <option key={t.id} value={t.id}>{t.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {automationForm.selectedActions?.includes('CHANGE_FLOW') && (
                                    <div className="form-group" ref={flowDropdownRef} style={{ position: 'relative' }}>
                                        <label>🔀 Hedef Dinamik Akış *</label>

                                        {/* Custom styled dropdown */}
                                        <div
                                            className={`flow-custom-select ${flowDropdownOpen ? 'open' : ''}`}
                                            onClick={() => setFlowDropdownOpen(o => !o)}
                                        >
                                            <div className="flow-custom-select-value">
                                                {automationForm.targetFlowId ? (
                                                    <>
                                                        <span
                                                            className="flow-status-dot"
                                                            style={{ background: flows.find(f => f.id === automationForm.targetFlowId)?.isActive ? '#10b981' : '#9ca3af' }}
                                                        />
                                                        <span>{flows.find(f => f.id === automationForm.targetFlowId)?.name || 'Akış seçin...'}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="flow-status-dot" style={{ background: '#d1d5db' }} />
                                                        <span style={{ color: '#9ca3af' }}>Akış Seç</span>
                                                    </>
                                                )}
                                            </div>
                                            <ChevronDown size={14} className={`flow-chevron ${flowDropdownOpen ? 'rotated' : ''}`} />
                                        </div>

                                        {flowDropdownOpen && (
                                            <div className="flow-custom-dropdown">
                                                {flows.length === 0 ? (
                                                    <div className="flow-dropdown-empty">
                                                        ⚠️ Henüz akış yok. Dinamik Otomasyonlar sekmesinden oluşturun.
                                                    </div>
                                                ) : (
                                                    flows.map(f => (
                                                        <div
                                                            key={f.id}
                                                            className={`flow-dropdown-item ${automationForm.targetFlowId === f.id ? 'selected' : ''}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setAutomationForm({ ...automationForm, targetFlowId: f.id });
                                                                setFlowDropdownOpen(false);
                                                            }}
                                                        >
                                                            <span
                                                                className="flow-status-dot"
                                                                style={{ background: f.isActive ? '#10b981' : '#9ca3af' }}
                                                            />
                                                            <span className="flow-dropdown-name">{f.name}</span>
                                                            {automationForm.targetFlowId === f.id && (
                                                                <CheckCircle size={13} color="#10b981" />
                                                            )}
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}

                                        {automationForm.targetFlowId && (() => {
                                            const sel = flows.find(f => f.id === automationForm.targetFlowId);
                                            return sel ? (
                                                <div className="form-hint" style={{ color: sel.isActive ? '#10b981' : '#f59e0b', marginTop: 6 }}>
                                                    {sel.isActive ? '✅ Akış aktif ve çalışıyor' : '⚠️ Akış taslak modunda — önce yayınlayın'}
                                                </div>
                                            ) : null;
                                        })()}
                                    </div>
                                )}

                                {automationForm.selectedActions?.includes('SEND_REMINDER') && (
                                    <>
                                        <div className="form-group">
                                            <label>Hatırlatma Gecikmesi (Dakika) *</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={automationForm.reminderDelayMin}
                                                onChange={(e) => setAutomationForm({ ...automationForm, reminderDelayMin: parseInt(e.target.value) || 60 })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Hatırlatma Mesajı *</label>
                                            <textarea
                                                value={automationForm.reminderMessage}
                                                onChange={(e) => setAutomationForm({ ...automationForm, reminderMessage: e.target.value })}
                                                placeholder="Randevunuza 1 saat kaldı..."
                                                rows={3}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setShowAutomationModal(false)}>
                                    Cancel
                                </button>
                                <button className="btn btn-primary" onClick={handleSaveAutomation}>
                                    {editingAutomation ? 'Güncelle' : 'Save'}
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
                                    <h2>📨 Şablon Send: {sendingTemplate.name}</h2>
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
                                        Cancel
                                    </button>
                                    <button
                                        className="btn btn-success"
                                        onClick={handleSendTemplate}
                                        disabled={sending || (!selectedContact && !phoneNumber)}
                                    >
                                        {sending ? 'Sendiliyor...' : 'Send'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }
            </div>
        </div>
    );
};

export default Automations;

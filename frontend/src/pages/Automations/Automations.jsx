import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import api, { automationAPI, rulesAPI, teamAPI, emailAPI, funnelAPI, retellAPI, contactAPI, flowAPI, scheduledMessageAPI } from '../../services/api';
import {
    MessageSquare, Zap, Plus, Trash2, Edit2, Send, RefreshCw,
    CheckCircle, Clock, XCircle, Globe, Search, X,
    Smartphone, Settings, Shield, Tag, ChevronDown, ChevronUp, GitBranch, Phone, Activity
} from 'lucide-react';
import './Automations.css';
import FlowBuilder from './FlowBuilder';

const Automations = ({ initialTab }) => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const [activeTab, setActiveTab] = useState(initialTab || 'automations');

    // NOT: initialTab'i bir effect ile senkronlamıyoruz. Sekme geçişi
    // App.jsx'te route'a verilen key ile çözülüyor — rota değişince bileşen
    // yeniden kuruluyor ve useState doğru başlangıç değerini okuyor.
    // Effect eklemek gereksiz bir ikinci render üretirdi.
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);

    // Otomasyon çalışma kayıtları — başarısızlıklar görünür olsun
    const [showLogs, setShowLogs] = useState(false);
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);

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
        marketingTplId: '',
        conditions: ''
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
    const [selectedFunnelForRule, setSelectedFunnelForRule] = useState({});

    const [segmentList, setSegmentList] = useState([]);
    const [segmentGroups, setSegmentGroups] = useState({});

    // AI Auto-Call master switch
    const [retellAutoCallEnabled, setRetellAutoCallEnabled] = useState(false);
    const [masterToggleSaving, setMasterToggleSaving] = useState(false);
    const [expandedAutoType, setExpandedAutoType] = useState(null);



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
        if (!currentWorkspace?.id) return;
        api.get(`/smart-segments/${currentWorkspace.id}/segments/definitions`)
            .then(res => {
                setSegmentList(res.data.segments || []);
                setSegmentGroups(res.data.groups || {});
            })
            .catch(err => console.error('Segment fetch error:', err));
    }, [currentWorkspace?.id]);

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

            // Load retell auto-call master switch
            try {
                const retellRes = await retellAPI.getSettings(currentWorkspace.id);
                setRetellAutoCallEnabled(retellRes.data.retellAutoCallEnabled || false);
            } catch { }

        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    // AI Auto-Call master toggle
    const handleAutoCallMasterToggle = async () => {
        const newVal = !retellAutoCallEnabled;
        setMasterToggleSaving(true);
        setRetellAutoCallEnabled(newVal);
        try {
            await retellAPI.saveSettings(currentWorkspace.id, { retellAutoCallEnabled: newVal });
        } catch {
            setRetellAutoCallEnabled(!newVal); // rollback
        } finally {
            setMasterToggleSaving(false);
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
            footerText: '',
            buttons: []
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
            marketingTplId: automation.marketingTplId || '',
            conditions: automation.conditions || ''
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
            marketingTplId: '',
            conditions: ''
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
            case 'STAGE_REACHED': return '🏁 Aşama Değişimi';
            case 'DAILY_CHECK': return '📅 Günlük Kontrol';
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

    const updateAutoConfig = (ruleType, field, value) => {
        const rule = getRule(ruleType);
        const updatedConfig = { ...rule.config, [field]: value };
        saveRule(ruleType, { isActive: rule.isActive, config: updatedConfig });
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

    const loadLogs = async () => {
        if (!currentWorkspace?.id) return;
        try {
            setLogsLoading(true);
            const res = await automationAPI.getAutomationLogs(currentWorkspace.id, { limit: 50 });
            setLogs(res.data?.logs || []);
        } catch (err) {
            console.error('Otomasyon kayıtları alınamadı:', err);
            setLogs([]);
        } finally {
            setLogsLoading(false);
        }
    };

    const toggleLogs = () => {
        const next = !showLogs;
        setShowLogs(next);
        if (next) loadLogs();
    };

    return (
        <div className="automations-page">
            {/* Header */}
            <div className="automations-header">
                <h1>
                    <Zap size={24} />
                    Otomasyonlar
                </h1>
                <div className="header-actions">

                    <button className="btn btn-secondary" onClick={toggleLogs} title="Otomasyonların son çalışma kayıtları ve hata sebepleri">
                        <Activity size={16} />
                        {showLogs ? 'Kayıtları Gizle' : 'Çalışma Kayıtları'}
                    </button>

                    {activeTab === 'automations' && (
                        <button className="btn btn-primary" onClick={() => { resetAutomationForm(); setEditingAutomation(null); setShowAutomationModal(true); }}>
                            <Plus size={16} />
                            Otomasyon Ekle
                        </button>
                    )}

                </div>
            </div>

            {/* Tab bar hidden — controlled by initialTab prop from Hub */}

            {/* Otomasyon çalışma kayıtları */}
            {showLogs && (
                <div style={{ margin: '0 0 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>🧾 Son Çalışma Kayıtları</h3>
                        <button className="btn btn-sm btn-secondary" onClick={loadLogs} disabled={logsLoading}>
                            {logsLoading ? 'Yükleniyor...' : 'Yenile'}
                        </button>
                    </div>
                    {logsLoading ? (
                        <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: 0 }}>Yükleniyor...</p>
                    ) : logs.length === 0 ? (
                        <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>
                            Henüz kayıt yok. Bir otomasyon çalıştığında (başarılı veya başarısız) burada görünür.
                        </p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                        <th style={{ padding: '6px 8px' }}>Zaman</th>
                                        <th style={{ padding: '6px 8px' }}>Otomasyon</th>
                                        <th style={{ padding: '6px 8px' }}>Kişi</th>
                                        <th style={{ padding: '6px 8px' }}>Sonuç</th>
                                        <th style={{ padding: '6px 8px' }}>Sebep</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map(l => (
                                        <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: '#6b7280' }}>
                                                {new Date(l.executedAt).toLocaleString('tr-TR')}
                                            </td>
                                            <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '0.78rem' }}>{l.ruleType}</td>
                                            <td style={{ padding: '6px 8px' }}>{l.contact?.name || l.contact?.phone || '—'}</td>
                                            <td style={{ padding: '6px 8px' }}>
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 600,
                                                    background: l.result === 'SUCCESS' ? '#dcfce7' : l.result === 'FAILED' ? '#fef2f2' : '#f3f4f6',
                                                    color: l.result === 'SUCCESS' ? '#166534' : l.result === 'FAILED' ? '#991b1b' : '#6b7280'
                                                }}>
                                                    {l.result === 'SUCCESS' ? 'Başarılı' : l.result === 'FAILED' ? 'Başarısız' : l.result}
                                                </span>
                                            </td>
                                            <td style={{ padding: '6px 8px', color: '#991b1b' }}>{l.error || ''}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Content */}
            <div className="automations-content">


                {/* Basit Otomasyonlar Tab (Automations + Rules merged) */}
                {activeTab === 'automations' && (() => {
                    // ── CATALOG DATA ──
                    const CATALOG = [
                        { type: 'CALL_SUCCESS_NOTIFY', icon: '✅', name: 'Arama Başarılı Bildirimi', desc: 'AI veya normal arama başarılı olduğunda müşteriye özet/teşekkür mesajı gönderir.', group: '📞 Arama Yönetimi', fields: ['templateId', 'channel'] },
                        { type: 'CALL_FAILED_NOTIFY', icon: '📵', name: 'Arama Başarısız Bildirimi', desc: 'AI veya normal arama başarısız olduğunda müşteriye bilgilendirme mesajı gönderir.', group: '📞 Arama Yönetimi', fields: ['templateId', 'channel'] },
                        { type: 'CALL_RETRY', icon: '🔁', name: 'Arama Tekrarlama', desc: 'Ulaşılamayan aramaların kaç kez tekrar deneneceğini belirler. Kademeli gecikmeler AI arama ayarlarından gelir.', group: '📞 Arama Yönetimi', fields: ['delayMinutes', 'maxRetries'] },
                        { type: 'MISSED_CALL_NOTIFY', icon: '📞', name: 'Cevapsız Arama Görevi', desc: 'Cevapsız kalan aramaları takıma bildirir ve geri arama görevi oluşturur.', group: '📞 Arama Yönetimi', fields: ['teamId'] },
                        { type: 'VOICE_MESSAGE_TRANSCRIBE', icon: '🎤', name: 'Sesli Mesaj Çözümleme', desc: 'Gelen sesli mesajları yazıya çevirip müşteri notlarına ekler.', group: '📞 Arama Yönetimi', fields: [] },

                        { type: 'APPOINTMENT_PLANNED_NOTIFY', icon: '📅', name: 'Randevu Planlandı Mesajı', desc: 'Randevu oluşturulduğunda müşteriye "randevunuz planlandı" mesajı gönderir.', group: '📅 Randevu Yönetimi', fields: ['templateId', 'channel'] },
                        { type: 'APPOINTMENT_REMINDER', icon: '🔔', name: 'Randevu Hatırlatma', desc: '"Yarın saat X\'te randevunuz var" — randevu öncesi otomatik hatırlatma gönderir.', group: '📅 Randevu Yönetimi', fields: ['templateId', 'reminderHours'] },
                        { type: 'APPOINTMENT_CONFIRM', icon: '✔️', name: 'Randevu Teyidi', desc: '"Yarın randevunuz var, geliyor musunuz? Evet/Hayır" — Hayır ise otomatik iptal eder.', group: '📅 Randevu Yönetimi', fields: ['templateId', 'reminderHours'] },
                        { type: 'APPOINTMENT_CANCEL_NOTIFY', icon: '❌', name: 'Randevu İptal Bildirimi', desc: 'Randevu iptal edildiğinde müşteriye ve sorumlu kişiye otomatik bildirim gönderir.', group: '📅 Randevu Yönetimi', fields: ['templateId'] },
                        { type: 'NO_SHOW_FOLLOWUP', icon: '👻', name: 'Gelmedi Takibi', desc: 'Randevusuna gelmeyen müşteriye takip mesajı gönderir ve yeni randevu önerir.', group: '📅 Randevu Yönetimi', fields: ['templateId', 'delayMinutes'] },
                        { type: 'HEALTH_APPOINTMENT_PREP', icon: '🏥', name: 'Randevu Hazırlık Bilgisi', desc: 'Sağlık randevusu öncesi hazırlık talimatlarını (aç gelme, belge getirme vb.) gönderir.', group: '📅 Randevu Yönetimi', fields: ['templateId', 'reminderHours'] },

                        { type: 'REQUEST_RECEIVED_NOTIFY', icon: '📩', name: 'Talep Alındı Bildirimi', desc: 'Lead veya arama talebi oluştuğunda müşteriye WhatsApp ile "talebiniz alındı" gönderir.', group: '📩 Talep & Lead', fields: ['templateId', 'channel'] },
                        { type: 'LEAD_WELCOME', icon: '👋', name: 'Hoşgeldin Mesajı', desc: 'Yeni gelen leadlere otomatik karşılama mesajı veya şablonu gönderir.', group: '📩 Talep & Lead', fields: ['templateId', 'channel'] },
                        { type: 'LEAD_SCORING', icon: '🎯', name: 'Lead Puanlama', desc: 'Yeni lead geldiğinde lead skorunu hesaplar. (Skorlama akış ve vaka hareketlerinde de ayrıca çalışır.)', group: '📩 Talep & Lead', fields: [] },
                        { type: 'LEAD_AUTO_ASSIGN', icon: '🎪', name: 'Otomatik Lead Atama', desc: 'Yeni leadin konuşmasını, seçilen takımın en az yüklü üyesine otomatik atar (round-robin).', group: '📩 Talep & Lead', fields: ['teamId'] },
                        { type: 'FUNNEL_STAGE_NOTIFY', icon: '📊', name: 'Aşama Değişiklik Bildirimi', desc: 'Müşteri satış hunisinde aşama değiştirdiğinde sorumlu kişiye bildirim gönderir.', group: '📩 Talep & Lead', fields: ['channel'] },
                        { type: 'NEW_LEAD_NOTIFY', icon: '🆕', name: 'Yeni Lead Bildirimi', desc: 'Yeni bir lead geldiğinde ilgili takıma anlık bildirim gönderir.', group: '📩 Talep & Lead', fields: ['teamId'] },

                        { type: 'SEND_LOCATION', icon: '📍', name: 'Konum Gönder', desc: 'Adres/konum sorulduğunda şube veya firma adresini ve Google Maps bağlantısını gönderir.', group: '📍 Bilgi & İçerik', fields: ['message', 'keywords', 'channel'] },
                        { type: 'SEND_CATALOG', icon: '📦', name: 'Katalog Gönder', desc: 'Katalog/ürün sorulduğunda, girdiğiniz şablonu veya mesajı otomatik gönderir.', group: '📍 Bilgi & İçerik', fields: ['templateId', 'message', 'keywords', 'channel'] },
                        { type: 'PRICE_AUTO_REPLY', icon: '🏷️', name: 'Fiyat Bilgisi Gönder', desc: 'Fiyat sorulduğunda, girdiğiniz şablonu veya mesajı otomatik gönderir. Tetikleyici kelimeleri siz belirlersiniz.', group: '📍 Bilgi & İçerik', fields: ['templateId', 'message', 'keywords', 'channel'] },
                        { type: 'FAQ_AUTO_REPLY', icon: '❓', name: 'SSS Otomatik Cevap', desc: 'Sık sorulan sorulara (çalışma saatleri, adres, ödeme) otomatik yanıt verir.', group: '📍 Bilgi & İçerik', fields: ['templateId', 'message', 'keywords', 'channel'] },
                        { type: 'SEND_WORKING_HOURS', icon: '🕐', name: 'Çalışma Saatleri Bildir', desc: '"Ne zaman açıksınız?" gibi sorulara çalışma saatlerini otomatik gönderir.', group: '📍 Bilgi & İçerik', fields: ['templateId', 'message', 'keywords', 'channel'] },

                        { type: 'DRIP_DAY_0', icon: '📨', name: 'Başvuru Günü Mesajı', desc: 'Bugün başvuran/form dolduran kişiye aynı gün mesaj gönderir. Kanal seçilmezse kişinin geldiği kanaldan gider.', group: '📣 Pazarlama Dizisi', fields: ['templateId', 'channel'] },
                        { type: 'DRIP_DAY_1', icon: '📬', name: '1 Gün Sonra Takip', desc: 'Başvurudan 1 gün sonra WhatsApp şablonu ile hatırlatma gönderir.', group: '📣 Pazarlama Dizisi', fields: ['templateId'] },
                        { type: 'DRIP_DAY_3', icon: '📭', name: '3 Gün Sonra İlgi Ölçme', desc: 'Başvurudan 3 gün sonra ilgi seviyesini ölçen mesaj gönderir.', group: '📣 Pazarlama Dizisi', fields: ['templateId'] },
                        { type: 'DRIP_DAY_7', icon: '📮', name: '7 Gün Sonra Hatırlatma', desc: '1 hafta sonra özel teklif veya bilgilendirme mesajı gönderir.', group: '📣 Pazarlama Dizisi', fields: ['templateId'] },
                        { type: 'DRIP_DAY_14', icon: '💌', name: '14 Gün Sonra Kampanya', desc: '2 hafta sonra son fırsat / kampanya duyurusu gönderir.', group: '📣 Pazarlama Dizisi', fields: ['templateId'] },
                        { type: 'DRIP_DAY_30', icon: '📝', name: '30 Gün Sonra Son Şans', desc: '1 ay sonra "hâlâ ilgileniyor musunuz?" mesajı gönderir.', group: '📣 Pazarlama Dizisi', fields: ['templateId'] },
                        { type: 'POSITIVE_LEAD_CAMPAIGN', icon: '🌟', name: 'Olumlu Leadlere Kampanya', desc: 'Olumlu işaretlenmiş leadlere özel kampanya veya hatırlatıcı mesaj gönderir.', group: '📣 Pazarlama Dizisi', fields: ['templateId'] },

                        { type: 'BIRTHDAY_GREETING', icon: '🎂', name: 'Doğum Günü Kutlama', desc: 'Müşterilerin doğum gününde otomatik kutlama mesajı ve özel teklif gönderir.', group: '🎁 Özel Günler', fields: ['templateId'] },
                        { type: 'CUSTOMER_1ST_YEAR', icon: '🎉', name: 'Müşteri Olmanızın 1. Yılı', desc: '"Müşterimiz olduğunuzun 1. yılı, teşekkürler!" — yıllık sadakat mesajı gönderir.', group: '🎁 Özel Günler', fields: ['templateId'] },
                        { type: 'FIRST_PURCHASE_ANNIV', icon: '🛒', name: 'İlk Alışveriş Yıldönümü', desc: 'Müşterinin ilk alışveriş yıldönümünde özel indirim veya teşekkür mesajı gönderir.', group: '🎁 Özel Günler', fields: ['templateId'] },
                        { type: 'SPECIAL_DAY_CAMPAIGN', icon: '📅', name: 'Özel Gün Kampanyası', desc: 'Bayram, yılbaşı, anneler günü gibi özel günlerde toplu kampanya mesajı gönderir.', group: '🎁 Özel Günler', fields: ['templateId'] },

                        { type: 'SATISFACTION_SURVEY', icon: '⭐', name: 'Memnuniyet Anketi', desc: 'Görüşme veya hizmet sonrası müşteriye otomatik memnuniyet anketi gönderir.', group: '🎯 Müşteri İlişkileri', fields: ['templateId', 'delayMinutes'] },
                        { type: 'POST_SALE_FOLLOWUP', icon: '🛍️', name: 'Satış Sonrası Takip', desc: 'Satış sonrası müşteriye teşekkür ve ürün değerlendirme daveti gönderir.', group: '🎯 Müşteri İlişkileri', fields: ['templateId', 'delayMinutes'] },
                        { type: 'REFERRAL_REQUEST', icon: '🤝', name: 'Referans İsteği', desc: 'Memnun müşterilerden otomatik olarak referans veya yorum talep eder.', group: '🎯 Müşteri İlişkileri', fields: ['templateId'] },
                        { type: 'INACTIVE_REACTIVATION', icon: '💤', name: 'Pasif Müşteri Reaktivasyonu', desc: 'Uzun süredir etkileşim kurmayan müşterilere "sizi özledik" kampanyası gönderir.', group: '🎯 Müşteri İlişkileri', fields: ['templateId', 'delayMinutes'] },

                        { type: 'QUOTE_REMINDER', icon: '💰', name: 'Teklif Hatırlatma', desc: 'Gönderilen tekliflere belirli süre yanıt gelmezse müşteriye hatırlatma gönderir.', group: '💼 Satış & Teklif', fields: ['templateId', 'delayMinutes'] },
                        { type: 'QUOTE_EXPIRY_NOTIFY', icon: '⏳', name: 'Teklif Süresi Dolmak Üzere', desc: 'Teklifin geçerlilik süresi dolmadan müşteriye son hatırlatma gönderir.', group: '💼 Satış & Teklif', fields: ['templateId', 'delayMinutes'] },
                        { type: 'UPSELL_SUGGEST', icon: '💎', name: 'Çapraz Satış Önerisi', desc: 'Mevcut müşterilere ilgili ürün/hizmet önerisi gönderir.', group: '💼 Satış & Teklif', fields: ['templateId'] },
                        { type: 'CONTRACT_RENEWAL', icon: '📋', name: 'Sözleşme Yenileme', desc: 'Sözleşme bitiş tarihinden önce yenileme hatırlatması gönderir.', group: '💼 Satış & Teklif', fields: ['templateId', 'reminderHours'] },

                        { type: 'FIRST_RESPONSE_SLA', icon: '⏱️', name: 'İlk Yanıt SLA Uyarısı', desc: 'Belirli sürede yanıtlanmayan mesajlar için takıma uyarı gönderir.', group: '🛎️ Müşteri Hizmetleri', fields: ['delayMinutes'] },
                        { type: 'COMPLAINT_ESCALATION', icon: '🚨', name: 'Şikayet Eskalasyonu', desc: 'Olumsuz mesajlar algılandığında yöneticiye otomatik bildirim gönderir.', group: '🛎️ Müşteri Hizmetleri', fields: ['teamId'] },
                        { type: 'TICKET_CLOSE_NOTIFY', icon: '🎫', name: 'Destek Talebi Kapatma', desc: 'Belirli süre yanıt gelmeyen destek taleplerini otomatik kapatır ve bildirir.', group: '🛎️ Müşteri Hizmetleri', fields: ['templateId', 'delayMinutes'] },
                        { type: 'AFTER_HOURS_REPLY', icon: '🌙', name: 'Mesai Dışı Otomatik Cevap', desc: 'Mesai dışında gelen mesajlara otomatik bilgilendirme mesajı gönderir.', group: '🛎️ Müşteri Hizmetleri', fields: ['templateId', 'message', 'channel'] },
                        { type: 'VIP_CUSTOMER_ALERT', icon: '👑', name: 'VIP Müşteri Uyarısı', desc: 'VIP müşteriden mesaj geldiğinde sorumlu kişiye anlık bildirim gönderir.', group: '🛎️ Müşteri Hizmetleri', fields: ['teamId'] },

                        { type: 'TASK_OVERDUE_ALERT', icon: '⏰', name: 'Görev Süresi Aşımı', desc: 'Tamamlanmamış görevler sürelerini aştığında sorumlu kişiye uyarı gönderir.', group: '⚙️ Operasyon', fields: ['delayMinutes'] },
                        { type: 'UNASSIGNED_TASK_ALERT', icon: '👤', name: 'Sahipsiz Görev Uyarısı', desc: 'Kimseye atanmamış görevler belirli süre geçince takım liderine bildirir.', group: '⚙️ Operasyon', fields: ['delayMinutes', 'teamId'] },
                        { type: 'DAILY_SUMMARY', icon: '📊', name: 'Günlük Özet Raporu', desc: 'Her gün sonunda açık görevler, aramalar ve yeni leadlerin özetini gönderir.', group: '⚙️ Operasyon', fields: ['channel'] },
                        { type: 'PAYMENT_REMINDER', icon: '💳', name: 'Ödeme Hatırlatma', desc: 'Vadesi gelen veya geciken ödemeler için müşteriye otomatik hatırlatma gönderir.', group: '⚙️ Operasyon', fields: ['templateId', 'delayMinutes'] },
                        { type: 'DOCUMENT_REQUEST', icon: '📄', name: 'Eksik Belge Hatırlatma', desc: 'Eksik belge veya evrak olan müşterilere otomatik hatırlatma gönderir.', group: '⚙️ Operasyon', fields: ['templateId'] },
                        { type: 'TEAM_PERFORMANCE', icon: '📈', name: 'Takım Performans Raporu', desc: 'Haftalık performansı (yanıt süresi, kapanan case, arama sayısı) raporlar.', group: '⚙️ Operasyon', fields: ['channel'] },
                    ];

                    const approvedTpls = templates.filter(t => t.status === 'approved' || t.status === 'APPROVED');
                    const LABELS = { templateId: '📋 WhatsApp Şablonu', channel: '📡 Kanal', delayMinutes: '⏳ Gecikme (dk)', reminderHours: '🔔 Hatırlatma', maxRetries: '🔁 Maks. Deneme', teamId: '👥 Takım', message: '💬 Mesaj', keywords: '🔑 Tetikleyici Kelimeler' };
                    const catalogGroups = [...new Set(CATALOG.map(a => a.group))];

                    // System automation items for category 1
                    const SYSTEM_ITEMS = [
                        { key: 'AI_AUTO_CALL', icon: '🤖', name: 'AI Arama İzni', desc: retellAutoCallEnabled ? 'AI arama asistanları aktif — kendi mesai saatleri ve kurallarına göre arama yapabilirler.' : 'Tüm AI aramaları durduruldu — hiçbir ajan otomatik arama yapamaz.', isActive: retellAutoCallEnabled, isMaster: true },
                        { key: 'SALES_PHONE_CALL', icon: '📞', name: 'Arama Talebi Algılama', desc: 'Form dolduran, mesajla telefon numarası veren veya "beni arayın" diyen kişiler için otomatik arama görevi oluşturur.', isActive: getRule('SALES_PHONE_CALL').isActive },
                        { key: 'APPOINTMENT_AUTO_PLAN', icon: '📅', name: 'Randevu Talebi Algılama', desc: 'Yazışma, AI arama veya formda randevu talebi algılandığında otomatik randevu görevi oluşturur.', isActive: getRule('APPOINTMENT_AUTO_PLAN').isActive },
                        { key: 'PHONE_CAPTURE', icon: '📱', name: 'Telefon Numarası Yakalama', desc: 'Müşteri mesajlarından telefon numarası algılayıp kişi kartına kaydeder.', isActive: getRule('PHONE_CAPTURE').isActive },
                        { key: 'HOT_KEYWORD', icon: '🔥', name: 'Sıcak Anahtar Kelime Algılama', desc: 'Yüksek satın alma niyeti gösteren anahtar kelimeleri algılayıp müşteriyi sıcak fırsat olarak işaretler.', isActive: getRule('HOT_KEYWORD').isActive },
                    ];

                    // All categories in order
                    const ALL_CATEGORIES = [
                        { key: 'system', icon: '🤖', name: 'Sistem Otomasyonları', type: 'system' },
                        { key: 'custom', icon: '✏️', name: 'Özel Otomasyonlar', type: 'custom' },
                        ...catalogGroups.map(g => ({ key: g, icon: g.split(' ')[0], name: g.replace(/^[^\s]+\s/, ''), type: 'catalog', group: g }))
                    ];

                    // Compute active counts per category
                    const getCategoryActiveCount = (cat) => {
                        if (cat.type === 'system') {
                            return SYSTEM_ITEMS.filter(s => s.isActive).length;
                        }
                        if (cat.type === 'custom') {
                            return automations.filter(a => a.isActive).length;
                        }
                        return CATALOG.filter(a => a.group === cat.group).filter(a => getRule(a.type).isActive).length;
                    };
                    const getCategoryTotalCount = (cat) => {
                        if (cat.type === 'system') return SYSTEM_ITEMS.length;
                        if (cat.type === 'custom') return automations.length;
                        return CATALOG.filter(a => a.group === cat.group).length;
                    };

                    return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {ALL_CATEGORIES.map(cat => {
                            const isOpen = expandedAutoType === cat.key;
                            const activeCount = getCategoryActiveCount(cat);
                            const totalCount = getCategoryTotalCount(cat);

                            return (
                                <div key={cat.key} style={{
                                    background: '#fff',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '12px',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                    overflow: 'hidden'
                                }}>
                                    {/* Category Header */}
                                    <div
                                        onClick={() => setExpandedAutoType(isOpen ? null : cat.key)}
                                        style={{
                                            padding: '14px 20px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            cursor: 'pointer',
                                            background: isOpen ? '#f8fafc' : '#fff',
                                            transition: 'background 0.2s',
                                            borderBottom: isOpen ? '1px solid #e5e7eb' : 'none'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{ fontSize: '1.2rem' }}>{cat.icon}</span>
                                            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#111827' }}>{cat.name}</span>
                                            <span style={{
                                                fontSize: '0.7rem', fontWeight: 600,
                                                padding: '2px 8px', borderRadius: '10px',
                                                background: activeCount > 0 ? '#dcfce7' : '#f3f4f6',
                                                color: activeCount > 0 ? '#16a34a' : '#9ca3af'
                                            }}>
                                                {activeCount}/{totalCount} aktif
                                            </span>
                                        </div>
                                        <div style={{ color: '#9ca3af', fontSize: '0.8rem', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>
                                            <ChevronDown size={18} />
                                        </div>
                                    </div>

                                    {/* Category Content */}
                                    {isOpen && (
                                        <div style={{ padding: '8px 12px 12px' }}>

                                            {/* ── SYSTEM AUTOMATIONS ── */}
                                            {cat.type === 'system' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    {SYSTEM_ITEMS.map(item => (
                                                        <div key={item.key} style={{
                                                            padding: '14px 16px',
                                                            background: item.isMaster
                                                                ? (item.isActive ? 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)' : 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)')
                                                                : (item.isActive ? '#f0fdf4' : '#fafafa'),
                                                            border: item.isMaster
                                                                ? (item.isActive ? '1px solid #99f6e4' : '1px solid #fecaca')
                                                                : (item.isActive ? '1px solid #bbf7d0' : '1px solid #f3f4f6'),
                                                            borderRadius: '10px',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center'
                                                        }}>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                                                                    <span style={{ fontWeight: 600, fontSize: '0.88rem', color: item.isActive ? '#111827' : '#9ca3af' }}>
                                                                        {item.name}
                                                                    </span>
                                                                    {item.isMaster && (
                                                                        <span style={{
                                                                            fontSize: '0.65rem', fontWeight: 600,
                                                                            padding: '2px 8px', borderRadius: '10px',
                                                                            background: item.isActive ? '#0d9488' : '#dc2626', color: '#fff'
                                                                        }}>
                                                                            {item.isActive ? 'ANA VANA AÇIK' : 'ANA VANA KAPALI'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '3px', lineHeight: 1.4 }}>
                                                                    {item.desc}
                                                                </div>
                                                            </div>
                                                            <label className="toggle-switch" style={{ flexShrink: 0, marginLeft: '16px' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={item.isActive}
                                                                    onChange={() => {
                                                                        if (item.isMaster) handleAutoCallMasterToggle();
                                                                        else toggleRule(item.key);
                                                                    }}
                                                                    disabled={item.isMaster ? masterToggleSaving : rulesSaving[item.key]}
                                                                />
                                                                <span className="toggle-slider" />
                                                            </label>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* ── CUSTOM AUTOMATIONS ── */}
                                            {cat.type === 'custom' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    {automations.length === 0 ? (
                                                        <div style={{ textAlign: 'center', padding: '30px 16px', color: '#9ca3af' }}>
                                                            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⚡</div>
                                                            <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>Henüz özel otomasyon yok</div>
                                                            <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>Tetikleyici ve aksiyon seçerek ilk otomasyonunuzu oluşturun.</div>
                                                        </div>
                                                    ) : (
                                                        automations.map(automation => (
                                                            <div key={automation.id} style={{
                                                                padding: '12px 16px',
                                                                background: automation.isActive ? '#fff' : '#fafafa',
                                                                border: automation.isActive ? '1px solid #e5e7eb' : '1px solid #f3f4f6',
                                                                borderRadius: '10px',
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center'
                                                            }}>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                                                        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: automation.isActive ? '#111827' : '#9ca3af' }}>
                                                                            {automation.name}
                                                                        </span>
                                                                        <span style={{
                                                                            fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: '6px',
                                                                            backgroundColor: automation.isActive ? '#dcfce7' : '#f3f4f6',
                                                                            color: automation.isActive ? '#16a34a' : '#6b7280'
                                                                        }}>
                                                                            {automation.isActive ? 'AKTİF' : 'PASİF'}
                                                                        </span>
                                                                    </div>
                                                                    <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '3px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                                                        <span>🎯 {getTriggerLabel(automation.trigger)}</span>
                                                                        <span>⚡ {getActionLabel(automation.action)}</span>
                                                                    </div>
                                                                    {automation.description && (
                                                                        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>{automation.description}</div>
                                                                    )}
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '12px' }}>
                                                                    <button onClick={() => openEditAutomation(automation)} style={{ color: '#6b7280', padding: '6px', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '6px' }} title="Düzenle">
                                                                        <Edit2 size={15} />
                                                                    </button>
                                                                    <button onClick={() => handleDeleteAutomation(automation.id)} style={{ color: '#ef4444', padding: '6px', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '6px' }} title="Sil">
                                                                        <Trash2 size={15} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                    <button
                                                        onClick={() => { resetAutomationForm(); setEditingAutomation(null); setShowAutomationModal(true); }}
                                                        style={{
                                                            padding: '10px 16px',
                                                            background: '#f8fafc',
                                                            border: '1px dashed #d1d5db',
                                                            borderRadius: '10px',
                                                            color: '#6366f1',
                                                            fontWeight: 600,
                                                            fontSize: '0.85rem',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '6px',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        <Plus size={16} /> Otomasyon Ekle
                                                    </button>
                                                </div>
                                            )}

                                            {/* ── CATALOG AUTOMATIONS ── */}
                                            {cat.type === 'catalog' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                    {CATALOG.filter(a => a.group === cat.group).map(auto => {
                                                        const rule = getRule(auto.type);
                                                        const isItemExp = expandedAutoType === cat.key && expandedRules[auto.type];
                                                        const cfg = rule.config || {};
                                                        return (
                                                            <div key={auto.type} style={{
                                                                background: rule.isActive ? '#fff' : '#fafafa',
                                                                border: rule.isActive ? '1px solid #d1fae5' : '1px solid #f3f4f6',
                                                                borderRadius: '10px',
                                                                overflow: 'hidden',
                                                                transition: 'all 0.2s'
                                                            }}>
                                                                <div style={{
                                                                    padding: '12px 16px',
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center',
                                                                    cursor: auto.fields.length > 0 ? 'pointer' : 'default',
                                                                    opacity: rule.isActive ? 1 : 0.6
                                                                }} onClick={() => {
                                                                    if (auto.fields.length > 0) {
                                                                        setExpandedRules(prev => ({ ...prev, [auto.type]: !prev[auto.type] }));
                                                                    }
                                                                }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                                                        <span style={{ fontSize: '1.15rem', flexShrink: 0 }}>{auto.icon}</span>
                                                                        <div style={{ minWidth: 0 }}>
                                                                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: rule.isActive ? '#111827' : '#9ca3af' }}>
                                                                                {auto.name}
                                                                            </div>
                                                                            {!isItemExp && <div style={{ fontSize: '0.73rem', color: '#b0b5bd', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{auto.desc}</div>}
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                                                        {auto.fields.length > 0 && <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{isItemExp ? '▲' : '⚙️'}</span>}
                                                                        <label className="toggle-switch" onClick={e => e.stopPropagation()}>
                                                                            <input type="checkbox" checked={rule.isActive} onChange={() => toggleRule(auto.type)} disabled={rulesSaving[auto.type]} />
                                                                            <span className="toggle-slider" />
                                                                        </label>
                                                                    </div>
                                                                </div>
                                                                {isItemExp && (
                                                                    <div style={{ padding: '0 16px 14px', borderTop: '1px solid #f1f5f9' }}>
                                                                        <div style={{ fontSize: '0.78rem', color: '#6b7280', margin: '10px 0 12px', lineHeight: 1.5 }}>{auto.desc}</div>
                                                                        {auto.fields.length > 0 && (
                                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                                                                {auto.fields.includes('templateId') && (
                                                                                    <div style={{ flex: '1 1 200px' }}>
                                                                                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>{LABELS.templateId}</label>
                                                                                        <select style={{ width: '100%', padding: '6px 8px', fontSize: '0.8rem', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#f9fafb' }}
                                                                                            value={cfg.templateId || ''} onChange={e => updateAutoConfig(auto.type, 'templateId', e.target.value)}>
                                                                                            <option value="">Şablon seçin...</option>
                                                                                            {approvedTpls.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                                                                        </select>
                                                                                    </div>
                                                                                )}
                                                                                {auto.fields.includes('channel') && (
                                                                                    <div style={{ flex: '1 1 150px' }}>
                                                                                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>{LABELS.channel}</label>
                                                                                        <select style={{ width: '100%', padding: '6px 8px', fontSize: '0.8rem', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#f9fafb' }}
                                                                                            value={cfg.channel || 'auto'} onChange={e => updateAutoConfig(auto.type, 'channel', e.target.value)}>
                                                                                            <option value="auto">Geldiği kanal (otomatik)</option>
                                                                                            <option value="whatsapp">WhatsApp</option>
                                                                                            <option value="email">E-posta</option>
                                                                                            <option value="widget">Web Sohbeti</option>
                                                                                            <option value="sms">SMS</option>
                                                                                            <option value="both">WhatsApp + E-posta</option>
                                                                                        </select>
                                                                                    </div>
                                                                                )}
                                                                                {auto.fields.includes('delayMinutes') && (
                                                                                    <div style={{ flex: '0 0 120px' }}>
                                                                                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>{LABELS.delayMinutes}</label>
                                                                                        <input type="number" min="0" style={{ width: '100%', padding: '6px 8px', fontSize: '0.8rem', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#f9fafb' }}
                                                                                            value={cfg.delayMinutes ?? 60} onChange={e => updateAutoConfig(auto.type, 'delayMinutes', parseInt(e.target.value) || 0)} />
                                                                                    </div>
                                                                                )}
                                                                                {auto.fields.includes('reminderHours') && (
                                                                                    <div style={{ flex: '0 0 140px' }}>
                                                                                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>{LABELS.reminderHours}</label>
                                                                                        <select style={{ width: '100%', padding: '6px 8px', fontSize: '0.8rem', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#f9fafb' }}
                                                                                            value={cfg.reminderHours ?? 24} onChange={e => updateAutoConfig(auto.type, 'reminderHours', parseInt(e.target.value))}>
                                                                                            <option value={1}>1 saat önce</option>
                                                                                            <option value={2}>2 saat önce</option>
                                                                                            <option value={4}>4 saat önce</option>
                                                                                            <option value={24}>1 gün önce</option>
                                                                                            <option value={48}>2 gün önce</option>
                                                                                        </select>
                                                                                    </div>
                                                                                )}
                                                                                {auto.fields.includes('maxRetries') && (
                                                                                    <div style={{ flex: '0 0 120px' }}>
                                                                                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>{LABELS.maxRetries}</label>
                                                                                        <input type="number" min="1" max="10" style={{ width: '100%', padding: '6px 8px', fontSize: '0.8rem', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#f9fafb' }}
                                                                                            value={cfg.maxRetries ?? 3} onChange={e => updateAutoConfig(auto.type, 'maxRetries', parseInt(e.target.value) || 3)} />
                                                                                    </div>
                                                                                )}
                                                                                {auto.fields.includes('teamId') && (
                                                                                    <div style={{ flex: '1 1 180px' }}>
                                                                                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>{LABELS.teamId}</label>
                                                                                        <select style={{ width: '100%', padding: '6px 8px', fontSize: '0.8rem', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#f9fafb' }}
                                                                                            value={cfg.teamId || ''} onChange={e => updateAutoConfig(auto.type, 'teamId', e.target.value)}>
                                                                                            <option value="">Takım seçin...</option>
                                                                                            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                                                                        </select>
                                                                                    </div>
                                                                                )}
                                                                                {auto.fields.includes('keywords') && (
                                                                                    <div style={{ flex: '1 1 100%' }}>
                                                                                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>{LABELS.keywords}</label>
                                                                                        <input type="text" style={{ width: '100%', padding: '6px 8px', fontSize: '0.8rem', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#f9fafb' }}
                                                                                            value={Array.isArray(cfg.keywords) ? cfg.keywords.join(', ') : (cfg.keywords || '')}
                                                                                            onChange={e => updateAutoConfig(auto.type, 'keywords', e.target.value.split(',').map(k => k.trim()).filter(Boolean))}
                                                                                            placeholder="fiyat, ücret, ne kadar (virgülle ayırın — boş bırakırsanız varsayılanlar kullanılır)" />
                                                                                    </div>
                                                                                )}
                                                                                {auto.fields.includes('message') && (
                                                                                    <div style={{ flex: '1 1 100%' }}>
                                                                                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>{LABELS.message}</label>
                                                                                        <textarea rows={2} style={{ width: '100%', padding: '6px 8px', fontSize: '0.8rem', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#f9fafb', resize: 'vertical', fontFamily: 'inherit' }}
                                                                                            value={cfg.message || ''} onChange={e => updateAutoConfig(auto.type, 'message', e.target.value)} placeholder="Otomatik mesaj içeriğini yazın..." />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}

                                                                        {/* Bağlı Aşama Seçici */}
                                                                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                                                                            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '6px' }}>📌 Bağlı Aşama</label>
                                                                            <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '0 0 6px' }}>Bir aşamaya bağlarsanız, sadece o aşamadaki kişilere uygulanır</p>
                                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                                <select
                                                                                    style={{ flex: 1, padding: '6px 8px', fontSize: '0.8rem', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#f9fafb' }}
                                                                                    value={(() => {
                                                                                        const r = getRule(auto.type);
                                                                                        if (!r.linkedStage) return '';
                                                                                        return r.linkedStage?.funnel?.id || '';
                                                                                    })()}
                                                                                    onChange={e => {
                                                                                        // When funnel changes, reset stage
                                                                                        if (!e.target.value) {
                                                                                            saveRule(auto.type, { isActive: rule.isActive, config: rule.config, linkedStageId: null });
                                                                                        }
                                                                                        setSelectedFunnelForRule(prev => ({ ...prev, [auto.type]: e.target.value }));
                                                                                    }}
                                                                                >
                                                                                    <option value="">Akış seçin...</option>
                                                                                    {funnels.map(f => <option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
                                                                                </select>
                                                                                <select
                                                                                    style={{ flex: 1, padding: '6px 8px', fontSize: '0.8rem', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#f9fafb' }}
                                                                                    value={rule.linkedStageId || rule.linkedStage?.id || ''}
                                                                                    onChange={e => {
                                                                                        saveRule(auto.type, { isActive: rule.isActive, config: rule.config, linkedStageId: e.target.value || null });
                                                                                    }}
                                                                                >
                                                                                    <option value="">Aşama seçin...</option>
                                                                                    {(() => {
                                                                                        const selFunnel = selectedFunnelForRule[auto.type] || rule.linkedStage?.funnel?.id;
                                                                                        if (!selFunnel) return null;
                                                                                        const funnel = funnels.find(f => f.id === selFunnel);
                                                                                        return (funnel?.stages || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>);
                                                                                    })()}
                                                                                </select>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    );
                })()}


                {/* Dinamik Otomasyonlar Tab */}
                {activeTab === 'flows' && (
                    <FlowBuilder workspaceId={currentWorkspace?.id} />
                )}

                {/* Birleşik Otomasyon Paneli */}
                {activeTab === 'unified' && (
                    <UnifiedPanelTab wsId={currentWorkspace?.id} />
                )}

                {/* Arama Şablonları */}
                {activeTab === 'retellTemplates' && (
                    <RetellTemplatesTab wsId={currentWorkspace?.id} />
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
                                            <small className="form-text text-muted" style={{ display: 'block', marginTop: '5px', fontSize: '12px', color: '#6c757d' }}>
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
                                            <option value="STAGE_REACHED">🏁 Belirli Bir Aşamaya Geldiğinde</option>
                                            <option value="DAILY_CHECK">📅 Günlük Kontrol (Doğum Günü vb.)</option>
                                        </select>
                                    </div>
                                    {!['STAGE_REACHED', 'DAILY_CHECK'].includes(automationForm.trigger) && (
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
                                    )}
                                </div>

                                {/* Aşama Tetikleyici: Akış ve Aşama Seçimi */}
                                {automationForm.trigger === 'STAGE_REACHED' && (
                                    <div className="form-row" style={{ marginTop: 8 }}>
                                        <div className="form-group">
                                            <label>Akış *</label>
                                            <select
                                                value={(() => { try { return JSON.parse(automationForm.conditions || '{}').funnelId || ''; } catch { return ''; } })()}
                                                onChange={e => {
                                                    const currentConds = (() => { try { return JSON.parse(automationForm.conditions || '{}'); } catch { return {}; } })();
                                                    currentConds.funnelId = e.target.value || undefined;
                                                    // Akış değişince aşamayı sıfırla
                                                    delete currentConds.stageId;
                                                    setAutomationForm(prev => ({ ...prev, conditions: JSON.stringify(currentConds) }));
                                                }}
                                            >
                                                <option value="">Akış seçin...</option>
                                                {funnels.map(f => <option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>Aşama *</label>
                                            <select
                                                value={(() => { try { return JSON.parse(automationForm.conditions || '{}').stageId || ''; } catch { return ''; } })()}
                                                onChange={e => {
                                                    const currentConds = (() => { try { return JSON.parse(automationForm.conditions || '{}'); } catch { return {}; } })();
                                                    currentConds.stageId = e.target.value || undefined;
                                                    setAutomationForm(prev => ({ ...prev, conditions: JSON.stringify(currentConds) }));
                                                }}
                                            >
                                                <option value="">Aşama seçin...</option>
                                                {(() => {
                                                    const selectedFunnelId = (() => { try { return JSON.parse(automationForm.conditions || '{}').funnelId; } catch { return null; } })();
                                                    if (!selectedFunnelId) return null;
                                                    const funnel = funnels.find(f => f.id === selectedFunnelId);
                                                    return (funnel?.stages || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>);
                                                })()}
                                            </select>
                                        </div>
                                    </div>
                                )}

                                {/* Günlük Kontrol: Koşul Seçimi */}
                                {automationForm.trigger === 'DAILY_CHECK' && (
                                    <div style={{ marginTop: 8 }}>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Günlük Koşul *</label>
                                                <select
                                                    value={(() => { try { return JSON.parse(automationForm.conditions || '{}').dailyCondition || ''; } catch { return ''; } })()}
                                                    onChange={e => {
                                                        const currentConds = (() => { try { return JSON.parse(automationForm.conditions || '{}'); } catch { return {}; } })();
                                                        currentConds.dailyCondition = e.target.value || undefined;
                                                        if (e.target.value !== 'INACTIVE') delete currentConds.inactiveDays;
                                                        setAutomationForm(prev => ({ ...prev, conditions: JSON.stringify(currentConds) }));
                                                    }}
                                                >
                                                    <option value="">Koşul seçin...</option>
                                                    <option value="BIRTHDAY">🎂 Doğum Günü Bugün Olanlar</option>
                                                    <option value="INACTIVE">💤 Belirli Süredir Hareketsiz</option>
                                                    <option value="ANNIVERSARY">🎉 Müşteri Yıldönümü</option>
                                                </select>
                                            </div>
                                            {(() => {
                                                try {
                                                    const conds = JSON.parse(automationForm.conditions || '{}');
                                                    if (conds.dailyCondition === 'INACTIVE') {
                                                        return (
                                                            <div className="form-group">
                                                                <label>Hareketsizlik Süresi (gün)</label>
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    value={conds.inactiveDays || 30}
                                                                    onChange={e => {
                                                                        const currentConds = { ...conds, inactiveDays: parseInt(e.target.value) || 30 };
                                                                        setAutomationForm(prev => ({ ...prev, conditions: JSON.stringify(currentConds) }));
                                                                    }}
                                                                    placeholder="30"
                                                                />
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                } catch { return null; }
                                            })()}
                                        </div>
                                    </div>
                                )}


                                {/* Hedef Kitle (Opsiyonel) */}
                                <div style={{ marginTop: 16, marginBottom: 16, padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span>🎯</span> Hedef Kitle <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }}>(opsiyonel)</span>
                                    </div>
                                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
                                        Sadece belirli segmentteki kişilere uygulanmasını istiyorsanız seçin
                                    </div>
                                    
                                    {/* Segment Seçimi */}
                                    <div style={{ marginBottom: 8 }}>
                                        <label style={{ fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4, display: 'block' }}>Akıllı Segment</label>
                                        <select
                                            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}
                                            value={(() => { try { return JSON.parse(automationForm.conditions || '{}').segment || ''; } catch { return ''; } })()}
                                            onChange={e => {
                                                const currentConds = (() => { try { return JSON.parse(automationForm.conditions || '{}'); } catch { return {}; } })();
                                                if (e.target.value) {
                                                    currentConds.segment = e.target.value;
                                                } else {
                                                    delete currentConds.segment;
                                                }
                                                setAutomationForm(prev => ({ ...prev, conditions: Object.keys(currentConds).length ? JSON.stringify(currentConds) : '' }));
                                            }}
                                        >
                                            <option value="">Tüm kişiler (filtre yok)</option>
                                            {Object.entries(segmentGroups).map(([groupKey, segs]) => (
                                                <optgroup key={groupKey} label={{
                                                    TIME: '📅 Zaman Bazlı',
                                                    LEAD_STATUS: '🔥 Lead Durumu',
                                                    CALL_STATUS: '📞 Arama Durumu',
                                                    BUSINESS: '📋 İş Durumu',
                                                    SOURCE: '🌐 Kaynak',
                                                    ENGAGEMENT: '💤 Etkileşim'
                                                }[groupKey] || groupKey}>
                                                    {segs.map(seg => (
                                                        <option key={seg.id} value={seg.id}>{seg.icon} {seg.label}</option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Dil Filtresi */}
                                    <div style={{ marginBottom: 8 }}>
                                        <label style={{ fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4, display: 'block' }}>🌍 Dil</label>
                                        <select
                                            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}
                                            value={(() => { try { return JSON.parse(automationForm.conditions || '{}').language || ''; } catch { return ''; } })()}
                                            onChange={e => {
                                                const currentConds = (() => { try { return JSON.parse(automationForm.conditions || '{}'); } catch { return {}; } })();
                                                if (e.target.value) {
                                                    currentConds.language = e.target.value;
                                                } else {
                                                    delete currentConds.language;
                                                }
                                                setAutomationForm(prev => ({ ...prev, conditions: Object.keys(currentConds).length ? JSON.stringify(currentConds) : '' }));
                                            }}
                                        >
                                            <option value="">Tüm diller</option>
                                            <option value="tr">🇹🇷 Türkçe</option>
                                            <option value="en">🇬🇧 İngilizce</option>
                                            <option value="ar">🇸🇦 Arapça</option>
                                            <option value="de">🇩🇪 Almanca</option>
                                            <option value="fr">🇫🇷 Fransızca</option>
                                            <option value="ru">🇷🇺 Rusça</option>
                                            <option value="es">🇪🇸 İspanyolca</option>
                                        </select>
                                    </div>

                                    {/* Saat Aralığı */}
                                    <div style={{ marginBottom: 8 }}>
                                        <label style={{ fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4, display: 'block' }}>⏰ Saat Aralığı</label>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <input
                                                type="time"
                                                style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                                                value={(() => { try { return JSON.parse(automationForm.conditions || '{}').timeRange?.start || ''; } catch { return ''; } })()}
                                                onChange={e => {
                                                    const currentConds = (() => { try { return JSON.parse(automationForm.conditions || '{}'); } catch { return {}; } })();
                                                    if (e.target.value) {
                                                        currentConds.timeRange = { ...(currentConds.timeRange || {}), start: e.target.value };
                                                    } else {
                                                        if (currentConds.timeRange) delete currentConds.timeRange.start;
                                                        if (currentConds.timeRange && !currentConds.timeRange.end) delete currentConds.timeRange;
                                                    }
                                                    setAutomationForm(prev => ({ ...prev, conditions: Object.keys(currentConds).length ? JSON.stringify(currentConds) : '' }));
                                                }}
                                            />
                                            <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>
                                            <input
                                                type="time"
                                                style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                                                value={(() => { try { return JSON.parse(automationForm.conditions || '{}').timeRange?.end || ''; } catch { return ''; } })()}
                                                onChange={e => {
                                                    const currentConds = (() => { try { return JSON.parse(automationForm.conditions || '{}'); } catch { return {}; } })();
                                                    if (e.target.value) {
                                                        currentConds.timeRange = { ...(currentConds.timeRange || {}), end: e.target.value };
                                                    } else {
                                                        if (currentConds.timeRange) delete currentConds.timeRange.end;
                                                        if (currentConds.timeRange && !currentConds.timeRange.start) delete currentConds.timeRange;
                                                    }
                                                    setAutomationForm(prev => ({ ...prev, conditions: Object.keys(currentConds).length ? JSON.stringify(currentConds) : '' }));
                                                }}
                                            />
                                        </div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Boş bırakırsanız her saat geçerli olur</div>
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

// ─────────────────────────────────────────────────────────────────────────────
// Birleşik Otomasyon Paneli
// ─────────────────────────────────────────────────────────────────────────────
function UnifiedPanelTab({ wsId }) {
    const [data, setData] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [sourceFilter, setSourceFilter] = React.useState('');

    React.useEffect(() => {
        if (!wsId) return;
        setLoading(true);
        automationAPI.getUnifiedPanel(wsId)
            .then(res => setData(res.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [wsId]);

    if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Yükleniyor...</div>;
    if (!data) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Veri alınamadı</div>;

    const SOURCE_META = {
        AUTOMATION: { icon: '⚡', label: 'Otomasyon', color: '#f59e0b' },
        FLOW: { icon: '🔀', label: 'Akış', color: '#3b82f6' },
        RULE: { icon: '📏', label: 'Kural', color: '#8b5cf6' },
        RETELL_TEMPLATE: { icon: '📞', label: 'Arama Şablonu', color: '#10b981' },
    };

    const filteredItems = sourceFilter
        ? data.unified.filter(u => u.source === sourceFilter)
        : data.unified;

    return (
        <div>
            {/* Stats */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ padding: '12px 20px', background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0', textAlign: 'center', minWidth: 100 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{data.stats.active}</div>
                    <div style={{ fontSize: 11, color: '#15803d' }}>Aktif</div>
                </div>
                <div style={{ padding: '12px 20px', background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca', textAlign: 'center', minWidth: 100 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>{data.stats.inactive}</div>
                    <div style={{ fontSize: 11, color: '#b91c1c' }}>Pasif</div>
                </div>
                <div style={{ padding: '12px 20px', background: '#eff6ff', borderRadius: 12, border: '1px solid #bfdbfe', textAlign: 'center', minWidth: 100 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#2563eb' }}>{data.stats.automationCount}</div>
                    <div style={{ fontSize: 11, color: '#1d4ed8' }}>Otomasyon</div>
                </div>
                <div style={{ padding: '12px 20px', background: '#faf5ff', borderRadius: 12, border: '1px solid #e9d5ff', textAlign: 'center', minWidth: 100 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#7c3aed' }}>{data.stats.flowCount}</div>
                    <div style={{ fontSize: 11, color: '#6d28d9' }}>Akış</div>
                </div>
                <div style={{ padding: '12px 20px', background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0', textAlign: 'center', minWidth: 100 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#059669' }}>{data.stats.retellTemplateCount}</div>
                    <div style={{ fontSize: 11, color: '#047857' }}>Arama Şablonu</div>
                </div>
                {data.stats.pendingScheduled > 0 && (
                    <div style={{ padding: '12px 20px', background: '#fefce8', borderRadius: 12, border: '1px solid #fde68a', textAlign: 'center', minWidth: 100 }}>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#ca8a04' }}>{data.stats.pendingScheduled}</div>
                        <div style={{ fontSize: 11, color: '#a16207' }}>Bekleyen Mesaj</div>
                    </div>
                )}
            </div>

            {/* Filter */}
            <div style={{ marginBottom: 12 }}>
                <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
                    style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                    <option value="">Tüm Kaynaklar ({data.unified.length})</option>
                    <option value="AUTOMATION">⚡ Otomasyonlar ({data.stats.automationCount})</option>
                    <option value="FLOW">🔀 Akışlar ({data.stats.flowCount})</option>
                    <option value="RULE">📏 Kurallar ({data.stats.ruleCount})</option>
                    <option value="RETELL_TEMPLATE">📞 Arama Şablonları ({data.stats.retellTemplateCount})</option>
                </select>
            </div>

            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredItems.length === 0 && (
                    <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Bu kategoride otomasyon yok</div>
                )}
                {filteredItems.map(item => {
                    const meta = SOURCE_META[item.source] || { icon: '📋', label: item.source, color: '#64748b' };
                    return (
                        <div key={`${item.source}-${item.id}`} style={{
                            background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
                            padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12
                        }}>
                            {/* Toggle */}
                            <button
                                onClick={async () => {
                                    const newState = !item.isActive;
                                    // Optimistic update
                                    setData(prev => ({
                                        ...prev,
                                        unified: prev.unified.map(u =>
                                            u.id === item.id && u.source === item.source
                                                ? { ...u, isActive: newState }
                                                : u
                                        ),
                                        stats: {
                                            ...prev.stats,
                                            active: prev.stats.active + (newState ? 1 : -1),
                                            inactive: prev.stats.inactive + (newState ? -1 : 1)
                                        }
                                    }));
                                    try {
                                        await automationAPI.toggleUnified(wsId, item.source, item.id, newState);
                                    } catch (e) {
                                        console.error(e);
                                        // Rollback
                                        setData(prev => ({
                                            ...prev,
                                            unified: prev.unified.map(u =>
                                                u.id === item.id && u.source === item.source
                                                    ? { ...u, isActive: !newState }
                                                    : u
                                            )
                                        }));
                                    }
                                }}
                                style={{
                                    width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                                    background: item.isActive ? '#22c55e' : '#d1d5db', position: 'relative',
                                    transition: 'background 0.2s', flexShrink: 0, padding: 0
                                }}
                            >
                                <div style={{
                                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                                    position: 'absolute', top: 2,
                                    left: item.isActive ? 18 : 2,
                                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                }} />
                            </button>
                            {/* Icon */}
                            <span style={{ fontSize: 20 }}>{meta.icon}</span>
                            {/* Info */}
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{item.name}</div>
                                {item.description && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.description}</div>}
                            </div>
                            {/* Source badge */}
                            <span style={{
                                fontSize: 10, padding: '3px 8px', borderRadius: 6,
                                background: meta.color + '18', color: meta.color, fontWeight: 600
                            }}>
                                {meta.label}
                            </span>
                            {/* Trigger info */}
                            {item.trigger && (
                                <span style={{ fontSize: 10, color: '#94a3b8' }}>
                                    {item.trigger}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Scheduled Messages Summary */}
            {data.scheduledMessages?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                        ⏰ Son Zamanlanmış Mesajlar ({data.scheduledMessages.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {data.scheduledMessages.slice(0, 10).map(msg => (
                            <div key={msg.id} style={{
                                background: '#f8fafc', borderRadius: 8, padding: '8px 12px',
                                fontSize: 12, display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #f1f5f9'
                            }}>
                                <span style={{
                                    padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                    background: msg.status === 'SENT' ? '#dcfce7' : msg.status === 'PENDING' ? '#fef9c3' : msg.status === 'FAILED' ? '#fef2f2' : '#f1f5f9',
                                    color: msg.status === 'SENT' ? '#16a34a' : msg.status === 'PENDING' ? '#a16207' : msg.status === 'FAILED' ? '#dc2626' : '#64748b'
                                }}>
                                    {msg.status}
                                </span>
                                <span style={{ flex: 1, color: '#475569' }}>{msg.content?.substring(0, 60)}...</span>
                                <span style={{ color: '#94a3b8' }}>
                                    {new Date(msg.scheduledAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Retell Arama Şablonları CRUD Paneli
// ─────────────────────────────────────────────────────────────────────────────
function RetellTemplatesTab({ wsId }) {
    const [templates, setTemplates] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [showForm, setShowForm] = React.useState(false);
    const [editing, setEditing] = React.useState(null);
    const [form, setForm] = React.useState({ name: '', description: '', agentId: '', beginMessage: '', promptSuffix: '', isActive: true });

    const loadTemplates = React.useCallback(async () => {
        if (!wsId) return;
        setLoading(true);
        try {
            const res = await retellAPI.getTemplates(wsId);
            setTemplates(res.data?.templates || res.data || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [wsId]);

    React.useEffect(() => { loadTemplates(); }, [loadTemplates]);

    const resetForm = () => {
        setForm({ name: '', description: '', agentId: '', beginMessage: '', promptSuffix: '', isActive: true });
        setEditing(null);
        setShowForm(false);
    };

    const handleSave = async () => {
        if (!form.name || !form.agentId) return alert('Şablon adı ve Agent ID zorunludur');
        try {
            if (editing) {
                await retellAPI.updateTemplate(wsId, editing.id, form);
            } else {
                await retellAPI.createTemplate(wsId, form);
            }
            resetForm();
            loadTemplates();
        } catch (e) { console.error(e); alert('Kaydetme hatası'); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Bu şablonu silmek istediğinize emin misiniz?')) return;
        try {
            await retellAPI.deleteTemplate(wsId, id);
            loadTemplates();
        } catch (e) { console.error(e); }
    };

    if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Yükleniyor...</div>;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>📞 Arama Şablonları ({templates.length})</div>
                <button onClick={() => { resetForm(); setShowForm(true); }}
                    style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    + Yeni Şablon
                </button>
            </div>

            {/* Form */}
            {showForm && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#334155' }}>
                        {editing ? 'Şablon Düzenle' : 'Yeni Şablon'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div>
                            <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Şablon Adı *</label>
                            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Agent ID *</label>
                            <input value={form.agentId} onChange={e => setForm(f => ({ ...f, agentId: e.target.value }))}
                                placeholder="agent_..." style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                        </div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Açıklama</label>
                        <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>
                            Başlangıç Mesajı <span style={{ color: '#94a3b8' }}>(opsiyonel, {'{{customer_name}}'} gibi değişkenler kullanılabilir)</span>
                        </label>
                        <textarea value={form.beginMessage} onChange={e => setForm(f => ({ ...f, beginMessage: e.target.value }))}
                            rows={3} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, resize: 'vertical' }} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Ek Prompt Talimatı</label>
                        <textarea value={form.promptSuffix} onChange={e => setForm(f => ({ ...f, promptSuffix: e.target.value }))}
                            rows={3} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, resize: 'vertical' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={handleSave}
                            style={{ padding: '8px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                            {editing ? 'Güncelle' : 'Kaydet'}
                        </button>
                        <button onClick={resetForm}
                            style={{ padding: '8px 20px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                            İptal
                        </button>
                    </div>
                </div>
            )}

            {/* List */}
            {templates.length === 0 && !showForm && (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Henüz arama şablonu yok</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {templates.map(tpl => (
                    <div key={tpl.id} style={{
                        background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
                        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12
                    }}>
                        <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: tpl.isActive ? '#22c55e' : '#e2e8f0', flexShrink: 0
                        }} />
                        <span style={{ fontSize: 20 }}>📞</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{tpl.name}</div>
                            {tpl.description && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{tpl.description}</div>}
                            {tpl.beginMessage && <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>"{tpl.beginMessage.substring(0, 80)}..."</div>}
                        </div>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>{tpl.agentId?.substring(0, 12)}...</span>
                        <button onClick={() => { setForm({ name: tpl.name, description: tpl.description || '', agentId: tpl.agentId, beginMessage: tpl.beginMessage || '', promptSuffix: tpl.promptSuffix || '', isActive: tpl.isActive }); setEditing(tpl); setShowForm(true); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>✏️</button>
                        <button onClick={() => handleDelete(tpl.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>🗑️</button>
                    </div>
                ))}
            </div>
        </div>
    );
}

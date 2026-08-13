import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { classifierAPI, funnelAPI, facebookAPI, whatsappAPI, formWebhookAPI, webWidgetAPI } from '../../services/api';
import { Plus, GitBranch, ArrowRight, X, ChevronUp, ChevronDown, Trash2, Edit2, Zap, AlertCircle, Phone, Facebook, Globe, FileText, Bot, Map, List, Settings, Clock, Hash, Brain, ChevronRight, AlertTriangle, MessageCircle, Instagram } from 'lucide-react';
import './Classifier.css';

const Classifier = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();

    const [loading, setLoading] = useState(true);
    const [rules, setRules] = useState([]);
    const [funnels, setFunnels] = useState([]);
    const [channels, setChannels] = useState([]); // All channels combined
    const [viewMode, setViewMode] = useState('map'); // 'map' | 'rules'

    // Map view state
    const [channelAssignments, setChannelAssignments] = useState({}); // channelId -> { funnelId, stageId }
    const [expandedChannel, setExpandedChannel] = useState(null); // channelId for detail rules panel
    const [savingChannel, setSavingChannel] = useState(null);

    // Modal state (for rule list view)
    const [showModal, setShowModal] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        conditionType: 'KEYWORD',
        conditions: { keywords: '', matchMode: 'ANY', aiDescription: '', channels: [], formIds: [] },
        targetFunnelId: '',
        targetStageId: '',
        isActive: true
    });

    // Detail rule modal state (for map view ⚙️)
    const [showDetailRuleModal, setShowDetailRuleModal] = useState(false);
    const [detailRuleChannel, setDetailRuleChannel] = useState(null);
    const [detailRuleForm, setDetailRuleForm] = useState({
        name: '',
        conditionType: 'KEYWORD',
        conditions: { keywords: '', matchMode: 'ANY', aiDescription: '', timeStart: '', timeEnd: '', days: [] },
        targetFunnelId: '',
        targetStageId: ''
    });

    useEffect(() => {
        if (currentWorkspace) {
            loadData();
        }
    }, [currentWorkspace]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [rulesRes, funnelsRes, pagesRes, waRes, formRes, widgetRes] = await Promise.all([
                classifierAPI.getRules(currentWorkspace.id).catch(() => ({ data: { rules: [] } })),
                funnelAPI.getAll(currentWorkspace.id).catch(() => ({ data: { funnels: [] } })),
                facebookAPI.getPages(currentWorkspace.id).catch(() => ({ data: { pages: [] } })),
                whatsappAPI.getPhoneNumbers(currentWorkspace.id).catch(() => ({ data: { phoneNumbers: [] } })),
                formWebhookAPI.getWebhooks(currentWorkspace.id).catch(() => ({ data: { webhooks: [] } })),
                webWidgetAPI.getAll(currentWorkspace.id).catch(() => ({ data: { widgets: [] } }))
            ]);

            const loadedRules = rulesRes.data.rules || [];
            setRules(loadedRules);
            const loadedFunnels = funnelsRes.data.funnels || funnelsRes.data || [];
            setFunnels(loadedFunnels);

            // Combine all channels into a flat list
            const combinedChannels = [];
            (pagesRes.data.pages || []).forEach(p => {
                combinedChannels.push({ id: `fb-${p.id}`, rawId: p.id, name: p.pageName, type: 'facebook', icon: Facebook, color: '#1877F2' });
                if (p.instagramBusinessId) {
                    combinedChannels.push({ id: `ig-${p.id}`, rawId: p.id, name: `@${p.instagramUsername || 'Instagram'}`, type: 'instagram', icon: Instagram, color: '#E4405F' });
                }
            });
            (waRes.data.phoneNumbers || []).forEach(w => {
                combinedChannels.push({ id: `wa-${w.id}`, rawId: w.id, name: w.displayPhoneNumber || w.phoneNumber, type: 'whatsapp', icon: Phone, color: '#25D366' });
            });
            (formRes.data.webhooks || []).forEach(f => {
                combinedChannels.push({ id: `form-${f.id}`, rawId: f.id, name: f.name, type: 'webform', icon: FileText, color: '#f59e0b' });
            });
            (widgetRes.data.widgets || []).forEach(w => {
                combinedChannels.push({ id: `widget-${w.id}`, rawId: w.id, name: w.domain || w.name || 'Web Widget', type: 'widget', icon: Globe, color: '#3b82f6' });
            });
            setChannels(combinedChannels);

            // Build channel assignments from existing rules
            const assignments = {};
            const defaultFunnel = loadedFunnels.find(f => f.isDefault || f.funnelType === 'MAIN') || loadedFunnels[0];
            
            // Parse rules to build assignments
            loadedRules.forEach(rule => {
                if (!rule.isActive) return;
                const cond = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions;
                
                if (rule.conditionType === 'CHANNEL' && cond.channels) {
                    cond.channels.forEach(chId => {
                        if (!assignments[chId]) {
                            assignments[chId] = { funnelId: rule.targetFunnelId, stageId: rule.targetStageId, ruleId: rule.id, ruleName: rule.name };
                        }
                    });
                }
            });

            // Set default for unassigned channels
            combinedChannels.forEach(ch => {
                if (!assignments[ch.id]) {
                    assignments[ch.id] = { funnelId: defaultFunnel?.id || '', stageId: '', ruleId: null, ruleName: null };
                }
            });

            setChannelAssignments(assignments);

        } catch (error) {
            console.error('Data load error', error);
        } finally {
            setLoading(false);
        }
    };

    // === MAP VIEW FUNCTIONS ===

    const getDefaultFunnel = () => {
        return funnels.find(f => f.isDefault || f.funnelType === 'MAIN') || funnels[0];
    };

    const handleChannelFunnelChange = async (channelId, funnelId) => {
        const prev = channelAssignments[channelId];
        setChannelAssignments(a => ({ ...a, [channelId]: { ...a[channelId], funnelId, stageId: '' } }));
        setSavingChannel(channelId);

        try {
            if (prev?.ruleId) {
                // Update existing rule
                await classifierAPI.updateRule(currentWorkspace.id, prev.ruleId, {
                    targetFunnelId: funnelId,
                    targetStageId: null
                });
                setChannelAssignments(a => ({ ...a, [channelId]: { ...a[channelId], funnelId, stageId: '' } }));
            } else {
                // Create new CHANNEL rule
                const channel = channels.find(c => c.id === channelId);
                const funnel = funnels.find(f => f.id === funnelId);
                const res = await classifierAPI.createRule(currentWorkspace.id, {
                    name: `${channel?.name || channelId} → ${funnel?.name || 'Akış'}`,
                    conditionType: 'CHANNEL',
                    conditions: JSON.stringify({ channels: [channelId] }),
                    targetFunnelId: funnelId,
                    isActive: true
                });
                setChannelAssignments(a => ({
                    ...a,
                    [channelId]: { funnelId, stageId: '', ruleId: res.data.rule.id, ruleName: res.data.rule.name }
                }));
            }
        } catch (error) {
            console.error('Assignment save error', error);
            // Revert
            setChannelAssignments(a => ({ ...a, [channelId]: prev }));
        } finally {
            setSavingChannel(null);
        }
    };

    const handleChannelStageChange = async (channelId, stageId) => {
        const prev = channelAssignments[channelId];
        setChannelAssignments(a => ({ ...a, [channelId]: { ...a[channelId], stageId } }));
        setSavingChannel(channelId);

        try {
            if (prev?.ruleId) {
                await classifierAPI.updateRule(currentWorkspace.id, prev.ruleId, {
                    targetStageId: stageId || null
                });
            }
        } catch (error) {
            console.error('Stage save error', error);
            setChannelAssignments(a => ({ ...a, [channelId]: prev }));
        } finally {
            setSavingChannel(null);
        }
    };

    const getDetailRulesForChannel = (channelId) => {
        return rules.filter(r => {
            if (r.conditionType === 'CHANNEL') return false; // Skip channel-level rules
            const cond = typeof r.conditions === 'string' ? JSON.parse(r.conditions) : r.conditions;
            return cond.channels?.includes(channelId);
        });
    };

    const getUnassignedCount = () => {
        return channels.filter(ch => {
            const assignment = channelAssignments[ch.id];
            return !assignment || !assignment.funnelId;
        }).length;
    };

    const getChannelIcon = (type) => {
        switch (type) {
            case 'facebook': return { icon: Facebook, color: '#1877F2', label: 'Facebook' };
            case 'instagram': return { icon: Instagram, color: '#E4405F', label: 'Instagram' };
            case 'whatsapp': return { icon: Phone, color: '#25D366', label: 'WhatsApp' };
            case 'webform': return { icon: FileText, color: '#f59e0b', label: 'Web Form' };
            case 'widget': return { icon: Globe, color: '#3b82f6', label: 'Web Widget' };
            default: return { icon: Globe, color: '#6b7280', label: 'Kanal' };
        }
    };

    const isDefaultFunnel = (funnelId) => {
        const def = getDefaultFunnel();
        return def?.id === funnelId;
    };

    // === RULE LIST VIEW FUNCTIONS ===

    const handleSaveRule = async () => {
        try {
            const payload = {
                ...formData,
                conditions: JSON.stringify(formData.conditions)
            };

            if (editingRule) {
                await classifierAPI.updateRule(currentWorkspace.id, editingRule.id, payload);
            } else {
                await classifierAPI.createRule(currentWorkspace.id, payload);
            }
            setShowModal(false);
            loadData();
        } catch (error) {
            console.error('Save rule error', error);
            alert('Kural kaydedilirken hata oluştu.');
        }
    };

    const handleDeleteRule = async (ruleId) => {
        if (window.confirm('Bu kuralı silmek istediğinize emin misiniz?')) {
            try {
                await classifierAPI.deleteRule(currentWorkspace.id, ruleId);
                loadData();
            } catch (error) {
                console.error('Delete error', error);
            }
        }
    };

    const handleToggleRule = async (ruleId, isActive) => {
        try {
            await classifierAPI.toggleRule(currentWorkspace.id, ruleId, { isActive });
            setRules(rules.map(r => r.id === ruleId ? { ...r, isActive } : r));
        } catch (error) {
            console.error('Toggle error', error);
        }
    };

    const moveRule = async (index, direction) => {
        const newRules = [...rules];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        
        if (targetIndex < 0 || targetIndex >= newRules.length) return;

        const temp = newRules[index];
        newRules[index] = newRules[targetIndex];
        newRules[targetIndex] = temp;

        const updatedRules = newRules.map((r, i) => ({ id: r.id, priority: i }));
        setRules(newRules.map((r, i) => ({ ...r, priority: i })));

        try {
            await classifierAPI.reorderRules(currentWorkspace.id, updatedRules);
        } catch (error) {
            console.error('Reorder error', error);
            loadData();
        }
    };

    const openModal = (rule = null) => {
        if (rule) {
            setEditingRule(rule);
            setFormData({
                name: rule.name,
                conditionType: rule.conditionType,
                conditions: typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : (rule.conditions || {}),
                targetFunnelId: rule.targetFunnelId || '',
                targetStageId: rule.targetStageId || '',
                isActive: rule.isActive
            });
        } else {
            setEditingRule(null);
            setFormData({
                name: '',
                conditionType: 'KEYWORD',
                conditions: { keywords: '', matchMode: 'ANY', aiDescription: '', channels: [], formIds: [] },
                targetFunnelId: '',
                targetStageId: '',
                isActive: true
            });
        }
        setShowModal(true);
    };

    const renderConditionPreview = (rule) => {
        const cond = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions;
        switch (rule.conditionType) {
            case 'KEYWORD':
                return <span className="rule-value">"{cond.keywords}" geçiyorsa</span>;
            case 'AI':
                return <span className="rule-value">Yapay Zeka: {cond.aiDescription}</span>;
            case 'CHANNEL':
                return <span className="rule-value">{cond.channels?.length || 0} Kanaldan geliyorsa</span>;
            case 'FORM':
                return <span className="rule-value">Belirli formlardan geliyorsa</span>;
            case 'DEFAULT':
                return <span className="rule-value">Hiçbir kurala uymazsa (Varsayılan)</span>;
            case 'TIME':
                return <span className="rule-value">⏰ {cond.timeStart}-{cond.timeEnd}</span>;
            default:
                return <span className="rule-value">Bilinmeyen Kural</span>;
        }
    };

    const renderConditionBadge = (type) => {
        switch (type) {
            case 'KEYWORD': return <span className="rule-badge badge-keyword">Kelime</span>;
            case 'AI': return <span className="rule-badge badge-ai">Yapay Zeka</span>;
            case 'CHANNEL': return <span className="rule-badge badge-channel">Kanal</span>;
            case 'DEFAULT': return <span className="rule-badge badge-default">Varsayılan</span>;
            case 'TIME': return <span className="rule-badge badge-time">Zaman</span>;
            default: return <span className="rule-badge badge-default">{type}</span>;
        }
    };

    const getTargetName = (funnelId, stageId) => {
        const funnel = funnels.find(f => f.id === funnelId);
        if (!funnel) return 'Bilinmeyen Akış';
        const stage = funnel.stages?.find(s => s.id === stageId);
        if (stage) return `${funnel.name} ➔ ${stage.name}`;
        return funnel.name;
    };

    // === RENDER ===

    return (
        <div className="classifier-container">
            <div className="classifier-header">
                <div>
                    <h1><GitBranch size={28} color="#6366f1" /> Sınıflandırıcı</h1>
                    <p>Gelen mesajların hangi akışlara yönlendirileceğini belirleyin.</p>
                </div>
                <div className="header-actions">
                    <div className="view-toggle">
                        <button 
                            className={`view-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
                            onClick={() => setViewMode('map')}
                        >
                            <Map size={16} /> Harita
                        </button>
                        <button 
                            className={`view-toggle-btn ${viewMode === 'rules' ? 'active' : ''}`}
                            onClick={() => setViewMode('rules')}
                        >
                            <List size={16} /> Kurallar
                        </button>
                    </div>
                    {viewMode === 'rules' && (
                        <button className="btn-primary" onClick={() => openModal()}>
                            <Plus size={18} /> Yeni Kural
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>Yükleniyor...</div>
            ) : viewMode === 'map' ? (
                /* ====== MAP VIEW ====== */
                <div className="map-view">
                    {/* Info banner */}
                    <div className="map-info-banner">
                        <AlertCircle size={20} className="info-icon" />
                        <span>Her kanal için hedef akış seçin. Seçilmeyenler otomatik <strong>Genel Akış</strong>'a düşer. Detay kuralları için <Settings size={14} style={{verticalAlign: 'middle'}} /> butonunu kullanın.</span>
                    </div>

                    {/* Unassigned warning */}
                    {getUnassignedCount() > 0 && (
                        <div className="map-warning">
                            <AlertTriangle size={18} />
                            <span>{getUnassignedCount()} kanal henüz atanmamış!</span>
                        </div>
                    )}

                    {/* Channel rows */}
                    <div className="map-table">
                        <div className="map-table-header">
                            <div className="map-col-channel">Kanal</div>
                            <div className="map-col-funnel">Hedef Akış</div>
                            <div className="map-col-stage">Aşama</div>
                            <div className="map-col-actions">Detay</div>
                        </div>

                        {channels.length === 0 ? (
                            <div className="map-empty">
                                <Globe size={32} />
                                <p>Henüz kanal eklenmemiş. Önce Kanallar sayfasından kanal ekleyin.</p>
                            </div>
                        ) : (
                            channels.map(ch => {
                                const assignment = channelAssignments[ch.id] || {};
                                const selectedFunnel = funnels.find(f => f.id === assignment.funnelId);
                                const iconInfo = getChannelIcon(ch.type);
                                const ChannelIcon = iconInfo.icon;
                                const isExpanded = expandedChannel === ch.id;
                                const isSaving = savingChannel === ch.id;
                                const isUnassigned = !assignment.funnelId;

                                return (
                                    <React.Fragment key={ch.id}>
                                        <div className={`map-row ${isUnassigned ? 'unassigned' : ''} ${isSaving ? 'saving' : ''}`}>
                                            {/* Channel info */}
                                            <div className="map-col-channel">
                                                <div className="channel-info">
                                                    <div className="channel-icon-badge" style={{ background: `${iconInfo.color}15` }}>
                                                        <ChannelIcon size={18} color={iconInfo.color} />
                                                    </div>
                                                    <div>
                                                        <div className="channel-name">{ch.name}</div>
                                                        <div className="channel-type">{iconInfo.label}</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Funnel dropdown */}
                                            <div className="map-col-funnel">
                                                <select
                                                    className={`map-select ${isUnassigned ? 'empty' : ''}`}
                                                    value={assignment.funnelId || ''}
                                                    onChange={e => handleChannelFunnelChange(ch.id, e.target.value)}
                                                    disabled={isSaving}
                                                >
                                                    <option value="">Seçiniz...</option>
                                                    {funnels.map(f => (
                                                        <option key={f.id} value={f.id}>
                                                            {f.name} {f.funnelType === 'MAIN' ? '(Ana)' : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                                {isDefaultFunnel(assignment.funnelId) && (
                                                    <span className="default-badge">AI sınıflandırır</span>
                                                )}
                                            </div>

                                            {/* Stage dropdown */}
                                            <div className="map-col-stage">
                                                {selectedFunnel?.stages?.length > 0 ? (
                                                    <select
                                                        className="map-select map-select-sm"
                                                        value={assignment.stageId || ''}
                                                        onChange={e => handleChannelStageChange(ch.id, e.target.value)}
                                                        disabled={isSaving}
                                                    >
                                                        <option value="">İlk aşama</option>
                                                        {selectedFunnel.stages.map(s => (
                                                            <option key={s.id} value={s.id}>{s.name}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span className="stage-na">—</span>
                                                )}
                                            </div>

                                            {/* Detail rules button */}
                                            <div className="map-col-actions">
                                                <button
                                                    className={`detail-rules-btn ${isExpanded ? 'active' : ''}`}
                                                    onClick={() => setExpandedChannel(isExpanded ? null : ch.id)}
                                                    title="Detay kuralları (zaman, keyword)"
                                                >
                                                    <Settings size={16} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded detail rules panel */}
                                        {isExpanded && (
                                            <div className="detail-rules-panel">
                                                <div className="detail-rules-header">
                                                    <span>📋 İçerik Kuralları — {ch.name}</span>
                                                    <button 
                                                        className="btn-add-detail-rule"
                                                        onClick={() => {
                                                            setDetailRuleChannel(ch);
                                                            setDetailRuleForm({
                                                                name: '',
                                                                conditionType: 'KEYWORD',
                                                                conditions: { keywords: '', matchMode: 'ANY', aiDescription: '', timeStart: '09:00', timeEnd: '18:00', days: [] },
                                                                targetFunnelId: '',
                                                                targetStageId: ''
                                                            });
                                                            setShowDetailRuleModal(true);
                                                        }}
                                                    >
                                                        <Plus size={14} /> Kural Ekle
                                                    </button>
                                                </div>
                                                <div className="detail-rules-list">
                                                    {getDetailRulesForChannel(ch.id).length === 0 ? (
                                                        <div className="detail-rules-empty">
                                                            İçerik kuralı yok. Tüm mesajlar varsayılan hedefe gider.
                                                        </div>
                                                    ) : (
                                                        getDetailRulesForChannel(ch.id).map(rule => (
                                                            <div key={rule.id} className="detail-rule-item">
                                                                <div className="detail-rule-condition">
                                                                    {renderConditionBadge(rule.conditionType)}
                                                                    {renderConditionPreview(rule)}
                                                                </div>
                                                                <ArrowRight size={16} color="#9ca3af" />
                                                                <div className="detail-rule-target">
                                                                    {getTargetName(rule.targetFunnelId, rule.targetStageId)}
                                                                </div>
                                                                <button className="action-btn delete" onClick={() => handleDeleteRule(rule.id)}>
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                                <div className="detail-rules-footer">
                                                    Eşleşme yoksa → <strong>{getTargetName(assignment.funnelId, assignment.stageId)}</strong> (dropdown'daki)
                                                </div>
                                            </div>
                                        )}
                                    </React.Fragment>
                                );
                            })
                        )}
                    </div>

                    {/* Stats bar */}
                    <div className="map-stats">
                        <div className="stat-item">
                            <span className="stat-number">{channels.length}</span>
                            <span className="stat-label">Kanal</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-number">{rules.length}</span>
                            <span className="stat-label">Kural</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-number">{funnels.length}</span>
                            <span className="stat-label">Akış</span>
                        </div>
                    </div>
                </div>
            ) : (
                /* ====== RULES LIST VIEW ====== */
                <>
                    <div className="classifier-info-banner">
                        <AlertCircle size={24} className="info-icon" />
                        <div>
                            <p><strong>Master Bot & Yönlendirme Nasıl Çalışır?</strong></p>
                            <p>Sistem, gelen mesajları buradaki kural listesine göre <strong>yukarıdan aşağıya</strong> sırayla kontrol eder. Mesaj bir kuralın şartını sağlarsa, belirtilen akışa yönlendirilir ve sonraki kurallara bakılmaz. Hiçbir kurala uymayan mesajlar, "Varsayılan (Default)" kuralınıza veya en alt akışa düşer.</p>
                        </div>
                    </div>

                    {rules.length === 0 ? (
                        <div className="empty-state">
                            <GitBranch size={48} />
                            <h3>Henüz Yönlendirme Kuralı Yok</h3>
                            <p>Müşterileri otomatik olarak doğru akışlara yönlendirmek için ilk kuralınızı oluşturun.</p>
                            <button className="btn-primary" style={{ margin: '16px auto 0' }} onClick={() => openModal()}>
                                <Plus size={18} /> Kural Ekle
                            </button>
                        </div>
                    ) : (
                        <div className="rules-list">
                            {rules.map((rule, index) => (
                                <div key={rule.id} className={`rule-card ${!rule.isActive ? 'inactive' : ''}`}>
                                    <div className="rule-reorder">
                                        <button className="reorder-btn" disabled={index === 0} onClick={() => moveRule(index, 'up')}>
                                            <ChevronUp size={20} />
                                        </button>
                                        <button className="reorder-btn" disabled={index === rules.length - 1} onClick={() => moveRule(index, 'down')}>
                                            <ChevronDown size={20} />
                                        </button>
                                    </div>

                                    <div className="rule-content">
                                        <div className="rule-if">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className="rule-label">EĞER</span>
                                                {renderConditionBadge(rule.conditionType)}
                                            </div>
                                            {renderConditionPreview(rule)}
                                            <span className="rule-value-sub">{rule.name}</span>
                                        </div>

                                        <div className="rule-arrow">
                                            <ArrowRight size={24} />
                                        </div>

                                        <div className="rule-then">
                                            <span className="rule-label">İSE YÖNLENDİR</span>
                                            <span className="rule-value">
                                                <GitBranch size={16} color="#6366f1" />
                                                {getTargetName(rule.targetFunnelId, rule.targetStageId)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="rule-actions">
                                        <label className="toggle-switch" title="Kuralı Aktif/Pasif Yap">
                                            <input 
                                                type="checkbox" 
                                                checked={rule.isActive} 
                                                onChange={(e) => handleToggleRule(rule.id, e.target.checked)} 
                                            />
                                            <span className="toggle-slider"></span>
                                        </label>
                                        <button className="action-btn" onClick={() => openModal(rule)} title="Düzenle">
                                            <Edit2 size={18} />
                                        </button>
                                        <button className="action-btn delete" onClick={() => handleDeleteRule(rule.id)} title="Sil">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Rule Modal (for rule list view) */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2>{editingRule ? 'Kuralı Düzenle' : 'Yeni Yönlendirme Kuralı'}</h2>
                            <button className="close-btn" onClick={() => setShowModal(false)}><X size={24} /></button>
                        </div>
                        
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Kural Adı (Örn: Şikayet Yönlendirmesi)</label>
                                <input 
                                    type="text" 
                                    className="form-control" 
                                    value={formData.name} 
                                    onChange={e => setFormData({...formData, name: e.target.value})} 
                                    placeholder="Kural için açıklayıcı bir isim..."
                                />
                            </div>

                            <div className="form-group">
                                <label>Koşul Tipi (EĞER)</label>
                                <div className="condition-tabs">
                                    <div className={`condition-tab ${formData.conditionType === 'KEYWORD' ? 'active' : ''}`} onClick={() => setFormData({...formData, conditionType: 'KEYWORD'})}>
                                        <FileText size={20} /> Kelime (Keyword)
                                    </div>
                                    <div className={`condition-tab ${formData.conditionType === 'AI' ? 'active' : ''}`} onClick={() => setFormData({...formData, conditionType: 'AI'})}>
                                        <Bot size={20} /> Yapay Zeka Niyeti
                                    </div>
                                    <div className={`condition-tab ${formData.conditionType === 'CHANNEL' ? 'active' : ''}`} onClick={() => setFormData({...formData, conditionType: 'CHANNEL'})}>
                                        <Globe size={20} /> Belirli Kanal
                                    </div>
                                    <div className={`condition-tab ${formData.conditionType === 'TIME' ? 'active' : ''}`} onClick={() => setFormData({...formData, conditionType: 'TIME'})}>
                                        <Clock size={20} /> Zaman
                                    </div>
                                    <div className={`condition-tab ${formData.conditionType === 'DEFAULT' ? 'active' : ''}`} onClick={() => setFormData({...formData, conditionType: 'DEFAULT'})}>
                                        <Zap size={20} /> Varsayılan (Herkes)
                                    </div>
                                </div>
                            </div>

                            {/* Condition Specific Inputs */}
                            {formData.conditionType === 'KEYWORD' && (
                                <div className="form-group">
                                    <label>Anahtar Kelimeler (Virgülle ayırın)</label>
                                    <input 
                                        type="text" 
                                        className="form-control" 
                                        value={formData.conditions.keywords || ''} 
                                        onChange={e => setFormData({
                                            ...formData, 
                                            conditions: { ...formData.conditions, keywords: e.target.value }
                                        })} 
                                        placeholder="şikayet, iade, bozuk, dava..."
                                    />
                                    <span style={{fontSize: '12px', color: '#6b7280'}}>Müşterinin mesajında bu kelimelerden biri geçerse kural tetiklenir.</span>
                                </div>
                            )}

                            {formData.conditionType === 'AI' && (
                                <div className="form-group">
                                    <label>Müşteri Niyeti (Yapay Zekaya Tarif Edin)</label>
                                    <textarea 
                                        className="form-control" 
                                        rows="3"
                                        value={formData.conditions.aiDescription || ''} 
                                        onChange={e => setFormData({
                                            ...formData, 
                                            conditions: { ...formData.conditions, aiDescription: e.target.value }
                                        })} 
                                        placeholder="Müşteri ürünün fiyatını soruyor veya satın alma niyeti gösteriyor..."
                                    />
                                    <span style={{fontSize: '12px', color: '#6b7280'}}>Master Bot konuşmayı okuyup niyetin bu olduğuna karar verirse yönlendirir.</span>
                                </div>
                            )}

                            {formData.conditionType === 'CHANNEL' && (
                                <div className="form-group">
                                    <label>Geçerli Kanalları Seçin</label>
                                    <div className="channel-selector-grid">
                                        {channels.map(ch => {
                                            const isSelected = (formData.conditions.channels || []).includes(ch.id);
                                            return (
                                                <label key={ch.id} className={`channel-option ${isSelected ? 'selected' : ''}`}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={isSelected}
                                                        onChange={(e) => {
                                                            const current = formData.conditions.channels || [];
                                                            const newChannels = e.target.checked 
                                                                ? [...current, ch.id]
                                                                : current.filter(id => id !== ch.id);
                                                            setFormData({
                                                                ...formData,
                                                                conditions: { ...formData.conditions, channels: newChannels }
                                                            });
                                                        }}
                                                    />
                                                    <ch.icon size={16} color={ch.color} />
                                                    <span style={{fontSize: '13px', fontWeight: 500}}>{ch.name}</span>
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {formData.conditionType === 'TIME' && (
                                <div className="form-group">
                                    <label>Zaman Aralığı</label>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        <input 
                                            type="time" 
                                            className="form-control" 
                                            style={{ width: 'auto' }}
                                            value={formData.conditions.timeStart || '09:00'} 
                                            onChange={e => setFormData({
                                                ...formData, 
                                                conditions: { ...formData.conditions, timeStart: e.target.value }
                                            })} 
                                        />
                                        <span>—</span>
                                        <input 
                                            type="time" 
                                            className="form-control" 
                                            style={{ width: 'auto' }}
                                            value={formData.conditions.timeEnd || '18:00'} 
                                            onChange={e => setFormData({
                                                ...formData, 
                                                conditions: { ...formData.conditions, timeEnd: e.target.value }
                                            })} 
                                        />
                                    </div>
                                    <span style={{fontSize: '12px', color: '#6b7280'}}>Bu saat aralığında gelen mesajlar belirtilen akışa yönlendirilir.</span>
                                </div>
                            )}

                            <div style={{height: '1px', background: '#e5e7eb', margin: '8px 0'}}></div>

                            {/* Target Selection */}
                            <div className="form-group">
                                <label>Hedef Akış (İSE YÖNLENDİR)</label>
                                <select 
                                    className="form-control" 
                                    value={formData.targetFunnelId}
                                    onChange={e => setFormData({...formData, targetFunnelId: e.target.value, targetStageId: ''})}
                                >
                                    <option value="">-- Akış Seçin --</option>
                                    {funnels.map(f => (
                                        <option key={f.id} value={f.id}>{f.name} {f.funnelType === 'MAIN' ? '(Ana Akış)' : ''}</option>
                                    ))}
                                </select>
                            </div>

                            {formData.targetFunnelId && (
                                <div className="form-group">
                                    <label>Hedef Aşama (Opsiyonel)</label>
                                    <select 
                                        className="form-control" 
                                        value={formData.targetStageId}
                                        onChange={e => setFormData({...formData, targetStageId: e.target.value})}
                                    >
                                        <option value="">Varsayılan (İlk Aşama)</option>
                                        {(funnels.find(f => f.id === formData.targetFunnelId)?.stages || []).map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                        </div>
                        
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setShowModal(false)}>İptal</button>
                            <button className="btn-primary" onClick={handleSaveRule} disabled={!formData.name || !formData.targetFunnelId}>
                                Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Rule Modal (for map view) */}
            {showDetailRuleModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2>İçerik Kuralı Ekle — {detailRuleChannel?.name}</h2>
                            <button className="close-btn" onClick={() => setShowDetailRuleModal(false)}><X size={24} /></button>
                        </div>
                        
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Kural Adı</label>
                                <input 
                                    type="text" 
                                    className="form-control" 
                                    value={detailRuleForm.name} 
                                    onChange={e => setDetailRuleForm({...detailRuleForm, name: e.target.value})} 
                                    placeholder="Akşam saatleri satışa yönlendir..."
                                />
                            </div>

                            <div className="form-group">
                                <label>Koşul Tipi</label>
                                <div className="condition-tabs">
                                    <div className={`condition-tab ${detailRuleForm.conditionType === 'KEYWORD' ? 'active' : ''}`} onClick={() => setDetailRuleForm({...detailRuleForm, conditionType: 'KEYWORD'})}>
                                        <Hash size={18} /> Keyword
                                    </div>
                                    <div className={`condition-tab ${detailRuleForm.conditionType === 'TIME' ? 'active' : ''}`} onClick={() => setDetailRuleForm({...detailRuleForm, conditionType: 'TIME'})}>
                                        <Clock size={18} /> Zaman
                                    </div>
                                    <div className={`condition-tab ${detailRuleForm.conditionType === 'AI' ? 'active' : ''}`} onClick={() => setDetailRuleForm({...detailRuleForm, conditionType: 'AI'})}>
                                        <Brain size={18} /> AI Niyet
                                    </div>
                                </div>
                            </div>

                            {detailRuleForm.conditionType === 'KEYWORD' && (
                                <div className="form-group">
                                    <label>Anahtar Kelimeler</label>
                                    <input 
                                        type="text" 
                                        className="form-control" 
                                        value={detailRuleForm.conditions.keywords || ''} 
                                        onChange={e => setDetailRuleForm({
                                            ...detailRuleForm, 
                                            conditions: { ...detailRuleForm.conditions, keywords: e.target.value }
                                        })} 
                                        placeholder="şikayet, iade..."
                                    />
                                </div>
                            )}

                            {detailRuleForm.conditionType === 'TIME' && (
                                <div className="form-group">
                                    <label>Saat Aralığı</label>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        <input type="time" className="form-control" style={{ width: 'auto' }}
                                            value={detailRuleForm.conditions.timeStart || '09:00'}
                                            onChange={e => setDetailRuleForm({ ...detailRuleForm, conditions: { ...detailRuleForm.conditions, timeStart: e.target.value } })}
                                        />
                                        <span>—</span>
                                        <input type="time" className="form-control" style={{ width: 'auto' }}
                                            value={detailRuleForm.conditions.timeEnd || '18:00'}
                                            onChange={e => setDetailRuleForm({ ...detailRuleForm, conditions: { ...detailRuleForm.conditions, timeEnd: e.target.value } })}
                                        />
                                    </div>
                                </div>
                            )}

                            {detailRuleForm.conditionType === 'AI' && (
                                <div className="form-group">
                                    <label>AI Niyet Açıklaması</label>
                                    <textarea className="form-control" rows="2"
                                        value={detailRuleForm.conditions.aiDescription || ''}
                                        onChange={e => setDetailRuleForm({ ...detailRuleForm, conditions: { ...detailRuleForm.conditions, aiDescription: e.target.value } })}
                                        placeholder="Müşteri şikayet bildiriyor..."
                                    />
                                </div>
                            )}

                            <div style={{height: '1px', background: '#e5e7eb', margin: '8px 0'}}></div>

                            <div className="form-group">
                                <label>Hedef Akış</label>
                                <select className="form-control" value={detailRuleForm.targetFunnelId}
                                    onChange={e => setDetailRuleForm({...detailRuleForm, targetFunnelId: e.target.value, targetStageId: ''})}>
                                    <option value="">-- Akış Seçin --</option>
                                    {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                            </div>

                            {detailRuleForm.targetFunnelId && (
                                <div className="form-group">
                                    <label>Hedef Aşama</label>
                                    <select className="form-control" value={detailRuleForm.targetStageId}
                                        onChange={e => setDetailRuleForm({...detailRuleForm, targetStageId: e.target.value})}>
                                        <option value="">İlk aşama</option>
                                        {(funnels.find(f => f.id === detailRuleForm.targetFunnelId)?.stages || []).map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                        
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setShowDetailRuleModal(false)}>İptal</button>
                            <button className="btn-primary" onClick={async () => {
                                try {
                                    await classifierAPI.createRule(currentWorkspace.id, {
                                        name: detailRuleForm.name,
                                        conditionType: detailRuleForm.conditionType,
                                        conditions: JSON.stringify({
                                            ...detailRuleForm.conditions,
                                            channels: [detailRuleChannel.id]
                                        }),
                                        targetFunnelId: detailRuleForm.targetFunnelId,
                                        targetStageId: detailRuleForm.targetStageId || null,
                                        isActive: true
                                    });
                                    setShowDetailRuleModal(false);
                                    loadData();
                                } catch (err) {
                                    console.error('Detail rule save error', err);
                                    alert('Kural kaydedilirken hata oluştu.');
                                }
                            }} disabled={!detailRuleForm.name || !detailRuleForm.targetFunnelId}>
                                Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Classifier;

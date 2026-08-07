import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { classifierAPI, funnelAPI, facebookAPI, whatsappAPI, formWebhookAPI, webWidgetAPI } from '../../services/api';
import { Plus, GitBranch, ArrowRight, X, ChevronUp, ChevronDown, Trash2, Edit2, Zap, AlertCircle, Phone, Facebook, Globe, FileText, Bot } from 'lucide-react';
import './Classifier.css';

const Classifier = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();

    const [loading, setLoading] = useState(true);
    const [rules, setRules] = useState([]);
    const [funnels, setFunnels] = useState([]);
    const [channels, setChannels] = useState([]); // All channels combined

    // Modal state
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

            setRules(rulesRes.data.rules || []);
            setFunnels(funnelsRes.data.funnels || funnelsRes.data || []);

            // Combine all channels into a flat list for easy selection
            const combinedChannels = [];
            (pagesRes.data.pages || []).forEach(p => {
                combinedChannels.push({ id: `fb-${p.id}`, name: p.pageName, icon: Facebook, color: '#1877F2' });
                if (p.instagramBusinessId) {
                    combinedChannels.push({ id: `ig-${p.id}`, name: `@${p.instagramUsername}`, icon: Facebook, color: '#E4405F' }); // Using FB icon for IG for simplicity
                }
            });
            (waRes.data.phoneNumbers || []).forEach(w => {
                combinedChannels.push({ id: `wa-${w.id}`, name: w.displayPhoneNumber, icon: Phone, color: '#25D366' });
            });
            (formRes.data.webhooks || []).forEach(f => {
                combinedChannels.push({ id: `form-${f.id}`, name: f.name, icon: FileText, color: '#f59e0b' });
            });
            (widgetRes.data.widgets || []).forEach(w => {
                combinedChannels.push({ id: `widget-${w.id}`, name: w.domain, icon: Globe, color: '#3b82f6' });
            });
            setChannels(combinedChannels);

        } catch (error) {
            console.error('Data load error', error);
        } finally {
            setLoading(false);
        }
    };

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

        // Swap
        const temp = newRules[index];
        newRules[index] = newRules[targetIndex];
        newRules[targetIndex] = temp;

        // Update priorities (0 is highest)
        const updatedRules = newRules.map((r, i) => ({ id: r.id, priority: i }));
        setRules(newRules.map((r, i) => ({ ...r, priority: i }))); // Optimistic update

        try {
            await classifierAPI.reorderRules(currentWorkspace.id, updatedRules);
        } catch (error) {
            console.error('Reorder error', error);
            loadData(); // Revert on error
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

    return (
        <div className="classifier-container">
            <div className="classifier-header">
                <div>
                    <h1><GitBranch size={28} color="#6366f1" /> Sınıflandırıcı (Kural Motoru)</h1>
                    <p>Gelen mesajların hangi koşullarda hangi akışlara (funnels) yönlendirileceğini belirleyin.</p>
                </div>
                <button className="btn-primary" onClick={() => openModal()}>
                    <Plus size={18} /> Yeni Kural Ekle
                </button>
            </div>

            <div className="classifier-info-banner">
                <AlertCircle size={24} className="info-icon" />
                <div>
                    <p><strong>Master Bot & Yönlendirme Nasıl Çalışır?</strong></p>
                    <p>Sistem, gelen mesajları buradaki kural listesine göre <strong>yukarıdan aşağıya</strong> sırayla kontrol eder. Mesaj bir kuralın şartını sağlarsa, belirtilen akışa yönlendirilir ve sonraki kurallara bakılmaz. Hiçbir kurala uymayan mesajlar, "Varsayılan (Default)" kuralınıza veya en alt akışa düşer.</p>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>Yükleniyor...</div>
            ) : rules.length === 0 ? (
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

            {/* Rule Modal */}
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
        </div>
    );
};

export default Classifier;

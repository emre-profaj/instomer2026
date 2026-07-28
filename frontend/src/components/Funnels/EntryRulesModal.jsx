import { useState, useEffect } from 'react';

const RULE_TYPES = [
    { value: 'CHANNEL_IS',      label: '📡 Kanaldan gelen' },
    { value: 'FIELD_EXISTS',    label: 'Alan var mı?' },
    { value: 'FIELD_EQUALS',    label: 'Alan eşit mi?' },
    { value: 'TOPIC_CONTAINS',  label: 'Konu içerir' },
    { value: 'DEAL_EXISTS',     label: 'Deal var mı?' },
    { value: 'DEAL_STATUS',     label: 'Deal durumu' },
    { value: 'ACTIVITY_EXISTS', label: 'Aktivite var mı?' },
    { value: 'ACTIVITY_RESULT', label: 'Aktivite sonucu' },
    { value: 'HAS_APPOINTMENT', label: 'Randevu var mı?' },
    { value: 'MESSAGE_COUNT_GT',label: 'Mesaj sayısı >' }
];

const CHANNEL_OPTIONS = [
    { value: 'WHATSAPP',    label: '💬 WhatsApp',       icon: '💬' },
    { value: 'INSTAGRAM',   label: '📸 Instagram DM',   icon: '📸' },
    { value: 'FACEBOOK',    label: '📘 Facebook',        icon: '📘' },
    { value: 'FORM',        label: '📋 Web Formu',       icon: '📋' },
    { value: 'META_LEAD',   label: '📑 Meta Lead Formu', icon: '📑' },
    { value: 'EMAIL',       label: '📧 Email',           icon: '📧' },
    { value: 'WIDGET',      label: '🌐 Web Widget',      icon: '🌐' },
    { value: 'RETELL',      label: '📞 AI Telefon',      icon: '📞' },
    { value: 'MANUAL',      label: '✍️ Manuel Kayıt',    icon: '✍️' },
    { value: 'IG_COMMENT',  label: '💬 Instagram Yorum',  icon: '💬' },
    { value: 'FB_COMMENT',  label: '💬 Facebook Yorum',   icon: '💬' },
];

const FIELD_OPTIONS = [
    { value: 'name',  label: 'İsim' },
    { value: 'phone', label: 'Telefon' },
    { value: 'email', label: 'Email' },
    { value: 'topic', label: 'Konu' }
];

const DEAL_STATUS_OPTIONS = [
    { value: 'WON',    label: 'WON' },
    { value: 'LOST',   label: 'LOST' },
    { value: 'ACTIVE', label: 'ACTIVE' }
];

const ACTIVITY_TYPE_OPTIONS = [
    { value: 'MEETING', label: 'MEETING' },
    { value: 'CALL',    label: 'CALL' },
    { value: 'VISIT',   label: 'VISIT' }
];

const ACTIVITY_RESULT_OPTIONS = [
    { value: 'COMPLETED', label: 'COMPLETED' },
    { value: 'CANCELLED', label: 'CANCELLED' }
];

const emptyRule = () => ({ type: 'FIELD_EXISTS', field: 'name', value: '' });

const EntryRulesModal = ({ isOpen, onClose, stage, onSave }) => {
    const [matchType, setMatchType] = useState('ALL');
    const [rules, setRules] = useState([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen || !stage) return;
        try {
            const parsed = stage.entryRules ? JSON.parse(stage.entryRules) : null;
            if (parsed && Array.isArray(parsed.rules)) {
                setMatchType(parsed.matchType || 'ALL');
                setRules(parsed.rules.length > 0 ? parsed.rules : [emptyRule()]);
            } else {
                setMatchType('ALL');
                setRules([emptyRule()]);
            }
        } catch {
            setMatchType('ALL');
            setRules([emptyRule()]);
        }
    }, [isOpen, stage]);

    if (!isOpen || !stage) return null;

    const updateRule = (index, updates) => {
        setRules(prev => prev.map((r, i) => i === index ? { ...r, ...updates } : r));
    };

    const removeRule = (index) => {
        setRules(prev => prev.filter((_, i) => i !== index));
    };

    const addRule = () => {
        setRules(prev => [...prev, emptyRule()]);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const validRules = rules.filter(r => r.type);
            const json = JSON.stringify({ matchType, rules: validRules });
            await onSave(stage.id, json);
            onClose();
        } catch (err) {
            console.error('Entry rules save error:', err);
        } finally {
            setSaving(false);
        }
    };

    const renderRuleInputs = (rule, index) => {
        switch (rule.type) {
            case 'FIELD_EXISTS':
                return (
                    <select
                        style={styles.ruleSelect}
                        value={rule.field || 'name'}
                        onChange={e => updateRule(index, { field: e.target.value })}
                    >
                        {FIELD_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                );

            case 'FIELD_EQUALS':
                return (
                    <>
                        <select
                            style={styles.ruleSelect}
                            value={rule.field || 'name'}
                            onChange={e => updateRule(index, { field: e.target.value })}
                        >
                            {FIELD_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                        <input
                            style={styles.ruleInput}
                            type="text"
                            placeholder="Değer"
                            value={rule.value || ''}
                            onChange={e => updateRule(index, { value: e.target.value })}
                        />
                    </>
                );

            case 'TOPIC_CONTAINS':
                return (
                    <input
                        style={{ ...styles.ruleInput, flex: 1 }}
                        type="text"
                        placeholder="Anahtar kelimeler (virgülle ayır)"
                        value={rule.value || ''}
                        onChange={e => updateRule(index, { value: e.target.value })}
                    />
                );

            case 'DEAL_EXISTS':
            case 'HAS_APPOINTMENT':
                return null;

            case 'DEAL_STATUS':
                return (
                    <select
                        style={styles.ruleSelect}
                        value={rule.value || 'WON'}
                        onChange={e => updateRule(index, { value: e.target.value })}
                    >
                        {DEAL_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                );

            case 'ACTIVITY_EXISTS':
                return (
                    <select
                        style={styles.ruleSelect}
                        value={rule.value || 'MEETING'}
                        onChange={e => updateRule(index, { value: e.target.value })}
                    >
                        {ACTIVITY_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                );

            case 'ACTIVITY_RESULT':
                return (
                    <>
                        <select
                            style={styles.ruleSelect}
                            value={rule.activityType || 'MEETING'}
                            onChange={e => updateRule(index, { activityType: e.target.value })}
                        >
                            {ACTIVITY_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <select
                            style={styles.ruleSelect}
                            value={rule.value || 'COMPLETED'}
                            onChange={e => updateRule(index, { value: e.target.value })}
                        >
                            {ACTIVITY_RESULT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </>
                );

            case 'CHANNEL_IS':
                return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 }}>
                        {CHANNEL_OPTIONS.map(ch => {
                            const selected = (rule.channels || []).includes(ch.value);
                            return (
                                <button
                                    key={ch.value}
                                    type="button"
                                    onClick={() => {
                                        const current = rule.channels || [];
                                        const updated = selected
                                            ? current.filter(v => v !== ch.value)
                                            : [...current, ch.value];
                                        updateRule(index, { channels: updated });
                                    }}
                                    style={{
                                        padding: '4px 10px', fontSize: '11px', fontWeight: 500,
                                        borderRadius: 16, cursor: 'pointer',
                                        border: selected ? '1.5px solid #3b82f6' : '1px solid #d1d5db',
                                        background: selected ? '#eff6ff' : '#fff',
                                        color: selected ? '#1d4ed8' : '#64748b',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {ch.icon} {ch.label.split(' ').slice(1).join(' ')}
                                </button>
                            );
                        })}
                    </div>
                );

            case 'MESSAGE_COUNT_GT':
                return (
                    <input
                        style={{ ...styles.ruleInput, width: '80px' }}
                        type="number"
                        min="0"
                        placeholder="0"
                        value={rule.value || ''}
                        onChange={e => updateRule(index, { value: e.target.value })}
                    />
                );

            default:
                return null;
        }
    };

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.container} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={styles.header}>
                    <h3 style={styles.title}>
                        ⚙️ Giriş Kuralları — <span style={{ color: stage.color || '#3b82f6' }}>{stage.name}</span>
                    </h3>
                    <button style={styles.closeBtn} onClick={onClose}>✕</button>
                </div>

                {/* Match Type */}
                <div style={styles.matchRow}>
                    <label style={styles.matchLabel}>Koşul eşleşme:</label>
                    <select
                        style={styles.matchSelect}
                        value={matchType}
                        onChange={e => setMatchType(e.target.value)}
                    >
                        <option value="ALL">Hepsi eşleşmeli (VE)</option>
                        <option value="ANY">Herhangi biri (VEYA)</option>
                    </select>
                </div>

                {/* Rules List */}
                <div style={styles.rulesList}>
                    {rules.map((rule, index) => (
                        <div key={index} style={styles.ruleRow}>
                            <select
                                style={styles.ruleTypeSelect}
                                value={rule.type}
                                onChange={e => updateRule(index, { type: e.target.value, field: 'name', value: '', activityType: '' })}
                            >
                                {RULE_TYPES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
                            </select>

                            {renderRuleInputs(rule, index)}

                            <button
                                style={styles.deleteBtn}
                                onClick={() => removeRule(index)}
                                title="Kuralı sil"
                            >
                                🗑️
                            </button>
                        </div>
                    ))}
                </div>

                {/* Add Rule */}
                <button style={styles.addBtn} onClick={addRule}>
                    + Kural Ekle
                </button>

                {/* Footer */}
                <div style={styles.footer}>
                    <button style={styles.cancelBtn} onClick={onClose}>İptal</button>
                    <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
                        {saving ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const styles = {
    overlay: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    },
    container: {
        background: '#fff',
        borderRadius: '12px',
        width: '640px',
        maxWidth: '90vw',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        borderBottom: '1px solid #e5e7eb'
    },
    title: {
        margin: 0,
        fontSize: '15px',
        fontWeight: 600,
        color: '#1e293b'
    },
    closeBtn: {
        background: 'none',
        border: 'none',
        fontSize: '18px',
        cursor: 'pointer',
        color: '#94a3b8',
        padding: '4px 8px',
        borderRadius: '6px'
    },
    matchRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '12px 20px',
        borderBottom: '1px solid #f1f5f9'
    },
    matchLabel: {
        fontSize: '13px',
        fontWeight: 500,
        color: '#475569',
        whiteSpace: 'nowrap'
    },
    matchSelect: {
        fontSize: '13px',
        padding: '6px 10px',
        borderRadius: '8px',
        border: '1px solid #d1d5db',
        background: '#f9fafb',
        color: '#1e293b',
        outline: 'none',
        cursor: 'pointer'
    },
    rulesList: {
        flex: 1,
        overflowY: 'auto',
        padding: '12px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    },
    ruleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 10px',
        background: '#f8fafc',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        flexWrap: 'wrap'
    },
    ruleTypeSelect: {
        fontSize: '12px',
        padding: '6px 8px',
        borderRadius: '6px',
        border: '1px solid #d1d5db',
        background: '#fff',
        color: '#1e293b',
        outline: 'none',
        cursor: 'pointer',
        minWidth: '140px'
    },
    ruleSelect: {
        fontSize: '12px',
        padding: '6px 8px',
        borderRadius: '6px',
        border: '1px solid #d1d5db',
        background: '#fff',
        color: '#1e293b',
        outline: 'none',
        cursor: 'pointer'
    },
    ruleInput: {
        fontSize: '12px',
        padding: '6px 8px',
        borderRadius: '6px',
        border: '1px solid #d1d5db',
        background: '#fff',
        color: '#1e293b',
        outline: 'none'
    },
    deleteBtn: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: '14px',
        padding: '4px',
        marginLeft: 'auto',
        opacity: 0.6
    },
    addBtn: {
        margin: '0 20px 12px',
        padding: '8px 14px',
        fontSize: '12px',
        fontWeight: 500,
        color: '#3b82f6',
        background: '#eff6ff',
        border: '1px dashed #93c5fd',
        borderRadius: '8px',
        cursor: 'pointer',
        textAlign: 'center'
    },
    footer: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px',
        padding: '12px 20px',
        borderTop: '1px solid #e5e7eb'
    },
    cancelBtn: {
        padding: '8px 16px',
        fontSize: '13px',
        fontWeight: 500,
        color: '#64748b',
        background: '#f1f5f9',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        cursor: 'pointer'
    },
    saveBtn: {
        padding: '8px 20px',
        fontSize: '13px',
        fontWeight: 600,
        color: '#fff',
        background: '#3b82f6',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer'
    }
};

export default EntryRulesModal;

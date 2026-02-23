import { useState, useEffect } from 'react';
import { teamAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { GitBranch, Plus, Trash2, GripVertical, ArrowRight } from 'lucide-react';

const FIELD_TYPES = [
    { value: 'TEXT', label: 'Metin' },
    { value: 'PHONE', label: 'Telefon' },
    { value: 'NUMBER', label: 'Sayı' },
    { value: 'SELECT', label: 'Seçenek' }
];

const OPERATORS = [
    { value: 'equals', label: 'Eşittir' },
    { value: 'not_equals', label: 'Eşit Değil' },
    { value: 'contains', label: 'İçerir' },
    { value: 'greater_than', label: 'Büyüktür' },
    { value: 'less_than', label: 'Küçüktür' }
];

const BotRoutingSettings = ({ routingConfig, onChange }) => {
    const { currentWorkspace } = useAuth();
    const [teams, setTeams] = useState([]);

    useEffect(() => {
        if (currentWorkspace?.id) {
            loadTeams();
        }
    }, [currentWorkspace?.id]);

    const loadTeams = async () => {
        try {
            const res = await teamAPI.getWorkspaceTeams(currentWorkspace.id);
            setTeams(res.data.teams || res.data || []);
        } catch (err) {
            console.error('Error loading teams:', err);
        }
    };

    const {
        routingEnabled = false,
        routingQuestions = [],
        routingDefaultTeamId = '',
        routingDefaultUserId = '',
        routingConditionalEnabled = false,
        routingRules = []
    } = routingConfig;

    const update = (field, value) => {
        onChange({ ...routingConfig, [field]: value });
    };

    // Questions CRUD
    const addQuestion = () => {
        const newQ = {
            id: Date.now().toString(),
            question: '',
            fieldName: '',
            fieldType: 'TEXT',
            required: true
        };
        update('routingQuestions', [...routingQuestions, newQ]);
    };

    const updateQuestion = (id, field, value) => {
        update('routingQuestions', routingQuestions.map(q =>
            q.id === id ? { ...q, [field]: value } : q
        ));
    };

    const removeQuestion = (id) => {
        update('routingQuestions', routingQuestions.filter(q => q.id !== id));
    };

    // Rules CRUD
    const addRule = () => {
        const newRule = {
            id: Date.now().toString(),
            field: routingQuestions[0]?.fieldName || '',
            operator: 'equals',
            value: '',
            teamId: '',
            userId: '',
            priority: routingRules.length
        };
        update('routingRules', [...routingRules, newRule]);
    };

    const updateRule = (id, field, value) => {
        update('routingRules', routingRules.map(r =>
            r.id === id ? { ...r, [field]: value } : r
        ));
    };

    const removeRule = (id) => {
        update('routingRules', routingRules.filter(r => r.id !== id));
    };

    // Render team options with sub-teams grouped under parent
    const renderTeamOptions = () => {
        const options = [];
        teams.forEach(team => {
            options.push(
                <option key={team.id} value={team.id}>{team.name}</option>
            );
            if (team.children && team.children.length > 0) {
                team.children.forEach(child => {
                    options.push(
                        <option key={child.id} value={child.id}>
                            {'\u00A0\u00A0\u00A0\u00A0└ ' + child.name}
                        </option>
                    );
                });
            }
        });
        return options;
    };

    return (
        <div className="bot-settings-section">
            <div className="section-header-toggle">
                <div className="section-title-group">
                    <GitBranch size={18} />
                    <span>Yönlendirme (Routing)</span>
                </div>
                <label className="toggle-switch">
                    <input
                        type="checkbox"
                        checked={routingEnabled}
                        onChange={(e) => update('routingEnabled', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                </label>
            </div>

            {routingEnabled && (
                <div className="section-content">
                    <p className="section-description">
                        Bot müşteriden bilgi topladıktan sonra belirlenen takıma otomatik yönlendirme yapar.
                    </p>

                    {/* Questions Section */}
                    <div className="routing-subsection">
                        <div className="routing-subsection-header">
                            <h5 className="form-label" style={{ margin: 0 }}>📋 Sorular</h5>
                            <button
                                type="button"
                                className="btn-modern btn-sm"
                                onClick={addQuestion}
                                style={{ fontSize: '12px', padding: '4px 10px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                <Plus size={14} /> Soru Ekle
                            </button>
                        </div>

                        {routingQuestions.length === 0 && (
                            <p className="text-muted" style={{ fontSize: '13px', margin: '8px 0' }}>
                                Henüz soru eklenmedi. Bot'un müşteriye soracağı soruları ekleyin.
                            </p>
                        )}

                        <div className="routing-questions-list">
                            {routingQuestions.map((q, index) => (
                                <div key={q.id} className="routing-question-item">
                                    <div className="question-number">{index + 1}</div>
                                    <div className="question-fields">
                                        <div className="question-field-row">
                                            <input
                                                type="text"
                                                className="input-modern input-sm"
                                                placeholder="Soru metni (ör: Telefon numaranızı paylaşır mısınız?)"
                                                value={q.question}
                                                onChange={(e) => updateQuestion(q.id, 'question', e.target.value)}
                                                style={{ flex: 2 }}
                                            />
                                            <input
                                                type="text"
                                                className="input-modern input-sm"
                                                placeholder="Alan adı (ör: phone)"
                                                value={q.fieldName}
                                                onChange={(e) => updateQuestion(q.id, 'fieldName', e.target.value)}
                                                style={{ flex: 1 }}
                                            />
                                            <select
                                                className="input-modern input-sm"
                                                value={q.fieldType}
                                                onChange={(e) => updateQuestion(q.id, 'fieldType', e.target.value)}
                                                style={{ width: '100px' }}
                                            >
                                                {FIELD_TYPES.map(ft => (
                                                    <option key={ft.value} value={ft.value}>{ft.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeQuestion(q.id)}
                                        className="btn-icon-sm"
                                        title="Soruyu Sil"
                                    >
                                        <Trash2 size={14} color="#ef4444" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Default Assignment */}
                    <div className="routing-subsection">
                        <h5 className="form-label">🎯 Varsayılan Hedef</h5>
                        <p className="text-muted" style={{ fontSize: '12px', marginBottom: '8px' }}>
                            Sorular tamamlandığında konuşma bu takıma yönlendirilir.
                        </p>
                        <select
                            className="input-modern input-sm"
                            value={routingDefaultTeamId}
                            onChange={(e) => update('routingDefaultTeamId', e.target.value)}
                            style={{ maxWidth: '300px' }}
                        >
                            <option value="">Takım seçin...</option>
                            {renderTeamOptions()}
                        </select>
                    </div>

                    {/* Conditional Routing */}
                    <div className="routing-subsection">
                        <div className="routing-subsection-header">
                            <div>
                                <h5 className="form-label" style={{ margin: 0 }}>⚡ Koşullu Yönlendirme</h5>
                                <p className="text-muted" style={{ fontSize: '12px', marginTop: '4px' }}>
                                    Cevaplara göre farklı takımlara yönlendirin.
                                </p>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={routingConditionalEnabled}
                                    onChange={(e) => update('routingConditionalEnabled', e.target.checked)}
                                />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>

                        {routingConditionalEnabled && (
                            <div style={{ marginTop: '12px' }}>
                                {routingRules.length === 0 && (
                                    <p className="text-muted" style={{ fontSize: '13px', margin: '8px 0' }}>
                                        Henüz kural eklenmedi.
                                    </p>
                                )}

                                <div className="routing-rules-list">
                                    {routingRules.map((rule, index) => (
                                        <div key={rule.id} className="routing-rule-item">
                                            <span className="rule-label">Eğer</span>
                                            <select
                                                className="input-modern input-sm"
                                                value={rule.field}
                                                onChange={(e) => updateRule(rule.id, 'field', e.target.value)}
                                                style={{ width: '120px' }}
                                            >
                                                <option value="">Alan...</option>
                                                {routingQuestions.map(q => (
                                                    <option key={q.id} value={q.fieldName}>{q.fieldName || q.question}</option>
                                                ))}
                                            </select>
                                            <select
                                                className="input-modern input-sm"
                                                value={rule.operator}
                                                onChange={(e) => updateRule(rule.id, 'operator', e.target.value)}
                                                style={{ width: '110px' }}
                                            >
                                                {OPERATORS.map(op => (
                                                    <option key={op.value} value={op.value}>{op.label}</option>
                                                ))}
                                            </select>
                                            <input
                                                type="text"
                                                className="input-modern input-sm"
                                                placeholder="Değer"
                                                value={rule.value}
                                                onChange={(e) => updateRule(rule.id, 'value', e.target.value)}
                                                style={{ width: '120px' }}
                                            />
                                            <ArrowRight size={16} color="#9ca3af" />
                                            <select
                                                className="input-modern input-sm"
                                                value={rule.teamId}
                                                onChange={(e) => updateRule(rule.id, 'teamId', e.target.value)}
                                                style={{ width: '150px' }}
                                            >
                                                <option value="">Takım...</option>
                                                {renderTeamOptions()}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={() => removeRule(rule.id)}
                                                className="btn-icon-sm"
                                                title="Kuralı Sil"
                                            >
                                                <Trash2 size={14} color="#ef4444" />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    className="btn-modern btn-sm"
                                    onClick={addRule}
                                    style={{ fontSize: '12px', padding: '6px 12px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px' }}
                                >
                                    <Plus size={14} /> Kural Ekle
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default BotRoutingSettings;

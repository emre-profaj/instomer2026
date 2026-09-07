import { useState, useEffect } from 'react';
import { aiAPI } from '../../services/api';
import { Save, Zap, Bot, BarChart3, MessageSquare, Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const MODEL_OPTIONS = [
    { value: '', label: '📦 Hesap Varsayılanı', desc: 'Company ayarından miras alır' },
    { value: 'gemini-2.0-flash-lite', label: '⚡ Lite', desc: 'En hızlı, en ucuz — $0.02/M input', color: '#22c55e' },
    { value: 'gemini-2.5-flash', label: '🔵 Standart', desc: 'Dengeli — $0.15/M input', color: '#3b82f6' },
    { value: 'gemini-2.5-pro', label: '🔴 Pro', desc: 'En yetenekli — $1.25/M input', color: '#ef4444' },
];

const AIIntegrationSettings = () => {
    const { currentWorkspace } = useAuth();
    const workspaceId = currentWorkspace?.id;

    const [apiKey, setApiKey] = useState('');
    const [aiModel, setAiModel] = useState('');
    const [effectiveModel, setEffectiveModel] = useState('gemini-2.5-flash');
    const [classifierEnabled, setClassifierEnabled] = useState(true);
    const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
    const [scorerEnabled, setScorerEnabled] = useState(true);
    const [followUpEnabled, setFollowUpEnabled] = useState(true);
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (workspaceId) {
            loadSettings();
        }
    }, [workspaceId]);

    const loadSettings = async () => {
        try {
            const res = await aiAPI.getSettings(workspaceId);
            setApiKey(res.data.aiApiKey || '');
            setAiModel(res.data.aiModel || '');
            setEffectiveModel(res.data.effectiveModel || 'gemini-2.5-flash');
            setClassifierEnabled(res.data.aiClassifierEnabled ?? true);
            setAutoReplyEnabled(res.data.aiAutoReplyEnabled ?? true);
            setScorerEnabled(res.data.aiScorerEnabled ?? true);
            setFollowUpEnabled(res.data.aiFollowUpEnabled ?? true);
        } catch (error) {
            console.error('Error loading AI settings:', error);
        }
    };

    const handleSave = async () => {
        try {
            setLoading(true);
            await aiAPI.updateSettings(workspaceId, {
                aiApiKey: apiKey,
                aiModel: aiModel || null,
                aiClassifierEnabled: classifierEnabled,
                aiAutoReplyEnabled: autoReplyEnabled,
                aiScorerEnabled: scorerEnabled,
                aiFollowUpEnabled: followUpEnabled,
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (error) {
            console.error('Error saving AI settings:', error);
            alert(error.response?.data?.error || 'Ayarlar kaydedilirken hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="settings-content">
            <h2 style={{ marginBottom: '24px' }}>AI Entegrasyonu</h2>

            {/* API Key Section */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <h3><Zap size={16} style={{ marginRight: 6 }} />API Bağlantısı</h3>
                <p className="text-muted text-sm mb-md">Google Gemini API anahtarınızı buraya giriniz. Boş bırakılırsa hesap veya global key kullanılır.</p>
                <div className="form-group">
                    <label>Gemini API Key</label>
                    <input
                        type="password"
                        className="input"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="AIza... (boş = hesap/global key)"
                        style={{ width: '100%' }}
                    />
                </div>
            </div>

            {/* Model Selection */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <h3><Bot size={16} style={{ marginRight: 6 }} />AI Model</h3>
                <p className="text-muted text-sm mb-md">
                    Bu workspace için kullanılacak model. Boş bırakılırsa hesap (Company) varsayılanı kullanılır.
                    <br />
                    <span style={{ fontSize: 11, color: '#6366f1' }}>Aktif model: <strong>{effectiveModel}</strong></span>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {MODEL_OPTIONS.map(opt => (
                        <label
                            key={opt.value}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                padding: '10px 14px', borderRadius: '8px', cursor: 'pointer',
                                border: aiModel === opt.value ? `2px solid ${opt.color || '#94a3b8'}` : '1px solid #e2e8f0',
                                background: aiModel === opt.value ? (opt.color ? opt.color + '08' : '#f8fafc') : '#fff',
                                transition: 'all 0.15s'
                            }}
                        >
                            <input
                                type="radio"
                                name="aiModel"
                                value={opt.value}
                                checked={aiModel === opt.value}
                                onChange={() => setAiModel(opt.value)}
                            />
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 14 }}>{opt.label}</div>
                                <div style={{ fontSize: 12, color: '#64748b' }}>{opt.desc}</div>
                            </div>
                        </label>
                    ))}
                </div>
            </div>

            {/* Feature Toggles */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <h3><BarChart3 size={16} style={{ marginRight: 6 }} />AI Özellikleri</h3>
                <p className="text-muted text-sm mb-md">Kapatılan özellikler token tüketmez, maliyet düşer.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[
                        { label: 'Sınıflandırıcı', desc: 'Konuşmaları otomatik kategorize eder (konu, akış, ekip)', icon: '🏷️', value: classifierEnabled, setter: setClassifierEnabled },
                        { label: 'Bot Yanıtları', desc: 'AI asistanlar otomatik mesaj gönderir', icon: '🤖', value: autoReplyEnabled, setter: setAutoReplyEnabled },
                        { label: 'Lead Puanlayıcı', desc: 'Her müşteriyi 0-100 arası puanlar', icon: '⭐', value: scorerEnabled, setter: setScorerEnabled },
                        { label: 'Takip Mesajları', desc: 'Akıllı follow-up önerileri üretir', icon: '🔔', value: followUpEnabled, setter: setFollowUpEnabled },
                    ].map(feature => (
                        <label
                            key={feature.label}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '12px 14px', borderRadius: '8px', cursor: 'pointer',
                                border: '1px solid #e2e8f0',
                                background: feature.value ? '#f0fdf4' : '#fef2f2',
                                transition: 'all 0.15s'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: 20 }}>{feature.icon}</span>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{feature.label}</div>
                                    <div style={{ fontSize: 12, color: '#64748b' }}>{feature.desc}</div>
                                </div>
                            </div>
                            <div style={{ position: 'relative', width: 44, height: 24 }}>
                                <input
                                    type="checkbox"
                                    checked={feature.value}
                                    onChange={e => feature.setter(e.target.checked)}
                                    style={{ opacity: 0, position: 'absolute', width: '100%', height: '100%', cursor: 'pointer', zIndex: 2 }}
                                />
                                <div style={{
                                    width: 44, height: 24, borderRadius: 12,
                                    background: feature.value ? '#22c55e' : '#e2e8f0',
                                    transition: 'all 0.2s',
                                    position: 'relative'
                                }}>
                                    <div style={{
                                        width: 20, height: 20, borderRadius: '50%',
                                        background: '#fff', position: 'absolute',
                                        top: 2, left: feature.value ? 22 : 2,
                                        transition: 'left 0.2s',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                    }} />
                                </div>
                            </div>
                        </label>
                    ))}
                </div>
            </div>

            {/* Save Button */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button
                    className="btn btn-primary"
                    onClick={handleSave}
                    disabled={loading}
                    style={{ minWidth: 160 }}
                >
                    <Save size={16} />
                    {loading ? 'Kaydediliyor...' : saved ? '✅ Kaydedildi!' : 'Tümünü Kaydet'}
                </button>
            </div>

            <div className="card bg-gray-50 border-0" style={{ marginTop: '24px' }}>
                <p className="text-muted text-sm">
                    ℹ️ Botlarınızı oluşturmak ve yönetmek için sol menüdeki <strong>AI Asistanlar</strong> sayfasını kullanabilirsiniz.
                </p>
            </div>
        </div>
    );
};

export default AIIntegrationSettings;

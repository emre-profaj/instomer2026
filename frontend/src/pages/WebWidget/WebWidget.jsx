import { useState, useEffect } from 'react';
import { aiAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Settings, Code, Bot, Save, Copy, Check, MessageSquare, Sparkles } from 'lucide-react';
import './WebWidget.css';

const WebWidget = () => {
    const { currentWorkspace } = useAuth();
    const workspaceId = currentWorkspace?.id;

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    // Settings state
    const [title, setTitle] = useState('Canlı Destek');
    const [subtitle, setSubtitle] = useState('Size nasıl yardımcı olabiliriz?');
    const [primaryColor, setPrimaryColor] = useState('#ef4444');
    const [greetingMessage, setGreetingMessage] = useState('Merhaba! Size nasıl yardımcı olabilirim?');
    const [isActive, setIsActive] = useState(true);
    const [position, setPosition] = useState('RIGHT');
    const [width, setWidth] = useState(350);
    
    // Bot assignment state
    const [assignedBotId, setAssignedBotId] = useState('');
    const [availableBots, setAvailableBots] = useState([]);

    useEffect(() => {
        if (workspaceId) {
            loadSettings();
        }
    }, [workspaceId]);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const res = await aiAPI.getWidgetSettings(workspaceId);
            const s = res.data.settings;
            const bots = res.data.bots || [];
            
            setTitle(s.title || 'Canlı Destek');
            setSubtitle(s.subtitle || '');
            setPrimaryColor(s.primaryColor || '#ef4444');
            setGreetingMessage(s.greetingMessage || '');
            setIsActive(s.isActive);
            setPosition(s.position || 'RIGHT');
            setWidth(s.width || 350);
            setAssignedBotId(s.assignedBotId || '');
            setAvailableBots(bots);
        } catch (error) {
            console.error('Error loading widget settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            await aiAPI.updateWidgetSettings(workspaceId, {
                title, subtitle, primaryColor, greetingMessage, isActive, position, width,
                assignedBotId: assignedBotId || null
            });
            alert('Widget ayarları kaydedildi!');
        } catch (error) {
            console.error('Error saving widget settings:', error);
            alert('Kaydedilemedi.');
        } finally {
            setSaving(false);
        }
    };

    // Get backend URL from environment or current location
    const getBackendUrl = () => {
        const apiUrl = import.meta.env.VITE_API_URL || '';
        if (apiUrl.includes('/api')) {
            return apiUrl.split('/api')[0];
        }
        return window.location.origin; // Fallback
    };

    const serverBaseUrl = getBackendUrl();
    const widgetCode = `<script>
  window.AntigravityConfig = {
    workspaceId: "${workspaceId}",
    baseUrl: "${serverBaseUrl}"
  };
</script>
<script src="${serverBaseUrl}/api/ai/public/widget/script" async></script>`;

    const handleCopy = () => {
        navigator.clipboard.writeText(widgetCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!currentWorkspace) return <div className="page-container">Lütfen bir workspace seçin.</div>;

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Web Widget</h1>
                    <p className="text-muted">Web sitenize bir canlı destek botu ekleyin ve asistanınızı eğitin.</p>
                </div>
            </div>

            <div className="widget-grid">
                {/* Visual Settings */}
                <div className="widget-card">
                    <div className="card-header">
                        <Settings size={20} />
                        <h3>Görünüm Ayarları</h3>
                    </div>
                    <div className="card-body">
                        <div className="form-group">
                            <label className="form-label">Widget Başlığı</label>
                            <input
                                type="text"
                                className="input-modern"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Alt Başlık</label>
                            <input
                                type="text"
                                className="input-modern"
                                value={subtitle}
                                onChange={(e) => setSubtitle(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Ana Renk</label>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <input
                                    type="color"
                                    value={primaryColor}
                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                    style={{ width: '40px', height: '40px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                />
                                <input
                                    type="text"
                                    className="input-modern"
                                    value={primaryColor}
                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                    style={{ flex: 1 }}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Karşılama Mesajı</label>
                            <textarea
                                className="input-modern"
                                rows="3"
                                value={greetingMessage}
                                onChange={(e) => setGreetingMessage(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Widget Pozisyonu</label>
                            <div className="position-toggle">
                                <button
                                    className={`toggle-btn ${position === 'LEFT' ? 'active' : ''}`}
                                    onClick={() => setPosition('LEFT')}
                                >
                                    Sol
                                </button>
                                <button
                                    className={`toggle-btn ${position === 'RIGHT' ? 'active' : ''}`}
                                    onClick={() => setPosition('RIGHT')}
                                >
                                    Sağ
                                </button>
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Widget Genişliği (px)</label>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <input
                                    type="range"
                                    min="300"
                                    max="500"
                                    step="10"
                                    value={width}
                                    onChange={(e) => setWidth(parseInt(e.target.value))}
                                    style={{ flex: 1 }}
                                />
                                <span style={{ fontSize: '14px', fontWeight: '500', minWidth: '45px' }}>{width}px</span>
                            </div>
                        </div>
                        {/* Bot Assignment */}
                        <div className="form-group">
                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Sparkles size={16} style={{ color: '#ef4444' }} />
                                AI Asistan (Bot)
                            </label>
                            <select
                                className="input-modern"
                                value={assignedBotId}
                                onChange={(e) => setAssignedBotId(e.target.value)}
                                style={{ cursor: 'pointer' }}
                            >
                                <option value="">Bot Seçilmedi (Manuel Yanıt)</option>
                                {availableBots.map(bot => (
                                    <option key={bot.id} value={bot.id}>
                                        {bot.name} {bot.isActive ? '' : '(Pasif)'}
                                    </option>
                                ))}
                            </select>
                            <p className="text-sm text-muted" style={{ marginTop: '6px' }}>
                                {assignedBotId 
                                    ? '✅ Seçili bot otomatik yanıt verecek.' 
                                    : '⚠️ Bot seçilmediğinde widget mesajları sadece Inbox\'a düşer, otomatik yanıt verilmez.'}
                            </p>
                        </div>

                        <div className="form-group">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input
                                    type="checkbox"
                                    id="widget-active"
                                    checked={isActive}
                                    onChange={(e) => setIsActive(e.target.checked)}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#ef4444' }}
                                />
                                <label htmlFor="widget-active" style={{ margin: 0, cursor: 'pointer', fontWeight: '500', color: '#334155' }}>Widget Aktif</label>
                            </div>
                        </div>
                        <button className="btn-modern btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: '20px', width: '100%', justifyContent: 'center' }}>
                            <Save size={18} />
                            {saving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
                        </button>
                    </div>
                </div>

                {/* Integration Code */}
                <div className="widget-card">
                    <div className="card-header">
                        <Code size={20} />
                        <h3>Kurulum Kodu</h3>
                    </div>
                    <div className="card-body">
                        <p className="text-sm text-muted" style={{ marginBottom: '16px' }}>
                            Aşağıdaki kodu web sitenizin <code>&lt;head&gt;</code> veya <code>&lt;body&gt;</code> etiketinin sonuna yapıştırın.
                        </p>
                        <div className="code-block">
                            <pre><code>{widgetCode}</code></pre>
                            <button className="copy-btn" onClick={handleCopy}>
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                            </button>
                        </div>

                        <div className="preview-info" style={{ marginTop: '32px' }}>
                            <h4>Önizleme</h4>
                            <div className="widget-preview" style={{
                                '--widget-color': primaryColor,
                                alignItems: position === 'LEFT' ? 'flex-start' : 'flex-end',
                                justifyContent: 'flex-end'
                            }}>
                                <div className="preview-fab">
                                    <MessageSquare size={24} />
                                </div>
                                <div className="preview-window" style={{
                                    width: `${width * 0.7}px`, // Scaled for preview
                                    maxWidth: '100%'
                                }}>
                                    <div className="preview-header">
                                        <div className="preview-title">{title}</div>
                                        <div className="preview-subtitle">{subtitle}</div>
                                    </div>
                                    <div className="preview-body">
                                        <div className="preview-msg bot">{greetingMessage}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Training Links */}
            <div className="widget-card" style={{ marginTop: '32px' }}>
                <div className="card-header">
                    <Bot size={20} />
                    <h3>Asistan Durumu</h3>
                </div>
                <div className="card-body">
                    {assignedBotId ? (
                        <>
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '12px', 
                                padding: '16px', 
                                backgroundColor: '#f0fdf4', 
                                borderRadius: '8px',
                                border: '1px solid #bbf7d0',
                                marginBottom: '20px'
                            }}>
                                <Sparkles size={24} style={{ color: '#22c55e' }} />
                                <div>
                                    <strong style={{ color: '#166534' }}>
                                        {availableBots.find(b => b.id === assignedBotId)?.name || 'Seçili Bot'}
                                    </strong>
                                    <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#15803d' }}>
                                        Bu bot widget üzerinden gelen mesajlara otomatik yanıt verecek.
                                    </p>
                                </div>
                            </div>
                            <p className="text-muted" style={{ marginBottom: '16px' }}>
                                Seçili botu düzenlemek, sistem talimatı vermek veya bilgi bankasına dosya yüklemek için asistanlar sayfasına gidin.
                            </p>
                        </>
                    ) : (
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px', 
                            padding: '16px', 
                            backgroundColor: '#fef3c7', 
                            borderRadius: '8px',
                            border: '1px solid #fcd34d',
                            marginBottom: '20px'
                        }}>
                            <Bot size={24} style={{ color: '#d97706' }} />
                            <div>
                                <strong style={{ color: '#92400e' }}>Bot Seçilmedi</strong>
                                <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#a16207' }}>
                                    Widget mesajları Inbox'a düşecek ancak otomatik yanıt verilmeyecek. 
                                    Yukarıdan bir bot seçin veya önce bir bot oluşturun.
                                </p>
                            </div>
                        </div>
                    )}
                    <button className="btn-modern btn-outline" onClick={() => (window.location.href = '/assistants')}>
                        Asistanları Yönet
                    </button>
                </div>
            </div>

            {/* Spacer to ensure bottom margin */}
            <div style={{ height: '100px', width: '100%' }}></div>
        </div>
    );
};

export default WebWidget;

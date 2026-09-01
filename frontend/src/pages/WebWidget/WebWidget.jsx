import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { aiAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Settings, Code, Bot, Save, Copy, Check, MessageSquare, Sparkles } from 'lucide-react';
import './WebWidget.css';

const WebWidget = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const workspaceId = currentWorkspace?.id;

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    // Settings state
    const [title, setTitle] = useState(t('webWidget.liveSupport'));
    const [subtitle, setSubtitle] = useState(t('webWidget.subtitle'));
    const [primaryColor, setPrimaryColor] = useState('#ef4444');
    const [greetingMessage, setGreetingMessage] = useState(t('webWidget.greeting'));
    const [quickReplies, setQuickReplies] = useState([]);
    const [newQuickReply, setNewQuickReply] = useState('');
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
            
            setTitle(s.title || t('webWidget.liveSupport'));
            setSubtitle(s.subtitle || '');
            setPrimaryColor(s.primaryColor || '#ef4444');
            setGreetingMessage(s.greetingMessage || '');
            
            let replies = [];
            if (Array.isArray(s.quickReplies)) {
                replies = s.quickReplies;
            } else if (typeof s.quickReplies === 'string') {
                try { replies = JSON.parse(s.quickReplies); } catch (e) { }
            }
            setQuickReplies(replies);

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

    const handleAddQuickReply = () => {
        const text = newQuickReply.trim();
        if (!text) return;
        if (quickReplies.includes(text)) return;
        setQuickReplies([...quickReplies, text]);
        setNewQuickReply('');
    };

    const handleRemoveQuickReply = (indexToRemove) => {
        setQuickReplies(quickReplies.filter((_, idx) => idx !== indexToRemove));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            await aiAPI.updateWidgetSettings(workspaceId, {
                title, subtitle, primaryColor, greetingMessage, quickReplies, isActive, position, width,
                assignedBotId: assignedBotId || null
            });
            alert(t('webWidget.saved'));
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
                    <p className="text-muted">{t('webWidget.description')}</p>
                </div>
            </div>

            <div className="widget-grid">
                {/* Visual Settings */}
                <div className="widget-card">
                    <div className="card-header">
                        <Settings size={20} />
                        <h3>{t('webWidget.appearance')}</h3>
                    </div>
                    <div className="card-body">
                        <div className="form-group">
                            <label className="form-label">{t('webWidget.widgetTitle')}</label>
                            <input
                                type="text"
                                className="input-modern"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">{t('webWidget.widgetSubtitle')}</label>
                            <input
                                type="text"
                                className="input-modern"
                                value={subtitle}
                                onChange={(e) => setSubtitle(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Primary Color</label>
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
                            <label className="form-label">Welcome Message</label>
                            <textarea
                                className="input-modern"
                                rows="3"
                                value={greetingMessage}
                                onChange={(e) => setGreetingMessage(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Hazır Sorular / Butonlar (Ziyaretçi Hızlı Yanıtları)</label>
                            <p className="text-sm text-muted" style={{ marginBottom: '8px' }}>
                                Ziyaretçilerin sohbet penceresinde tek tıkla asistana sorabileceği hazır soru butonları ekleyin.
                            </p>
                            <div className="quick-reply-input-row">
                                <input
                                    type="text"
                                    className="input-modern"
                                    value={newQuickReply}
                                    onChange={(e) => setNewQuickReply(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddQuickReply();
                                        }
                                    }}
                                    placeholder="Örn: ✨ Mutfak için parlak modeller"
                                />
                                <button
                                    type="button"
                                    className="quick-reply-add-btn"
                                    onClick={handleAddQuickReply}
                                >
                                    Ekle
                                </button>
                            </div>
                            {quickReplies.length > 0 && (
                                <div className="quick-reply-tags">
                                    {quickReplies.map((reply, idx) => (
                                        <span key={idx} className="quick-reply-tag">
                                            {reply}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveQuickReply(idx)}
                                                className="tag-remove-btn"
                                                title="Kaldır"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
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
                            <label className="form-label">{t('webWidget.widgetWidth')}</label>
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
                                <label htmlFor="widget-active" style={{ margin: 0, cursor: 'pointer', fontWeight: '500', color: '#334155' }}>Widget Active</label>
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
                            <h4>{t('webWidget.preview')}</h4>
                                <div className="widget-preview" style={{
                                    '--widget-color': primaryColor,
                                    alignItems: position === 'LEFT' ? 'flex-start' : 'flex-end',
                                    justifyContent: 'flex-end'
                                }}>
                                    <div className="preview-window" style={{
                                        width: `${width * 0.7}px`, // Scaled for preview
                                        maxWidth: '100%'
                                    }}>
                                        <div className="preview-header">
                                            <div className="preview-header-left">
                                                <div className="preview-avatar">
                                                    <svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="m94 56c0-4.8310547-2.8756104-8.9938965-7-10.8946533v-1.1053467c0-21.5048828-17.4951172-39-39-39s-39 17.4951172-39 39v1.1053467c-4.1243896 1.9007568-7 6.0635986-7 10.8946533 0 6.6166992 5.3828125 12 12 12h4c1.1044922 0 2-.8955078 2-2v-20c0-1.1044922-.8955078-2-2-2h-4c-.3375244 0-.6694336.0231934-1 .0506592v-.0506592c0-19.2988281 15.7011719-35 35-35s35 15.7011719 35 35v.0506592c-.3305664-.0274658-.6624756-.0506592-1-.0506592h-4c-1.1044922 0-2 .8955078-2 2v20c0 1.1044922.8955078 2 2 2h4c.3375244 0 .6694336-.0231934 1-.0506592v3.0506592c0 6.6166992-5.3828125 12-12 12h-15c0-2.2055664-1.7939453-4-4-4h-10c-2.2060547 0-4 1.7944336-4 4v4c0 2.2055664 1.7939453 4 4 4h10c2.2060547 0 4-1.7944336 4-4h15c8.8222656 0 16-7.1777344 16-16v-4.1053467c4.1243896-1.9007568 7-6.0635986 7-10.8946533zm-78-8v16h-2c-4.4111328 0-8-3.5888672-8-8s3.5888672-8 8-8zm26 39v-4h10l.0014648 1.9855957c-.000061.0049439-.0014648.0094605-.0014648.0144043 0 .0050049.0014038.0096436.0014648.0146484l.0014649 1.9853516zm40-23h-2v-16h2c4.4111328 0 8 3.5888672 8 8s-3.5888672 8-8 8zm-34 5c12.1308594 0 22-9.8691406 22-22s-9.8691406-22-22-22-22 9.8691406-22 22c0 3.9248047 1.0517578 7.7607422 3.0498047 11.1459961l-2.0136719 10.4765625c-.1396484.7275391.1337891 1.4726563.7119141 1.9370117.3613281.2900391.8046875.4404297 1.2519531.4404297.2685547 0 .5380859-.0537109.7929688-.1635742l8.9794922-3.8759766c2.9111328 1.3540039 6.0107421 2.0395508 9.227539 2.0395508zm-16.3222656-3.3339844 1.4462891-7.527832c.0966797-.503418-.0029297-1.0244141-.2792969-1.4560547-1.8613282-2.9052734-2.8447266-6.253418-2.8447266-9.6821289 0-9.925293 8.0751953-18 18-18s18 8.074707 18 18-8.0751953 18-18 18c-2.8916016 0-5.6689453-.6787109-8.2548828-2.0170898-.5322266-.2758789-1.1611328-.2988281-1.7119141-.0600586zm16.3222656-12.6660156h-10c-1.1044922 0-2-.8955078-2-2s.8955078-2 2-2h10c1.1044922 0 2 .8955078 2 2s-.8955078 2-2 2zm-12-10c0-1.1044922.8955078-2 2-2h20c1.1044922 0 2 .8955078 2 2s-.8955078 2-2 2h-20c-1.1044922 0-2-.8955078-2-2z"/>
                                                    </svg>
                                                </div>
                                                <div>
                                                    <div className="preview-title">Instomer Akıllı Danışman</div>
                                                    <div className="preview-subtitle">
                                                        <span className="preview-dot"></span>
                                                        <span>{subtitle || 'Online Canlı Destek'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="preview-body">
                                            <div className="preview-msg bot">{greetingMessage}</div>
                                        </div>
                                        <div className="preview-input-box">
                                            {quickReplies.length > 0 && (
                                                <div className="preview-quick-replies">
                                                    {quickReplies.map((r, i) => (
                                                        <div key={i} className="preview-quick-pill">{r}</div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="preview-input-pill">
                                                <span>Mesajınızı yazın...</span>
                                                <div className="preview-send-btn">
                                                    <svg viewBox="0 0 24 24" width="12" height="12" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="preview-fab-pill">
                                        <div className="preview-fab-icon-box">
                                            <svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" className="preview-fab-svg">
                                                <path d="m94 56c0-4.8310547-2.8756104-8.9938965-7-10.8946533v-1.1053467c0-21.5048828-17.4951172-39-39-39s-39 17.4951172-39 39v1.1053467c-4.1243896 1.9007568-7 6.0635986-7 10.8946533 0 6.6166992 5.3828125 12 12 12h4c1.1044922 0 2-.8955078 2-2v-20c0-1.1044922-.8955078-2-2-2h-4c-.3375244 0-.6694336.0231934-1 .0506592v-.0506592c0-19.2988281 15.7011719-35 35-35s35 15.7011719 35 35v.0506592c-.3305664-.0274658-.6624756-.0506592-1-.0506592h-4c-1.1044922 0-2 .8955078-2 2v20c0 1.1044922.8955078 2 2 2h4c.3375244 0 .6694336-.0231934 1-.0506592v3.0506592c0 6.6166992-5.3828125 12-12 12h-15c0-2.2055664-1.7939453-4-4-4h-10c-2.2060547 0-4 1.7944336-4 4v4c0 2.2055664 1.7939453 4 4 4h10c2.2060547 0 4-1.7944336 4-4h15c8.8222656 0 16-7.1777344 16-16v-4.1053467c4.1243896-1.9007568 7-6.0635986 7-10.8946533zm-78-8v16h-2c-4.4111328 0-8-3.5888672-8-8s3.5888672-8 8-8zm26 39v-4h10l.0014648 1.9855957c-.000061.0049439-.0014648.0094605-.0014648.0144043 0 .0050049.0014038.0096436.0014648.0146484l.0014649 1.9853516zm40-23h-2v-16h2c4.4111328 0 8 3.5888672 8 8s-3.5888672 8-8 8zm-34 5c12.1308594 0 22-9.8691406 22-22s-9.8691406-22-22-22-22 9.8691406-22 22c0 3.9248047 1.0517578 7.7607422 3.0498047 11.1459961l-2.0136719 10.4765625c-.1396484.7275391.1337891 1.4726563.7119141 1.9370117.3613281.2900391.8046875.4404297 1.2519531.4404297.2685547 0 .5380859-.0537109.7929688-.1635742l8.9794922-3.8759766c2.9111328 1.3540039 6.0107421 2.0395508 9.227539 2.0395508zm-16.3222656-3.3339844 1.4462891-7.527832c.0966797-.503418-.0029297-1.0244141-.2792969-1.4560547-1.8613282-2.9052734-2.8447266-6.253418-2.8447266-9.6821289 0-9.925293 8.0751953-18 18-18s18 8.074707 18 18-8.0751953 18-18 18c-2.8916016 0-5.6689453-.6787109-8.2548828-2.0170898-.5322266-.2758789-1.1611328-.2988281-1.7119141-.0600586zm16.3222656-12.6660156h-10c-1.1044922 0-2-.8955078-2-2s.8955078-2 2-2h10c1.1044922 0 2 .8955078 2 2s-.8955078 2-2 2zm-12-10c0-1.1044922.8955078-2 2-2h20c1.1044922 0 2 .8955078 2 2s-.8955078 2-2 2h-20c-1.1044922 0-2-.8955078-2-2z"/>
                                            </svg>
                                        </div>
                                        <div className="preview-fab-text">
                                            <div className="preview-fab-title">Dijital Asistan</div>
                                            <div className="preview-subtitle">
                                                <span className="preview-dot"></span>
                                                <span>{subtitle || 'Online Canlı Destek'}</span>
                                            </div>
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

import { useState, useEffect } from 'react';
import { aiAPI, webWidgetAPI } from '../services/api';
import { ArrowLeft, Copy, Check, MessageSquare, Settings, Code, Save } from 'lucide-react';
import './WebWidgetModal.css';

const WebWidgetModal = ({ workspaceId, mode = 'create', widget = null, onClose, onSave }) => {
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    // Widget info
    const [name, setName] = useState('');
    const [siteUrl, setSiteUrl] = useState('');

    // Widget settings
    const [title, setTitle] = useState('Canlı Destek');
    const [subtitle, setSubtitle] = useState('Size nasıl yardımcı olabiliriz?');
    const [primaryColor, setPrimaryColor] = useState('#ef4444');
    const [greetingMessage, setGreetingMessage] = useState('Merhaba! Size nasıl yardımcı olabilirim?');
    const [isActive, setIsActive] = useState(true);
    const [position, setPosition] = useState('RIGHT');
    const [width, setWidth] = useState(350);
    const [assignedBotId, setAssignedBotId] = useState('');
    const [quickReplies, setQuickReplies] = useState([]);
    const [newQuickReply, setNewQuickReply] = useState('');
    const [prechatFormEnabled, setPrechatFormEnabled] = useState(false);
    const [ignoreSchedule, setIgnoreSchedule] = useState(true);
    const [availableBots, setAvailableBots] = useState([]);

    useEffect(() => {
        if (workspaceId) loadBots();
        if (mode === 'edit' && widget) loadWidgetData();
    }, [workspaceId, mode, widget]);

    const loadBots = async () => {
        try {
            console.log('[WebWidget] Loading bots for workspace:', workspaceId);
            const res = await aiAPI.getBots(workspaceId);
            console.log('[WebWidget] Bots loaded:', res.data.bots);
            setAvailableBots(res.data.bots || []);
        } catch (error) {
            console.error('[WebWidget] Error loading bots:', error);
            setAvailableBots([]);
        }
    };

    const loadWidgetData = () => {
        if (!widget) return;
        setName(widget.name || '');
        setSiteUrl(widget.siteUrl || '');
        setTitle(widget.title || 'Canlı Destek');
        setSubtitle(widget.subtitle || '');
        setPrimaryColor(widget.primaryColor || '#ef4444');
        setGreetingMessage(widget.greetingMessage || '');
        setIsActive(widget.isActive !== undefined ? widget.isActive : true);
        setPosition(widget.position || 'RIGHT');
        setWidth(widget.width || 350);
        setAssignedBotId(widget.assignedBotId || '');
        
        let replies = [];
        if (Array.isArray(widget.quickReplies)) {
            replies = widget.quickReplies;
        } else if (typeof widget.quickReplies === 'string') {
            try { replies = JSON.parse(widget.quickReplies); } catch (e) { }
        }
        setQuickReplies(replies);

        setPrechatFormEnabled(widget.prechatFormEnabled !== undefined ? widget.prechatFormEnabled : true);
        setIgnoreSchedule(widget.ignoreSchedule !== undefined ? widget.ignoreSchedule : true);
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
        if (!name.trim()) {
            alert('Widget adı gerekli!');
            return;
        }

        try {
            setSaving(true);
            const data = {
                workspaceId,
                name: name.trim(),
                siteUrl: siteUrl.trim() || null,
                title,
                subtitle,
                primaryColor,
                greetingMessage,
                quickReplies,
                isActive,
                position,
                width,
                assignedBotId: assignedBotId || null,
                prechatFormEnabled,
                ignoreSchedule
            };

            if (mode === 'create') {
                await webWidgetAPI.create(data);
            } else {
                await webWidgetAPI.update(widget.id, data);
            }

            alert(`✅ Widget ${mode === 'create' ? 'oluşturuldu' : 'güncellendi'}!`);
            onSave?.();
        } catch (error) {
            console.error('Error saving widget:', error);
            alert('❌ Kaydedilemedi.');
        } finally {
            setSaving(false);
        }
    };

    const getBackendUrl = () => {
        const apiUrl = import.meta.env.VITE_API_URL || '';
        return apiUrl.includes('/api') ? apiUrl.split('/api')[0] : window.location.origin;
    };

    const widgetId = mode === 'edit' && widget ? widget.id : 'WIDGET_ID';
    const widgetCode = `<script>
  window.AntigravityConfig = {
    widgetId: "${widgetId}",
    baseUrl: "${getBackendUrl()}"
  };
</script>
<script src="${getBackendUrl()}/api/ai/public/widget/script" async></script>`;

    const handleCopy = () => {
        navigator.clipboard.writeText(widgetCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="widget-modal-overlay" onClick={onClose}>
            <div className="widget-modal-panel" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="widget-modal-header">
                    <button className="back-btn" onClick={onClose}>
                        <ArrowLeft size={20} />
                    </button>
                    <h2 style={{ flex: 1, margin: 0, fontSize: '18px', fontWeight: 600 }}>
                        {mode === 'create' ? 'Yeni Web Widget' : 'Widget Düzenle'}
                    </h2>
                    <button className="save-btn" onClick={handleSave} disabled={saving}>
                        <Save size={16} />
                        {saving ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                </div>

                {/* Body - Using Web Widget page style */}
                <div className="widget-modal-body">
                    <div className="modal-grid">
                        {/* Left Column - Settings */}
                        <div className="modal-card">
                            <div className="modal-card-header">
                                <Settings size={18} />
                                <span>Görünüm Ayarları</span>
                            </div>
                            <div className="modal-card-body">
                                <div className="modal-form-group">
                                    <label>Widget Adı *</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Örn: Ana Site Widget"
                                    />
                                </div>
                                <div className="modal-form-group">
                                    <label>Site URL (opsiyonel)</label>
                                    <input
                                        type="url"
                                        value={siteUrl}
                                        onChange={(e) => setSiteUrl(e.target.value)}
                                        placeholder="https://example.com"
                                    />
                                </div>
                                <div className="modal-form-group">
                                    <label>Widget Başlığı</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                    />
                                </div>
                                <div className="modal-form-group">
                                    <label>Alt Başlık</label>
                                    <input
                                        type="text"
                                        value={subtitle}
                                        onChange={(e) => setSubtitle(e.target.value)}
                                    />
                                </div>
                                <div className="modal-form-group">
                                    <label>Ana Renk</label>
                                    <div className="color-input-row">
                                        <input
                                            type="color"
                                            value={primaryColor}
                                            onChange={(e) => setPrimaryColor(e.target.value)}
                                            className="color-picker"
                                        />
                                        <input
                                            type="text"
                                            value={primaryColor}
                                            onChange={(e) => setPrimaryColor(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="modal-form-group">
                                    <label>Karşılama Mesajı</label>
                                    <textarea
                                        rows="2"
                                        value={greetingMessage}
                                        onChange={(e) => setGreetingMessage(e.target.value)}
                                    />
                                </div>
                                <div className="modal-form-group">
                                    <label>Hazır Sorular / Butonlar (Ziyaretçi Hızlı Yanıtları)</label>
                                    <small className="hint" style={{ marginBottom: '8px', display: 'block' }}>
                                        Ziyaretçilerin sohbet penceresinde tek tıkla asistana sorabileceği örnek soru butonları ekleyin.
                                    </small>
                                    <div className="quick-reply-input-row">
                                        <input
                                            type="text"
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
                                <div className="modal-form-group">
                                    <label>Widget Pozisyonu</label>
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
                                <div className="modal-form-group">
                                    <label>Widget Genişliği (px)</label>
                                    <div className="range-row">
                                        <input
                                            type="range"
                                            min="300"
                                            max="500"
                                            step="10"
                                            value={width}
                                            onChange={(e) => setWidth(parseInt(e.target.value))}
                                        />
                                        <span>{width}px</span>
                                    </div>
                                </div>
                                <div className="modal-form-group">
                                    <label>AI Asistan (Bot)</label>
                                    <select
                                        value={assignedBotId}
                                        onChange={(e) => setAssignedBotId(e.target.value)}
                                    >
                                        <option value="">Bot Seçilmedi (Manuel Yanıt)</option>
                                        {availableBots.map(bot => (
                                            <option key={bot.id} value={bot.id}>
                                                {bot.name} {!bot.isActive && '(Pasif)'}
                                            </option>
                                        ))}
                                    </select>
                                    <small className="hint">
                                        {assignedBotId
                                            ? '✅ Seçili bot otomatik yanıt verecek.'
                                            : '⚠️ Bot seçilmediğinde mesajlar sadece Inbox\'a düşer.'}
                                    </small>
                                </div>
                                <div className="modal-form-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={isActive}
                                            onChange={(e) => setIsActive(e.target.checked)}
                                        />
                                        Widget Aktif
                                    </label>
                                </div>
                                <div className="modal-form-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={prechatFormEnabled}
                                            onChange={(e) => setPrechatFormEnabled(e.target.checked)}
                                        />
                                        Pre-Chat Formu Aktif
                                    </label>
                                    <small className="hint">
                                        {prechatFormEnabled
                                            ? '✅ Ziyaretçiler sohbet başlamadan önce iletişim bilgilerini dolduracak.'
                                            : '⚠️ Ziyaretçiler doğrudan sohbete başlayacak.'}
                                    </small>
                                </div>
                                <div className="modal-form-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={ignoreSchedule}
                                            onChange={(e) => setIgnoreSchedule(e.target.checked)}
                                        />
                                        🕐 7/24 Aktif (Bot Zamanlamasını Yok Say)
                                    </label>
                                    <small className="hint">
                                        {ignoreSchedule
                                            ? '✅ Widget, botun zamanlama ayarından bağımsız olarak 7/24 cevap verecek.'
                                            : '⚠️ Widget, botun çalışma saatlerine göre yanıt verecek.'}
                                    </small>
                                </div>
                            </div>
                        </div>

                        {/* Right Column - Code & Preview */}
                        <div className="modal-card">
                            <div className="modal-card-header">
                                <Code size={18} />
                                <span>Kurulum Kodu</span>
                            </div>
                            <div className="modal-card-body">
                                {mode === 'edit' ? (
                                    <>
                                        <p className="hint" style={{ marginBottom: '12px' }}>
                                            Aşağıdaki kodu web sitenizin &lt;head&gt; veya &lt;body&gt; etiketinin sonuna yapıştırın.
                                        </p>
                                        <div className="code-block">
                                            <pre><code>{widgetCode}</code></pre>
                                            <button className="copy-btn" onClick={handleCopy}>
                                                {copied ? <Check size={16} /> : <Copy size={16} />}
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <p className="hint">Widget kaydedildikten sonra kurulum kodu görünecektir.</p>
                                )}

                                {/* Preview */}
                                <div className="preview-section">
                                    <h4>Önizleme</h4>
                                    <div className="widget-preview" style={{
                                        '--widget-color': primaryColor,
                                        alignItems: position === 'LEFT' ? 'flex-start' : 'flex-end'
                                    }}>
                                        <div className="preview-window">
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
                                                <div className="preview-fab-subtitle">
                                                    <span className="preview-fab-status-dot"></span>
                                                    <span>Online Canlı Destek</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WebWidgetModal;

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
    const [prechatFormEnabled, setPrechatFormEnabled] = useState(false);
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
        setPrechatFormEnabled(widget.prechatFormEnabled !== undefined ? widget.prechatFormEnabled : true);
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
                isActive,
                position,
                width,
                assignedBotId: assignedBotId || null,
                prechatFormEnabled
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
                                            <div className="preview-header" style={{ background: primaryColor }}>
                                                <div className="preview-title">{title}</div>
                                                <div className="preview-subtitle">{subtitle}</div>
                                            </div>
                                            <div className="preview-body">
                                                <div className="preview-msg bot">{greetingMessage}</div>
                                            </div>
                                        </div>
                                        <div className="preview-fab" style={{ background: primaryColor }}>
                                            <MessageSquare size={24} />
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

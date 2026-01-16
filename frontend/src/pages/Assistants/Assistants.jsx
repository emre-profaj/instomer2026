import { useState, useEffect } from 'react';
import { aiAPI, workspaceAPI } from '../../services/api';
import { Plus, Trash2, Bot, FileText, Upload, Save, X, Clock, Timer, AlertCircle, Gauge } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './Assistants.css';

// Sub-component for managing documents
const BotDocumentManager = ({ workspaceId, botId }) => {
    const [documents, setDocuments] = useState([]);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (workspaceId && botId) {
            loadDocuments();
        }
    }, [workspaceId, botId]);

    const loadDocuments = async () => {
        try {
            const res = await aiAPI.getDocuments(workspaceId, botId);
            setDocuments(res.data.documents);
        } catch (error) {
            console.error('Error loading docs:', error);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            setUploading(true);
            await aiAPI.uploadDocument(workspaceId, botId, formData);
            loadDocuments();
            alert('Dosya yüklendi!');
        } catch (error) {
            console.error('Upload error:', error);
            alert('Dosya yüklenemedi. Sadece PDF ve DOCX desteklenir.');
        } finally {
            setUploading(false);
            e.target.value = null; // Reset input
        }
    };

    const handleDelete = async (docId) => {
        if (!window.confirm('Bu dokümanı silmek istediğinize emin misiniz?')) return;
        try {
            await aiAPI.deleteDocument(workspaceId, botId, docId);
            loadDocuments();
        } catch (error) {
            console.error('Delete error:', error);
            alert('Silinemedi.');
        }
    };

    return (
        <div className="doc-manager">
            <h5 className="form-label">Bilgi Bankası (PDF/DOCX)</h5>

            {documents.length > 0 ? (
                <ul className="doc-list">
                    {documents.map(doc => (
                        <li key={doc.id} className="doc-item">
                            <span className="doc-name"><FileText size={14} /> {doc.filename}</span>
                            <button
                                onClick={() => handleDelete(doc.id)}
                                className="btn-icon text-danger"
                                style={{ border: 'none', background: 'none', cursor: 'pointer' }}
                            >
                                <Trash2 size={14} color="#ef4444" />
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-muted" style={{ marginBottom: '16px', fontSize: '13px' }}>Henüz dosya yüklenmedi. Asistanın öğrenmesi için belge ekleyin.</p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label className="btn-modern btn-primary" style={{ cursor: 'pointer', background: '#4b5563', fontSize: '12px' }}>
                    <Upload size={14} />
                    {uploading ? 'Yükleniyor...' : 'Belge Yükle'}
                    <input
                        type="file"
                        accept=".pdf,.docx"
                        onChange={handleFileUpload}
                        style={{ display: 'none' }}
                        disabled={uploading}
                    />
                </label>
            </div>
        </div>
    );
};

// Sub-component for individual Bot Item
const BotItem = ({ bot, workspaceId, onDelete, onRefresh }) => {
    const [prompt, setPrompt] = useState(bot.prompt || '');
    const [updating, setUpdating] = useState(false);

    // Scheduler states
    const [schedulerEnabled, setSchedulerEnabled] = useState(bot.schedulerEnabled || false);
    const [scheduleStartTime, setScheduleStartTime] = useState(bot.scheduleStartTime || '09:00');
    const [scheduleEndTime, setScheduleEndTime] = useState(bot.scheduleEndTime || '18:00');
    const [scheduleStartDate, setScheduleStartDate] = useState(bot.scheduleStartDate ? bot.scheduleStartDate.split('T')[0] : '');
    const [scheduleEndDate, setScheduleEndDate] = useState(bot.scheduleEndDate ? bot.scheduleEndDate.split('T')[0] : '');
    const [scheduleDays, setScheduleDays] = useState(() => {
        try {
            return bot.scheduleDays ? JSON.parse(bot.scheduleDays) : [];
        } catch {
            return [];
        }
    });

    // Auto-reply delay states
    const [autoReplyDelayEnabled, setAutoReplyDelayEnabled] = useState(bot.autoReplyDelayEnabled || false);
    const [autoReplyDelaySeconds, setAutoReplyDelaySeconds] = useState(bot.autoReplyDelaySeconds || 30);
    const [autoReplyDelayMessage, setAutoReplyDelayMessage] = useState(bot.autoReplyDelayMessage || '');

    // Follow-up: Inactivity warning (40s)
    const [inactivityWarningEnabled, setInactivityWarningEnabled] = useState(bot.inactivityWarningEnabled || false);
    const [inactivityWarningSeconds, setInactivityWarningSeconds] = useState(bot.inactivityWarningSeconds || 40);
    const [inactivityWarningMessage, setInactivityWarningMessage] = useState(bot.inactivityWarningMessage || '');

    // Follow-up: Daily reminder (24h, max 1 time)
    const [dailyReminderEnabled, setDailyReminderEnabled] = useState(bot.dailyReminderEnabled || false);
    const [dailyReminderHours, setDailyReminderHours] = useState(bot.dailyReminderHours || 24);
    const [dailyReminderMessage, setDailyReminderMessage] = useState(bot.dailyReminderMessage || '');

    const daysOfWeek = [
        { key: 'monday', label: 'Pzt' },
        { key: 'tuesday', label: 'Sal' },
        { key: 'wednesday', label: 'Çar' },
        { key: 'thursday', label: 'Per' },
        { key: 'friday', label: 'Cum' },
        { key: 'saturday', label: 'Cmt' },
        { key: 'sunday', label: 'Paz' }
    ];

    const toggleDay = (day) => {
        setScheduleDays(prev =>
            prev.includes(day)
                ? prev.filter(d => d !== day)
                : [...prev, day]
        );
    };

    const handleUpdate = async () => {
        try {
            setUpdating(true);
            await aiAPI.updateBot(workspaceId, bot.id, {
                name: bot.name,
                role: bot.role,
                prompt: prompt,
                // Scheduler
                schedulerEnabled,
                scheduleStartTime: schedulerEnabled ? scheduleStartTime : null,
                scheduleEndTime: schedulerEnabled ? scheduleEndTime : null,
                scheduleStartDate: schedulerEnabled && scheduleStartDate ? scheduleStartDate : null,
                scheduleEndDate: schedulerEnabled && scheduleEndDate ? scheduleEndDate : null,
                scheduleDays: schedulerEnabled && scheduleDays.length > 0 ? JSON.stringify(scheduleDays) : null,
                // Auto-reply delay
                autoReplyDelayEnabled,
                autoReplyDelaySeconds: autoReplyDelayEnabled ? autoReplyDelaySeconds : 30,
                autoReplyDelayMessage: autoReplyDelayEnabled ? autoReplyDelayMessage : null,
                // Inactivity warning
                inactivityWarningEnabled,
                inactivityWarningSeconds: inactivityWarningEnabled ? inactivityWarningSeconds : 40,
                inactivityWarningMessage: inactivityWarningEnabled ? inactivityWarningMessage : null,
                // Daily reminder
                dailyReminderEnabled,
                dailyReminderHours: dailyReminderEnabled ? dailyReminderHours : 24,
                dailyReminderMessage: dailyReminderEnabled ? dailyReminderMessage : null
            });
            alert('Bot ayarları güncellendi!');
            if (onRefresh) onRefresh();
        } catch (error) {
            console.error('Update bot error:', error);
            alert('Güncelleme başarısız.');
        } finally {
            setUpdating(false);
        }
    };

    return (
        <div className="bot-card">
            <div className="bot-card-header">
                <div className="bot-info">
                    <div className="bot-avatar">
                        <Bot size={24} />
                    </div>
                    <div className="bot-title-group">
                        <h4>{bot.name}</h4>
                        <span className="bot-role-badge">{bot.role}</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        className="btn-modern btn-outline-danger"
                        onClick={() => onDelete(bot.id)}
                        title="Botu Sil"
                        style={{ padding: '8px' }}
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>

            {/* Bot Assignment Info - Tüm atamalar */}
            {bot.assignments && (
                <div className="bot-assignments-section">
                    <label className="form-label" style={{ marginBottom: '10px' }}>📍 Atanan Kanallar</label>
                    <div className="assignments-list">
                        {/* DM Kanalları - Yönlendirme sayfasından */}
                        {bot.assignments.routedChannels?.facebook?.length > 0 && bot.assignments.routedChannels.facebook.map(a => (
                            <span key={a.id} className="assignment-badge facebook">💬 {a.name} {a.team && `→ ${a.team}`}</span>
                        ))}
                        {bot.assignments.routedChannels?.instagram?.length > 0 && bot.assignments.routedChannels.instagram.map(a => (
                            <span key={a.id} className="assignment-badge instagram">📸 {a.name} {a.team && `→ ${a.team}`}</span>
                        ))}
                        {bot.assignments.routedChannels?.whatsapp?.length > 0 && bot.assignments.routedChannels.whatsapp.map(a => (
                            <span key={a.id} className="assignment-badge whatsapp">📱 {a.name} {a.team && `→ ${a.team}`}</span>
                        ))}
                        {bot.assignments.routedChannels?.email?.length > 0 && bot.assignments.routedChannels.email.map(a => (
                            <span key={a.id} className="assignment-badge email">📧 {a.name} {a.team && `→ ${a.team}`}</span>
                        ))}
                        {bot.assignments.routedChannels?.webWidget?.length > 0 && bot.assignments.routedChannels.webWidget.map(a => (
                            <span key={a.id} className="assignment-badge widget">🌐 {a.name} {a.team && `→ ${a.team}`}</span>
                        ))}
                        {bot.assignments.routedChannels?.form?.length > 0 && bot.assignments.routedChannels.form.map(a => (
                            <span key={a.id} className="assignment-badge form">📝 {a.name} {a.team && `→ ${a.team}`}</span>
                        ))}

                        {/* Yorum Kanalları - Kanallar sayfasından */}
                        {bot.assignments.facebookComments?.length > 0 && bot.assignments.facebookComments.map(a => (
                            <span key={a.id} className="assignment-badge facebook-comment">💭 FB Yorum: {a.name}</span>
                        ))}
                        {bot.assignments.instagramComments?.length > 0 && bot.assignments.instagramComments.map(a => (
                            <span key={a.id} className="assignment-badge instagram-comment">💭 IG Yorum: {a.name}</span>
                        ))}

                        {/* Hiç atama yoksa */}
                        {(!bot.assignments.routedChannels?.facebook?.length &&
                            !bot.assignments.routedChannels?.instagram?.length &&
                            !bot.assignments.routedChannels?.whatsapp?.length &&
                            !bot.assignments.routedChannels?.email?.length &&
                            !bot.assignments.routedChannels?.webWidget?.length &&
                            !bot.assignments.routedChannels?.form?.length &&
                            !bot.assignments.facebookComments?.length &&
                            !bot.assignments.instagramComments?.length) && (
                                <span className="assignment-badge info">
                                    💡 {bot.botType === 'CHATS' ? 'Kanallar → Yönlendirme' : 'Kanallar'} sayfasından atama yapın
                                </span>
                            )}
                    </div>
                </div>
            )}

            <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Sistem Talimatı (Prompt)</label>
                <textarea
                    className="input-modern"
                    rows="4"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Örn: Sen yardımsever bir teknik destek uzmanısın. Müşterilere kibar dille yanıt ver..."
                />
            </div>

            {/* Scheduler Section */}
            <div className="bot-settings-section">
                <div className="section-header-toggle">
                    <div className="section-title-group">
                        <Clock size={18} />
                        <span>Zamanlayıcı</span>
                    </div>
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={schedulerEnabled}
                            onChange={(e) => setSchedulerEnabled(e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </div>
                {schedulerEnabled && (
                    <div className="section-content">
                        <p className="section-description">Bot sadece belirlediğiniz zamanlarda otomatik aktif olacaktır.</p>

                        <div className="scheduler-row">
                            <div className="form-group">
                                <label className="form-label-sm">Başlangıç Saati</label>
                                <input
                                    type="time"
                                    className="input-modern input-sm"
                                    value={scheduleStartTime}
                                    onChange={(e) => setScheduleStartTime(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label-sm">Bitiş Saati</label>
                                <input
                                    type="time"
                                    className="input-modern input-sm"
                                    value={scheduleEndTime}
                                    onChange={(e) => setScheduleEndTime(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="scheduler-row">
                            <div className="form-group">
                                <label className="form-label-sm">Başlangıç Tarihi (Opsiyonel)</label>
                                <input
                                    type="date"
                                    className="input-modern input-sm"
                                    value={scheduleStartDate}
                                    onChange={(e) => setScheduleStartDate(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label-sm">Bitiş Tarihi (Opsiyonel)</label>
                                <input
                                    type="date"
                                    className="input-modern input-sm"
                                    value={scheduleEndDate}
                                    onChange={(e) => setScheduleEndDate(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label-sm">Aktif Günler</label>
                            <div className="days-selector">
                                {daysOfWeek.map(day => (
                                    <button
                                        key={day.key}
                                        type="button"
                                        className={`day-btn ${scheduleDays.includes(day.key) ? 'active' : ''}`}
                                        onClick={() => toggleDay(day.key)}
                                    >
                                        {day.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-muted text-xs" style={{ marginTop: '4px' }}>Hiçbiri seçilmezse her gün aktif olur.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Auto-Reply Delay Section */}
            <div className="bot-settings-section">
                <div className="section-header-toggle">
                    <div className="section-title-group">
                        <Timer size={18} />
                        <span>Otomatik Yanıt Gecikmesi</span>
                    </div>
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={autoReplyDelayEnabled}
                            onChange={(e) => setAutoReplyDelayEnabled(e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </div>
                {autoReplyDelayEnabled && (
                    <div className="section-content">
                        <p className="section-description">Müşteri mesajına belirlenen süre içinde yanıt verilmezse otomatik mesaj gönderilir.</p>

                        <div className="form-group">
                            <label className="form-label-sm">Bekleme Süresi (Saniye)</label>
                            <input
                                type="number"
                                className="input-modern input-sm"
                                min="5"
                                max="300"
                                value={autoReplyDelaySeconds}
                                onChange={(e) => setAutoReplyDelaySeconds(parseInt(e.target.value) || 30)}
                                style={{ width: '120px' }}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label-sm">Otomatik Mesaj (Opsiyonel)</label>
                            <textarea
                                className="input-modern"
                                rows="2"
                                value={autoReplyDelayMessage}
                                onChange={(e) => setAutoReplyDelayMessage(e.target.value)}
                                placeholder="Boş bırakılırsa AI yanıtı gönderilir. Özel mesaj için buraya yazın..."
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Inactivity Warning Section (40s) */}
            <div className="bot-settings-section">
                <div className="section-header-toggle">
                    <div className="section-title-group">
                        <AlertCircle size={18} />
                        <span>Müşteri Cevap Vermezse Uyarı</span>
                    </div>
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={inactivityWarningEnabled}
                            onChange={(e) => setInactivityWarningEnabled(e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </div>
                {inactivityWarningEnabled && (
                    <div className="section-content">
                        <p className="section-description">Bot mesaj gönderdikten sonra müşteri belirlenen süre içinde yanıt vermezse uyarı mesajı gönderilir.</p>

                        <div className="form-group">
                            <label className="form-label-sm">Bekleme Süresi (Saniye)</label>
                            <input
                                type="number"
                                className="input-modern input-sm"
                                min="10"
                                max="300"
                                value={inactivityWarningSeconds}
                                onChange={(e) => setInactivityWarningSeconds(parseInt(e.target.value) || 40)}
                                style={{ width: '120px' }}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label-sm">Uyarı Mesajı</label>
                            <textarea
                                className="input-modern"
                                rows="2"
                                value={inactivityWarningMessage}
                                onChange={(e) => setInactivityWarningMessage(e.target.value)}
                                placeholder="Örn: Merhaba, yanıtınızı bekliyorum. Size nasıl yardımcı olabilirim? 😊"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Daily Reminder Section (24h, max 1 time) */}
            <div className="bot-settings-section">
                <div className="section-header-toggle">
                    <div className="section-title-group">
                        <Clock size={18} />
                        <span>Hatırlatma Mesajı (1 Kez)</span>
                    </div>
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={dailyReminderEnabled}
                            onChange={(e) => setDailyReminderEnabled(e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </div>
                {dailyReminderEnabled && (
                    <div className="section-content">
                        <p className="section-description">Müşteri uzun süre yanıt vermezse hatırlatma mesajı gönderilir. <strong>Her sohbette sadece 1 kez</strong> gönderilir.</p>

                        <div className="form-group">
                            <label className="form-label-sm">Bekleme Süresi (Saat)</label>
                            <input
                                type="number"
                                className="input-modern input-sm"
                                min="1"
                                max="168"
                                value={dailyReminderHours}
                                onChange={(e) => setDailyReminderHours(parseInt(e.target.value) || 24)}
                                style={{ width: '120px' }}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label-sm">Hatırlatma Mesajı</label>
                            <textarea
                                className="input-modern"
                                rows="2"
                                value={dailyReminderMessage}
                                onChange={(e) => setDailyReminderMessage(e.target.value)}
                                placeholder="Örn: Merhaba! Geçen görüşmemizden bu yana size ulaşamadık. Hala yardıma ihtiyacınız var mı? 🙋‍♂️"
                            />
                        </div>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', marginBottom: '16px' }}>
                <button
                    className="btn-modern btn-primary"
                    onClick={handleUpdate}
                    disabled={updating}
                    style={{ fontSize: '13px', padding: '8px 16px' }}
                >
                    <Save size={14} />
                    {updating ? 'Kaydediliyor...' : 'Tüm Ayarları Kaydet'}
                </button>
            </div>

            <BotDocumentManager workspaceId={workspaceId} botId={bot.id} />
        </div>
    );
};

const Assistants = () => {
    const { currentWorkspace } = useAuth();
    const workspaceId = currentWorkspace?.id;

    const [bots, setBots] = useState([]);
    const [loading, setLoading] = useState(false);

    // Bot form state
    const [showAddBot, setShowAddBot] = useState(false);
    const [newBotName, setNewBotName] = useState('');
    const [newBotRole, setNewBotRole] = useState('Teknik Servis');
    const [newBotPrompt, setNewBotPrompt] = useState('Sen yardımsever bir müşteri temsilcisisin.');
    const [newWhatsappEnabled, setNewWhatsappEnabled] = useState(false);
    const [newFacebookEnabled, setNewFacebookEnabled] = useState(false);
    const [newInstagramEnabled, setNewInstagramEnabled] = useState(false);
    const [newWidgetEnabled, setNewWidgetEnabled] = useState(false);

    // AI Usage State
    const [aiUsage, setAiUsage] = useState(null);
    const [aiUsageLoading, setAiUsageLoading] = useState(false);

    useEffect(() => {
        if (workspaceId) {
            loadBots();
            loadAiUsage();
        }
    }, [workspaceId]);

    const loadAiUsage = async () => {
        if (!workspaceId) return;
        try {
            setAiUsageLoading(true);
            const response = await workspaceAPI.getAiUsage(workspaceId);
            setAiUsage(response.data);
        } catch (error) {
            console.error('AI usage load error:', error);
            setAiUsage(null);
        } finally {
            setAiUsageLoading(false);
        }
    };

    const loadBots = async () => {
        try {
            setLoading(true);
            const res = await aiAPI.getBots(workspaceId);
            setBots(res.data.bots);
        } catch (error) {
            console.error('Error loading bots:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateBot = async () => {
        if (!newBotName) return;
        try {
            await aiAPI.createBot(workspaceId, {
                name: newBotName,
                role: newBotRole,
                prompt: newBotPrompt
            });
            setShowAddBot(false);
            setNewBotName('');
            setNewBotPrompt('Sen yardımsever bir müşteri temsilcisisin.');
            setNewWhatsappEnabled(false);
            setNewFacebookEnabled(false);
            setNewInstagramEnabled(false);
            loadBots();
        } catch (error) {
            console.error('Error creating bot:', error);
            alert(error.response?.data?.error || 'Bot oluşturulurken hata oluştu.');
        }
    };

    const handleDeleteBot = async (botId) => {
        if (!confirm('Silmek istediğinize emin misiniz?')) return;
        try {
            await aiAPI.deleteBot(workspaceId, botId);
            loadBots();
        } catch (error) {
            console.error('Error deleting bot:', error);
        }
    };

    if (!currentWorkspace) return <div className="page-container">Lütfen bir workspace seçin.</div>;

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">AI Asistanlar</h1>
                    <p className="text-muted">Müşterilerinize otomatik yanıt verecek asistanları buradan yönetin.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    {!showAddBot && (
                        <button
                            className="btn-modern btn-primary"
                            onClick={() => {
                                setShowAddBot(true);
                            }}
                        >
                            <Plus size={18} />
                            Yeni Asistan Ekle
                        </button>
                    )}
                </div>
            </div>

            {/* AI Usage Limit Card */}
            <div className="ai-usage-card-wrapper">
                {aiUsageLoading ? (
                    <div className="ai-usage-card loading">
                        <div className="usage-loading">Kullanım bilgisi yükleniyor...</div>
                    </div>
                ) : aiUsage ? (
                    <div className={`ai-usage-card ${aiUsage.percentage >= 100 ? 'exceeded' : aiUsage.percentage >= 80 ? 'warning' : ''}`}>
                        <div className="usage-card-header">
                            <div className="usage-card-icon">
                                <Gauge size={20} />
                            </div>
                            <div className="usage-card-title">
                                <h4>Günlük AI Kullanımı</h4>
                                <span className={`usage-plan-tag ${aiUsage.subscription?.toLowerCase()}`}>
                                    {aiUsage.subscriptionName}
                                </span>
                            </div>
                        </div>

                        <div className="usage-card-stats">
                            <div className="usage-stat">
                                <span className="stat-value">{aiUsage.currentCount}</span>
                                <span className="stat-label">Kullanılan</span>
                            </div>
                            <div className="usage-stat divider">/</div>
                            <div className="usage-stat">
                                <span className="stat-value">{aiUsage.limit}</span>
                                <span className="stat-label">Limit</span>
                            </div>
                            <div className="usage-stat remaining">
                                <span className="stat-value">{aiUsage.remaining}</span>
                                <span className="stat-label">Kalan</span>
                            </div>
                        </div>

                        <div className="usage-progress-bar">
                            <div
                                className="usage-progress-fill"
                                style={{ width: `${Math.min(aiUsage.percentage, 100)}%` }}
                            />
                        </div>

                        {aiUsage.percentage >= 100 && (
                            <div className="usage-alert exceeded">
                                <AlertCircle size={16} />
                                <span>Günlük limit doldu! AI bot yanıt vermeyecek.</span>
                            </div>
                        )}
                        {aiUsage.percentage >= 80 && aiUsage.percentage < 100 && (
                            <div className="usage-alert warning">
                                <AlertCircle size={16} />
                                <span>Limite yaklaşıyorsunuz (%{aiUsage.percentage})</span>
                            </div>
                        )}
                    </div>
                ) : null}
            </div>

            <div className="assistants-info-box">
                <p>💡 Botları Channels sayfasından ilgili kanallara (WhatsApp, Facebook, Instagram, E-posta, Widget) atayabilirsiniz.</p>
            </div>

            <div className="assistants-content">
                {/* Add Bot Form Overlay */}
                {showAddBot && (
                    <div className="add-bot-form">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '20px', fontWeight: '600' }}>Yeni Asistan Oluştur</h3>
                            <button onClick={() => setShowAddBot(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={24} color="#6b7280" />
                            </button>
                        </div>

                        <div className="form-group" style={{ marginBottom: '16px' }}>
                            <label className="form-label">Asistan Adı</label>
                            <input
                                type="text"
                                className="input-modern"
                                value={newBotName}
                                onChange={(e) => setNewBotName(e.target.value)}
                                placeholder="Örn: Satış Temsilcisi Ali"
                            />
                        </div>
                        <div className="form-group" style={{ marginBottom: '16px' }}>
                            <label className="form-label">Rolü</label>
                            <select
                                className="input-modern"
                                value={newBotRole}
                                onChange={(e) => setNewBotRole(e.target.value)}
                            >
                                <option value="Teknik Servis">Teknik Servis</option>
                                <option value="Satış">Satış</option>
                                <option value="Bilgi">Bilgi / Info</option>
                                <option value="Diğer">Diğer</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ marginBottom: '24px' }}>
                            <label className="form-label">Sistem Talimatı</label>
                            <textarea
                                className="input-modern"
                                rows="4"
                                value={newBotPrompt}
                                onChange={(e) => setNewBotPrompt(e.target.value)}
                                placeholder="Örn: Sen nazik bir satış temsilcisisin. İnsanlarla konuşurken emojiler kullan..."
                            />
                        </div>



                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button className="btn-modern btn-outline-danger" style={{ border: '1px solid #d1d5db', color: '#374151' }} onClick={() => setShowAddBot(false)}>
                                İptal
                            </button>
                            <button className="btn-modern btn-primary" onClick={handleCreateBot}>
                                Asistanı Oluştur
                            </button>
                        </div>
                    </div>
                )}

                {/* Bots Grid */}
                {loading && !bots.length ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>Yükleniyor...</div>
                ) : bots.length === 0 && !showAddBot ? (
                    <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '16px', border: '1px dashed #d1d5db' }}>
                        <Bot size={48} color="#9ca3af" style={{ marginBottom: '16px' }} />
                        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Henüz Asistan Yok</h3>
                        <p className="text-muted" style={{ marginBottom: '24px' }}>İlk yapay zeka asistanınızı oluşturarak başlayın.</p>
                        <button className="btn-modern btn-primary" onClick={() => setShowAddBot(true)}>
                            <Plus size={18} /> İlk Asistanı Ekle
                        </button>
                    </div>
                ) : (
                    <div className="bots-grid">
                        {bots.map(bot => (
                            <BotItem
                                key={bot.id}
                                bot={bot}
                                workspaceId={workspaceId}
                                onDelete={handleDeleteBot}
                                onRefresh={loadBots}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Spacer to ensure bottom margin */}
            <div style={{ height: '100px', width: '100%' }}></div>
        </div>
    );
};

export default Assistants;

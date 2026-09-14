import { useState } from 'react';
import { X, Phone, Calendar, Bell, FileText, CheckCircle, XCircle } from 'lucide-react';
import { activityAPI } from '../../services/activity.api';
import { useAuth } from '../../context/AuthContext';
import './QuickActivityModal.css';

/**
 * QuickActivityModal
 * Hızlı eylem butonlarından açılan bağımsız popup modal.
 * actionType: 'NOTE' | 'CALL' | 'MEETING' | 'REMINDER'
 * contact: { id, name, phone, email }
 */
const QuickActivityModal = ({ actionType, contact, agents = [], onClose, onSaved }) => {
    const { currentWorkspace } = useAuth();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // NOTE özel alanlar
    const [callSuccess, setCallSuccess] = useState(null); // 'SUCCESS' | 'FAILED'
    const [sentiment, setSentiment] = useState(null); // 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'

    // MEETING özel alanlar
    const [meetingType, setMeetingType] = useState('YUZ_YUZE');

    // Ortak alanlar
    const [description, setDescription] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [assignedToId, setAssignedToId] = useState(agents[0]?.id || '');

    const config = {
        NOTE:     { title: 'Arama Notu',      icon: <FileText size={18} />,  color: '#f59e0b' },
        CALL:     { title: 'Arama Planla',     icon: <Phone size={18} />,     color: '#3b82f6' },
        MEETING:  { title: 'Görüşme Planla',   icon: <Calendar size={18} />,  color: '#8b5cf6' },
        REMINDER: { title: 'Görev Hatırlatıcı',icon: <Bell size={18} />,      color: '#10b981' },
    }[actionType] || { title: 'Aktivite', icon: <FileText size={18} />, color: '#6366f1' };

    const handleSave = async () => {
        if (!contact?.id || !currentWorkspace?.id) return;

        if (actionType === 'NOTE') {
            if (!callSuccess) return setError('Lütfen arama sonucunu seçin.');
            if (callSuccess === 'SUCCESS' && !sentiment) return setError('Lütfen görüşme tonunu seçin.');
            if (!description.trim()) return setError('Açıklama boş olamaz.');
        } else {
            if (!description.trim()) return setError('Açıklama boş olamaz.');
            if ((actionType === 'CALL' || actionType === 'MEETING' || actionType === 'REMINDER') && !dueDate) {
                return setError('Lütfen tarih/saat seçin.');
            }
        }

        setSaving(true);
        setError('');
        try {
            const isNote = actionType === 'NOTE';
            const data = {
                workspaceId: currentWorkspace.id,
                type: isNote ? 'CALL' : actionType,
                title: config.title,
                description: isNote && callSuccess === 'FAILED'
                    ? `📵 Ulaşılamadı: ${description}`
                    : description,
                dueDate: isNote ? new Date().toISOString() : (dueDate ? new Date(dueDate).toISOString() : null),
                assignedToId: isNote ? null : (assignedToId || null),
                status: isNote ? 'COMPLETED' : 'PENDING',
                ...(isNote && { callSuccessful: callSuccess === 'SUCCESS', callSentiment: sentiment }),
                ...(actionType === 'MEETING' && { callTopic: meetingType }),
            };
            await activityAPI.createActivity(contact.id, data);
            onSaved?.();
            onClose();
        } catch (e) {
            setError('Kayıt sırasında bir hata oluştu.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div className="qam-backdrop" onClick={onClose} />
            <div className="qam-modal">
                {/* Header */}
                <div className="qam-header" style={{ '--action-color': config.color }}>
                    <div className="qam-header-icon" style={{ background: config.color + '20', color: config.color }}>
                        {config.icon}
                    </div>
                    <div className="qam-header-text">
                        <span className="qam-action-label">{config.title}</span>
                        <span className="qam-contact-name">{contact?.name || contact?.phone || 'Kişi'}</span>
                    </div>
                    <button className="qam-close" onClick={onClose}><X size={18} /></button>
                </div>

                {/* Body */}
                <div className="qam-body">

                    {/* NOTE: Arama sonucu */}
                    {actionType === 'NOTE' && (
                        <>
                            <div className="qam-field-label">Arama Başarılı mı?</div>
                            <div className="qam-choice-row">
                                <button
                                    className={`qam-choice ${callSuccess === 'SUCCESS' ? 'selected success' : ''}`}
                                    onClick={() => setCallSuccess('SUCCESS')}
                                >
                                    <CheckCircle size={16} /> Ulaşıldı
                                </button>
                                <button
                                    className={`qam-choice ${callSuccess === 'FAILED' ? 'selected failed' : ''}`}
                                    onClick={() => setCallSuccess('FAILED')}
                                >
                                    <XCircle size={16} /> Ulaşılamadı
                                </button>
                            </div>

                            {callSuccess === 'SUCCESS' && (
                                <>
                                    <div className="qam-field-label">Görüşme Nasıl Geçti?</div>
                                    <div className="qam-choice-row">
                                        {[
                                            { key: 'POSITIVE', emoji: '😊', label: 'Olumlu' },
                                            { key: 'NEUTRAL',  emoji: '😐', label: 'Nötr' },
                                            { key: 'NEGATIVE', emoji: '😞', label: 'Olumsuz' },
                                        ].map(s => (
                                            <button
                                                key={s.key}
                                                className={`qam-choice sentiment ${sentiment === s.key ? 'selected' : ''}`}
                                                onClick={() => setSentiment(s.key)}
                                            >
                                                {s.emoji} {s.label}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    {/* MEETING: Görüşme Tipi */}
                    {actionType === 'MEETING' && (
                        <div className="qam-field">
                            <label className="qam-field-label">Görüşme Tipi</label>
                            <div className="qam-choice-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                                {[
                                    { value: 'YUZ_YUZE', label: 'Yüz Yüze',        icon: '🤝' },
                                    { value: 'ONLINE',   label: 'Online / Video',  icon: '💻' },
                                    { value: 'TELEFON',  label: 'Telefon',         icon: '📞' },
                                    { value: 'KLINIK',   label: 'Muayene / Klinik', icon: '🏥' },
                                    { value: 'DIGER',    label: 'Diğer',           icon: '📋' },
                                ].map(t => (
                                    <button
                                        key={t.value}
                                        type="button"
                                        className={`qam-choice ${meetingType === t.value ? 'selected' : ''}`}
                                        onClick={() => setMeetingType(t.value)}
                                        style={{ flex: '1 1 auto', minWidth: '100px' }}
                                    >
                                        <span>{t.icon}</span> {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tarih/Saat — CALL, MEETING, REMINDER */}
                    {(actionType === 'CALL' || actionType === 'MEETING' || actionType === 'REMINDER') && (
                        <div className="qam-field">
                            <label className="qam-field-label">Tarih / Saat</label>
                            <input
                                type="datetime-local"
                                className="qam-input"
                                value={dueDate}
                                onChange={e => setDueDate(e.target.value)}
                            />
                        </div>
                    )}

                    {/* Atama — sadece NOTE değilse */}
                    {actionType !== 'NOTE' && agents.length > 0 && (
                        <div className="qam-field">
                            <label className="qam-field-label">Temsilci</label>
                            <select
                                className="qam-input"
                                value={assignedToId}
                                onChange={e => setAssignedToId(e.target.value)}
                            >
                                {agents.map(a => (
                                    <option key={a.id} value={a.id}>{a.name || a.email}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Açıklama */}
                    <div className="qam-field">
                        <label className="qam-field-label">
                            {actionType === 'NOTE' ? 'Görüşme Notu *' : 'Açıklama *'}
                        </label>
                        <textarea
                            className="qam-textarea"
                            placeholder={actionType === 'NOTE' ? 'Görüşme notunu yazın...' : 'Açıklama ekleyin...'}
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={4}
                        />
                    </div>

                    {error && <div className="qam-error">{error}</div>}
                </div>

                {/* Footer */}
                <div className="qam-footer">
                    <button className="qam-btn-cancel" onClick={onClose}>İptal</button>
                    <button
                        className="qam-btn-save"
                        style={{ background: config.color }}
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                </div>
            </div>
        </>
    );
};

export default QuickActivityModal;

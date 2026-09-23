import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Bell, UserCheck, MessageSquarePlus, TrendingUp, Loader2, Smartphone, Mail, ChevronRight, Save, UserPlus } from 'lucide-react';
import './NotificationSettings.css';

const NotificationSettings = () => {
    const { user, currentWorkspace } = useAuth();
    const [preferences, setPreferences] = useState({
        assignment: true,
        newRequest: true,
        dealStage: true,
        fbLead: true,
        whatsappEnabled: false,
        whatsappPhone: '',
        emailEnabled: false,
        notificationEmail: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedKey, setSavedKey] = useState(null);

    useEffect(() => {
        if (currentWorkspace?.id) {
            loadPreferences();
        }
    }, [currentWorkspace]);

    const loadPreferences = async () => {
        try {
            setLoading(true);
            const response = await api.get(`/notifications/${currentWorkspace.id}/preferences`);
            if (response.data?.preferences) {
                setPreferences(prev => ({ ...prev, ...response.data.preferences }));
            }
        } catch (error) {
            console.error('Error loading notification preferences:', error);
        } finally {
            setLoading(false);
        }
    };

    const savePreferences = async (newPrefs) => {
        setSaving(true);
        try {
            await api.put(`/notifications/${currentWorkspace.id}/preferences`, newPrefs);
        } catch (error) {
            console.error('Error saving notification preferences:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async (key) => {
        const newPrefs = { ...preferences, [key]: !preferences[key] };
        setPreferences(newPrefs);
        setSavedKey(key);
        await savePreferences(newPrefs);
        setTimeout(() => setSavedKey(null), 1500);
    };

    const handlePhoneSave = async () => {
        setSavedKey('whatsappPhone');
        await savePreferences(preferences);
        setTimeout(() => setSavedKey(null), 1500);
    };

    const handleEmailSave = async () => {
        setSavedKey('notificationEmail');
        await savePreferences(preferences);
        setTimeout(() => setSavedKey(null), 1500);
    };

    const notificationItems = [
        {
            key: 'assignment',
            icon: <UserCheck size={20} />,
            title: 'Bana atama yapıldığında',
            description: 'Bir görüşme veya görev size atandığında bildirim alın'
        },
        {
            key: 'newRequest',
            icon: <MessageSquarePlus size={20} />,
            title: 'Yeni talep geldiğinde',
            description: 'Yeni mesaj, form veya lead geldiğinde bildirim alın'
        },
        {
            key: 'dealStage',
            icon: <TrendingUp size={20} />,
            title: 'Fırsat aşamasına giriş yaptığında',
            description: 'Bir fırsat yeni bir aşamaya geçtiğinde bildirim alın'
        },
        {
            key: 'fbLead',
            icon: <UserPlus size={20} />,
            title: 'Yeni Facebook Lead geldiğinde',
            description: 'Facebook lead formundan yeni bir kayıt geldiğinde bildirim alın'
        }
    ];

    return (
        <div className="ws-settings-page">
            <div className="ws-settings-header">
                <div className="ws-settings-breadcrumb">
                    <span>Ayarlar</span>
                    <ChevronRight size={14} />
                    <span className="ws-settings-breadcrumb-active">Bildirim Ayarları</span>
                </div>
                <h1 className="ws-settings-title">
                    <Bell size={22} />
                    Bildirim Ayarları
                </h1>
                <p className="ws-settings-subtitle">
                    Neler hakkında bildirim almak istediğinizi ve hangi kanallardan ulaşılacağını belirleyin.
                </p>
            </div>

            <div className="ws-settings-body">
                {loading ? (
                    <div className="notif-loading">
                        <Loader2 size={20} className="notif-spin" />
                        <span>Yükleniyor...</span>
                    </div>
                ) : (
                    <div className="notif-content">
                        {/* Bildirim Tercihleri */}
                        <section className="ws-settings-section">
                            <div className="ws-settings-section-header">
                                <h2 className="ws-settings-section-title">Bildirim Tercihleri</h2>
                                <p className="ws-settings-section-desc">Hangi olaylar için bildirim almak istediğinizi seçin.</p>
                            </div>

                            <div className="ws-settings-cards">
                                {notificationItems.map((item) => (
                                    <div key={item.key} className={`ws-settings-card ${preferences[item.key] ? 'card-on' : 'card-off'}`}>
                                        <div className="ws-settings-card-left">
                                            <div className={`ws-settings-card-icon ${preferences[item.key] ? 'icon-on' : 'icon-off'}`}>
                                                {item.icon}
                                            </div>
                                            <div className="ws-settings-card-info">
                                                <div className="ws-settings-card-name">{item.title}</div>
                                                <div className="ws-settings-card-desc">{item.description}</div>
                                            </div>
                                        </div>
                                        <div className="ws-settings-card-right">
                                            {savedKey === item.key && <span className="notif-saved">✓</span>}
                                            <button
                                                className={`ws-toggle-btn ${preferences[item.key] ? 'on' : 'off'}`}
                                                onClick={() => handleToggle(item.key)}
                                                disabled={saving}
                                            >
                                                {preferences[item.key] ? 'Açık' : 'Kapalı'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Bildirim Kanalları */}
                        <section className="ws-settings-section" style={{ marginTop: 32 }}>
                            <div className="ws-settings-section-header">
                                <h2 className="ws-settings-section-title">Bildirim Kanalları</h2>
                                <p className="ws-settings-section-desc">Bildirimlerin hangi kanallardan gönderileceğini belirleyin.</p>
                            </div>

                            <div className="ws-settings-cards">
                                {/* E-posta */}
                                <div className={`ws-settings-card ${preferences.emailEnabled ? 'card-on' : 'card-off'}`}>
                                    <div className="ws-settings-card-left">
                                        <div className={`ws-settings-card-icon ${preferences.emailEnabled ? 'icon-blue' : 'icon-off'}`}>
                                            <Mail size={20} />
                                        </div>
                                        <div className="ws-settings-card-info">
                                            <div className="ws-settings-card-name">E-posta Bildirimi</div>
                                            <div className="ws-settings-card-desc">
                                                {preferences.notificationEmail?.trim() ? (
                                                    <>Bildirimler <strong>yalnızca</strong> aşağıda yazdığınız adreslere gönderilir</>
                                                ) : user?.email ? (
                                                    <>Bildirimler hesabınızdaki e-posta adresine <strong>({user.email})</strong> gönderilir</>
                                                ) : (
                                                    'Bildirimler hesabınızdaki e-posta adresine gönderilir'
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="ws-settings-card-right">
                                        {savedKey === 'emailEnabled' && <span className="notif-saved">✓</span>}
                                        <button
                                            className={`ws-toggle-btn ${preferences.emailEnabled ? 'on' : 'off'}`}
                                            onClick={() => handleToggle('emailEnabled')}
                                            disabled={saving}
                                        >
                                            {preferences.emailEnabled ? 'Açık' : 'Kapalı'}
                                        </button>
                                    </div>
                                </div>

                                {/* Ek / Manuel E-posta Yazma Alanı */}
                                {preferences.emailEnabled && (
                                    <div className="notif-email-card">
                                        <label>Bildirim Gönderilecek Adresler (Opsiyonel)</label>
                                        <div className="notif-email-row">
                                            <input
                                                type="text"
                                                placeholder="Örn: bildirim@sirketiniz.com (birden fazla ise virgülle ayırın)"
                                                value={preferences.notificationEmail || ''}
                                                onChange={(e) => setPreferences(prev => ({ ...prev, notificationEmail: e.target.value }))}
                                                onKeyDown={(e) => { if (e.key === 'Enter') handleEmailSave(); }}
                                            />
                                            <button
                                                className="notif-email-save"
                                                onClick={handleEmailSave}
                                                disabled={saving}
                                            >
                                                <Save size={14} />
                                                {savedKey === 'notificationEmail' ? 'Kaydedildi!' : 'Kaydet'}
                                            </button>
                                        </div>
                                        <span className="notif-email-hint">
                                            {preferences.notificationEmail?.trim()
                                                ? <>Bildirimler <strong>yalnızca</strong> buradaki adreslere gider; hesap e-postanıza{user?.email ? ` (${user.email})` : ''} gönderilmez. Birden fazla adresi virgülle ayırın.</>
                                                : <>Boş bırakırsanız bildirimler hesap e-postanıza{user?.email ? ` (${user.email})` : ''} gider. Buraya adres yazarsanız yalnızca o adreslere gönderilir.</>}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationSettings;

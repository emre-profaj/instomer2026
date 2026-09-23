import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { Key, Save, Loader, CheckCircle, AlertCircle, Activity, ShieldCheck, HelpCircle, Mail, Send } from 'lucide-react';
import './AdminDashboard.css';
import './AdminSettings.css';

const AdminSettings = () => {
    const { t } = useTranslation();
    const [globalSettings, setGlobalSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [globalAiApiKey, setGlobalAiApiKey] = useState('');
    const [message, setMessage] = useState({ type: '', text: '' });

    // Facebook Health Check
    const [checkingHealth, setCheckingHealth] = useState(false);
    // Sistem e-postası: .env'e dokunmadan panelden girilebilsin diye
    const [mail, setMail] = useState({ host: 'smtp.gmail.com', port: 587, user: '', from: '', pass: '' });
    const [mailDurum, setMailDurum] = useState(null);
    const [mailKaydediliyor, setMailKaydediliyor] = useState(false);
    const [testAdresi, setTestAdresi] = useState('');
    const [testGonderiliyor, setTestGonderiliyor] = useState(false);
    const [healthResults, setHealthResults] = useState(null);

    useEffect(() => {
        loadGlobalSettings();
    }, []);

    const loadGlobalSettings = async () => {
        try {
            setLoading(true);
            const response = await adminAPI.getGlobalSettings();
            const ayar = response.data.settings;
            setGlobalSettings(ayar);
            setMail(m => ({
                ...m,
                host: ayar?.systemEmailHost || m.host,
                port: ayar?.systemEmailPort || 587,
                user: ayar?.systemEmailUser || '',
                from: ayar?.systemEmailFrom || '',
                pass: ''
            }));
            adminAPI.checkSystemEmail().then(r => setMailDurum(r.data)).catch(() => {});
        } catch (error) {
            console.error('Global settings error:', error);
            setMessage({ type: 'error', text: 'Ayarlar yüklenemedi' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage({ type: '', text: '' });
        try {
            await adminAPI.updateGlobalSettings({ globalAiApiKey });
            setMessage({
                type: 'success',
                text: globalAiApiKey ? 'Global AI API Key başarıyla güncellendi!' : 'Global AI API Key kaldırıldı!'
            });
            setGlobalAiApiKey('');
            loadGlobalSettings();
        } catch (error) {
            setMessage({
                type: 'error',
                text: 'Kaydetme hatası: ' + (error.response?.data?.error || error.message)
            });
        } finally {
            setSaving(false);
        }
    };

    const mailKaydet = async () => {
        setMailKaydediliyor(true);
        setMessage({ type: '', text: '' });
        try {
            const r = await adminAPI.saveSystemEmail(mail);
            setMailDurum(r.data.durum);
            setMail(m => ({ ...m, pass: '' }));
            setMessage(r.data.durum?.configured
                ? { type: 'success', text: 'Gönderici kaydedildi ve bağlantı doğrulandı.' }
                : { type: 'error', text: 'Kaydedildi ama bağlantı kurulamadı: ' + (r.data.durum?.error || '') });
            loadGlobalSettings();
        } catch (error) {
            setMessage({ type: 'error', text: 'Kaydetme hatası: ' + (error.response?.data?.error || error.message) });
        } finally {
            setMailKaydediliyor(false);
        }
    };

    const mailTestGonder = async () => {
        setTestGonderiliyor(true);
        setMessage({ type: '', text: '' });
        try {
            const r = await adminAPI.testSystemEmail(testAdresi);
            setMessage({ type: 'success', text: r.data.message });
        } catch (error) {
            setMessage({ type: 'error', text: 'Test maili gönderilemedi: ' + (error.response?.data?.error || error.message) });
        } finally {
            setTestGonderiliyor(false);
        }
    };

    const handleCheckFacebookHealth = async () => {
        setCheckingHealth(true);
        setMessage({ type: '', text: '' });
        try {
            const response = await adminAPI.checkFacebookHealth();
            setHealthResults(response.data);
            setMessage({
                type: response.data.unhealthy > 0 ? 'error' : 'success',
                text: `Kontrol tamamlandı: ${response.data.healthy} sağlıklı, ${response.data.unhealthy} sorunlu sayfa`
            });
        } catch (error) {
            setMessage({
                type: 'error',
                text: 'Health check hatası: ' + (error.response?.data?.error || error.message)
            });
        } finally {
            setCheckingHealth(false);
        }
    };

    if (loading) {
        return (
            <div className="admin-dashboard">
                <div className="loading">
                    <Loader className="spinning" size={24} />
                    <span style={{ marginLeft: '10px' }}>Yükleniyor...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-settings-container">
            {/* Message Alert */}
            {message.text && (
                <div className={`alert ${message.type}`} style={{
                    padding: '16px 20px',
                    borderRadius: '12px',
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
                    color: message.type === 'success' ? '#166534' : '#991b1b',
                    border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                    fontSize: '14px',
                    fontWeight: 500,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                }}>
                    {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    {message.text}
                </div>
            )}

            {/* Sistem E-postası */}
            <div className="settings-card">
                <div className="settings-card-header">
                    <div className="header-icon-box red">
                        <Mail size={26} color="white" strokeWidth={2.5} />
                    </div>
                    <div className="header-text">
                        <h2>Sistem E-postası</h2>
                        <p>Lead ve bildirim mailleri bu adresten gönderilir</p>
                    </div>
                </div>

                <div className={`status-badge ${mailDurum?.configured ? 'active' : 'warning'}`}>
                    {mailDurum?.configured ? (
                        <>
                            <CheckCircle size={18} />
                            <span>Bağlantı doğrulandı — <strong>{mailDurum.email}</strong>
                                {mailDurum.kaynak === 'env' ? ' (.env)' : ''}</span>
                        </>
                    ) : (
                        <>
                            <AlertCircle size={18} />
                            <span>{mailDurum?.error || 'Gönderici tanımlı değil — bildirim mailleri gitmiyor.'}</span>
                        </>
                    )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12, marginTop: 18 }}>
                    <div>
                        <label htmlFor="m-host" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>SMTP Sunucusu</label>
                        <input id="m-host" className="settings-input" placeholder="smtp.gmail.com"
                            value={mail.host} onChange={e => setMail({ ...mail, host: e.target.value })} />
                    </div>
                    <div>
                        <label htmlFor="m-port" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Port</label>
                        <input id="m-port" className="settings-input" type="number" placeholder="587"
                            value={mail.port} onChange={e => setMail({ ...mail, port: e.target.value })} />
                    </div>
                </div>

                <div style={{ marginTop: 12 }}>
                    <label htmlFor="m-user" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Kullanıcı (e-posta)</label>
                    <input id="m-user" className="settings-input" placeholder="bildirim@instomer.com"
                        value={mail.user} onChange={e => setMail({ ...mail, user: e.target.value })} />
                </div>

                <div style={{ marginTop: 12 }}>
                    <label htmlFor="m-pass" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                        Şifre {globalSettings?.hasSystemEmailPass && <span style={{ fontWeight: 400, color: '#64748b' }}>— kayıtlı, değiştirmek için yazın</span>}
                    </label>
                    <input id="m-pass" className="settings-input" type="password" autoComplete="new-password"
                        placeholder={globalSettings?.hasSystemEmailPass ? '••••••••••••' : 'Uygulama şifresi'}
                        value={mail.pass} onChange={e => setMail({ ...mail, pass: e.target.value })} />
                    <small style={{ display: 'block', marginTop: 6, fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                        Google Workspace kullanıyorsanız hesabın normal şifresi çalışmaz; 2 adımlı doğrulamayı açıp
                        <strong> Uygulama Şifresi</strong> üretin. Şifre şifrelenerek saklanır ve bir daha ekranda gösterilmez.
                    </small>
                </div>

                <div style={{ marginTop: 12 }}>
                    <label htmlFor="m-from" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Görünen gönderici <span style={{ fontWeight: 400, color: '#64748b' }}>(opsiyonel)</span></label>
                    <input id="m-from" className="settings-input" placeholder="Instomer &lt;bildirim@instomer.com&gt;"
                        value={mail.from} onChange={e => setMail({ ...mail, from: e.target.value })} />
                </div>

                <button className="btn-premium red" onClick={mailKaydet} disabled={mailKaydediliyor || !mail.host || !mail.user}
                    style={{ marginTop: 18 }}>
                    {mailKaydediliyor ? <><Loader size={18} className="spinning" /> Kaydediliyor...</> : <><Save size={18} /> Kaydet ve doğrula</>}
                </button>

                <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid #f1f5f9' }}>
                    <label htmlFor="m-test" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Test maili gönder</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <input id="m-test" className="settings-input" type="email" placeholder="ornek@firma.com"
                            value={testAdresi} onChange={e => setTestAdresi(e.target.value)} style={{ flexGrow: 1 }} />
                        <button className="btn-premium red" onClick={mailTestGonder}
                            disabled={testGonderiliyor || !testAdresi.includes('@') || !mailDurum?.configured}
                            style={{ margin: 0, whiteSpace: 'nowrap' }}>
                            {testGonderiliyor ? <><Loader size={16} className="spinning" /> Gönderiliyor</> : <><Send size={16} /> Gönder</>}
                        </button>
                    </div>
                </div>
            </div>

            {/* Global AI API Key Card */}
            <div className="settings-card">
                <div className="settings-card-header">
                    <div className="header-icon-box red">
                        <Key size={26} color="white" strokeWidth={2.5} />
                    </div>
                    <div className="header-text">
                        <h2>Global AI API Key</h2>
                        <p>Tüm workspace'ler için varsayılan AI API anahtarı</p>
                    </div>
                </div>

                {/* Current Status Badge */}
                <div className={`status-badge ${globalSettings?.hasGlobalAiApiKey ? 'active' : 'warning'}`}>
                    {globalSettings?.hasGlobalAiApiKey ? (
                        <>
                            <span className="badge-label">Active</span>
                            <span>
                                Key: <code style={{ letterSpacing: '2px', opacity: 0.8 }}>••••••••{globalSettings.globalAiApiKey?.slice(-4)}</code>
                            </span>
                        </>
                    ) : (
                        <>
                            <span className="badge-label">Not Set</span>
                            <span>Henüz global API key tanımlanmamış.</span>
                        </>
                    )}
                </div>

                {/* Input Form */}
                <div className="settings-form-group">
                    <label>Google Gemini API Key</label>
                    <input
                        type="password"
                        value={globalAiApiKey}
                        onChange={(e) => setGlobalAiApiKey(e.target.value)}
                        placeholder="AQ.Ab..."
                        className="settings-input"
                    />
                    <div className="input-hint">
                        {globalSettings?.hasGlobalAiApiKey
                            ? 'Yeni bir anahtar girerek mevcut olanı güncelleyebilirsiniz. Alanı boş bırakıp kaydederseniz anahtar silinir.'
                            : 'AI platformu üzerinden aldığınız API anahtarını buraya girin. Bu anahtar, bireysel anahtarı bulunmayan tüm workspace\'lerin AI özelliklerini besleyecektir.'}
                    </div>
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-premium red"
                >
                    {saving ? <Loader size={18} className="spinning" /> : <Save size={18} />}
                    {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                </button>
            </div>

            {/* Facebook/Instagram Health Check Card */}
            <div className="settings-card">
                <div className="settings-card-header">
                    <div className="header-icon-box red">
                        <Activity size={26} color="white" strokeWidth={2.5} />
                    </div>
                    <div className="header-text" style={{ flex: 1 }}>
                        <h2>Facebook/Instagram Sayfa Kontrolü</h2>
                        <p>Platforma bağlı tüm sayfaların erişim durumunu ve token sağlığını kontrol edin</p>
                    </div>
                    <button
                        onClick={handleCheckFacebookHealth}
                        disabled={checkingHealth}
                        className="btn-premium red"
                    >
                        {checkingHealth ? <Loader size={18} className="spinning" /> : <Activity size={18} />}
                        {checkingHealth ? 'Kontrol ediliyor...' : 'Şimdi Kontrol Et'}
                    </button>
                </div>

                {healthResults && (
                    <div className="health-stat-container">
                        <div className="health-stats-grid">
                            <div className="health-stat-card total">
                                <div className="value">{healthResults.total}</div>
                                <div className="label">Toplam Sayfa</div>
                            </div>
                            <div className="health-stat-card healthy">
                                <div className="value">{healthResults.healthy}</div>
                                <div className="label">Sağlıklı</div>
                            </div>
                            <div className="health-stat-card unhealthy">
                                <div className="value">{healthResults.unhealthy}</div>
                                <div className="label">Sorunlu</div>
                            </div>
                        </div>

                        {healthResults.unhealthy > 0 && (
                            <div className="unhealthy-table-container">
                                <div className="unhealthy-title">
                                    <AlertCircle size={18} />
                                    Sorunlu Sayfalar ({healthResults.unhealthy})
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="unhealthy-table">
                                        <thead>
                                            <tr>
                                                <th>Sayfa Adı</th>
                                                <th>Mecra</th>
                                                <th>Workspace</th>
                                                <th>Kontrol Detayı / Hata Mesajı</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {healthResults.unhealthyPages.map((page, idx) => (
                                                <tr key={idx}>
                                                    <td style={{ fontWeight: 600 }}>{page.pageName}</td>
                                                    <td>
                                                        <span className={`channel-tag ${page.channelType.toLowerCase()}`}>
                                                            {page.channelType}
                                                        </span>
                                                    </td>
                                                    <td style={{ color: '#64748b' }}>{page.workspaceName}</td>
                                                    <td style={{ color: '#ef4444' }}>
                                                        <span style={{ opacity: 0.7, marginRight: '6px' }}>Kod {page.errorCode}:</span>
                                                        {page.errorMessage}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div style={{ padding: '16px', background: '#fffbeb', color: '#92400e', fontSize: '13px', display: 'flex', gap: '8px', borderTop: '1px solid #fde68a' }}>
                                    <HelpCircle size={18} style={{ flexShrink: 0 }} />
                                    <span><strong>Çözüm Önerisi:</strong> Listelenen sayfaların bağlı olduğu workspace'lere giderek Facebook/Instagram bağlantılarını yenilemeniz (re-auth) gerekmektedir.</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Info Card - Hierarchy */}
            <div className="info-section">
                <h3><ShieldCheck size={20} color="#ef4444" /> AI API Key Hiyerarşisi</h3>
                <ul className="info-list">
                    <li>
                        <div className="info-bullet"></div>
                        <div>
                            <strong>Workspace Key:</strong>
                            Eğer bir workspace kendi ayarlarından özel bir API key tanımlarsa, öncelikli olarak o anahtar kullanılır. (SaaS modeli için uygundur)
                        </div>
                    </li>
                    <li>
                        <div className="info-bullet"></div>
                        <div>
                            <strong>Global Key:</strong>
                            Workspace'e özel bir anahtar tanımlanmamışsa, yukarıda belirttiğiniz bu anahtar varsayılan olarak tüm sistemde kullanılır.
                        </div>
                    </li>
                    <li>
                        <div className="info-bullet" style={{ background: '#94a3b8' }}></div>
                        <div>
                            <strong>Hata Durumu:</strong>
                            Eğer her iki seviyede de anahtar tanımlı değilse, AI özellikleri (Robotik yanıt, özetleme vb.) devre dışı kalacaktır.
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    );
};

export default AdminSettings;

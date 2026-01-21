import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { Key, Save, Loader, CheckCircle, AlertCircle, Activity } from 'lucide-react';
import './AdminDashboard.css';

const AdminSettings = () => {
    const [globalSettings, setGlobalSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [globalAiApiKey, setGlobalAiApiKey] = useState('');
    const [message, setMessage] = useState({ type: '', text: '' });

    // Facebook Health Check
    const [checkingHealth, setCheckingHealth] = useState(false);
    const [healthResults, setHealthResults] = useState(null);

    useEffect(() => {
        loadGlobalSettings();
    }, []);

    const loadGlobalSettings = async () => {
        try {
            setLoading(true);
            const response = await adminAPI.getGlobalSettings();
            setGlobalSettings(response.data.settings);
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
                <div className="loading">Yükleniyor...</div>
            </div>
        );
    }

    return (
        <div className="admin-dashboard">
            {/* Message Alert */}
            {message.text && (
                <div className={`alert ${message.type}`} style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: message.type === 'success' ? '#d4edda' : '#f8d7da',
                    color: message.type === 'success' ? '#155724' : '#721c24',
                    border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`
                }}>
                    {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                    {message.text}
                </div>
            )}

            {/* Global AI API Key Card */}
            <div className="settings-card" style={{
                background: 'white',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                marginBottom: '24px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <Key size={24} color="white" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#ef4444' }}>Global AI API Key</h2>
                        <p style={{ margin: '4px 0 0', color: '#666', fontSize: '14px' }}>
                            Tüm workspace'ler için varsayılan AI API anahtarı
                        </p>
                    </div>
                </div>

                {/* Current Status */}
                <div style={{
                    background: globalSettings?.hasGlobalAiApiKey ? '#fee2e2' : '#fff3e0',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    border: globalSettings?.globalAiApiKey ? '1px solid #fecaca' : '1px solid #ffe0b2'
                }}>
                    {globalSettings?.globalAiApiKey ? (
                        <>
                            <CheckCircle size={20} color="#ef4444" />
                            <div>
                                <strong style={{ color: '#dc2626' }}>Aktif</strong>
                                <span style={{ marginLeft: '8px', color: '#666' }}>
                                    Key: ••••••••{globalSettings.globalAiApiKey.slice(-4)}
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <AlertCircle size={20} color="#f57c00" />
                            <div>
                                <strong style={{ color: '#e65100' }}>Ayarlanmamış</strong>
                                <span style={{ marginLeft: '8px', color: '#666' }}>
                                    Henüz global API key girilmemiş
                                </span>
                            </div>
                        </>
                    )}
                </div>

                {/* Input Form */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                        Google Gemini API Key
                    </label>
                    <input
                        type="password"
                        value={globalAiApiKey}
                        onChange={(e) => setGlobalAiApiKey(e.target.value)}
                        placeholder="AIza..."
                        style={{
                            width: '100%',
                            padding: '12px 16px',
                            borderRadius: '8px',
                            border: '1px solid #ddd',
                            fontSize: '14px'
                        }}
                    />
                    <p style={{ color: '#888', fontSize: '12px', marginTop: '8px' }}>
                        {globalSettings?.hasGlobalAiApiKey
                            ? 'Yeni key girerek mevcut key\'i güncelleyebilirsiniz. Boş bırakırsanız key kaldırılır.'
                            : 'API key girin. Bu key, kendi API key\'i olmayan tüm workspace\'ler tarafından kullanılacak.'}
                    </p>
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        color: 'white',
                        border: 'none',
                        padding: '12px 24px',
                        borderRadius: '8px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        opacity: saving ? 0.7 : 1
                    }}
                >
                    {saving ? <Loader size={18} className="spinning" /> : <Save size={18} />}
                    {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
            </div>

            {/* Facebook/Instagram Health Check Card */}
            <div className="settings-card" style={{
                background: 'white',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                marginBottom: '24px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <Activity size={24} color="white" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#3b82f6' }}>Facebook/Instagram Sayfa Kontrolü</h2>
                        <p style={{ margin: '4px 0 0', color: '#666', fontSize: '14px' }}>
                            Tüm sayfaların token durumunu kontrol edin
                        </p>
                    </div>
                    <button
                        onClick={handleCheckFacebookHealth}
                        disabled={checkingHealth}
                        style={{
                            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            color: 'white',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '8px',
                            cursor: checkingHealth ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            opacity: checkingHealth ? 0.7 : 1
                        }}
                    >
                        {checkingHealth ? <Loader size={18} className="spinning" /> : <Activity size={18} />}
                        {checkingHealth ? 'Kontrol ediliyor...' : 'Kontrol Et'}
                    </button>
                </div>

                {healthResults && (
                    <>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '12px',
                            marginBottom: '20px'
                        }}>
                            <div style={{
                                background: '#f0f9ff',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid #bfdbfe'
                            }}>
                                <div style={{ fontSize: '24px', fontWeight: 600, color: '#3b82f6' }}>{healthResults.total}</div>
                                <div style={{ fontSize: '12px', color: '#666' }}>Toplam Sayfa</div>
                            </div>
                            <div style={{
                                background: '#f0fdf4',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid #bbf7d0'
                            }}>
                                <div style={{ fontSize: '24px', fontWeight: 600, color: '#22c55e' }}>{healthResults.healthy}</div>
                                <div style={{ fontSize: '12px', color: '#666' }}>Sağlıklı</div>
                            </div>
                            <div style={{
                                background: '#fef2f2',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid #fecaca'
                            }}>
                                <div style={{ fontSize: '24px', fontWeight: 600, color: '#ef4444' }}>{healthResults.unhealthy}</div>
                                <div style={{ fontSize: '12px', color: '#666' }}>Sorunlu</div>
                            </div>
                        </div>

                        {healthResults.unhealthy > 0 && (
                            <div style={{ marginTop: '20px' }}>
                                <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600, color: '#ef4444' }}>
                                    ⚠️ Sorunlu Sayfalar ({healthResults.unhealthy})
                                </h3>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                                                <th style={{ padding: '8px', textAlign: 'left' }}>Sayfa Adı</th>
                                                <th style={{ padding: '8px', textAlign: 'left' }}>Tip</th>
                                                <th style={{ padding: '8px', textAlign: 'left' }}>Workspace</th>
                                                <th style={{ padding: '8px', textAlign: 'left' }}>Hata</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {healthResults.unhealthyPages.map((page, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                    <td style={{ padding: '8px' }}>{page.pageName}</td>
                                                    <td style={{ padding: '8px' }}>
                                                        <span style={{
                                                            background: page.channelType === 'FACEBOOK' ? '#1877f2' : '#e4405f',
                                                            color: 'white',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '11px'
                                                        }}>
                                                            {page.channelType}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '8px', fontSize: '12px', color: '#666' }}>{page.workspaceName}</td>
                                                    <td style={{ padding: '8px', fontSize: '12px', color: '#ef4444' }}>
                                                        Code {page.errorCode}: {page.errorMessage}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p style={{ marginTop: '12px', fontSize: '12px', color: '#666', background: '#fff3cd', padding: '8px', borderRadius: '4px', border: '1px solid #ffc107' }}>
                                    💡 <strong>Çözüm:</strong> Sorunlu sayfaların workspace'lerine gidip Facebook/Instagram sayfalarını yeniden bağlayın.
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Info Card */}
            <div style={{
                background: '#f8f9fa',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid #e9ecef'
            }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>
                    🔑 API Key Hiyerarşisi
                </h3>
                <ul style={{ margin: 0, paddingLeft: '20px', color: '#666', lineHeight: 1.8 }}>
                    <li><strong>Workspace Key:</strong> Workspace kendi API key'ini girerse, o key kullanılır (öncelikli)</li>
                    <li><strong>Global Key:</strong> Workspace key'i yoksa, bu global key kullanılır</li>
                    <li><strong>Hata:</strong> Her iki key de yoksa, AI fonksiyonları çalışmaz</li>
                </ul>
            </div>
        </div>
    );
};

export default AdminSettings;

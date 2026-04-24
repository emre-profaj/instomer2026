import { useState, useEffect } from 'react';
import { Activity, Save, Wifi, WifiOff, Eye, EyeOff, AlertTriangle, X, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { healthAPI } from '../../services/api';

export default function HealthModuleSettings() {
    const { currentWorkspace } = useAuth();
    const wid = currentWorkspace?.id;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [err, setErr] = useState('');
    const [success, setSuccess] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const [form, setForm] = useState({
        apiUrl: '',
        username: '',
        password: '',
        isActive: true,
    });

    useEffect(() => {
        if (!wid) return;
        loadSettings();
    }, [wid]);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const res = await healthAPI.getSettings(wid);
            if (res.data.settings) {
                const s = res.data.settings;
                setForm({ apiUrl: s.apiUrl || '', username: s.username || '', password: s.password || '', isActive: s.isActive });
            }
        } catch {} finally { setLoading(false); }
    };

    const save = async () => {
        if (!form.apiUrl || !form.username || !form.password) {
            setErr('Tüm alanlar zorunludur.');
            return;
        }
        setSaving(true);
        setErr('');
        try {
            await healthAPI.updateSettings(wid, form);
            setSuccess('Ayarlar kaydedildi.');
            setTimeout(() => setSuccess(''), 3000);
        } catch (e) {
            setErr(e.response?.data?.message || 'Kaydedilemedi.');
        } finally { setSaving(false); }
    };

    const testConnection = async () => {
        if (!form.apiUrl || !form.username) {
            setErr('URL ve kullanıcı adı gerekli.');
            return;
        }
        setTesting(true);
        setErr('');
        setSuccess('');
        try {
            const pwd = form.password === '••••••••' ? '' : form.password;
            const res = await healthAPI.testConnection(wid, {
                apiUrl: form.apiUrl,
                username: form.username,
                password: pwd || form.password,
            });
            if (res.data.success) {
                setSuccess('✅ ' + res.data.message);
            } else {
                setErr(res.data.message || 'Bağlantı başarısız.');
            }
        } catch (e) {
            setErr(e.response?.data?.message || 'Bağlantı test edilemedi.');
        } finally { setTesting(false); }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, color: '#7f8c8d' }}>
                <Activity size={28} className="animate-spin" /><span>Yükleniyor...</span>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: 'linear-gradient(135deg, #1abc9c, #16a085)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Activity size={22} color="white" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2c3e50', margin: 0 }}>Sağlık Modülü</h1>
                        <p style={{ fontSize: '0.8125rem', color: '#7f8c8d', margin: 0 }}>Probel HBYS entegrasyon ayarları</p>
                    </div>
                </div>
                <button
                    onClick={save}
                    disabled={saving}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px',
                        background: '#1a5276', color: 'white', border: 'none', borderRadius: 8,
                        fontWeight: 600, fontSize: '0.875rem', cursor: saving ? 'wait' : 'pointer',
                        opacity: saving ? 0.7 : 1,
                    }}
                >
                    <Save size={14} /> {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
            </div>

            {/* Alerts */}
            {err && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#fadbd8', borderRadius: 8, marginBottom: 16, color: '#922b21', fontSize: '0.875rem', justifyContent: 'space-between' }}>
                    <span><AlertTriangle size={15} style={{ marginRight: 6 }} />{err}</span>
                    <button onClick={() => setErr('')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={14} /></button>
                </div>
            )}
            {success && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#d5f5e3', borderRadius: 8, marginBottom: 16, color: '#1e8449', fontSize: '0.875rem' }}>
                    <CheckCircle size={15} />{success}
                </div>
            )}

            {/* Form Card */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e8ecf0', padding: 24 }}>
                {/* API URL */}
                <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#2c3e50', marginBottom: 6 }}>
                        API URL <span style={{ color: '#e74c3c' }}>*</span>
                    </label>
                    <input
                        type="text"
                        placeholder="http://195.87.67.254"
                        value={form.apiUrl}
                        onChange={e => setForm(f => ({ ...f, apiUrl: e.target.value }))}
                        style={{
                            width: '100%', padding: '10px 14px', border: '1.5px solid #dce1e8',
                            borderRadius: 8, fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={e => e.target.style.borderColor = '#1a5276'}
                        onBlur={e => e.target.style.borderColor = '#dce1e8'}
                    />
                    <p style={{ fontSize: '0.75rem', color: '#95a5a6', marginTop: 4 }}>
                        Probel sunucu adresi. <code>/DynamicDataApi</code> kısmı otomatik eklenir.
                    </p>
                </div>

                {/* Username & Password */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#2c3e50', marginBottom: 6 }}>
                            Kullanıcı Adı <span style={{ color: '#e74c3c' }}>*</span>
                        </label>
                        <input
                            type="text"
                            placeholder="egeumut"
                            value={form.username}
                            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                            style={{
                                width: '100%', padding: '10px 14px', border: '1.5px solid #dce1e8',
                                borderRadius: 8, fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
                            }}
                            onFocus={e => e.target.style.borderColor = '#1a5276'}
                            onBlur={e => e.target.style.borderColor = '#dce1e8'}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#2c3e50', marginBottom: 6 }}>
                            Şifre <span style={{ color: '#e74c3c' }}>*</span>
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••"
                                value={form.password}
                                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                                style={{
                                    width: '100%', padding: '10px 40px 10px 14px', border: '1.5px solid #dce1e8',
                                    borderRadius: 8, fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
                                }}
                                onFocus={e => e.target.style.borderColor = '#1a5276'}
                                onBlur={e => e.target.style.borderColor = '#dce1e8'}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(p => !p)}
                                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#95a5a6' }}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Active Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid #f0f2f5', marginBottom: 20 }}>
                    <div>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#2c3e50' }}>Modül Durumu</span>
                        <p style={{ fontSize: '0.75rem', color: '#95a5a6', margin: '2px 0 0' }}>Pasif olduğunda API çağrıları yapılmaz.</p>
                    </div>
                    <button
                        onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                        style={{
                            width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                            background: form.isActive ? '#1abc9c' : '#bdc3c7',
                            position: 'relative', transition: 'background 0.2s',
                        }}
                    >
                        <div style={{
                            width: 20, height: 20, borderRadius: '50%', background: 'white',
                            position: 'absolute', top: 3,
                            left: form.isActive ? 25 : 3,
                            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }} />
                    </button>
                </div>

                {/* Test Connection */}
                <button
                    onClick={testConnection}
                    disabled={testing}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                        background: 'white', border: '1.5px solid #1abc9c', borderRadius: 8,
                        color: '#1abc9c', fontWeight: 600, fontSize: '0.875rem', cursor: testing ? 'wait' : 'pointer',
                        opacity: testing ? 0.7 : 1, width: '100%', justifyContent: 'center',
                    }}
                >
                    {testing ? <WifiOff size={16} /> : <Wifi size={16} />}
                    {testing ? 'Test ediliyor...' : 'Bağlantıyı Test Et'}
                </button>
            </div>

            {/* Info */}
            <div style={{ marginTop: 20, padding: '16px 20px', background: '#eaf2f8', borderRadius: 10, fontSize: '0.8125rem', color: '#2c3e50', lineHeight: 1.7 }}>
                <strong>ℹ️ Nasıl Çalışır?</strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                    <li>API URL: Probel DynamicDataApi sunucu adresi</li>
                    <li>Kullanıcı adı ve şifre: Probel tarafından verilen API erişim bilgileri</li>
                    <li>"Bağlantıyı Test Et" ile token alınarak bağlantı doğrulanır</li>
                    <li>Kaydet ile bilgiler güvenli şekilde saklanır</li>
                </ul>
            </div>
        </div>
    );
}

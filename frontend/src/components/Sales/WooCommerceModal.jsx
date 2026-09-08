import React, { useState, useEffect } from 'react';
import { 
    ShoppingCart, CheckCircle2, AlertCircle, RefreshCw, 
    DownloadCloud, X, HelpCircle, Check, Copy, Key, Globe
} from 'lucide-react';
import { woocommerceAPI } from '../../services/api';

export default function WooCommerceModal({ isOpen, onClose, workspaceId, onSyncComplete }) {
    const [activeTab, setActiveTab] = useState('settings'); // 'settings' | 'sync' | 'guide'
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const [pulling, setPulling] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        storeUrl: '',
        consumerKey: '',
        consumerSecret: '',
        isActive: true
    });

    const [savedConfig, setSavedConfig] = useState(null);
    const [testResult, setTestResult] = useState(null); // { success: bool, message: string, error?: string }
    const [syncResult, setSyncResult] = useState(null);
    const [copiedStep, setCopiedStep] = useState(null);

    useEffect(() => {
        if (isOpen && workspaceId) {
            loadConfig();
        } else {
            setTestResult(null);
            setSyncResult(null);
        }
    }, [isOpen, workspaceId]);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const res = await woocommerceAPI.getConfig(workspaceId);
            if (res.data?.success) {
                const cfg = res.data.data;
                setSavedConfig(cfg);
                setFormData({
                    storeUrl: cfg.storeUrl || '',
                    consumerKey: cfg.consumerKeyMasked || '',
                    consumerSecret: '',
                    isActive: cfg.isActive !== undefined ? Boolean(cfg.isActive) : true
                });
            }
        } catch (err) {
            console.error('Failed to load WooCommerce config:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        if (!formData.storeUrl.trim()) {
            alert('Lütfen mağaza web sitesi adresini girin.');
            return;
        }

        setLoading(true);
        try {
            const res = await woocommerceAPI.saveConfig(workspaceId, formData);
            if (res.data?.success) {
                setSavedConfig(res.data.data);
                setTestResult({ success: true, message: 'Ayarlar başarıyla kaydedildi.' });
            }
        } catch (err) {
            setTestResult({
                success: false,
                error: err.response?.data?.error || 'Ayarlar kaydedilirken hata oluştu.'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            // Eğer formda yeni bilgi varsa onları da test için gönder
            const credentials = {
                storeUrl: formData.storeUrl,
                consumerKey: formData.consumerKey,
                consumerSecret: formData.consumerSecret
            };
            const res = await woocommerceAPI.testConnection(workspaceId, credentials);
            if (res.data?.success) {
                setTestResult({
                    success: true,
                    message: res.data.message || `Bağlantı başarılı! (${res.data.storeName || ''})`
                });
            }
        } catch (err) {
            setTestResult({
                success: false,
                error: err.response?.data?.error || 'Bağlantı kurulamadı. Lütfen bilgileri kontrol edin.'
            });
        } finally {
            setTesting(false);
        }
    };

    const handlePullAll = async () => {
        if (!window.confirm('WooCommerce mağazanızdaki ürünler Instomer kataloğuna çekilecek (Kategoriler çekilmez; ürünlerinizi Instomer sektör yapınıza göre düzenleyebilirsiniz). Onaylıyor musunuz?')) {
            return;
        }
        setPulling(true);
        setSyncResult(null);
        try {
            const res = await woocommerceAPI.pullAll(workspaceId);
            if (res.data?.success) {
                setSyncResult({
                    type: 'pull',
                    success: true,
                    message: res.data.message || 'WooCommerce ürünleri Instomer kataloğuna aktarıldı.',
                    data: res.data.data
                });
                loadConfig();
                if (onSyncComplete) onSyncComplete();
            }
        } catch (err) {
            setSyncResult({
                type: 'pull',
                success: false,
                error: err.response?.data?.error || 'Ürünler çekilirken hata oluştu.'
            });
        } finally {
            setPulling(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.5)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(3px)', padding: '20px'
        }}
            onClick={onClose}
        >
            <div style={{
                background: '#fff', borderRadius: '16px', maxWidth: '640px', width: '100%',
                maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden'
            }}
                onClick={e => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div style={{
                    padding: '20px 24px', borderBottom: '1px solid #e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#faf5ff'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '42px', height: '42px', borderRadius: '10px',
                            background: '#7c3aed', color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <ShoppingCart size={22} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                                    WooCommerce Entegrasyonu
                                </h2>
                                {savedConfig?.isConfigured && (
                                    <span style={{
                                        fontSize: '0.68rem', fontWeight: 600,
                                        padding: '2px 8px', borderRadius: '12px',
                                        background: savedConfig.isActive ? '#dcfce7' : '#f1f5f9',
                                        color: savedConfig.isActive ? '#166534' : '#64748b'
                                    }}>
                                        {savedConfig.isActive ? '● Aktif' : 'Devre Dışı'}
                                    </span>
                                )}
                            </div>
                            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                                REST API üzerinden ürün ve fiyat senkronizasyonu
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            border: 'none', background: '#fff', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#64748b', boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div style={{
                    display: 'flex', borderBottom: '1px solid #e2e8f0',
                    background: '#fff', padding: '0 24px'
                }}>
                    <button
                        onClick={() => setActiveTab('settings')}
                        style={{
                            padding: '12px 16px', background: 'none', border: 'none',
                            fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                            color: activeTab === 'settings' ? '#7c3aed' : '#64748b',
                            borderBottom: activeTab === 'settings' ? '2px solid #7c3aed' : '2px solid transparent'
                        }}
                    >
                        Bağlantı & Kurulum
                    </button>
                    <button
                        onClick={() => setActiveTab('sync')}
                        style={{
                            padding: '12px 16px', background: 'none', border: 'none',
                            fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                            color: activeTab === 'sync' ? '#7c3aed' : '#64748b',
                            borderBottom: activeTab === 'sync' ? '2px solid #7c3aed' : '2px solid transparent'
                        }}
                    >
                        Senkronizasyon İşlemleri
                    </button>
                    <button
                        onClick={() => setActiveTab('guide')}
                        style={{
                            padding: '12px 16px', background: 'none', border: 'none',
                            fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                            color: activeTab === 'guide' ? '#7c3aed' : '#64748b',
                            borderBottom: activeTab === 'guide' ? '2px solid #7c3aed' : '2px solid transparent',
                            display: 'flex', alignItems: 'center', gap: '4px'
                        }}
                    >
                        <HelpCircle size={14} /> Kurulum Rehberi
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
                    {/* TAB 1: Settings */}
                    {activeTab === 'settings' && (
                        <form onSubmit={handleSave}>
                            {/* Test Sonuç Bildirimi */}
                            {testResult && (
                                <div style={{
                                    padding: '10px 14px', borderRadius: '8px', marginBottom: '16px',
                                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                                    background: testResult.success ? '#f0fdf4' : '#fef2f2',
                                    border: `1px solid ${testResult.success ? '#bbf7d0' : '#fecaca'}`,
                                    color: testResult.success ? '#15803d' : '#b91c1c',
                                    fontSize: '0.8rem'
                                }}>
                                    {testResult.success ? <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '2px' }} /> : <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />}
                                    <div>{testResult.success ? testResult.message : testResult.error}</div>
                                </div>
                            )}

                            {/* Mağaza URL */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                    Mağaza Web Sitesi Adresi (URL) <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <Globe size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                    <input
                                        type="text"
                                        value={formData.storeUrl}
                                        onChange={e => setFormData(prev => ({ ...prev, storeUrl: e.target.value }))}
                                        placeholder="https://magazaniz.com"
                                        style={{
                                            width: '100%', padding: '9px 12px 9px 34px', borderRadius: '8px',
                                            border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                            boxSizing: 'border-box'
                                        }}
                                        required
                                    />
                                </div>
                                <small style={{ color: '#94a3b8', fontSize: '0.7rem' }}>Sitenizin HTTPS (SSL) protokolüyle çalıştığından emin olun.</small>
                            </div>

                            {/* Consumer Key */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                    Consumer Key (Müşteri Anahtarı) <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <Key size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                    <input
                                        type="text"
                                        value={formData.consumerKey}
                                        onChange={e => setFormData(prev => ({ ...prev, consumerKey: e.target.value }))}
                                        placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                        style={{
                                            width: '100%', padding: '9px 12px 9px 34px', borderRadius: '8px',
                                            border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                            fontFamily: 'monospace', boxSizing: 'border-box'
                                        }}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Consumer Secret */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                    Consumer Secret (Müşteri Parolası) {savedConfig?.isConfigured && <span style={{ color: '#94a3b8', fontWeight: 400 }}>(Değiştirmek istemiyorsanız boş bırakın)</span>}
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <Key size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                    <input
                                        type="password"
                                        value={formData.consumerSecret}
                                        onChange={e => setFormData(prev => ({ ...prev, consumerSecret: e.target.value }))}
                                        placeholder={savedConfig?.isConfigured ? '••••••••••••••••••••••••••••••••••••••••' : 'cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}
                                        style={{
                                            width: '100%', padding: '9px 12px 9px 34px', borderRadius: '8px',
                                            border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                            fontFamily: 'monospace', boxSizing: 'border-box'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Toggle: Entegrasyon Aktif */}
                            <div style={{
                                padding: '12px 14px', borderRadius: '8px', background: '#f8fafc',
                                border: '1px solid #e2e8f0', marginBottom: '20px'
                            }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
                                    <input
                                        type="checkbox"
                                        checked={formData.isActive}
                                        onChange={e => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                                        style={{ width: '16px', height: '16px', accentColor: '#7c3aed', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>
                                        Entegrasyonu Etkinleştir
                                    </span>
                                </label>
                            </div>

                            {/* Footer Buttons */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                                <button
                                    type="button"
                                    onClick={handleTest}
                                    disabled={testing || !formData.storeUrl}
                                    style={{
                                        padding: '9px 16px', borderRadius: '8px',
                                        border: '1px solid #cbd5e1', background: '#fff',
                                        fontSize: '0.82rem', fontWeight: 600, color: '#334155',
                                        cursor: (testing || !formData.storeUrl) ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex', alignItems: 'center', gap: '6px'
                                    }}
                                >
                                    {testing && <RefreshCw size={14} className="animate-spin" />}
                                    {testing ? 'Test Ediliyor...' : 'Bağlantıyı Test Et'}
                                </button>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    style={{
                                        padding: '9px 20px', borderRadius: '8px',
                                        border: 'none', background: '#7c3aed', color: '#fff',
                                        fontSize: '0.82rem', fontWeight: 600,
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        boxShadow: '0 2px 8px rgba(124, 58, 237, 0.3)'
                                    }}
                                >
                                    {loading ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* TAB 2: Sync Actions */}
                    {activeTab === 'sync' && (
                        <div>
                            {/* Son Senkronizasyon Durumu Kartı */}
                            <div style={{
                                padding: '14px 16px', borderRadius: '10px',
                                background: '#f8fafc', border: '1px solid #e2e8f0',
                                marginBottom: '20px'
                            }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                    Son Senkronizasyon
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ fontSize: '0.82rem', color: '#1e293b', fontWeight: 500 }}>
                                        {savedConfig?.lastSyncAt ? (
                                            <>
                                                {new Date(savedConfig.lastSyncAt).toLocaleString('tr-TR')}
                                                {savedConfig.lastSyncMessage && (
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                                        {savedConfig.lastSyncMessage}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <span style={{ color: '#94a3b8' }}>Henüz senkronizasyon yapılmadı</span>
                                        )}
                                    </div>
                                    {savedConfig?.lastSyncStatus && (
                                        <span style={{
                                            fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '12px',
                                            background: savedConfig.lastSyncStatus === 'success' ? '#dcfce7' : '#fef2f2',
                                            color: savedConfig.lastSyncStatus === 'success' ? '#166534' : '#dc2626'
                                        }}>
                                            {savedConfig.lastSyncStatus === 'success' ? 'Başarılı' : 'Uyarı/Hata'}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Sync Sonuç Bildirimi */}
                            {syncResult && (
                                <div style={{
                                    padding: '10px 14px', borderRadius: '8px', marginBottom: '16px',
                                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                                    background: syncResult.success ? '#f0fdf4' : '#fef2f2',
                                    border: `1px solid ${syncResult.success ? '#bbf7d0' : '#fecaca'}`,
                                    color: syncResult.success ? '#15803d' : '#b91c1c',
                                    fontSize: '0.8rem'
                                }}>
                                    {syncResult.success ? <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '2px' }} /> : <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />}
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{syncResult.message}</div>
                                        {syncResult.data?.errors?.length > 0 && (
                                            <ul style={{ margin: '6px 0 0', paddingLeft: '16px', fontSize: '0.75rem' }}>
                                                {syncResult.data.errors.slice(0, 3).map((err, i) => (
                                                    <li key={i}>{err.productName}: {err.error}</li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Eylem Kartı: WooCommerce -> Instomer */}
                            <div style={{
                                padding: '16px', borderRadius: '12px',
                                border: '1px solid #e2e8f0', background: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                    <div style={{
                                        width: '38px', height: '38px', borderRadius: '8px',
                                        background: '#e0f2fe', color: '#0284c7',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                    }}>
                                        <DownloadCloud size={20} />
                                    </div>
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>
                                            WooCommerce &rarr; Instomer
                                        </h4>
                                        <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                                            WooCommerce'deki ürünleri Instomer kataloğuna çeker (Kategoriler çekilmez, Instomer yapınıza göre serbestçe düzenleyebilirsiniz).
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handlePullAll}
                                    disabled={pulling || !savedConfig?.isConfigured}
                                    style={{
                                        padding: '8px 16px', borderRadius: '8px',
                                        border: '1px solid #cbd5e1', background: '#fff', color: '#334155',
                                        fontSize: '0.8rem', fontWeight: 600,
                                        cursor: (pulling || !savedConfig?.isConfigured) ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap'
                                    }}
                                >
                                    {pulling && <RefreshCw size={14} className="animate-spin" />}
                                    {pulling ? 'Çekiliyor...' : 'Ürünleri Çek'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: Guide */}
                    {activeTab === 'guide' && (
                        <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.6 }}>
                            <div style={{
                                padding: '12px 14px', borderRadius: '8px',
                                background: '#eff6ff', border: '1px solid #bfdbfe',
                                color: '#1e40af', marginBottom: '16px'
                            }}>
                                <strong>Adım Adım WooCommerce API Anahtarı Nasıl Alınır?</strong>
                            </div>

                            <ol style={{ paddingLeft: '20px', margin: 0 }}>
                                <li style={{ marginBottom: '10px' }}>
                                    WordPress yönetim panelinize (wp-admin) giriş yapın.
                                </li>
                                <li style={{ marginBottom: '10px' }}>
                                    Sol menüden <strong>WooCommerce &gt; Ayarlar</strong> sayfasına tıklayın.
                                </li>
                                <li style={{ marginBottom: '10px' }}>
                                    Üstteki sekmelerden <strong>Gelişmiş &gt; REST API</strong> bölümünü seçin.
                                </li>
                                <li style={{ marginBottom: '10px' }}>
                                    <strong>Anahtar Ekle (Add key)</strong> butonuna tıklayın.
                                </li>
                                <li style={{ marginBottom: '10px' }}>
                                    Aşağıdaki bilgileri doldurun:
                                    <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
                                        <li><strong>Açıklama:</strong> Instomer Entegrasyonu</li>
                                        <li><strong>Kullanıcı:</strong> Yönetici hesabınız</li>
                                        <li><strong>İzinler (Permissions):</strong> <span style={{ color: '#7c3aed', fontWeight: 600 }}>Sadece Okuma (Read)</span> veya Okuma/Yazma</li>
                                    </ul>
                                </li>
                                <li style={{ marginBottom: '10px' }}>
                                    <strong>API Anahtarı Oluştur (Generate API key)</strong> düğmesine basın.
                                </li>
                                <li>
                                    Ekranda üretilen <strong>Consumer Key</strong> (`ck_...`) ve <strong>Consumer Secret</strong> (`cs_...`) kodlarını kopyalayıp buradaki <em>Bağlantı & Kurulum</em> sekmesine yapıştırın.
                                </li>
                            </ol>

                            <div style={{ marginTop: '16px', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#64748b' }}>
                                🛡️ <strong>Güvenli Entegrasyon:</strong> Instomer yalnızca WooCommerce mağazanızdaki ürünleri ve fiyatları okuyarak içe aktarır; WooCommerce mağazanızdaki hiçbir ürünü veya ayarı kesinlikle değiştirmez veya silmez.
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Database, Shield, Unplug } from 'lucide-react';
import { workspaceAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const DisaoSettingsModal = ({ isOpen, onClose, onSaved }) => {
    const { currentWorkspace } = useAuth();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [wasEnabled, setWasEnabled] = useState(false);
    const [settings, setSettings] = useState({
        username: '',
        password: '',
        nationality: '1',
        recordType: '2',
        projectId: '131',
        userId: '471'
    });

    useEffect(() => {
        if (isOpen && currentWorkspace?.id) {
            fetchSettings();
        }
    }, [isOpen, currentWorkspace]);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await workspaceAPI.getById(currentWorkspace.id);
            if (res.data) {
                const ws = res.data.workspace || res.data;
                setEnabled(ws.disaoCrmEnabled || false);
                setWasEnabled(ws.disaoCrmEnabled || false);
                if (ws.disaoCrmSettings) {
                    let parsed = ws.disaoCrmSettings;
                    if (typeof parsed === 'string') {
                        parsed = JSON.parse(parsed);
                    }
                    if (typeof parsed === 'string') {
                        parsed = JSON.parse(parsed);
                    }
                    setSettings({
                        ...settings,
                        ...parsed
                    });
                }
            }
        } catch (err) {
            console.error('Error fetching Disao CRM settings:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = async () => {
        if (!window.confirm('Disao CRM bağlantısını kesmek istediğinize emin misiniz? Tüm ayarlar silinecektir.')) return;
        setSaving(true);
        try {
            await workspaceAPI.updateDisaoCrmSettings(currentWorkspace.id, {
                enabled: false,
                settings: null
            });
            if (onSaved) onSaved();
            onClose();
            window.location.reload();
        } catch (err) {
            console.error('Error disconnecting:', err);
            alert('Bağlantı kesilirken bir hata oluştu.');
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await workspaceAPI.updateDisaoCrmSettings(currentWorkspace.id, {
                enabled,
                settings
            });
            if (onSaved) onSaved();
            onClose();
            // Force reload to update the currentWorkspace context and show the green dot
            window.location.reload();
        } catch (err) {
            console.error('Error saving Disao CRM settings:', err);
            const errorMessage = err.response?.data?.details || err.response?.data?.error || err.message || 'Bilinmeyen hata';
            alert(`Ayarlar kaydedilirken bir hata oluştu: ${errorMessage}`);
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            const res = await workspaceAPI.testDisaoCrmConnection(currentWorkspace.id, { settings });
            if (res.data.success) {
                alert('✅ Bağlantı başarılı! Kullanıcı adı ve şifre doğru.');
            } else {
                alert('❌ Bağlantı hatası: ' + res.data.error);
            }
        } catch (err) {
            alert('❌ Bağlantı hatası oluştu.');
        } finally {
            setTesting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                    <h2><Database size={20} className="mr-2" style={{ display: 'inline' }}/> Disao CRM Bağlantısı</h2>
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </div>
                
                {loading ? (
                    <div className="modal-body">Yükleniyor...</div>
                ) : (
                    <form onSubmit={handleSave}>
                        <div className="modal-body">
                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={enabled}
                                        onChange={(e) => setEnabled(e.target.checked)}
                                        style={{ width: '16px', height: '16px', margin: 0, flexShrink: 0 }}
                                    />
                                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Disao CRM Entegrasyonunu Etkinleştir</span>
                                </label>
                                <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '4px' }}>
                                    Aktif olduğunda, aşaması "Sıcak Fırsat" yapılan müşteriler doğrudan Disao CRM sistemine aktarılır.
                                </p>
                            </div>

                            {enabled && (
                                <div>
                                    <div className="form-group">
                                        <label>Kullanıcı Adı (E-posta)</label>
                                        <input 
                                            type="text" 
                                            value={settings.username} 
                                            onChange={e => setSettings({...settings, username: e.target.value})} 
                                            className="form-control"
                                            required 
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Şifre</label>
                                        <input 
                                            type="password" 
                                            value={settings.password} 
                                            onChange={e => setSettings({...settings, password: e.target.value})} 
                                            className="form-control"
                                            required 
                                        />
                                    </div>
                                    
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div className="form-group">
                                            <label>Nationality (Uyruk ID)</label>
                                            <input 
                                                type="number" 
                                                value={settings.nationality} 
                                                onChange={e => setSettings({...settings, nationality: e.target.value})} 
                                                className="form-control"
                                                required 
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Record Type</label>
                                            <input 
                                                type="number" 
                                                value={settings.recordType} 
                                                onChange={e => setSettings({...settings, recordType: e.target.value})} 
                                                className="form-control"
                                                required 
                                            />
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div className="form-group">
                                            <label>Proje ID</label>
                                            <input 
                                                type="number" 
                                                value={settings.projectId} 
                                                onChange={e => setSettings({...settings, projectId: e.target.value})} 
                                                className="form-control"
                                                required 
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Temsilci User ID</label>
                                            <input 
                                                type="number" 
                                                value={settings.userId} 
                                                onChange={e => setSettings({...settings, userId: e.target.value})} 
                                                className="form-control"
                                                required 
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div>
                                {wasEnabled && (
                                    <button type="button" className="btn btn-outline-danger" onClick={handleDisconnect} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626', borderColor: '#dc2626' }}>
                                        <Unplug size={16} /> Bağlantıyı Kes
                                    </button>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {enabled && (
                                    <button type="button" className="btn btn-outline-primary" onClick={handleTest} disabled={testing || saving} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Shield size={16} /> {testing ? 'Sınanıyor...' : 'Bağlantıyı Sına'}
                                    </button>
                                )}
                                <button type="button" className="btn btn-secondary" onClick={onClose}>İptal</button>
                                <button type="submit" className="btn btn-primary" disabled={saving || testing} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {saving ? 'Kaydediliyor...' : <><CheckCircle size={16} /> Kaydet</>}
                                </button>
                            </div>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default DisaoSettingsModal;

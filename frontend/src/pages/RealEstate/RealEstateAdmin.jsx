import { useState, useEffect } from 'react';
import { Settings, Save, AlertTriangle, X, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { realEstateAPI } from '../../services/api';
import './RealEstate.css';

export default function RealEstateAdmin() {
    const { currentWorkspace } = useAuth();
    const wid = currentWorkspace?.id;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const [saved, setSaved] = useState(false);
    const [moduleForm, setModuleForm] = useState({ moduleType: 'BASIC', isActive: true, legalDisclaimer: '' });

    useEffect(() => {
        if (!wid) return;
        (async () => {
            try {
                const res = await realEstateAPI.getModule(wid);
                const m = res.data.module;
                setModuleForm({ moduleType: m.moduleType, isActive: m.isActive, legalDisclaimer: m.legalDisclaimer || '' });
            } catch { setErr('Modül yüklenemedi.'); } finally { setLoading(false); }
        })();
    }, [wid]);

    const save = async () => {
        setSaving(true);
        try {
            await realEstateAPI.updateModule(wid, moduleForm);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch { setErr('Kaydedilemedi.'); } finally { setSaving(false); }
    };

    if (loading) return <div className="re-loading"><Settings size={32} /><span>Yükleniyor...</span></div>;

    return (
        <div className="re-page">
            <div className="re-page-header">
                <div className="re-page-title">
                    <div className="re-page-title-icon"><Settings size={22} /></div>
                    <div><h1>Genel Ayarlar</h1><p>Gayrimenkul modülü yapılandırması</p></div>
                </div>
                <button className="re-btn re-btn-primary re-btn-sm" onClick={save} disabled={saving}>
                    <Save size={14} /> {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
            </div>

            {err && (
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 16px', background:'#fadbd8', borderRadius:8, marginBottom:16, color:'#922b21', fontSize:'0.875rem', justifyContent:'space-between' }}>
                    <span><AlertTriangle size={15} style={{marginRight:6}} />{err}</span>
                    <button onClick={() => setErr('')}><X size={14} /></button>
                </div>
            )}

            {saved && (
                <div style={{ padding:'10px 16px', background:'#d5f5e3', borderRadius:8, marginBottom:16, color:'#1e8449', fontSize:'0.875rem' }}>
                    ✅ Ayarlar kaydedildi.
                </div>
            )}

            <div className="re-card">
                <div className="re-form-row">
                    <div className="re-form-group">
                        <label>Modül Tipi</label>
                        <select className="re-input re-select" value={moduleForm.moduleType} onChange={e => setModuleForm(f => ({ ...f, moduleType: e.target.value }))}>
                            <option value="BASIC">Basit Sürüm (Tip Bazlı)</option>
                            <option value="ADVANCED">Gelişmiş Sürüm (Kroki Bazlı)</option>
                        </select>
                        <p style={{ fontSize:'0.75rem', color:'var(--re-muted)', marginTop:4 }}>
                            {moduleForm.moduleType === 'BASIC'
                                ? 'Daire tipleri üzerinden jenerik teklif verilir.'
                                : 'Spesifik daire seçimi ve stok takibi yapılır.'}
                        </p>
                    </div>
                    <div className="re-form-group">
                        <label>Modül Durumu</label>
                        <select className="re-input re-select" value={moduleForm.isActive ? 'true' : 'false'} onChange={e => setModuleForm(f => ({ ...f, isActive: e.target.value === 'true' }))}>
                            <option value="true">✅ Aktif</option>
                            <option value="false">⏸ Pasif</option>
                        </select>
                    </div>
                </div>
                <div className="re-form-group">
                    <label>Yasal Uyarı Metni</label>
                    <textarea
                        className="re-input re-textarea"
                        placeholder="Bu hesaplama bilgilendirme amaçlıdır..."
                        value={moduleForm.legalDisclaimer}
                        onChange={e => setModuleForm(f => ({ ...f, legalDisclaimer: e.target.value }))}
                    />
                </div>
            </div>
        </div>
    );
}

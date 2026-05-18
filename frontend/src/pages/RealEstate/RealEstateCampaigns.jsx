import { useState, useEffect } from 'react';
import {
    Tag, Plus, Trash2, Edit2, Save, X, AlertTriangle, RefreshCw, Percent
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { realEstateAPI } from '../../services/api';
import './RealEstate.css';

function Modal({ title, onClose, children, footer }) {
    return (
        <div className="re-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="re-modal" style={{ maxWidth: 640 }}>
                <div className="re-modal-header">
                    <h3>{title}</h3>
                    <button className="re-btn re-btn-ghost re-btn-sm" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="re-modal-body">{children}</div>
                {footer && <div className="re-modal-footer">{footer}</div>}
            </div>
        </div>
    );
}

// Boş discount tier şablonu
const EMPTY_TIER = { months: '', discountRate: '', label: '' };

// Varsayılan discount tier form durumu
function defaultCampForm() {
    return {
        name: '',
        monthlyInterestRate: '0',
        minDownPaymentRate: '20',
        flexDownPaymentRate: '',   // Esneme alt sınırı (opsiyonel)
        maxInstallments: '36',
        discountTiers: [],         // [{months, discountRate, label}]
        description: '',
        endDate: '',
        offerValidityType: 'DAYS',
        offerValidityDays: '7',
    };
}

export default function RealEstateCampaigns() {
    const { currentWorkspace } = useAuth();
    const wid = currentWorkspace?.id;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');

    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState(null);
    const [campaigns, setCampaigns] = useState([]);

    const [showCampModal, setShowCampModal] = useState(false);
    const [editingCamp, setEditingCamp] = useState(null);
    const [campForm, setCampForm] = useState(defaultCampForm());

    useEffect(() => {
        if (!wid) return;
        loadProjects();
    }, [wid]);

    useEffect(() => {
        if (!selectedProject || !wid) return;
        loadCampaigns();
    }, [selectedProject]);

    const loadProjects = async () => {
        setLoading(true);
        try {
            const res = await realEstateAPI.getProjects(wid);
            const proj = res.data.projects || [];
            setProjects(proj);
            if (proj.length > 0) setSelectedProject(proj[0]);
        } catch {
            setErr('Projeler yüklenemedi.');
        } finally {
            setLoading(false);
        }
    };

    const loadCampaigns = async () => {
        try {
            const res = await realEstateAPI.getCampaigns(wid, selectedProject.id);
            setCampaigns(res.data.campaigns || []);
        } catch {}
    };

    const openCampModal = (c = null) => {
        setEditingCamp(c);
        if (c) {
            let tiers = [];
            try {
                tiers = typeof c.discountTiers === 'string'
                    ? JSON.parse(c.discountTiers)
                    : (c.discountTiers || []);
            } catch { tiers = []; }

            setCampForm({
                name: c.name,
                monthlyInterestRate: c.monthlyInterestRate ?? 0,
                minDownPaymentRate: c.minDownPaymentRate,
                flexDownPaymentRate: c.flexDownPaymentRate ?? '',
                maxInstallments: c.maxInstallments,
                discountTiers: tiers,
                description: c.description || '',
                endDate: c.endDate ? new Date(c.endDate).toISOString().split('T')[0] : '',
                offerValidityType: c.offerValidityType || 'DAYS',
                offerValidityDays: c.offerValidityDays || '7',
            });
        } else {
            setCampForm(defaultCampForm());
        }
        setShowCampModal(true);
    };

    const saveCamp = async () => {
        if (!campForm.name) { setErr('Kampanya adı zorunludur.'); return; }
        setSaving(true);
        try {
            // Discount tier'ları temizle (boş satırları çıkar)
            const cleanedTiers = campForm.discountTiers
                .filter(t => t.months && t.discountRate)
                .map(t => ({
                    months: parseInt(t.months),
                    discountRate: parseFloat(t.discountRate),
                    label: t.label || `${t.months} Ay`,
                }));

            const data = {
                name: campForm.name,
                monthlyInterestRate: parseFloat(campForm.monthlyInterestRate) || 0,
                minDownPaymentRate: parseFloat(campForm.minDownPaymentRate) || 20,
                flexDownPaymentRate: campForm.flexDownPaymentRate !== '' ? parseFloat(campForm.flexDownPaymentRate) : null,
                maxInstallments: parseInt(campForm.maxInstallments) || 36,
                discountTiers: cleanedTiers.length > 0 ? JSON.stringify(cleanedTiers) : null,
                description: campForm.description || null,
                endDate: campForm.endDate ? new Date(campForm.endDate).toISOString() : null,
                offerValidityType: campForm.offerValidityType || 'DAYS',
                offerValidityDays: parseInt(campForm.offerValidityDays) || 7,
            };
            if (editingCamp) {
                await realEstateAPI.updateCampaign(wid, selectedProject.id, editingCamp.id, data);
            } else {
                await realEstateAPI.createCampaign(wid, selectedProject.id, data);
            }
            setShowCampModal(false);
            loadCampaigns();
        } catch { setErr('Kampanya kaydedilemedi.'); } finally { setSaving(false); }
    };

    const deleteCamp = async (cid) => {
        if (!window.confirm('Bu kampanyayı silmek istediğinizden emin misiniz?')) return;
        try {
            await realEstateAPI.deleteCampaign(wid, selectedProject.id, cid);
            loadCampaigns();
        } catch { setErr('Kampanya silinemedi.'); }
    };

    // Tier yardımcıları
    const addTier = () => setCampForm(f => ({ ...f, discountTiers: [...f.discountTiers, { ...EMPTY_TIER }] }));
    const removeTier = (i) => setCampForm(f => ({ ...f, discountTiers: f.discountTiers.filter((_, idx) => idx !== i) }));
    const updateTier = (i, field, val) => setCampForm(f => ({
        ...f,
        discountTiers: f.discountTiers.map((t, idx) => idx === i ? { ...t, [field]: val } : t),
    }));

    if (loading) return <div className="re-loading"><Tag size={32} /><span>Kampanyalar yükleniyor...</span></div>;

    return (
        <div className="re-page">
            {/* Header */}
            <div className="re-page-header">
                <div className="re-page-title">
                    <div className="re-page-title-icon"><Tag size={22} /></div>
                    <div>
                        <h1>Kampanyalar</h1>
                        <p>Ödeme kampanyaları ve vade planları</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {projects.length > 1 && (
                        <select
                            className="re-input re-select"
                            style={{ width: 200 }}
                            value={selectedProject?.id || ''}
                            onChange={e => setSelectedProject(projects.find(p => p.id === e.target.value))}
                        >
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    )}
                    {selectedProject && (
                        <button className="re-btn re-btn-primary re-btn-sm" onClick={() => openCampModal()}>
                            <Plus size={14} /> Kampanya Ekle
                        </button>
                    )}
                    <button className="re-btn re-btn-outline re-btn-sm" onClick={loadCampaigns}>
                        <RefreshCw size={14} /> Yenile
                    </button>
                </div>
            </div>

            {/* Hata */}
            {err && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#fadbd8', borderRadius: 8, marginBottom: 16, color: '#922b21', fontSize: '0.875rem', justifyContent: 'space-between' }}>
                    <span><AlertTriangle size={15} style={{ marginRight: 6 }} />{err}</span>
                    <button onClick={() => setErr('')}><X size={14} /></button>
                </div>
            )}

            {/* Proje Sekmeleri */}
            {projects.length > 1 && (
                <div className="re-admin-tabs" style={{ marginBottom: 20 }}>
                    {projects.map(p => (
                        <button
                            key={p.id}
                            className={`re-admin-tab ${selectedProject?.id === p.id ? 'active' : ''}`}
                            onClick={() => setSelectedProject(p)}
                        >
                            {p.name}
                        </button>
                    ))}
                </div>
            )}

            <div className="re-card">
                {!selectedProject ? (
                    <div className="re-empty" style={{ padding: '30px 0' }}>
                        <Tag size={44} />
                        <h3>Proje bulunamadı</h3>
                        <p>Önce Portföy sayfasından bir proje oluşturun.</p>
                    </div>
                ) : campaigns.length === 0 ? (
                    <div className="re-empty" style={{ padding: '30px 0' }}>
                        <Tag size={44} />
                        <h3>Kampanya tanımlanmamış</h3>
                        <p>
                            {selectedProject.name} projesi için ödeme kampanyası ekleyin.
                            {projects.length <= 1 && selectedProject && (
                                <span style={{ display: 'block', marginTop: 4 }}>
                                    Proje: <strong>{selectedProject.name}</strong>
                                </span>
                            )}
                        </p>
                        <button className="re-btn re-btn-primary" style={{ marginTop: 12 }} onClick={() => openCampModal()}>
                            <Plus size={14} /> İlk Kampanyayı Ekle
                        </button>
                    </div>
                ) : (
                    <div className="re-campaign-cards">
                        {campaigns.map(c => {
                            let tiers = [];
                            try { tiers = typeof c.discountTiers === 'string' ? JSON.parse(c.discountTiers) : (c.discountTiers || []); } catch {}
                            return (
                                <div className="re-campaign-card" key={c.id}>
                                    <div className="re-campaign-name">{c.name}</div>
                                    <div className="re-campaign-stats">
                                        <div className="re-campaign-stat">
                                            <span className="stat-label">Aylık Faiz</span>
                                            <span className="stat-value">%{c.monthlyInterestRate}</span>
                                        </div>
                                        <div className="re-campaign-stat">
                                            <span className="stat-label">Min. Peşinat</span>
                                            <span className="stat-value">%{c.minDownPaymentRate}
                                                {c.flexDownPaymentRate != null && (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--re-muted)', fontWeight: 400 }}> (esnek %{c.flexDownPaymentRate})</span>
                                                )}
                                            </span>
                                        </div>
                                        <div className="re-campaign-stat">
                                            <span className="stat-label">Maks. Taksit</span>
                                            <span className="stat-value">{c.maxInstallments} Ay</span>
                                        </div>
                                        <div className="re-campaign-stat">
                                            <span className="stat-label">Durum</span>
                                            <span className="stat-value" style={{ color: c.isActive ? 'var(--re-success)' : 'var(--re-muted)' }}>
                                                {c.isActive ? 'Aktif' : 'Pasif'}
                                            </span>
                                        </div>
                                    </div>
                                    {/* Discount Tiers Gösterimi */}
                                    {tiers.length > 0 && (
                                        <div style={{ marginTop: 10, paddingLeft: 12 }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--re-muted)', marginBottom: 4 }}>Vade İndirimleri:</div>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                {tiers.map((t, i) => (
                                                    <span key={i} style={{
                                                        fontSize: '0.75rem', padding: '2px 8px',
                                                        background: 'rgba(26,82,118,0.08)', color: 'var(--re-primary)',
                                                        borderRadius: 4, fontWeight: 600,
                                                    }}>
                                                        {t.months} Ay → %{t.discountRate} İndirim
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {c.endDate && (
                                        <p style={{ fontSize: '0.8125rem', color: 'var(--re-muted)', marginTop: 8, paddingLeft: 12 }}>
                                            Bitiş: {new Date(c.endDate).toLocaleDateString('tr-TR')}
                                        </p>
                                    )}
                                    {c.description && <p style={{ fontSize: '0.8125rem', color: 'var(--re-muted)', marginTop: 4, paddingLeft: 12 }}>{c.description}</p>}
                                    <div className="re-campaign-actions">
                                        <button className="re-btn re-btn-outline re-btn-sm" onClick={() => openCampModal(c)}><Edit2 size={13} /> Düzenle</button>
                                        <button className="re-btn re-btn-danger re-btn-sm" onClick={() => deleteCamp(c.id)}><Trash2 size={13} /></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Modal: Kampanya */}
            {showCampModal && (
                <Modal title={editingCamp ? 'Kampanyayı Düzenle' : 'Yeni Kampanya'} onClose={() => setShowCampModal(false)}
                    footer={<>
                        <button className="re-btn re-btn-outline" onClick={() => setShowCampModal(false)}>İptal</button>
                        <button className="re-btn re-btn-primary" onClick={saveCamp} disabled={saving}><Save size={14} /> {saving ? '...' : 'Kaydet'}</button>
                    </>}>

                    <div className="re-form-group">
                        <label>Kampanya Adı <span className="required">*</span></label>
                        <input className="re-input" placeholder="Emlak Konut Kampanyası" value={campForm.name} onChange={e => setCampForm(f => ({ ...f, name: e.target.value }))} />
                    </div>

                    {/* Temel Parametreler */}
                    <div className="re-form-row re-form-row triple">
                        <div className="re-form-group">
                            <label>Aylık Faiz Oranı (%)</label>
                            <input className="re-input" type="number" step="0.1" placeholder="0" value={campForm.monthlyInterestRate} onChange={e => setCampForm(f => ({ ...f, monthlyInterestRate: e.target.value }))} />
                            <p style={{ fontSize: '0.7rem', color: 'var(--re-muted)', marginTop: 3 }}>0 = Sıfır Faiz</p>
                        </div>
                        <div className="re-form-group">
                            <label>Maks. Taksit (Ay)</label>
                            <input className="re-input" type="number" min="1" placeholder="36" value={campForm.maxInstallments} onChange={e => setCampForm(f => ({ ...f, maxInstallments: e.target.value }))} />
                        </div>
                    </div>

                    {/* Peşinat Ayarları */}
                    <div style={{ padding: '14px 16px', background: 'rgba(26,82,118,0.05)', borderRadius: 10, marginBottom: 16, border: '1px solid rgba(26,82,118,0.1)' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: 10, color: 'var(--re-primary)' }}>
                            💰 Peşinat Yapılandırması
                        </div>
                        <div className="re-form-row">
                            <div className="re-form-group">
                                <label>Standart Min. Peşinat (%)</label>
                                <input className="re-input" type="number" min="0" max="100" placeholder="50"
                                    value={campForm.minDownPaymentRate}
                                    onChange={e => setCampForm(f => ({ ...f, minDownPaymentRate: e.target.value }))} />
                                <p style={{ fontSize: '0.7rem', color: 'var(--re-muted)', marginTop: 3 }}>Varsayılan önerilen peşinat oranı</p>
                            </div>
                            <div className="re-form-group">
                                <label>Esnek Min. Peşinat (%) <span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--re-muted)' }}>(Opsiyonel)</span></label>
                                <input className="re-input" type="number" min="0" max="100" placeholder="40"
                                    value={campForm.flexDownPaymentRate}
                                    onChange={e => setCampForm(f => ({ ...f, flexDownPaymentRate: e.target.value }))} />
                                <p style={{ fontSize: '0.7rem', color: 'var(--re-muted)', marginTop: 3 }}>Danışman inisiyatifle inebileceği alt sınır</p>
                            </div>
                        </div>
                    </div>

                    {/* Vade - İndirim Tablosu */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <label style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--re-primary)', margin: 0 }}>
                                📊 Vade - İndirim Tablosu
                            </label>
                            <button className="re-btn re-btn-outline re-btn-sm" onClick={addTier}>
                                <Plus size={13} /> Vade Ekle
                            </button>
                        </div>
                        <div style={{ padding: '10px 14px', background: 'rgba(26,82,118,0.04)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--re-muted)', marginBottom: 10 }}>
                            💡 Her vade için ayrı indirim oranı tanımlayın. Maks. Taksit süresi ise indirimsiz (liste fiyatı) standart vadedir.
                        </div>
                        {campForm.discountTiers.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '16px', fontSize: '0.8125rem', color: 'var(--re-muted)', border: '1px dashed var(--re-border)', borderRadius: 8 }}>
                                Henüz vade-indirim tanımı yok. "+ Vade Ekle" ile ekleyin.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {/* Başlık */}
                                <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr auto', gap: 8, fontSize: '0.75rem', color: 'var(--re-muted)', padding: '0 4px' }}>
                                    <span>Ay Sayısı</span>
                                    <span>İndirim Oranı (%)</span>
                                    <span>Etiket (Opsiyonel)</span>
                                    <span></span>
                                </div>
                                {campForm.discountTiers.map((t, i) => (
                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                                        <input className="re-input" type="number" min="1" placeholder="30"
                                            value={t.months}
                                            onChange={e => updateTier(i, 'months', e.target.value)} />
                                        <div style={{ position: 'relative' }}>
                                            <input className="re-input" type="number" min="0" max="100" step="0.5" placeholder="3.5"
                                                value={t.discountRate}
                                                onChange={e => updateTier(i, 'discountRate', e.target.value)} />
                                            <Percent size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--re-muted)', pointerEvents: 'none' }} />
                                        </div>
                                        <input className="re-input" type="text" placeholder={`${t.months || '?'} Ay`}
                                            value={t.label}
                                            onChange={e => updateTier(i, 'label', e.target.value)} />
                                        <button className="re-btn re-btn-danger re-btn-sm" onClick={() => removeTier(i)} style={{ padding: '6px 10px' }}>
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Tarih ve Geçerlilik */}
                    <div className="re-form-group">
                        <label>Kampanya Bitiş Tarihi</label>
                        <input className="re-input" type="date" value={campForm.endDate} onChange={e => setCampForm(f => ({ ...f, endDate: e.target.value }))} />
                        <p style={{ fontSize: '0.75rem', color: 'var(--re-muted)', marginTop: 4 }}>Kampanyanın genel sonlanma tarihi (Opsiyonel)</p>
                    </div>
                    <div className="re-form-row triple">
                        <div className="re-form-group" style={{ gridColumn: 'span 2' }}>
                            <label>TEKLİF: Geçerlilik Türü</label>
                            <select className="re-input re-select" value={campForm.offerValidityType} onChange={e => setCampForm(f => ({ ...f, offerValidityType: e.target.value }))}>
                                <option value="DAYS">Teklif Tarihi + X Gün</option>
                                <option value="CAMPAIGN_END">Kampanya Bitiş Tarihine Kadar</option>
                            </select>
                        </div>
                        {campForm.offerValidityType === 'DAYS' && (
                            <div className="re-form-group">
                                <label>TEKLİF: Gün Süresi</label>
                                <input className="re-input" type="number" min="1" value={campForm.offerValidityDays} onChange={e => setCampForm(f => ({ ...f, offerValidityDays: e.target.value }))} />
                            </div>
                        )}
                    </div>
                    <div className="re-form-group">
                        <label>Açıklama</label>
                        <textarea className="re-input re-textarea" placeholder="Kampanya detayları, vb." value={campForm.description} onChange={e => setCampForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                </Modal>
            )}
        </div>
    );
}

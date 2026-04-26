import { useState, useEffect } from 'react';
import {
    Tag, Plus, Trash2, Edit2, Save, X, AlertTriangle, RefreshCw
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { realEstateAPI } from '../../services/api';
import './RealEstate.css';

function Modal({ title, onClose, children, footer }) {
    return (
        <div className="re-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="re-modal">
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
    const [campForm, setCampForm] = useState({
        name: '', monthlyInterestRate: '', minDownPaymentRate: '20', maxInstallments: '24',
        description: '', endDate: '', offerValidityType: 'DAYS', offerValidityDays: '7'
    });

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
            setCampForm({
                name: c.name,
                monthlyInterestRate: c.monthlyInterestRate,
                minDownPaymentRate: c.minDownPaymentRate,
                maxInstallments: c.maxInstallments,
                description: c.description || '',
                endDate: c.endDate ? new Date(c.endDate).toISOString().split('T')[0] : '',
                offerValidityType: c.offerValidityType || 'DAYS',
                offerValidityDays: c.offerValidityDays || '7'
            });
        } else {
            setCampForm({ name: '', monthlyInterestRate: '', minDownPaymentRate: '20', maxInstallments: '24', description: '', endDate: '', offerValidityType: 'DAYS', offerValidityDays: '7' });
        }
        setShowCampModal(true);
    };

    const saveCamp = async () => {
        if (!campForm.name) { setErr('Kampanya adı zorunludur.'); return; }
        setSaving(true);
        try {
            const data = {
                name: campForm.name,
                monthlyInterestRate: parseFloat(campForm.monthlyInterestRate) || 0,
                minDownPaymentRate: parseFloat(campForm.minDownPaymentRate) || 20,
                maxInstallments: parseInt(campForm.maxInstallments) || 24,
                description: campForm.description || null,
                endDate: campForm.endDate ? new Date(campForm.endDate).toISOString() : null,
                offerValidityType: campForm.offerValidityType || 'DAYS',
                offerValidityDays: parseInt(campForm.offerValidityDays) || 7
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
                        {campaigns.map(c => (
                            <div className="re-campaign-card" key={c.id}>
                                <div className="re-campaign-name">{c.name}</div>
                                <div className="re-campaign-stats">
                                    <div className="re-campaign-stat">
                                        <span className="stat-label">Aylık Faiz</span>
                                        <span className="stat-value">%{c.monthlyInterestRate}</span>
                                    </div>
                                    <div className="re-campaign-stat">
                                        <span className="stat-label">Min. Peşinat</span>
                                        <span className="stat-value">%{c.minDownPaymentRate}</span>
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
                        ))}
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
                        <input className="re-input" placeholder="%30 Peşin 24 Ay Sıfır Faiz" value={campForm.name} onChange={e => setCampForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="re-form-row re-form-row triple">
                        <div className="re-form-group">
                            <label>Aylık Faiz Oranı (%)</label>
                            <input className="re-input" type="number" step="0.1" placeholder="1.5" value={campForm.monthlyInterestRate} onChange={e => setCampForm(f => ({ ...f, monthlyInterestRate: e.target.value }))} />
                        </div>
                        <div className="re-form-group">
                            <label>Min. Peşinat (%)</label>
                            <input className="re-input" type="number" min="0" max="100" placeholder="20" value={campForm.minDownPaymentRate} onChange={e => setCampForm(f => ({ ...f, minDownPaymentRate: e.target.value }))} />
                        </div>
                        <div className="re-form-group">
                            <label>Maks. Taksit (Ay)</label>
                            <input className="re-input" type="number" min="1" placeholder="24" value={campForm.maxInstallments} onChange={e => setCampForm(f => ({ ...f, maxInstallments: e.target.value }))} />
                        </div>
                    </div>
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
                    <div style={{ padding: '12px 16px', background: 'rgba(26,82,118,0.05)', borderRadius: 8, fontSize: '0.8125rem', color: 'var(--re-primary)', marginTop: 8 }}>
                        💡 <b>Aylık faiz = 0</b> olarak girilirse "sıfır faizli" kampanya oluşturulur.
                    </div>
                </Modal>
            )}
        </div>
    );
}

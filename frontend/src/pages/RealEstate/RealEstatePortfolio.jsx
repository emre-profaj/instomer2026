import { useState, useEffect, useMemo } from 'react';
import {
    Building2, Plus, Trash2, Edit2, Save, X,
    Home, AlertTriangle, RefreshCw, ChevronUp, ChevronDown
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { realEstateAPI } from '../../services/api';
import UnitManager from './UnitManager';
import './RealEstate.css';

const fmt = (n) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0);

const compressImage = (file, maxMB = 2) => {
    return new Promise((resolve) => {
        if (!file || !file.type.startsWith('image/')) return resolve(file);
        if (file.size <= maxMB * 1024 * 1024) return resolve(file);
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = e => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                const maxDim = 2048;
                if (width > height && width > maxDim) { height *= maxDim / width; width = maxDim; }
                else if (height > maxDim) { width *= maxDim / height; height = maxDim; }
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                canvas.toBlob(blob => resolve(blob ? new File([blob], file.name, { type: file.type }) : file), file.type, 0.7);
            };
            img.onerror = () => resolve(file);
        };
        reader.onerror = () => resolve(file);
    });
};

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

export default function RealEstatePortfolio() {
    const { currentWorkspace } = useAuth();
    const wid = currentWorkspace?.id;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');

    // Proje
    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState(null);
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [projectForm, setProjectForm] = useState({ name: '', description: '', location: '' });
    const [editingProject, setEditingProject] = useState(null);

    // Daire Tipleri
    const [aptTypes, setAptTypes] = useState([]);
    const [showAptModal, setShowAptModal] = useState(false);
    const [editingApt, setEditingApt] = useState(null);
    const [aptForm, setAptForm] = useState({
        name: '', roomCount: '', floor: '', grossArea: '', netArea: '', direction: '',
        listPrice: '', cashPrice: '', description: '',
        sitePlanUrl: '', sitePlanFile: null,
        floorPlans: []
    });

    // Sıralama
    const [aptSort, setAptSort] = useState({ key: '', dir: '' }); // key: roomCount|netArea|grossArea|listPrice|cashPrice, dir: asc|desc
    const toggleSort = (key) => setAptSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
    const SortIcon = ({ col }) => aptSort.key !== col ? <span style={{ opacity: 0.3, marginLeft: 4, fontSize: '0.7rem' }}>⇅</span> : aptSort.dir === 'asc' ? <ChevronUp size={14} style={{ marginLeft: 2 }} /> : <ChevronDown size={14} style={{ marginLeft: 2 }} />;
    const sortedAptTypes = useMemo(() => {
        if (!aptSort.key) return aptTypes;
        return [...aptTypes].sort((a, b) => {
            let va = a[aptSort.key] ?? 0, vb = b[aptSort.key] ?? 0;
            if (typeof va === 'string') return aptSort.dir === 'asc' ? va.localeCompare(vb, 'tr') : vb.localeCompare(va, 'tr');
            return aptSort.dir === 'asc' ? va - vb : vb - va;
        });
    }, [aptTypes, aptSort]);

    useEffect(() => {
        if (!wid) return;
        loadProjects();
    }, [wid]);

    useEffect(() => {
        if (!selectedProject || !wid) return;
        loadAptTypes();
    }, [selectedProject]);

    const loadProjects = async () => {
        setLoading(true);
        try {
            const res = await realEstateAPI.getProjects(wid);
            const proj = res.data.projects || [];
            setProjects(proj);
            if (proj.length > 0 && !selectedProject) setSelectedProject(proj[0]);
        } catch {
            setErr('Projeler yüklenemedi.');
        } finally {
            setLoading(false);
        }
    };

    const loadAptTypes = async () => {
        try {
            const res = await realEstateAPI.getApartmentTypes(wid, selectedProject.id);
            setAptTypes(res.data.types || []);
        } catch {}
    };

    // ── Proje CRUD ──────────────────────────────────────────────────────────
    const saveProject = async () => {
        setSaving(true);
        try {
            if (editingProject) {
                await realEstateAPI.updateProject(wid, editingProject.id, projectForm);
            } else {
                await realEstateAPI.createProject(wid, projectForm);
            }
            setShowProjectModal(false);
            setEditingProject(null);
            setProjectForm({ name: '', description: '', location: '' });
            loadProjects();
        } catch { setErr('Proje kaydedilemedi.'); } finally { setSaving(false); }
    };

    const deleteProject = async (pid) => {
        if (!window.confirm('Bu projeyi silmek istediğinizden emin misiniz?')) return;
        try {
            await realEstateAPI.deleteProject(wid, pid);
            if (selectedProject?.id === pid) setSelectedProject(null);
            loadProjects();
        } catch { setErr('Proje silinemedi.'); }
    };

    // ── Daire Tipi CRUD ─────────────────────────────────────────────────────
    const openAptModal = (t = null) => {
        setEditingApt(t);
        let parsedFloorPlans = [];
        try { if (t?.floorPlans) parsedFloorPlans = JSON.parse(t.floorPlans).map(url => ({ url, file: null, preview: url })); } catch {}
        setAptForm(t ? {
            name: t.name, roomCount: t.roomCount || '', floor: t.floor || '',
            grossArea: t.grossArea || '', netArea: t.netArea || '',
            direction: t.direction || '', listPrice: t.listPrice || '',
            cashPrice: t.cashPrice || '', description: t.description || '',
            sitePlanUrl: t.sitePlanUrl || '', sitePlanFile: null, floorPlans: parsedFloorPlans
        } : {
            name: '', roomCount: '', floor: '', grossArea: '', netArea: '',
            direction: '', listPrice: '', cashPrice: '', description: '',
            sitePlanUrl: '', sitePlanFile: null, floorPlans: []
        });
        setShowAptModal(true);
    };

    const saveApt = async () => {
        if (!aptForm.name || !aptForm.listPrice) { setErr('Ad ve Liste Fiyatı zorunludur.'); return; }
        setSaving(true);
        try {
            let finalSitePlanUrl = aptForm.sitePlanUrl;
            if (aptForm.sitePlanFile) {
                const compFile = await compressImage(aptForm.sitePlanFile, 2);
                const fd = new FormData(); fd.append('image', compFile);
                const res = await realEstateAPI.uploadImage(wid, fd);
                finalSitePlanUrl = res.data.url;
            }
            const finalFloorPlans = [];
            for (let f of aptForm.floorPlans) {
                if (f.file) {
                    const compFile = await compressImage(f.file, 2);
                    const fd = new FormData(); fd.append('image', compFile);
                    const res = await realEstateAPI.uploadImage(wid, fd);
                    finalFloorPlans.push(res.data.url);
                } else if (f.url) {
                    finalFloorPlans.push(f.url);
                }
            }
            const data = {
                name: aptForm.name,
                roomCount: aptForm.roomCount || null,
                floor: aptForm.floor || null,
                grossArea: aptForm.grossArea ? parseFloat(aptForm.grossArea) : null,
                netArea: aptForm.netArea ? parseFloat(aptForm.netArea) : null,
                direction: aptForm.direction || null,
                listPrice: parseFloat(aptForm.listPrice),
                cashPrice: aptForm.cashPrice ? parseFloat(aptForm.cashPrice) : parseFloat(aptForm.listPrice),
                description: aptForm.description || null,
                sitePlanUrl: finalSitePlanUrl || null,
                floorPlans: JSON.stringify(finalFloorPlans),
            };
            if (editingApt) {
                await realEstateAPI.updateApartmentType(wid, selectedProject.id, editingApt.id, data);
            } else {
                await realEstateAPI.createApartmentType(wid, selectedProject.id, data);
            }
            setShowAptModal(false);
            loadAptTypes();
        } catch { setErr('Daire tipi kaydedilemedi.'); } finally { setSaving(false); }
    };

    const deleteApt = async (tid) => {
        if (!window.confirm('Bu daire tipini silmek istediğinizden emin misiniz?')) return;
        try {
            await realEstateAPI.deleteApartmentType(wid, selectedProject.id, tid);
            loadAptTypes();
        } catch { setErr('Daire tipi silinemedi.'); }
    };

    if (loading) return <div className="re-loading"><Building2 size={32} /><span>Portföy yükleniyor...</span></div>;

    return (
        <div className="re-page">
            {/* Header */}
            <div className="re-page-header">
                <div className="re-page-title">
                    <div className="re-page-title-icon"><Home size={22} /></div>
                    <div>
                        <h1>Portföy</h1>
                        <p>Proje ve daire tipi yönetimi</p>
                    </div>
                </div>
                <button className="re-btn re-btn-outline re-btn-sm" onClick={loadProjects} disabled={loading}>
                    <RefreshCw size={14} /> Yenile
                </button>
            </div>

            {/* Hata */}
            {err && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#fadbd8', borderRadius: 8, marginBottom: 16, color: '#922b21', fontSize: '0.875rem', justifyContent: 'space-between' }}>
                    <span><AlertTriangle size={15} style={{ marginRight: 6 }} />{err}</span>
                    <button onClick={() => setErr('')}><X size={14} /></button>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Proje Listesi */}
                <div className="re-card">
                    <div className="re-card-header">
                        <span className="re-card-title">Projeler</span>
                        <button className="re-btn re-btn-primary re-btn-sm" onClick={() => { setEditingProject(null); setProjectForm({ name: '', description: '', location: '' }); setShowProjectModal(true); }}>
                            <Plus size={14} /> Proje Ekle
                        </button>
                    </div>
                    {projects.length === 0 ? (
                        <div className="re-empty" style={{ padding: '30px 0' }}>
                            <Building2 size={44} />
                            <h3>Henüz proje yok</h3>
                            <p>İlk projenizi ekleyerek başlayın.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                            {projects.map(p => (
                                <div
                                    key={p.id}
                                    onClick={() => setSelectedProject(p)}
                                    style={{
                                        padding: '12px 18px',
                                        border: `2px solid ${selectedProject?.id === p.id ? 'var(--re-primary)' : 'var(--re-border)'}`,
                                        borderRadius: 10,
                                        cursor: 'pointer',
                                        background: selectedProject?.id === p.id ? 'rgba(26,82,118,0.05)' : 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        transition: 'all 0.15s ease',
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 700, color: 'var(--re-text)' }}>{p.name}</div>
                                        {p.location && <div style={{ fontSize: '0.75rem', color: 'var(--re-muted)' }}>{p.location}</div>}
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                                        <button className="re-btn re-btn-ghost re-btn-sm" onClick={e => { e.stopPropagation(); setEditingProject(p); setProjectForm({ name: p.name, description: p.description || '', location: p.location || '' }); setShowProjectModal(true); }}><Edit2 size={13} /></button>
                                        <button className="re-btn re-btn-danger re-btn-sm" onClick={e => { e.stopPropagation(); deleteProject(p.id); }}><Trash2 size={13} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Seçili Proje — Daire Tipleri */}
                {selectedProject && (
                    <div className="re-card">
                        <div className="re-card-header">
                            <div>
                                <span className="re-card-title">Daire Tipleri</span>
                                <span style={{ fontSize: '0.8125rem', color: 'var(--re-muted)', marginLeft: 8 }}>— {selectedProject.name}</span>
                            </div>
                            <button className="re-btn re-btn-primary re-btn-sm" onClick={() => openAptModal()}>
                                <Plus size={14} /> Daire Tipi Ekle
                            </button>
                        </div>

                        {aptTypes.length === 0 ? (
                            <div className="re-empty" style={{ padding: '30px 0' }}>
                                <Home size={40} />
                                <h3>Daire tipi tanımlanmamış</h3>
                                <p>Bu proje için daire tiplerini ekleyin.</p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="re-offers-table">
                                    <thead>
                                        <tr>
                                            <th>Ad</th>
                                            <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('roomCount')}>Oda<SortIcon col="roomCount" /></th>
                                            <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('netArea')}>Net m²<SortIcon col="netArea" /></th>
                                            <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('grossArea')}>Brüt m²<SortIcon col="grossArea" /></th>
                                            <th>Yön</th>
                                            <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('listPrice')}>Liste Fiyatı<SortIcon col="listPrice" /></th>
                                            <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('cashPrice')}>Nakit Fiyatı<SortIcon col="cashPrice" /></th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedAptTypes.map(t => (
                                            <tr key={t.id}>
                                                <td style={{ fontWeight: 600 }}>{t.name}</td>
                                                <td>{t.roomCount || '—'}</td>
                                                <td>{t.netArea ? `${t.netArea} m²` : '—'}</td>
                                                <td>{t.grossArea ? `${t.grossArea} m²` : '—'}</td>
                                                <td>{t.direction || '—'}</td>
                                                <td style={{ color: 'var(--re-primary)', fontWeight: 700 }}>{fmt(t.listPrice)}</td>
                                                <td style={{ color: 'var(--re-success)', fontWeight: 600 }}>{fmt(t.cashPrice)}</td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                        <button className="re-btn re-btn-ghost re-btn-sm" onClick={() => openAptModal(t)}><Edit2 size={14} /></button>
                                                        <button className="re-btn re-btn-danger re-btn-sm" onClick={() => deleteApt(t.id)}><Trash2 size={14} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* Stok Daireler */}
                {selectedProject && aptTypes.length > 0 && (
                    <UnitManager wid={wid} projectId={selectedProject.id} aptTypes={aptTypes} />
                )}
            </div>

            {/* Modal: Proje */}
            {showProjectModal && (
                <Modal title={editingProject ? 'Projeyi Düzenle' : 'Yeni Proje'} onClose={() => setShowProjectModal(false)}
                    footer={<>
                        <button className="re-btn re-btn-outline" onClick={() => setShowProjectModal(false)}>İptal</button>
                        <button className="re-btn re-btn-primary" onClick={saveProject} disabled={saving}><Save size={14} /> {saving ? '...' : 'Kaydet'}</button>
                    </>}>
                    <div className="re-form-group">
                        <label>Proje Adı <span className="required">*</span></label>
                        <input className="re-input" placeholder="Gürkayalar Luna" value={projectForm.name} onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="re-form-group">
                        <label>Konum</label>
                        <input className="re-input" placeholder="İstanbul, Kadıköy" value={projectForm.location} onChange={e => setProjectForm(f => ({ ...f, location: e.target.value }))} />
                    </div>
                    <div className="re-form-group">
                        <label>Açıklama</label>
                        <textarea className="re-input re-textarea" placeholder="Proje hakkında kısa bilgi..." value={projectForm.description} onChange={e => setProjectForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                </Modal>
            )}

            {/* Modal: Daire Tipi */}
            {showAptModal && (
                <Modal title={editingApt ? 'Daire Tipini Düzenle' : 'Yeni Daire Tipi'} onClose={() => setShowAptModal(false)}
                    footer={<>
                        <button className="re-btn re-btn-outline" onClick={() => setShowAptModal(false)}>İptal</button>
                        <button className="re-btn re-btn-primary" onClick={saveApt} disabled={saving}><Save size={14} /> {saving ? '...' : 'Kaydet'}</button>
                    </>}>
                    <div className="re-form-row triple">
                        <div className="re-form-group">
                            <label>Tip Adı <span className="required">*</span></label>
                            <input className="re-input" placeholder="2+1 Lüks Tip" value={aptForm.name} onChange={e => setAptForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="re-form-group">
                            <label>Oda Sayısı</label>
                            <select className="re-input re-select" value={aptForm.roomCount} onChange={e => setAptForm(f => ({ ...f, roomCount: e.target.value }))}>
                                <option value="">Seçin</option>
                                {['1+1', '2+1', '3+1', '4+1', '5+1', 'Stüdyo', 'Dükkan', 'Ofis'].map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div className="re-form-group">
                            <label>Kat Bilgisi</label>
                            <input className="re-input" placeholder="Zemin, 1. Kat vb." value={aptForm.floor} onChange={e => setAptForm(f => ({ ...f, floor: e.target.value }))} />
                        </div>
                    </div>
                    <div className="re-form-row re-form-row triple">
                        <div className="re-form-group">
                            <label>Net m²</label>
                            <input className="re-input" type="number" placeholder="85" value={aptForm.netArea} onChange={e => setAptForm(f => ({ ...f, netArea: e.target.value }))} />
                        </div>
                        <div className="re-form-group">
                            <label>Brüt m²</label>
                            <input className="re-input" type="number" placeholder="110" value={aptForm.grossArea} onChange={e => setAptForm(f => ({ ...f, grossArea: e.target.value }))} />
                        </div>
                        <div className="re-form-group">
                            <label>Yön</label>
                            <select className="re-input re-select" value={aptForm.direction} onChange={e => setAptForm(f => ({ ...f, direction: e.target.value }))}>
                                <option value="">—</option>
                                {['Kuzey', 'Güney', 'Doğu', 'Batı', 'Kuzey-Doğu', 'Kuzey-Batı', 'Güney-Doğu', 'Güney-Batı'].map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="re-form-row">
                        <div className="re-form-group">
                            <label>Liste Fiyatı (TL) <span className="required">*</span></label>
                            <input className="re-input" type="number" placeholder="5000000" value={aptForm.listPrice} onChange={e => setAptForm(f => ({ ...f, listPrice: e.target.value }))} />
                        </div>
                        <div className="re-form-group">
                            <label>Nakit Fiyatı (TL)</label>
                            <input className="re-input" type="number" placeholder="4500000" value={aptForm.cashPrice} onChange={e => setAptForm(f => ({ ...f, cashPrice: e.target.value }))} />
                            <p style={{ fontSize: '0.75rem', color: 'var(--re-muted)', marginTop: 3 }}>Boş bırakılırsa liste fiyatı kullanılır</p>
                        </div>
                    </div>
                    <div className="re-form-group">
                        <label>Vaziyet Planı Görseli (Max 2MB'a otomatik sıkıştırılır)</label>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            {(aptForm.sitePlanFile || aptForm.sitePlanUrl) && (
                                <img src={aptForm.sitePlanFile ? URL.createObjectURL(aptForm.sitePlanFile) : aptForm.sitePlanUrl.startsWith('http') ? aptForm.sitePlanUrl : `${import.meta.env.VITE_API_URL || ''}${aptForm.sitePlanUrl}`} alt="Vaziyet" style={{ height: 60, borderRadius: 6, objectFit: 'contain', background: '#f8f9fa', border: '1px solid var(--re-border)' }} />
                            )}
                            <input className="re-input" type="file" accept="image/*" onChange={e => { if (e.target.files[0]) setAptForm(f => ({ ...f, sitePlanFile: e.target.files[0] })); }} />
                            {(aptForm.sitePlanFile || aptForm.sitePlanUrl) && (
                                <button className="re-btn re-btn-ghost re-btn-sm" style={{ color: 'var(--re-danger)' }} onClick={() => setAptForm(f => ({ ...f, sitePlanFile: null, sitePlanUrl: '' }))}><Trash2 size={16} /></button>
                            )}
                        </div>
                    </div>
                    <div className="re-form-group">
                        <label>Kat Planı Görselleri (Çoklu Galeri)</label>
                        <input className="re-input" type="file" multiple accept="image/*" onChange={e => {
                            const newFiles = Array.from(e.target.files).map(file => ({ file, url: '', preview: URL.createObjectURL(file) }));
                            setAptForm(f => ({ ...f, floorPlans: [...f.floorPlans, ...newFiles] }));
                        }} />
                        {aptForm.floorPlans?.length > 0 && (
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                                {aptForm.floorPlans.map((fp, i) => (
                                    <div key={i} style={{ position: 'relative' }}>
                                        <img src={fp.preview.startsWith('http') || fp.preview.startsWith('blob:') ? fp.preview : `${import.meta.env.VITE_API_URL || ''}${fp.preview}`} alt="Plan" style={{ height: 75, width: 75, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--re-border)' }} />
                                        <button className="re-btn re-btn-danger re-btn-sm" style={{ position: 'absolute', top: -6, right: -6, padding: 3, borderRadius: '50%' }} onClick={() => setAptForm(f => ({ ...f, floorPlans: f.floorPlans.filter((_, idx) => idx !== i) }))}><X size={12} /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="re-form-group">
                        <label>Açıklama</label>
                        <textarea className="re-input re-textarea" placeholder="Balkon, kapalı otopark, havuz erişimi..." value={aptForm.description} onChange={e => setAptForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                </Modal>
            )}
        </div>
    );
}

import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Edit2, Save, X, Search, ArrowUpDown } from 'lucide-react';
import { realEstateAPI } from '../../services/api';

const fmt = (n) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0);

const STATUS_MAP = {
    AVAILABLE: { label: 'Satışa Uygun', color: '#27ae60', bg: '#d5f5e3' },
    OPTIONED:  { label: 'Opsiyonlandı', color: '#b7950b', bg: '#fef9e7' },
    RESERVED:  { label: 'Rezerve', color: '#2980b9', bg: '#d6eaf8' },
    SOLD:      { label: 'Satıldı', color: '#922b21', bg: '#fadbd8' },
};

function Modal({ title, onClose, children, footer }) {
    return (
        <div className="re-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="re-modal">
                <div className="re-modal-header"><h3>{title}</h3><button className="re-btn re-btn-ghost re-btn-sm" onClick={onClose}><X size={18} /></button></div>
                <div className="re-modal-body">{children}</div>
                {footer && <div className="re-modal-footer">{footer}</div>}
            </div>
        </div>
    );
}

export default function UnitManager({ wid, projectId, aptTypes }) {
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ unitCode: '', block: '', floor: '', doorNumber: '', description: '', apartmentTypeId: '', status: 'AVAILABLE', customPrice: '' });

    // Filters
    const [statusFilter, setStatusFilter] = useState('');
    const [roomFilter, setRoomFilter] = useState('');
    const [sortBy, setSortBy] = useState('');

    useEffect(() => { if (wid && projectId) loadUnits(); }, [wid, projectId]);

    const loadUnits = async () => {
        setLoading(true);
        try {
            const res = await realEstateAPI.getUnits(wid, projectId);
            setUnits(res.data.units || []);
        } catch {} finally { setLoading(false); }
    };

    const openModal = (u = null) => {
        setEditing(u);
        setForm(u ? {
            unitCode: u.unitCode, block: u.block || '', floor: u.floor || '',
            doorNumber: u.doorNumber || '', description: u.description || '',
            apartmentTypeId: u.apartmentTypeId || '', status: u.status || 'AVAILABLE',
            customPrice: u.customPrice || ''
        } : { unitCode: '', block: '', floor: '', doorNumber: '', description: '', apartmentTypeId: '', status: 'AVAILABLE', customPrice: '' });
        setShowModal(true);
    };

    const saveUnit = async () => {
        if (!form.unitCode) return;
        setSaving(true);
        try {
            const data = {
                unitCode: form.unitCode,
                block: form.block || null,
                floor: form.floor || null,
                doorNumber: form.doorNumber || null,
                description: form.description || null,
                apartmentTypeId: form.apartmentTypeId || null,
                status: form.status,
                customPrice: form.customPrice ? parseFloat(form.customPrice) : null,
            };
            if (editing) {
                await realEstateAPI.updateUnit(wid, projectId, editing.id, data);
            } else {
                await realEstateAPI.createUnit(wid, projectId, data);
            }
            setShowModal(false);
            loadUnits();
        } catch {} finally { setSaving(false); }
    };

    const deleteUnit = async (uid) => {
        if (!window.confirm('Bu daireyi silmek istediğinize emin misiniz?')) return;
        try { await realEstateAPI.deleteUnit(wid, projectId, uid); loadUnits(); } catch {}
    };

    const updateStatus = async (uid, status) => {
        try {
            const extra = {};
            if (status === 'SOLD') extra.soldAt = new Date().toISOString();
            await realEstateAPI.updateUnit(wid, projectId, uid, { status, ...extra });
            setUnits(prev => prev.map(u => u.id === uid ? { ...u, status, ...extra } : u));
        } catch {}
    };

    // Unique room counts from types
    const roomOptions = useMemo(() => [...new Set(aptTypes.map(t => t.roomCount).filter(Boolean))], [aptTypes]);

    const getUnitPrice = (u) => u.customPrice || u.apartmentType?.listPrice || 0;

    const filtered = useMemo(() => {
        let list = [...units];
        if (statusFilter) list = list.filter(u => u.status === statusFilter);
        if (roomFilter) list = list.filter(u => u.apartmentType?.roomCount === roomFilter);
        if (sortBy === 'price_asc') list.sort((a, b) => getUnitPrice(a) - getUnitPrice(b));
        if (sortBy === 'price_desc') list.sort((a, b) => getUnitPrice(b) - getUnitPrice(a));
        if (sortBy === 'floor_asc') list.sort((a, b) => (a.floor || '').localeCompare(b.floor || '', 'tr', { numeric: true }));
        return list;
    }, [units, statusFilter, roomFilter, sortBy]);

    const counts = useMemo(() => ({
        total: units.length,
        available: units.filter(u => u.status === 'AVAILABLE').length,
        optioned: units.filter(u => u.status === 'OPTIONED').length,
        sold: units.filter(u => u.status === 'SOLD').length,
    }), [units]);

    if (loading) return <div style={{ padding: 20, color: 'var(--re-muted)', fontSize: '0.875rem' }}>Daireler yükleniyor...</div>;

    return (
        <div className="re-card" style={{ marginTop: 20 }}>
            <div className="re-card-header">
                <div>
                    <span className="re-card-title">Stok Daireler</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--re-muted)', marginLeft: 8 }}>
                        {counts.total} daire — {counts.available} satışa uygun, {counts.optioned} opsiyonlu, {counts.sold} satıldı
                    </span>
                </div>
                <button className="re-btn re-btn-primary re-btn-sm" onClick={() => openModal()}>
                    <Plus size={14} /> Daire Ekle
                </button>
            </div>

            {/* Filters */}
            {units.length > 0 && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '0 0 16px 0' }}>
                    <select className="re-input re-select" style={{ width: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="">Tüm Durumlar</option>
                        {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    {roomOptions.length > 0 && (
                        <select className="re-input re-select" style={{ width: 140 }} value={roomFilter} onChange={e => setRoomFilter(e.target.value)}>
                            <option value="">Tüm Odalar</option>
                            {roomOptions.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    )}
                    <select className="re-input re-select" style={{ width: 170 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
                        <option value="">Varsayılan Sıra</option>
                        <option value="price_asc">Fiyat ↑ (Artan)</option>
                        <option value="price_desc">Fiyat ↓ (Azalan)</option>
                        <option value="floor_asc">Kat (Artan)</option>
                    </select>
                </div>
            )}

            {filtered.length === 0 ? (
                <div className="re-empty" style={{ padding: '24px 0' }}>
                    <Search size={36} />
                    <h3>{units.length === 0 ? 'Henüz daire eklenmemiş' : 'Filtreye uygun daire bulunamadı'}</h3>
                    {units.length === 0 && <p>Projeye stoktaki daireleri ekleyin.</p>}
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table className="re-offers-table">
                        <thead>
                            <tr>
                                <th>Daire No</th>
                                <th>Blok / Kat</th>
                                <th>Tip</th>
                                <th>Oda</th>
                                <th>m²</th>
                                <th>Fiyat</th>
                                <th>Durum</th>
                                <th>Açıklama</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(u => {
                                const s = STATUS_MAP[u.status] || STATUS_MAP.AVAILABLE;
                                const price = getUnitPrice(u);
                                const isCustom = u.customPrice && u.customPrice > 0;
                                return (
                                    <tr key={u.id}>
                                        <td style={{ fontWeight: 700 }}>{u.unitCode}</td>
                                        <td style={{ fontSize: '0.8125rem' }}>{[u.block, u.floor].filter(Boolean).join(' / ') || '—'}</td>
                                        <td style={{ fontSize: '0.8125rem' }}>{u.apartmentType?.name || '—'}</td>
                                        <td>{u.apartmentType?.roomCount || '—'}</td>
                                        <td style={{ fontSize: '0.8125rem' }}>{u.apartmentType?.netArea ? `${u.apartmentType.netArea}m²` : '—'}</td>
                                        <td style={{ fontWeight: 700, color: isCustom ? 'var(--re-warning)' : 'var(--re-primary)' }}>
                                            {fmt(price)}
                                            {isCustom && <span style={{ fontSize: '0.65rem', display: 'block', color: 'var(--re-muted)' }}>özel fiyat</span>}
                                        </td>
                                        <td>
                                            <select
                                                style={{ background: s.bg, color: s.color, border: 'none', borderRadius: 6, padding: '4px 8px', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}
                                                value={u.status}
                                                onChange={e => updateStatus(u.id, e.target.value)}
                                            >
                                                {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                            </select>
                                        </td>
                                        <td style={{ fontSize: '0.75rem', color: 'var(--re-muted)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.description || '—'}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button className="re-btn re-btn-ghost re-btn-sm" onClick={() => openModal(u)}><Edit2 size={14} /></button>
                                                <button className="re-btn re-btn-danger re-btn-sm" onClick={() => deleteUnit(u.id)}><Trash2 size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal: Daire */}
            {showModal && (
                <Modal title={editing ? 'Daireyi Düzenle' : 'Yeni Daire'} onClose={() => setShowModal(false)}
                    footer={<>
                        <button className="re-btn re-btn-outline" onClick={() => setShowModal(false)}>İptal</button>
                        <button className="re-btn re-btn-primary" onClick={saveUnit} disabled={saving}><Save size={14} /> {saving ? '...' : 'Kaydet'}</button>
                    </>}>
                    <div className="re-form-row triple">
                        <div className="re-form-group">
                            <label>Daire No <span className="required">*</span></label>
                            <input className="re-input" placeholder="No 56" value={form.unitCode} onChange={e => setForm(f => ({ ...f, unitCode: e.target.value }))} />
                        </div>
                        <div className="re-form-group">
                            <label>Blok</label>
                            <input className="re-input" placeholder="B Blok" value={form.block} onChange={e => setForm(f => ({ ...f, block: e.target.value }))} />
                        </div>
                        <div className="re-form-group">
                            <label>Kat</label>
                            <input className="re-input" placeholder="6. Kat" value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} />
                        </div>
                    </div>
                    <div className="re-form-row">
                        <div className="re-form-group">
                            <label>Daire Tipi</label>
                            <select className="re-input re-select" value={form.apartmentTypeId} onChange={e => setForm(f => ({ ...f, apartmentTypeId: e.target.value }))}>
                                <option value="">Tip Seçin</option>
                                {aptTypes.map(t => <option key={t.id} value={t.id}>{t.name} — {t.roomCount || ''} ({fmt(t.listPrice)})</option>)}
                            </select>
                        </div>
                        <div className="re-form-group">
                            <label>Durum</label>
                            <select className="re-input re-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                                {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="re-form-group">
                        <label>Özel Fiyat (TL)</label>
                        <input className="re-input" type="number" placeholder="Boş bırakılırsa daire tipinin fiyatı kullanılır" value={form.customPrice} onChange={e => setForm(f => ({ ...f, customPrice: e.target.value }))} />
                        {form.apartmentTypeId && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--re-muted)', marginTop: 3 }}>
                                Tip fiyatı: {fmt(aptTypes.find(t => t.id === form.apartmentTypeId)?.listPrice)}
                            </p>
                        )}
                    </div>
                    <div className="re-form-group">
                        <label>Açıklama</label>
                        <input className="re-input" placeholder="Havuz cepheli, geniş balkon..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                </Modal>
            )}
        </div>
    );
}

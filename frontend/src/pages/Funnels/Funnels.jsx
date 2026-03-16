import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { funnelAPI } from '../../services/api';
import { Plus, Trash2, Edit2, Check, X, Loader, Kanban } from 'lucide-react';
import './Funnels.css';

const FUNNEL_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#f97316','#06b6d4','#ec4899','#14b8a6','#64748b'];

const Funnels = () => {
    const { currentWorkspace } = useAuth();
    const [funnels, setFunnels] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState('#3b82f6');
    const [editingFunnel, setEditingFunnel] = useState(null);

    useEffect(() => {
        if (currentWorkspace) loadFunnels();
    }, [currentWorkspace]);

    const loadFunnels = async () => {
        try {
            setLoading(true);
            const res = await funnelAPI.getAll(currentWorkspace.id);
            setFunnels(res.data.funnels || []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setSaving(true);
        try {
            const res = await funnelAPI.create(currentWorkspace.id, { name: newName.trim(), color: newColor });
            setFunnels(prev => [...prev, res.data.funnel]);
            setNewName('');
            setNewColor('#3b82f6');
        } catch (err) { console.error(err); }
        finally { setSaving(false); }
    };

    const handleUpdate = async () => {
        if (!editingFunnel?.name?.trim()) return;
        setSaving(true);
        try {
            const res = await funnelAPI.update(currentWorkspace.id, editingFunnel.id, { name: editingFunnel.name, color: editingFunnel.color });
            setFunnels(prev => prev.map(f => f.id === editingFunnel.id ? res.data.funnel : f));
            setEditingFunnel(null);
        } catch (err) { console.error(err); }
        finally { setSaving(false); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Bu funnel silinecek. Emin misiniz?')) return;
        try {
            await funnelAPI.delete(currentWorkspace.id, id);
            setFunnels(prev => prev.filter(f => f.id !== id));
        } catch (err) { console.error(err); }
    };

    return (
        <div className="funnels-page">
            <div className="funnels-header">
                <div className="funnels-header-icon"><Kanban size={24} /></div>
                <div>
                    <h1>Funnel Yönetimi</h1>
                    <p>Sohbetleri kategorize etmek ve Pipeline'da görüntülemek için funnellar oluşturun.</p>
                </div>
            </div>

            {/* Create form */}
            <div className="funnels-create-card">
                <h2>Yeni Funnel Ekle</h2>
                <div className="funnels-create-row">
                    <input
                        className="funnels-input"
                        type="text"
                        placeholder="Funnel adı… (ör. Satış, Destek, İş Başvurusu)"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    />
                    <div className="funnels-color-row">
                        {FUNNEL_COLORS.map(c => (
                            <button
                                key={c}
                                className={`funnels-color-dot ${newColor === c ? 'active' : ''}`}
                                style={{ background: c, boxShadow: newColor === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : 'none' }}
                                onClick={() => setNewColor(c)}
                            />
                        ))}
                    </div>
                    <button
                        className="funnels-btn-primary"
                        onClick={handleCreate}
                        disabled={saving || !newName.trim()}
                    >
                        {saving ? <Loader size={15} className="spin" /> : <Plus size={15} />}
                        Oluştur
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="funnels-list-card">
                {loading ? (
                    <div className="funnels-empty">Yükleniyor...</div>
                ) : funnels.length === 0 ? (
                    <div className="funnels-empty">
                        <Kanban size={40} />
                        <p>Henüz funnel yok. Yukarıdan ilk funnel'ınızı oluşturun.</p>
                    </div>
                ) : (
                    funnels.map(funnel => (
                        <div key={funnel.id} className="funnels-row">
                            <div className="funnels-dot" style={{ background: editingFunnel?.id === funnel.id ? editingFunnel.color : funnel.color }} />

                            {editingFunnel?.id === funnel.id ? (
                                <>
                                    <input
                                        autoFocus
                                        className="funnels-input funnels-input-edit"
                                        value={editingFunnel.name}
                                        onChange={e => setEditingFunnel(p => ({ ...p, name: e.target.value }))}
                                        onKeyDown={e => e.key === 'Enter' && handleUpdate()}
                                    />
                                    <div className="funnels-color-row">
                                        {FUNNEL_COLORS.map(c => (
                                            <button key={c}
                                                className={`funnels-color-dot ${editingFunnel.color === c ? 'active' : ''}`}
                                                style={{ background: c, width: '18px', height: '18px' }}
                                                onClick={() => setEditingFunnel(p => ({ ...p, color: c }))}
                                            />
                                        ))}
                                    </div>
                                    <button className="funnels-btn-sm funnels-btn-save" onClick={handleUpdate} disabled={saving}>
                                        <Check size={13} /> Kaydet
                                    </button>
                                    <button className="funnels-btn-sm funnels-btn-cancel" onClick={() => setEditingFunnel(null)}>
                                        <X size={13} /> İptal
                                    </button>
                                </>
                            ) : (
                                <>
                                    <span className="funnels-name">{funnel.name}</span>
                                    <span className="funnels-id">#{funnel.id.slice(-6)}</span>
                                    <button className="funnels-icon-btn" onClick={() => setEditingFunnel({ id: funnel.id, name: funnel.name, color: funnel.color })} title="Düzenle">
                                        <Edit2 size={15} />
                                    </button>
                                    <button className="funnels-icon-btn funnels-icon-btn-danger" onClick={() => handleDelete(funnel.id)} title="Sil">
                                        <Trash2 size={15} />
                                    </button>
                                </>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default Funnels;

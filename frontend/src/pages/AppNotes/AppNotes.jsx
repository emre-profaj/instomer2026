
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import {
    BookOpen, Lightbulb, Plus, Edit2, Trash2, Check, X,
    ChevronDown, ChevronRight, Rocket, Clock, Zap, Star, AlertCircle, Sparkles
} from 'lucide-react';
import './AppNotes.css';

const STATUS_CONFIG = {
    IDEA:        { label: 'Fikir',       icon: Lightbulb, color: '#8b5cf6', bg: '#f5f3ff' },
    TODO:        { label: 'Yapılacak',   icon: Clock,     color: '#f59e0b', bg: '#fffbeb' },
    IN_PROGRESS: { label: 'Yapılıyor',   icon: Zap,       color: '#3b82f6', bg: '#eff6ff' },
    DONE:        { label: 'Tamamlandı',  icon: Check,     color: '#10b981', bg: '#ecfdf5' }
};

const PRIORITY_CONFIG = {
    0: { label: 'Normal',  color: '#6b7280' },
    1: { label: 'Yüksek',  color: '#f59e0b' },
    2: { label: 'Kritik',  color: '#ef4444' }
};

export default function AppNotes() {
    const { currentWorkspace } = useAuth();
    const wsId = currentWorkspace?.id;

    const [activeTab, setActiveTab] = useState('CHANGELOG');
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingNote, setEditingNote] = useState(null);

    // Form state
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [version, setVersion] = useState('');
    const [status, setStatus] = useState('IDEA');
    const [priority, setPriority] = useState(0);

    const loadNotes = useCallback(async () => {
        if (!wsId) return;
        setLoading(true);
        try {
            const res = await api.get(`/app-notes/${wsId}/notes?type=${activeTab}`);
            setNotes(res.data.notes || []);
        } catch (err) {
            console.error('Notes load error:', err);
        }
        setLoading(false);
    }, [wsId, activeTab]);

    useEffect(() => { loadNotes(); }, [loadNotes]);

    const resetForm = () => {
        setTitle(''); setContent(''); setVersion(''); setStatus('IDEA'); setPriority(0);
        setEditingNote(null); setShowForm(false);
    };

    const openEdit = (note) => {
        setTitle(note.title);
        setContent(note.content || '');
        setVersion(note.version || '');
        setStatus(note.status);
        setPriority(note.priority);
        setEditingNote(note);
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!title.trim()) return;
        try {
            if (editingNote) {
                await api.put(`/app-notes/${wsId}/notes/${editingNote.id}`, { title, content, version, status, priority });
            } else {
                await api.post(`/app-notes/${wsId}/notes`, { type: activeTab, title, content, version, status, priority });
            }
            resetForm();
            loadNotes();
        } catch (err) {
            console.error('Save error:', err);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Bu notu silmek istediğinize emin misiniz?')) return;
        try {
            await api.delete(`/app-notes/${wsId}/notes/${id}`);
            loadNotes();
        } catch (err) {
            console.error('Delete error:', err);
        }
    };

    const handleStatusChange = async (note, newStatus) => {
        try {
            await api.put(`/app-notes/${wsId}/notes/${note.id}`, { status: newStatus });
            loadNotes();
        } catch (err) {
            console.error('Status change error:', err);
        }
    };

    const formatDate = (d) => {
        const date = new Date(d);
        return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    // Group changelog notes by version
    const groupedNotes = activeTab === 'CHANGELOG'
        ? notes.reduce((acc, note) => {
            const key = note.version || 'Sürüm belirtilmemiş';
            if (!acc[key]) acc[key] = [];
            acc[key].push(note);
            return acc;
        }, {})
        : null;

    return (
        <div className="appnotes-page">
            {/* Header */}
            <div className="appnotes-header">
                <div className="appnotes-header-left">
                    <BookOpen size={24} className="appnotes-icon" />
                    <h1>Instomer Notları</h1>
                </div>
                <button className="appnotes-add-btn" onClick={() => { resetForm(); setShowForm(true); }}>
                    <Plus size={16} /> {activeTab === 'CHANGELOG' ? 'Değişiklik Ekle' : 'Fikir Ekle'}
                </button>
            </div>

            {/* Tabs */}
            <div className="appnotes-tabs">
                <button
                    className={`appnotes-tab ${activeTab === 'CHANGELOG' ? 'active' : ''}`}
                    onClick={() => setActiveTab('CHANGELOG')}
                >
                    <Rocket size={16} /> Changelog
                </button>
                <button
                    className={`appnotes-tab ${activeTab === 'WHATSNEXT' ? 'active' : ''}`}
                    onClick={() => setActiveTab('WHATSNEXT')}
                >
                    <Lightbulb size={16} /> What's Next
                </button>
            </div>

            {/* Form Modal */}
            {showForm && (
                <div className="appnotes-modal-overlay" onClick={() => resetForm()}>
                    <div className="appnotes-modal" onClick={e => e.stopPropagation()}>
                        <div className="appnotes-modal-header">
                            <h2>{editingNote ? 'Notu Düzenle' : (activeTab === 'CHANGELOG' ? 'Yeni Değişiklik' : 'Yeni Fikir')}</h2>
                            <button onClick={resetForm}><X size={18} /></button>
                        </div>
                        <div className="appnotes-modal-body">
                            <div className="appnotes-field">
                                <label>Başlık *</label>
                                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ne değişti? / Yeni fikir..." />
                            </div>
                            <div className="appnotes-field">
                                <label>Açıklama</label>
                                <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Detaylar..." rows={4} />
                            </div>
                            <div className="appnotes-field-row">
                                {activeTab === 'CHANGELOG' && (
                                    <div className="appnotes-field">
                                        <label>Sürüm</label>
                                        <input value={version} onChange={e => setVersion(e.target.value)} placeholder="v2.4.0" />
                                    </div>
                                )}
                                <div className="appnotes-field">
                                    <label>Durum</label>
                                    <select value={status} onChange={e => setStatus(e.target.value)}>
                                        {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                                            <option key={k} value={k}>{v.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="appnotes-field">
                                    <label>Öncelik</label>
                                    <select value={priority} onChange={e => setPriority(Number(e.target.value))}>
                                        {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                                            <option key={k} value={k}>{v.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="appnotes-modal-footer">
                            <button className="appnotes-btn-cancel" onClick={resetForm}>İptal</button>
                            <button className="appnotes-btn-save" onClick={handleSave}>Kaydet</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="appnotes-content">
                {loading ? (
                    <div className="appnotes-loading">Yükleniyor...</div>
                ) : notes.length === 0 ? (
                    <div className="appnotes-empty">
                        {activeTab === 'CHANGELOG' ? (
                            <>
                                <Rocket size={48} />
                                <p>Henüz değişiklik notu eklenmemiş</p>
                                <span>Yaptığınız güncellemeleri buraya yazın</span>
                            </>
                        ) : (
                            <>
                                <Lightbulb size={48} />
                                <p>Henüz fikir eklenmemiş</p>
                                <span>Aklınıza gelen fikirleri buraya ekleyin</span>
                            </>
                        )}
                    </div>
                ) : activeTab === 'CHANGELOG' ? (
                    /* Changelog — grouped by version */
                    <div className="appnotes-timeline">
                        {Object.entries(groupedNotes).map(([ver, items]) => (
                            <div key={ver} className="appnotes-version-group">
                                <div className="appnotes-version-header">
                                    <span className="appnotes-version-badge">{ver}</span>
                                    <span className="appnotes-version-date">{formatDate(items[0].createdAt)}</span>
                                </div>
                                <div className="appnotes-version-items">
                                    {items.map(note => (
                                        <div key={note.id} className="appnotes-item">
                                            <div className="appnotes-item-dot" style={{ background: PRIORITY_CONFIG[note.priority]?.color || '#6b7280' }} />
                                            <div className="appnotes-item-content">
                                                <div className="appnotes-item-title">{note.title}</div>
                                                {note.content && <div className="appnotes-item-desc">{note.content}</div>}
                                            </div>
                                            <div className="appnotes-item-actions">
                                                <button onClick={() => openEdit(note)}><Edit2 size={14} /></button>
                                                <button onClick={() => handleDelete(note.id)}><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    /* What's Next — kanban-style status groups */
                    <div className="appnotes-kanban">
                        {Object.entries(STATUS_CONFIG).map(([statusKey, cfg]) => {
                            const items = notes.filter(n => n.status === statusKey);
                            const StatusIcon = cfg.icon;
                            return (
                                <div key={statusKey} className="appnotes-kanban-col">
                                    <div className="appnotes-kanban-header" style={{ borderColor: cfg.color }}>
                                        <StatusIcon size={16} style={{ color: cfg.color }} />
                                        <span>{cfg.label}</span>
                                        <span className="appnotes-kanban-count">{items.length}</span>
                                    </div>
                                    <div className="appnotes-kanban-items">
                                        {items.map(note => (
                                            <div key={note.id} className="appnotes-kanban-card">
                                                <div className="appnotes-kanban-card-header">
                                                    {note.priority > 0 && (
                                                        <span className="appnotes-priority" style={{ color: PRIORITY_CONFIG[note.priority]?.color }}>
                                                            {note.priority === 2 ? <AlertCircle size={12} /> : <Star size={12} />}
                                                        </span>
                                                    )}
                                                    <span className="appnotes-kanban-card-title">{note.title}</span>
                                                </div>
                                                {note.content && <div className="appnotes-kanban-card-desc">{note.content}</div>}
                                                <div className="appnotes-kanban-card-footer">
                                                    <span className="appnotes-kanban-date">{formatDate(note.createdAt)}</span>
                                                    <div className="appnotes-kanban-card-actions">
                                                        <select
                                                            value={note.status}
                                                            onChange={e => handleStatusChange(note, e.target.value)}
                                                            className="appnotes-status-select"
                                                            style={{ color: cfg.color }}
                                                        >
                                                            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                                                                <option key={k} value={k}>{v.label}</option>
                                                            ))}
                                                        </select>
                                                        <button onClick={() => openEdit(note)}><Edit2 size={12} /></button>
                                                        <button onClick={() => handleDelete(note.id)}><Trash2 size={12} /></button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {items.length === 0 && (
                                            <div className="appnotes-kanban-empty">Boş</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

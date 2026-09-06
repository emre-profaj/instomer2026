
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import {
    BookOpen, Lightbulb, Plus, Edit2, Trash2, Check, X,
    Rocket, Clock, Zap, Star, AlertCircle, Search, ChevronDown
} from 'lucide-react';
import './AppNotes.css';

const MODULES = [
    { key: 'INBOX',         label: '📥 Inbox',         color: '#3b82f6' },
    { key: 'KISILER',       label: '👥 Kişiler',       color: '#8b5cf6' },
    { key: 'PAZARLAMA',     label: '📣 Pazarlama',     color: '#ec4899' },
    { key: 'SATIS',         label: '💰 Satış',         color: '#10b981' },
    { key: 'TAKIMLAR',      label: '🏢 Takımlar',      color: '#f59e0b' },
    { key: 'OTOMASYONLAR',  label: '⚡ Otomasyonlar',  color: '#6366f1' },
    { key: 'RAPORLAR',      label: '📊 Raporlar',      color: '#14b8a6' },
    { key: 'AYARLAR',       label: '⚙️ Ayarlar',       color: '#64748b' },
    { key: 'GENEL',         label: '🔧 Genel',         color: '#94a3b8' },
];

const STATUS_LABELS = {
    IDEA:        { label: 'Fikir',      emoji: '💡', color: '#8b5cf6' },
    TODO:        { label: 'Yapılacak',  emoji: '📋', color: '#f59e0b' },
    IN_PROGRESS: { label: 'Yapılıyor',  emoji: '🔨', color: '#3b82f6' },
    DONE:        { label: 'Tamamlandı', emoji: '✅', color: '#10b981' }
};

const getModuleLabel = (key) => MODULES.find(m => m.key === key)?.label || key;
const getModuleColor = (key) => MODULES.find(m => m.key === key)?.color || '#94a3b8';

export default function AppNotes() {
    const { currentWorkspace } = useAuth();
    const wsId = currentWorkspace?.id;

    const [activeTab, setActiveTab] = useState('CHANGELOG');
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(false);

    // Quick add
    const [quickText, setQuickText] = useState('');
    const [quickModule, setQuickModule] = useState('');
    const [quickVersion, setQuickVersion] = useState('');
    const [similarNotes, setSimilarNotes] = useState([]);
    const quickRef = useRef(null);

    // Edit inline
    const [editingId, setEditingId] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [editContent, setEditContent] = useState('');
    const [editModule, setEditModule] = useState('');
    const [editStatus, setEditStatus] = useState('');
    const [editVersion, setEditVersion] = useState('');

    // Filter
    const [filterModule, setFilterModule] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    const loadNotes = useCallback(async () => {
        if (!wsId) return;
        setLoading(true);
        try {
            const res = await api.get(`/app-notes/${wsId}/notes?type=${activeTab}`);
            setNotes(res.data.notes || []);
        } catch (err) { console.error(err); }
        setLoading(false);
    }, [wsId, activeTab]);

    useEffect(() => { loadNotes(); }, [loadNotes]);

    // AI-like duplicate check — search as you type
    useEffect(() => {
        if (quickText.length < 3) { setSimilarNotes([]); return; }
        const words = quickText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const matches = notes.filter(n => {
            const text = `${n.title} ${n.content || ''}`.toLowerCase();
            return words.some(w => text.includes(w));
        }).slice(0, 3);
        setSimilarNotes(matches);
    }, [quickText, notes]);

    const handleQuickAdd = async () => {
        if (!quickText.trim()) return;
        try {
            await api.post(`/app-notes/${wsId}/notes`, {
                type: activeTab,
                title: quickText.trim(),
                module: quickModule || null,
                version: quickVersion || null,
                status: activeTab === 'WHATSNEXT' ? 'IDEA' : 'DONE'
            });
            setQuickText('');
            setQuickModule('');
            setSimilarNotes([]);
            loadNotes();
        } catch (err) { console.error(err); }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleQuickAdd();
        }
    };

    const startEdit = (note) => {
        setEditingId(note.id);
        setEditTitle(note.title);
        setEditContent(note.content || '');
        setEditModule(note.module || '');
        setEditStatus(note.status);
        setEditVersion(note.version || '');
    };

    const saveEdit = async () => {
        try {
            await api.put(`/app-notes/${wsId}/notes/${editingId}`, {
                title: editTitle, content: editContent, module: editModule,
                status: editStatus, version: editVersion
            });
            setEditingId(null);
            loadNotes();
        } catch (err) { console.error(err); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Silmek istediğinize emin misiniz?')) return;
        try {
            await api.delete(`/app-notes/${wsId}/notes/${id}`);
            loadNotes();
        } catch (err) { console.error(err); }
    };

    const cycleStatus = async (note) => {
        const order = ['IDEA', 'TODO', 'IN_PROGRESS', 'DONE'];
        const next = order[(order.indexOf(note.status) + 1) % order.length];
        try {
            await api.put(`/app-notes/${wsId}/notes/${note.id}`, { status: next });
            loadNotes();
        } catch (err) { console.error(err); }
    };

    const formatDate = (d) => new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

    // Filtered + grouped
    let filtered = notes;
    if (filterModule) filtered = filtered.filter(n => n.module === filterModule);
    if (filterStatus) filtered = filtered.filter(n => n.status === filterStatus);

    // Changelog: group by version then module
    const changelogGroups = activeTab === 'CHANGELOG'
        ? filtered.reduce((acc, note) => {
            const ver = note.version || 'Diğer';
            if (!acc[ver]) acc[ver] = {};
            const mod = note.module || 'GENEL';
            if (!acc[ver][mod]) acc[ver][mod] = [];
            acc[ver][mod].push(note);
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
            </div>

            {/* Tabs */}
            <div className="appnotes-tabs">
                <button className={`appnotes-tab ${activeTab === 'CHANGELOG' ? 'active' : ''}`}
                    onClick={() => setActiveTab('CHANGELOG')}>
                    <Rocket size={16} /> Changelog
                </button>
                <button className={`appnotes-tab ${activeTab === 'WHATSNEXT' ? 'active' : ''}`}
                    onClick={() => setActiveTab('WHATSNEXT')}>
                    <Lightbulb size={16} /> What's Next
                </button>
            </div>

            {/* Quick Add Bar */}
            <div className="appnotes-quick-add">
                <div className="appnotes-quick-row">
                    <select className="appnotes-quick-module" value={quickModule}
                        onChange={e => setQuickModule(e.target.value)}>
                        <option value="">Modül</option>
                        {MODULES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                    {activeTab === 'CHANGELOG' && (
                        <input className="appnotes-quick-version" value={quickVersion}
                            onChange={e => setQuickVersion(e.target.value)}
                            placeholder="v2.4" style={{ width: 70 }} />
                    )}
                    <input ref={quickRef} className="appnotes-quick-input" value={quickText}
                        onChange={e => setQuickText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={activeTab === 'CHANGELOG' ? 'Ne değişti? Enter ile ekle...' : 'Yeni fikir yaz, Enter ile ekle...'}
                    />
                    <button className="appnotes-quick-btn" onClick={handleQuickAdd} disabled={!quickText.trim()}>
                        <Plus size={16} />
                    </button>
                </div>
                {/* Similar notes warning */}
                {similarNotes.length > 0 && (
                    <div className="appnotes-similar">
                        <span className="appnotes-similar-label">🔍 Benzer notlar bulundu:</span>
                        {similarNotes.map(n => (
                            <div key={n.id} className="appnotes-similar-item">
                                <span className="appnotes-similar-status">{STATUS_LABELS[n.status]?.emoji}</span>
                                {n.module && <span className="appnotes-module-badge" style={{ background: getModuleColor(n.module) }}>{getModuleLabel(n.module)}</span>}
                                <span>{n.title}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Filters */}
            <div className="appnotes-filters">
                <select value={filterModule} onChange={e => setFilterModule(e.target.value)}>
                    <option value="">Tüm modüller</option>
                    {MODULES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
                {activeTab === 'WHATSNEXT' && (
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="">Tüm durumlar</option>
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v.emoji} {v.label}</option>
                        ))}
                    </select>
                )}
                <span className="appnotes-count">{filtered.length} kayıt</span>
            </div>

            {/* Content */}
            <div className="appnotes-content">
                {loading ? (
                    <div className="appnotes-loading">Yükleniyor...</div>
                ) : filtered.length === 0 ? (
                    <div className="appnotes-empty">
                        <p>{activeTab === 'CHANGELOG' ? '📝 Henüz değişiklik notu yok' : '💡 Henüz fikir yok'}</p>
                        <span>Yukarıdaki kutuya yazıp Enter'a basın</span>
                    </div>
                ) : activeTab === 'CHANGELOG' ? (
                    /* CHANGELOG — version > module > items */
                    <div className="appnotes-list">
                        {Object.entries(changelogGroups).map(([ver, modules]) => (
                            <div key={ver} className="appnotes-ver-section">
                                <div className="appnotes-ver-title">
                                    <span className="appnotes-ver-badge">{ver}</span>
                                </div>
                                {Object.entries(modules).map(([mod, items]) => (
                                    <div key={mod} className="appnotes-mod-section">
                                        <div className="appnotes-mod-title" style={{ color: getModuleColor(mod) }}>
                                            {getModuleLabel(mod)}
                                        </div>
                                        {items.map(note => (
                                            <NoteRow key={note.id} note={note} editingId={editingId}
                                                editTitle={editTitle} setEditTitle={setEditTitle}
                                                editContent={editContent} setEditContent={setEditContent}
                                                editModule={editModule} setEditModule={setEditModule}
                                                editStatus={editStatus} setEditStatus={setEditStatus}
                                                editVersion={editVersion} setEditVersion={setEditVersion}
                                                startEdit={startEdit} saveEdit={saveEdit} setEditingId={setEditingId}
                                                handleDelete={handleDelete} cycleStatus={cycleStatus}
                                                activeTab={activeTab} formatDate={formatDate} />
                                        ))}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                ) : (
                    /* WHATSNEXT — flat list */
                    <div className="appnotes-list">
                        {filtered.map(note => (
                            <NoteRow key={note.id} note={note} editingId={editingId}
                                editTitle={editTitle} setEditTitle={setEditTitle}
                                editContent={editContent} setEditContent={setEditContent}
                                editModule={editModule} setEditModule={setEditModule}
                                editStatus={editStatus} setEditStatus={setEditStatus}
                                editVersion={editVersion} setEditVersion={setEditVersion}
                                startEdit={startEdit} saveEdit={saveEdit} setEditingId={setEditingId}
                                handleDelete={handleDelete} cycleStatus={cycleStatus}
                                activeTab={activeTab} formatDate={formatDate} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── Note Row Component ─── */
function NoteRow({ note, editingId, editTitle, setEditTitle, editContent, setEditContent,
    editModule, setEditModule, editStatus, setEditStatus, editVersion, setEditVersion,
    startEdit, saveEdit, setEditingId, handleDelete, cycleStatus, activeTab, formatDate }) {

    const isEditing = editingId === note.id;
    const st = STATUS_LABELS[note.status] || STATUS_LABELS.IDEA;

    if (isEditing) {
        return (
            <div className="appnotes-row editing">
                <div className="appnotes-row-edit">
                    <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="appnotes-edit-title" autoFocus />
                    <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="appnotes-edit-content" placeholder="Açıklama..." rows={2} />
                    <div className="appnotes-edit-meta">
                        <select value={editModule} onChange={e => setEditModule(e.target.value)}>
                            <option value="">Modül</option>
                            {MODULES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                        </select>
                        <select value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
                        </select>
                        {activeTab === 'CHANGELOG' && (
                            <input value={editVersion} onChange={e => setEditVersion(e.target.value)} placeholder="v2.4" style={{ width: 70 }} />
                        )}
                        <button className="appnotes-edit-save" onClick={saveEdit}><Check size={14} /> Kaydet</button>
                        <button className="appnotes-edit-cancel" onClick={() => setEditingId(null)}><X size={14} /></button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="appnotes-row">
            <button className="appnotes-row-status" onClick={() => cycleStatus(note)} title={`${st.label} — tıkla değiştir`}>
                {st.emoji}
            </button>
            <div className="appnotes-row-body">
                <div className="appnotes-row-title">
                    {note.title}
                    {note.module && activeTab === 'WHATSNEXT' && (
                        <span className="appnotes-module-badge" style={{ background: getModuleColor(note.module) }}>
                            {getModuleLabel(note.module)}
                        </span>
                    )}
                </div>
                {note.content && <div className="appnotes-row-desc">{note.content}</div>}
            </div>
            <span className="appnotes-row-date">{formatDate(note.createdAt)}</span>
            <div className="appnotes-row-actions">
                <button onClick={() => startEdit(note)} title="Düzenle"><Edit2 size={13} /></button>
                <button onClick={() => handleDelete(note.id)} title="Sil"><Trash2 size={13} /></button>
            </div>
        </div>
    );
}

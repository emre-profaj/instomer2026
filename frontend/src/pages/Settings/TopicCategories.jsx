import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    getTopicCategories,
    createTopicCategory,
    updateTopicCategory,
    deleteTopicCategory,
    autoGenerateCategories,
    backfillConversations,
    mergeCategories,
    simplifyCategories,
    aiChatCategories
} from '../../services/topicCategory.api';
import './TopicCategories.css';

const TopicCategories = () => {
    const { currentWorkspace } = useAuth();
    const workspaceId = currentWorkspace?.id;
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [backfilling, setBackfilling] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [showAddForm, setShowAddForm] = useState(false);
    const [newCategory, setNewCategory] = useState({ name: '', description: '', icon: '', keywords: '' });
    const [statusMessage, setStatusMessage] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [searchFilter, setSearchFilter] = useState('');
    const [simplifying, setSimplifying] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const [chatHistory, setChatHistory] = useState([]);

    const handleAiChat = async () => {
        const msg = chatInput.trim();
        if (!msg) return;
        setChatHistory(prev => [...prev, { role: 'user', text: msg }]);
        setChatInput('');
        setChatLoading(true);
        try {
            const res = await aiChatCategories(workspaceId, msg);
            setChatHistory(prev => [...prev, { role: 'ai', reply: res.data.reply, changes: res.data.changes }]);
            if (res.data.changes?.length > 0) await fetchCategories();
        } catch (err) {
            setChatHistory(prev => [...prev, { role: 'ai', reply: `\u274c Hata: ${err.message}`, changes: [] }]);
        } finally {
            setChatLoading(false);
        }
    };

    const fetchCategories = useCallback(async () => {
        try {
            setLoading(true);
            const res = await getTopicCategories(workspaceId);
            setCategories(res.data);
        } catch (err) {
            console.error('Kategoriler yüklenemedi:', err);
        } finally {
            setLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    const handleAutoGenerate = async () => {
        if (!window.confirm('Bilgi bankası ve mevcut konuşmalardan otomatik kategoriler oluşturulacak. Devam etmek istiyor musunuz?')) return;
        try {
            setGenerating(true);
            setStatusMessage({ type: 'info', text: '🤖 AI kategorileri oluşturuyor... Bu birkaç dakika sürebilir.' });
            const res = await autoGenerateCategories(workspaceId);
            const errCount = res.data.errors?.length || 0;
            if (res.data.created > 0) {
                setStatusMessage({ type: 'success', text: `✅ ${res.data.created} yeni kategori oluşturuldu!` });
            } else if (errCount > 0) {
                setStatusMessage({ type: 'error', text: `❌ Kategoriler oluşturulamadı: ${res.data.errors[0]?.error || 'Bilinmeyen hata'}` });
            } else {
                setStatusMessage({ type: 'success', text: `✅ ${res.data.created} yeni kategori oluşturuldu! (${res.data.skipped} mevcut atlandı)` });
            }
            await fetchCategories();
        } catch (err) {
            setStatusMessage({ type: 'error', text: `❌ Hata: ${err.response?.data?.error || err.message}` });
        } finally {
            setGenerating(false);
        }
    };

    const handleBackfill = async () => {
        if (!window.confirm('Mevcut konuşmalar kategorilere eşleştirilecek. Devam?')) return;
        try {
            setBackfilling(true);
            setStatusMessage({ type: 'info', text: '🔄 Konuşmalar eşleştiriliyor...' });
            const res = await backfillConversations(workspaceId);
            setStatusMessage({
                type: 'success',
                text: `✅ ${res.data.matched} konuşma eşleştirildi. ${res.data.aiMatched || 0} AI ile eşleştirildi. ${res.data.newCategories || 0} yeni kategori oluşturuldu.`
            });
        } catch (err) {
            setStatusMessage({ type: 'error', text: `❌ Hata: ${err.response?.data?.error || err.message}` });
        } finally {
            setBackfilling(false);
            await fetchCategories();
        }
    };

    const handleSimplify = async () => {
        if (!window.confirm('AI benzer kategorileri otomatik birleştirecek. Devam?')) return;
        setSimplifying(true);
        setStatusMessage({ type: 'info', text: '🧠 AI kategorileri analiz ediyor...' });

        try {
            const token = localStorage.getItem('token');
            const baseUrl = import.meta.env.VITE_API_URL || '/api';
            const response = await fetch(`${baseUrl}/topic-categories/${workspaceId}/simplify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'progress') {
                            setStatusMessage({ type: 'info', text: data.message });
                        } else if (data.type === 'done') {
                            if (data.totalMerged > 0) {
                                setStatusMessage({ type: 'success', text: data.message });
                            } else {
                                setStatusMessage({ type: 'info', text: 'ℹ️ Sadeleştirilecek benzer kategori bulunamadı.' });
                            }
                        } else if (data.type === 'error') {
                            setStatusMessage({ type: 'error', text: `❌ ${data.message}` });
                        }
                    } catch (e) {}
                }
            }

            await fetchCategories();
        } catch (err) {
            setStatusMessage({ type: 'error', text: `❌ Hata: ${err.message}` });
        } finally {
            setSimplifying(false);
        }
    };

    const handleAdd = async () => {
        if (!newCategory.name.trim()) return;
        try {
            const keywords = newCategory.keywords
                ? newCategory.keywords.split(',').map(k => k.trim()).filter(Boolean)
                : [];
            await createTopicCategory(workspaceId, {
                name: newCategory.name.trim(),
                description: newCategory.description.trim() || null,
                icon: newCategory.icon || null,
                keywords
            });
            setNewCategory({ name: '', description: '', icon: '', keywords: '' });
            setShowAddForm(false);
            await fetchCategories();
        } catch (err) {
            alert('Hata: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleEdit = (cat) => {
        setEditingId(cat.id);
        setEditForm({
            name: cat.name,
            description: cat.description || '',
            icon: cat.icon || '',
            keywords: cat.keywords ? JSON.parse(cat.keywords).join(', ') : ''
        });
    };

    const handleSaveEdit = async (id) => {
        try {
            const keywords = editForm.keywords
                ? editForm.keywords.split(',').map(k => k.trim()).filter(Boolean)
                : [];
            await updateTopicCategory(workspaceId, id, {
                name: editForm.name,
                description: editForm.description || null,
                icon: editForm.icon || null,
                keywords
            });
            setEditingId(null);
            await fetchCategories();
        } catch (err) {
            alert('Hata: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`"${name}" kategorisini silmek istediğinize emin misiniz?`)) return;
        try {
            await deleteTopicCategory(workspaceId, id);
            await fetchCategories();
        } catch (err) {
            alert('Hata: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleToggleActive = async (id, currentActive) => {
        try {
            await updateTopicCategory(workspaceId, id, { isActive: !currentActive });
            await fetchCategories();
        } catch (err) {
            alert('Hata: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleMerge = async () => {
        if (selectedIds.size < 2) return;
        const ids = [...selectedIds];
        const targetName = window.prompt('Birleştirilen kategori adı:', '');
        if (!targetName) return;
        try {
            setStatusMessage({ type: 'info', text: '🔄 Kategoriler birleştiriliyor...' });
            const res = await mergeCategories(workspaceId, ids, targetName);
            setStatusMessage({ type: 'success', text: `✅ ${res.data.mergedCount} kategori birleştirildi. ${res.data.movedConversations} konuşma taşındı.` });
            setSelectedIds(new Set());
            await fetchCategories();
        } catch (err) {
            setStatusMessage({ type: 'error', text: `❌ Hata: ${err.response?.data?.error || err.message}` });
        }
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedIds(new Set(categories.map(c => c.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelectOne = (id, checked) => {
        const newSet = new Set(selectedIds);
        if (checked) {
            newSet.add(id);
        } else {
            newSet.delete(id);
        }
        setSelectedIds(newSet);
    };

    const totalConversations = categories.reduce((sum, c) => sum + (c._count?.conversations || 0), 0);

    return (
        <div className="topic-categories-page">
            <div className="tc-header">
                <div className="tc-header-left">
                    <h2>🏷️ Konu Kategorileri</h2>
                    <span className="tc-subtitle">
                        {categories.length} kategori · {totalConversations} konuşma eşleştirildi
                    </span>
                </div>
                <div className="tc-header-actions">
                    {selectedIds.size >= 2 && (
                        <button
                            className="tc-btn"
                            style={{ background: 'linear-gradient(45deg, #ff416c, #ff4b2b)', color: 'white', border: 'none' }}
                            onClick={handleMerge}
                        >
                            🔗 Birleştir ({selectedIds.size})
                        </button>
                    )}
                    <button
                        className="tc-btn tc-btn-secondary"
                        onClick={() => setShowAddForm(!showAddForm)}
                    >
                        + Elle Ekle
                    </button>
                    <button
                        className="tc-btn tc-btn-primary"
                        onClick={handleAutoGenerate}
                        disabled={generating}
                    >
                        {generating ? '⏳ Oluşturuluyor...' : '🤖 Otomatik Oluştur'}
                    </button>
                    <button
                        className="tc-btn tc-btn-outline"
                        onClick={handleBackfill}
                        disabled={backfilling || categories.length === 0}
                    >
                        {backfilling ? '⏳ Eşleştiriliyor...' : '🔄 Konuşmaları Eşleştir'}
                    </button>
                    <button
                        className="tc-btn"
                        style={{ background: 'linear-gradient(45deg, #8b5cf6, #6366f1)', color: 'white', border: 'none' }}
                        onClick={handleSimplify}
                        disabled={simplifying || categories.length < 3}
                    >
                        {simplifying ? '⏳ Sadeleştiriliyor...' : '🧠 AI ile Sadeleştir'}
                    </button>
                </div>
            </div>

            {/* Arama Filtresi */}
            {categories.length > 5 && (
                <div style={{ margin: '0 0 12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="🔍 Kategori ara..."
                        value={searchFilter}
                        onChange={e => setSearchFilter(e.target.value)}
                        className="tc-input"
                        style={{ maxWidth: 300, padding: '8px 12px', fontSize: '14px' }}
                    />
                    {searchFilter && (
                        <button
                            className="tc-btn tc-btn-secondary"
                            onClick={() => setSearchFilter('')}
                            style={{ padding: '8px 12px', fontSize: '13px' }}
                        >
                            ✕ Temizle
                        </button>
                    )}
                </div>
            )}

            {statusMessage && (
                <div className={`tc-status tc-status-${statusMessage.type}`}>
                    {statusMessage.text}
                    <button className="tc-status-close" onClick={() => setStatusMessage(null)}>×</button>
                </div>
            )}

            {showAddForm && (
                <div className="tc-add-form">
                    <h3>Yeni Kategori Ekle</h3>
                    <div className="tc-form-grid">
                        <div className="tc-form-field">
                            <label>İkon</label>
                            <input
                                type="text"
                                placeholder="🏥"
                                value={newCategory.icon}
                                onChange={e => setNewCategory({ ...newCategory, icon: e.target.value })}
                                className="tc-input tc-input-icon"
                            />
                        </div>
                        <div className="tc-form-field tc-form-field-wide">
                            <label>Kategori Adı *</label>
                            <input
                                type="text"
                                placeholder="Obezite Cerrahisi"
                                value={newCategory.name}
                                onChange={e => setNewCategory({ ...newCategory, name: e.target.value })}
                                className="tc-input"
                            />
                        </div>
                        <div className="tc-form-field tc-form-field-full">
                            <label>Açıklama</label>
                            <input
                                type="text"
                                placeholder="Obezite ameliyatı, tüp mide, sleeve gastrektomi talepleri"
                                value={newCategory.description}
                                onChange={e => setNewCategory({ ...newCategory, description: e.target.value })}
                                className="tc-input"
                            />
                        </div>
                        <div className="tc-form-field tc-form-field-full">
                            <label>Anahtar Kelimeler (virgülle ayırın)</label>
                            <input
                                type="text"
                                placeholder="obezite, mide küçültme, sleeve, tüp mide"
                                value={newCategory.keywords}
                                onChange={e => setNewCategory({ ...newCategory, keywords: e.target.value })}
                                className="tc-input"
                            />
                        </div>
                    </div>
                    <div className="tc-form-actions">
                        <button className="tc-btn tc-btn-secondary" onClick={() => setShowAddForm(false)}>İptal</button>
                        <button className="tc-btn tc-btn-primary" onClick={handleAdd} disabled={!newCategory.name.trim()}>Kaydet</button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="tc-loading">Yükleniyor...</div>
            ) : categories.length === 0 ? (
                <div className="tc-empty">
                    <div className="tc-empty-icon">🏷️</div>
                    <h3>Henüz kategori yok</h3>
                    <p>Bilgi bankası ve mevcut konuşmalarınızdan otomatik kategoriler oluşturun.</p>
                    <button className="tc-btn tc-btn-primary" onClick={handleAutoGenerate} disabled={generating}>
                        🤖 Otomatik Oluştur
                    </button>
                </div>
            ) : (
                <div className="tc-table-wrapper">
                    <table className="tc-table">
                        <thead>
                            <tr>
                                <th style={{ width: 40, textAlign: 'center' }}>
                                    <input 
                                        type="checkbox" 
                                        style={{ cursor: 'pointer' }}
                                        checked={categories.length > 0 && selectedIds.size === categories.length}
                                        onChange={handleSelectAll}
                                    />
                                </th>
                                <th style={{ width: 40 }}>#</th>
                                <th>Kategori</th>
                                <th>Açıklama</th>
                                <th>Anahtar Kelimeler</th>
                                <th style={{ width: 100 }}>Konuşma</th>
                                <th style={{ width: 80 }}>Aktif</th>
                                <th style={{ width: 120 }}>İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories
                                .filter(cat => {
                                    if (!searchFilter) return true;
                                    const q = searchFilter.toLowerCase();
                                    const name = (cat.name || '').toLowerCase();
                                    const desc = (cat.description || '').toLowerCase();
                                    const kws = cat.keywords ? JSON.parse(cat.keywords).join(' ').toLowerCase() : '';
                                    return name.includes(q) || desc.includes(q) || kws.includes(q);
                                })
                                .map((cat, idx) => (
                                <tr key={cat.id} className={!cat.isActive ? 'tc-row-disabled' : ''}>
                                    <td style={{ textAlign: 'center' }}>
                                        <input 
                                            type="checkbox" 
                                            style={{ cursor: 'pointer' }}
                                            checked={selectedIds.has(cat.id)}
                                            onChange={e => handleSelectOne(cat.id, e.target.checked)}
                                        />
                                    </td>
                                    <td className="tc-cell-num">{idx + 1}</td>
                                    <td>
                                        {editingId === cat.id ? (
                                            <div className="tc-inline-edit">
                                                <input
                                                    type="text"
                                                    value={editForm.icon}
                                                    onChange={e => setEditForm({ ...editForm, icon: e.target.value })}
                                                    className="tc-input tc-input-icon"
                                                    placeholder="🏥"
                                                />
                                                <input
                                                    type="text"
                                                    value={editForm.name}
                                                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                                    className="tc-input"
                                                />
                                            </div>
                                        ) : (
                                            <span className="tc-cat-name">
                                                {cat.icon && <span className="tc-cat-icon">{cat.icon}</span>}
                                                {cat.name}
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        {editingId === cat.id ? (
                                            <input
                                                type="text"
                                                value={editForm.description}
                                                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                                className="tc-input"
                                            />
                                        ) : (
                                            <span className="tc-description">{cat.description || '—'}</span>
                                        )}
                                    </td>
                                    <td>
                                        {editingId === cat.id ? (
                                            <input
                                                type="text"
                                                value={editForm.keywords}
                                                onChange={e => setEditForm({ ...editForm, keywords: e.target.value })}
                                                className="tc-input"
                                                placeholder="obezite, mide küçültme"
                                            />
                                        ) : (
                                            <div className="tc-keywords">
                                                {cat.keywords && JSON.parse(cat.keywords).slice(0, 4).map((kw, i) => (
                                                    <span key={i} className="tc-keyword-tag">{kw}</span>
                                                ))}
                                                {cat.keywords && JSON.parse(cat.keywords).length > 4 && (
                                                    <span className="tc-keyword-more">+{JSON.parse(cat.keywords).length - 4}</span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="tc-cell-count">
                                        <span className="tc-count-badge">{cat._count?.conversations || 0}</span>
                                    </td>
                                    <td>
                                        <button
                                            className={`tc-toggle ${cat.isActive ? 'tc-toggle-on' : 'tc-toggle-off'}`}
                                            onClick={() => handleToggleActive(cat.id, cat.isActive)}
                                        >
                                            {cat.isActive ? '✅' : '⬜'}
                                        </button>
                                    </td>
                                    <td>
                                        {editingId === cat.id ? (
                                            <div className="tc-row-actions">
                                                <button className="tc-btn-sm tc-btn-save" onClick={() => handleSaveEdit(cat.id)}>💾</button>
                                                <button className="tc-btn-sm tc-btn-cancel" onClick={() => setEditingId(null)}>✕</button>
                                            </div>
                                        ) : (
                                            <div className="tc-row-actions">
                                                <button className="tc-btn-sm tc-btn-edit" onClick={() => handleEdit(cat)}>✏️</button>
                                                <button className="tc-btn-sm tc-btn-delete" onClick={() => handleDelete(cat.id, cat.name)}>🗑️</button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {/* AI Sohbet Asistanı */}
            <div style={{
                marginTop: 20, padding: 16, background: 'linear-gradient(135deg, #f0f4ff, #e8f0fe)',
                borderRadius: 12, border: '1px solid #c7d2fe'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 20 }}>🤖</span>
                    <strong style={{ color: '#4338ca' }}>AI Kategori Asistanı</strong>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>— Doğal dille kategori yönet</span>
                </div>

                {chatHistory.length > 0 && (
                    <div style={{
                        maxHeight: 200, overflowY: 'auto', marginBottom: 10,
                        background: 'white', borderRadius: 8, padding: 10, fontSize: 13
                    }}>
                        {chatHistory.map((msg, i) => (
                            <div key={i} style={{
                                padding: '6px 0',
                                borderBottom: i < chatHistory.length - 1 ? '1px solid #f1f5f9' : 'none'
                            }}>
                                {msg.role === 'user' ? (
                                    <div style={{ color: '#1e40af' }}><strong>Sen:</strong> {msg.text}</div>
                                ) : (
                                    <div>
                                        {msg.reply && <div style={{ color: '#4b5563', marginBottom: 4 }}>🤖 {msg.reply}</div>}
                                        {msg.changes?.map((c, ci) => (
                                            <div key={ci} style={{ color: '#059669', paddingLeft: 8 }}>{c}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                    <input
                        type="text"
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !chatLoading && chatInput.trim() && handleAiChat()}
                        placeholder="Örn: 'bel fıtığını sinir cerrahisine taşı' veya 'üroloji kategorilerini birleştir'"
                        className="tc-input"
                        style={{ flex: 1, padding: '10px 14px', fontSize: 14 }}
                        disabled={chatLoading}
                    />
                    <button
                        className="tc-btn tc-btn-primary"
                        onClick={handleAiChat}
                        disabled={chatLoading || !chatInput.trim()}
                        style={{ whiteSpace: 'nowrap' }}
                    >
                        {chatLoading ? '⏳ İşleniyor...' : '🚀 Gönder'}
                    </button>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                    💡 Birleştir, taşı, yeni oluştur, yeniden adlandır, sil — doğal dille yaz
                </div>
            </div>
        </div>
    );
};

export default TopicCategories;

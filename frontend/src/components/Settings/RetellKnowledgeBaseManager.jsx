import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../services/api';
import {
    BookOpen, Plus, Trash2, Upload, RefreshCw, Loader,
    FileText, Link, AlertCircle, CheckCircle, FolderOpen, File
} from 'lucide-react';

const ACCEPTED_TYPES = '.txt,.md,.csv,.pdf,.docx,.doc';
const ACCEPTED_MIME = [
    'text/plain', 'text/markdown', 'text/csv',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
];
const FILE_ICONS = { pdf: '📄', docx: '📝', doc: '📝', csv: '📊', md: '📋', txt: '📃' };

const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1px solid #e5e7eb', fontSize: '0.88rem', background: '#fff',
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
};

function getFileIcon(name) {
    const ext = (name || '').split('.').pop().toLowerCase();
    return FILE_ICONS[ext] || '📄';
}

export function RetellKnowledgeBaseManager({ workspaceId }) {
    const [kbs, setKbs] = useState([]);
    const [selectedKb, setSelectedKb] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [newKbName, setNewKbName] = useState('');
    const [showNewKbForm, setShowNewKbForm] = useState(false);
    const [creatingKb, setCreatingKb] = useState(false);
    const [deletingKbId, setDeletingKbId] = useState(null);
    const [deletingSourceId, setDeletingSourceId] = useState(null);
    const [uploadType, setUploadType] = useState('file');
    const [textTitle, setTextTitle] = useState('');
    const [textContent, setTextContent] = useState('');
    const [urlValue, setUrlValue] = useState('');
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const fileInputRef = useRef(null);

    useEffect(() => { if (workspaceId) fetchKBs(); }, [workspaceId]);

    const showMsg = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 5000);
    };

    const fetchKBs = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/retell/${workspaceId}/knowledge-bases/retell`);
            const list = res.data.knowledgeBases || [];
            setKbs(list);
            if (selectedKb) {
                const updated = list.find(k => k.knowledge_base_id === selectedKb.knowledge_base_id);
                setSelectedKb(updated || null);
            }
        } catch (e) {
            showMsg(e.response?.data?.error || 'KB listesi alinamadi', 'error');
        } finally {
            setLoading(false);
        }
    };

    const createKB = async () => {
        if (!newKbName.trim()) return;
        setCreatingKb(true);
        try {
            await api.post(`/retell/${workspaceId}/knowledge-bases/retell`, { name: newKbName.trim() });
            showMsg('Knowledge Base olusturuldu');
            setNewKbName(''); setShowNewKbForm(false);
            await fetchKBs();
        } catch (e) {
            showMsg(e.response?.data?.error || 'KB olusturulamadi', 'error');
        } finally {
            setCreatingKb(false);
        }
    };

    const deleteKB = async (kbId) => {
        if (!window.confirm('Bu Knowledge Base silinecek. Emin misiniz?')) return;
        setDeletingKbId(kbId);
        try {
            await api.delete(`/retell/${workspaceId}/knowledge-bases/retell/${kbId}`);
            showMsg('Knowledge Base silindi');
            if (selectedKb?.knowledge_base_id === kbId) setSelectedKb(null);
            await fetchKBs();
        } catch (e) {
            showMsg(e.response?.data?.error || 'KB silinemedi', 'error');
        } finally {
            setDeletingKbId(null);
        }
    };

    const deleteSource = async (sourceId) => {
        if (!selectedKb) return;
        setDeletingSourceId(sourceId);
        try {
            await api.delete(`/retell/${workspaceId}/knowledge-bases/retell/${selectedKb.knowledge_base_id}/sources/${sourceId}`);
            showMsg('Kaynak silindi');
            await fetchKBs();
        } catch (e) {
            showMsg(e.response?.data?.error || 'Kaynak silinemedi', 'error');
        } finally {
            setDeletingSourceId(null);
        }
    };

    const doUploadFile = async (file) => {
        if (!file || !selectedKb) return;
        const ext = file.name.split('.').pop().toLowerCase();
        setUploading(true);
        setUploadProgress(`"${file.name}" isleniyor...`);
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await api.post(
                `/retell/${workspaceId}/knowledge-bases/retell/${selectedKb.knowledge_base_id}/upload`,
                form,
                { headers: { 'Content-Type': 'multipart/form-data' } }
            );
            const chars = res.data.chars;
            showMsg(`${file.name} yuklendi${chars ? ` (${Math.round(chars / 1000)}K karakter)` : ''}`);
            await fetchKBs();
        } catch (e) {
            showMsg(e.response?.data?.error || 'Dosya yuklenemedi', 'error');
        } finally {
            setUploading(false);
            setUploadProgress('');
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleFileInput = (e) => doUploadFile(e.target.files?.[0]);

    const handleDragOver = useCallback((e) => {
        e.preventDefault(); e.stopPropagation();
        if (selectedKb) setDragOver(true);
    }, [selectedKb]);

    const handleDragLeave = useCallback((e) => {
        e.preventDefault(); e.stopPropagation();
        setDragOver(false);
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault(); e.stopPropagation();
        setDragOver(false);
        if (!selectedKb) return;
        const file = e.dataTransfer.files?.[0];
        if (file) doUploadFile(file);
    }, [selectedKb]);

    const addTextOrUrl = async () => {
        if (!selectedKb) return;
        if (uploadType === 'text' && !textContent.trim()) return;
        if (uploadType === 'url' && !urlValue.trim()) return;
        setUploading(true);
        try {
            await api.post(`/retell/${workspaceId}/knowledge-bases/retell/${selectedKb.knowledge_base_id}/sources`, {
                type: uploadType,
                title: textTitle || (uploadType === 'url' ? urlValue : 'Metin'),
                text: uploadType === 'text' ? textContent : undefined,
                url: uploadType === 'url' ? urlValue : undefined,
            });
            showMsg('Kaynak eklendi');
            setTextTitle(''); setTextContent(''); setUrlValue('');
            await fetchKBs();
        } catch (e) {
            showMsg(e.response?.data?.error || 'Kaynak eklenemedi', 'error');
        } finally {
            setUploading(false);
        }
    };

    const formatDate = (ts) => ts ? new Date(ts).toLocaleDateString('tr-TR') : '';
    const getSourceIcon = (s) => s.type === 'url' ? <Link size={14} /> : <FileText size={14} />;
    const getSourceName = (s) => {
        if (s.type === 'url') return s.url || 'URL';
        return s.title || s.filename || s.source_id || 'Kaynak';
    };

    return (
        <div style={{ fontFamily: 'inherit' }}>
            {message && (
                <div style={{
                    padding: '10px 14px', borderRadius: 8, marginBottom: 14,
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem',
                    background: message.type === 'error' ? '#fef2f2' : '#f0fdf4',
                    color: message.type === 'error' ? '#991b1b' : '#065f46',
                    border: `1px solid ${message.type === 'error' ? '#fecaca' : '#a7f3d0'}`
                }}>
                    {message.type === 'error' ? <AlertCircle size={15} /> : <CheckCircle size={15} />}
                    {message.text}
                </div>
            )}

            <div style={{ display: 'flex', gap: 16, minHeight: 480 }}>
                {/* Sol: KB Listesi */}
                <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e1b4b' }}>Knowledge Bases</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={fetchKBs} disabled={loading} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4 }}>
                                <RefreshCw size={13} className={loading ? 'spin' : ''} />
                            </button>
                            <button onClick={() => setShowNewKbForm(v => !v)}
                                style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, border: '1px solid #6366f1', background: '#eef2ff', color: '#6366f1', cursor: 'pointer' }}>
                                <Plus size={11} /> Yeni
                            </button>
                        </div>
                    </div>
                    {showNewKbForm && (
                        <div style={{ display: 'flex', gap: 5, marginBottom: 4 }}>
                            <input value={newKbName} onChange={e => setNewKbName(e.target.value)} placeholder="KB adi..."
                                onKeyDown={e => e.key === 'Enter' && createKB()}
                                style={{ ...inputStyle, flex: 1, padding: '6px 8px', fontSize: '0.8rem' }} />
                            <button onClick={createKB} disabled={creatingKb || !newKbName.trim()}
                                style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}>
                                {creatingKb ? <Loader size={12} className="spin" /> : 'Oluştur'}
                            </button>
                        </div>
                    )}
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {loading && kbs.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: '0.8rem' }}>
                                <Loader size={16} className="spin" /><br />Yukleniyor...
                            </div>
                        ) : kbs.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: '0.8rem' }}>Henuz KB yok</div>
                        ) : kbs.map(kb => (
                            <div key={kb.knowledge_base_id} onClick={() => setSelectedKb(kb)}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s', background: selectedKb?.knowledge_base_id === kb.knowledge_base_id ? '#eef2ff' : '#f9fafb', border: `1px solid ${selectedKb?.knowledge_base_id === kb.knowledge_base_id ? '#a5b4fc' : '#e5e7eb'}` }}>
                                <FolderOpen size={14} color={selectedKb?.knowledge_base_id === kb.knowledge_base_id ? '#6366f1' : '#9ca3af'} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kb.knowledge_base_name}</div>
                                    <div style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{kb.sources?.length || 0} kaynak</div>
                                </div>
                                <button onClick={e => { e.stopPropagation(); deleteKB(kb.knowledge_base_id); }}
                                    disabled={deletingKbId === kb.knowledge_base_id}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2, flexShrink: 0 }}>
                                    {deletingKbId === kb.knowledge_base_id ? <Loader size={12} className="spin" /> : <Trash2 size={12} />}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Sag: KB Detay */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}
                    onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                    {!selectedKb ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.88rem', gap: 8, minHeight: 360 }}>
                            <BookOpen size={36} color="#d1d5db" />
                            <span>Duzenlemek icin bir Knowledge Base secin</span>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '1px solid #e5e7eb' }}>
                                <FolderOpen size={17} color="#6366f1" />
                                <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#111827' }}>{selectedKb.knowledge_base_name}</span>
                                <span style={{ fontSize: '0.7rem', color: '#9ca3af', background: '#f3f4f6', padding: '2px 8px', borderRadius: 20 }}>{selectedKb.knowledge_base_id.substring(0, 14)}...</span>
                            </div>

                            {/* Kaynak Listesi */}
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#374151', marginBottom: 8 }}>
                                    Kaynaklar ({selectedKb.sources?.length || 0})
                                </div>
                                {(!selectedKb.sources || selectedKb.sources.length === 0) ? (
                                    <div style={{ textAlign: 'center', padding: '24px', background: '#f9fafb', borderRadius: 10, border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '0.82rem' }}>
                                        Henuz kaynak yok. Asagidan ekleyin ya da dosya surukleleyin.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {selectedKb.sources.map(source => (
                                            <div key={source.source_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                                                <div style={{ color: '#6366f1', flexShrink: 0, fontSize: 18 }}>{source.type === 'url' ? '🔗' : getFileIcon(getSourceName(source))}</div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.83rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getSourceName(source)}</div>
                                                    <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{source.type}{source.created_at ? ` • ${formatDate(source.created_at)}` : ''}</div>
                                                </div>
                                                <button onClick={() => deleteSource(source.source_id)} disabled={deletingSourceId === source.source_id}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                                                    {deletingSourceId === source.source_id ? <Loader size={13} className="spin" /> : <Trash2 size={13} />}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Dosya Yukle Alani */}
                            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#374151', marginBottom: 8 }}>Kaynak Ekle</div>
                                {/* Tur secici */}
                                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                                    {[{ id: 'file', label: '📄 Dosya' }, { id: 'text', label: '📝 Metin' }, { id: 'url', label: '🔗 URL' }].map(t => (
                                        <button key={t.id} onClick={() => setUploadType(t.id)}
                                            style={{ padding: '4px 10px', borderRadius: 6, fontSize: '0.77rem', fontWeight: 600, cursor: 'pointer', border: uploadType === t.id ? '1px solid #6366f1' : '1px solid #e5e7eb', background: uploadType === t.id ? '#eef2ff' : '#f9fafb', color: uploadType === t.id ? '#4338ca' : '#6b7280' }}>
                                            {t.label}
                                        </button>
                                    ))}
                                </div>

                                {uploadType === 'file' && (
                                    <>
                                        <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} onChange={handleFileInput} style={{ display: 'none' }} />
                                        {/* Drag & Drop Zone */}
                                        <div
                                            onClick={() => !uploading && fileInputRef.current?.click()}
                                            style={{
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                gap: 8, padding: '20px 16px', borderRadius: 12,
                                                border: dragOver ? '2px solid #6366f1' : '2px dashed #c7d2fe',
                                                background: dragOver ? '#eef2ff' : uploading ? '#f9fafb' : '#faf5ff',
                                                cursor: uploading ? 'not-allowed' : 'pointer',
                                                transition: 'all 0.2s',
                                                boxSizing: 'border-box'
                                            }}>
                                            {uploading ? (
                                                <>
                                                    <Loader size={24} className="spin" color="#6366f1" />
                                                    <span style={{ fontSize: '0.83rem', color: '#6366f1', fontWeight: 600 }}>{uploadProgress || 'Yukleniyor...'}</span>
                                                </>
                                            ) : dragOver ? (
                                                <>
                                                    <Upload size={28} color="#6366f1" />
                                                    <span style={{ fontSize: '0.88rem', color: '#6366f1', fontWeight: 700 }}>Birak!</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Upload size={24} color="#818cf8" />
                                                    <span style={{ fontSize: '0.85rem', color: '#6366f1', fontWeight: 600 }}>Surukle & Birak veya Tikla</span>
                                                    <span style={{ fontSize: '0.73rem', color: '#9ca3af' }}>PDF, DOCX, TXT, MD, CSV — maks. 50MB</span>
                                                </>
                                            )}
                                        </div>
                                    </>
                                )}

                                {uploadType === 'text' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                        <input value={textTitle} onChange={e => setTextTitle(e.target.value)} placeholder="Baslik (istege bagli)" style={{ ...inputStyle, padding: '7px 10px', fontSize: '0.82rem' }} />
                                        <textarea value={textContent} onChange={e => setTextContent(e.target.value)} placeholder="Metin icerigi..." rows={4}
                                            style={{ ...inputStyle, resize: 'vertical', padding: '7px 10px', fontSize: '0.82rem' }} />
                                        <button onClick={addTextOrUrl} disabled={uploading || !textContent.trim()}
                                            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', opacity: !textContent.trim() ? 0.5 : 1, alignSelf: 'flex-end' }}>
                                            {uploading ? <Loader size={13} className="spin" /> : 'Ekle'}
                                        </button>
                                    </div>
                                )}

                                {uploadType === 'url' && (
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input value={urlValue} onChange={e => setUrlValue(e.target.value)} placeholder="https://..."
                                            onKeyDown={e => e.key === 'Enter' && addTextOrUrl()}
                                            style={{ ...inputStyle, flex: 1, padding: '7px 10px', fontSize: '0.82rem' }} />
                                        <button onClick={addTextOrUrl} disabled={uploading || !urlValue.trim()}
                                            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', opacity: !urlValue.trim() ? 0.5 : 1 }}>
                                            {uploading ? <Loader size={13} className="spin" /> : 'Ekle'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
    Bot, Save, Loader, RefreshCw, CheckCircle, AlertCircle,
    ChevronDown, ChevronRight, BookOpen, Zap, Settings, Link
} from 'lucide-react';

const API_BASE = '/api';

// ─── Agent Yönetimi Sekmesi ─────────────────────────────────────────────────
export function RetellAgentManager({ workspaceId }) {
    const [agents, setAgents] = useState([]);
    const [selectedAgentId, setSelectedAgentId] = useState('');
    const [agentDetail, setAgentDetail] = useState(null);
    const [llmDetail, setLlmDetail] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    // Editable fields
    const [prompt, setPrompt] = useState('');
    const [beginMsg, setBeginMsg] = useState('');
    const [agentName, setAgentName] = useState('');

    const isConvFlow = agentDetail?.response_engine?.type !== 'retell-llm';

    useEffect(() => {
        if (workspaceId) fetchAgents();
    }, [workspaceId]);

    const fetchAgents = async () => {
        try {
            const res = await axios.get(`${API_BASE}/retell/${workspaceId}/agents`);
            setAgents(res.data.agents || []);
        } catch (e) {
            console.error(e);
        }
    };

    const selectAgent = async (agentId) => {
        if (!agentId) { setAgentDetail(null); setLlmDetail(null); return; }
        setSelectedAgentId(agentId);
        setLoading(true);
        setMessage(null);
        try {
            const res = await axios.get(`${API_BASE}/retell/${workspaceId}/agents/${agentId}`);
            setAgentDetail(res.data.agent);
            setLlmDetail(res.data.llm);
            setAgentName(res.data.agent?.agent_name || '');
            setPrompt(res.data.llm?.general_prompt || '');
            setBeginMsg(res.data.llm?.begin_message || '');
        } catch (e) {
            setMessage({ type: 'error', text: 'Agent bilgisi alınamadı: ' + (e.response?.data?.error || e.message) });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedAgentId) return;
        setSaving(true);
        setMessage(null);
        try {
            const payload = { agentName };
            if (!isConvFlow) {
                payload.generalPrompt = prompt;
                payload.beginMessage = beginMsg;
            }
            await axios.patch(`${API_BASE}/retell/${workspaceId}/agents/${selectedAgentId}/prompt`, payload);
            setMessage({ type: 'success', text: '✅ Agent Retell\'e başarıyla kaydedildi!' });
        } catch (e) {
            setMessage({ type: 'error', text: e.response?.data?.error || 'Kayıt başarısız' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            {/* Agent Seçici */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
                <select
                    value={selectedAgentId}
                    onChange={e => selectAgent(e.target.value)}
                    style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.87rem', background: '#fff' }}
                >
                    <option value="">— Agent Seçin —</option>
                    {agents.map(a => (
                        <option key={a.agent_id} value={a.agent_id}>
                            {a.agent_name || a.agent_id}
                        </option>
                    ))}
                </select>
                <button
                    onClick={fetchAgents}
                    style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: '#6b7280', fontSize: '0.82rem' }}
                >
                    <RefreshCw size={14} /> Yenile
                </button>
            </div>

            {loading && (
                <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>
                    <Loader size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                    <p style={{ margin: 0 }}>Agent bilgisi yükleniyor...</p>
                </div>
            )}

            {message && (
                <div style={{
                    padding: '10px 14px', borderRadius: 8, marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem',
                    background: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
                    color: message.type === 'success' ? '#065f46' : '#991b1b',
                    border: `1px solid ${message.type === 'success' ? '#a7f3d0' : '#fecaca'}`
                }}>
                    {message.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                    {message.text}
                </div>
            )}

            {agentDetail && !loading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Agent meta bilgisi */}
                    <div style={{ background: '#f8faff', border: '1px solid #e0e7ff', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agent ID</div>
                            <code style={{ fontSize: '0.8rem', color: '#374151' }}>{agentDetail.agent_id}</code>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tip</div>
                            <span style={{
                                fontSize: '0.78rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                                background: isConvFlow ? '#fef9c3' : '#ecfdf5',
                                color: isConvFlow ? '#854d0e' : '#065f46'
                            }}>
                                {isConvFlow ? 'Conversation Flow' : 'Retell LLM'}
                            </span>
                        </div>
                        {agentDetail.voice_id && (
                            <div>
                                <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ses</div>
                                <span style={{ fontSize: '0.82rem', color: '#374151' }}>{agentDetail.voice_id}</span>
                            </div>
                        )}
                        {agentDetail.knowledge_base_ids?.length > 0 && (
                            <div>
                                <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bağlı KB</div>
                                <span style={{ fontSize: '0.78rem', background: '#ede9fe', color: '#5b21b6', padding: '2px 8px', borderRadius: 6 }}>
                                    {agentDetail.knowledge_base_ids.length} adet
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Agent Adı */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Agent Adı</label>
                        <input
                            value={agentName}
                            onChange={e => setAgentName(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.87rem', boxSizing: 'border-box' }}
                        />
                    </div>

                    {/* Prompt Editörü */}
                    {isConvFlow ? (
                        <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', fontSize: '0.82rem', color: '#92400e' }}>
                            ⚠️ Bu agent <strong>Conversation Flow</strong> kullanıyor. Prompt düzenleme desteklenmiyor — sadece Agent Adı değiştirilebilir. Prompt'u Retell Dashboard'dan düzenleyin.
                        </div>
                    ) : (
                        <>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                                    Açılış Mesajı <span style={{ fontWeight: 400, color: '#9ca3af' }}>(Agent aramayı açtığında ilk söylediği)</span>
                                </label>
                                <input
                                    value={beginMsg}
                                    onChange={e => setBeginMsg(e.target.value)}
                                    placeholder="Merhaba, Özel Sağlık Hastanesi. Size nasıl yardımcı olabilirim?"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.87rem', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                                    Sistem Prompt'u <span style={{ fontWeight: 400, color: '#9ca3af' }}>(Agent'ın davranış kuralları)</span>
                                </label>
                                <textarea
                                    value={prompt}
                                    onChange={e => setPrompt(e.target.value)}
                                    rows={14}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box', resize: 'vertical' }}
                                    placeholder="Sen Özel Sağlık Hastanesi'nin telefon asistanısın. Görevin..."
                                />
                                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 4 }}>
                                    {prompt.length} karakter — Retell'e kaydettiğinizde anında aktif olur.
                                </div>
                            </div>
                        </>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px',
                                background: saving ? '#9ca3af' : '#6366f1', color: '#fff', border: 'none',
                                borderRadius: 8, fontSize: '0.9rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {saving ? <Loader size={16} className="spin" /> : <Save size={16} />}
                            {saving ? 'Retell\'e Gönderiliyor...' : 'Retell\'e Kaydet'}
                        </button>
                    </div>
                </div>
            )}

            {!agentDetail && !loading && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
                    <Bot size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                    <p style={{ margin: 0 }}>Düzenlemek için bir agent seçin</p>
                </div>
            )}
        </div>
    );
}

// ─── Bilgi Bankası Sync Sekmesi ──────────────────────────────────────────────
export function RetellKnowledgeBaseSync({ workspaceId }) {
    const [instomerKbs, setInstomerKbs] = useState([]);
    const [retellKbs, setRetellKbs] = useState([]);
    const [syncedKbId, setSyncedKbId] = useState(null);
    const [agents, setAgents] = useState([]);
    const [selectedAgentId, setSelectedAgentId] = useState('');
    const [selectedKbIds, setSelectedKbIds] = useState([]);
    const [syncing, setSyncing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState(null);
    const [lastSynced, setLastSynced] = useState(null);

    useEffect(() => {
        if (workspaceId) loadAll();
    }, [workspaceId]);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [kbRes, retellKbRes, agentRes] = await Promise.all([
                axios.get(`${API_BASE}/ai/${workspaceId}/knowledge-bases`).catch(() => ({ data: { knowledgeBases: [] } })),
                axios.get(`${API_BASE}/retell/${workspaceId}/knowledge-bases`).catch(() => ({ data: { knowledgeBases: [], syncedKbId: null } })),
                axios.get(`${API_BASE}/retell/${workspaceId}/agents`).catch(() => ({ data: { agents: [] } }))
            ]);
            const kbs = kbRes.data.knowledgeBases || kbRes.data || [];
            setInstomerKbs(Array.isArray(kbs) ? kbs : []);
            setRetellKbs(retellKbRes.data.knowledgeBases || []);
            setSyncedKbId(retellKbRes.data.syncedKbId);
            setAgents(agentRes.data.agents || []);
            // Varsayılan olarak tüm KB'leri seç
            if (kbs.length > 0) setSelectedKbIds(kbs.map(k => k.id));
        } catch (e) {
            console.error('loadAll error:', e);
        } finally {
            setLoading(false);
        }
    };

    const toggleKb = (id) => {
        setSelectedKbIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleSync = async () => {
        if (selectedKbIds.length === 0) {
            setMessage({ type: 'error', text: 'En az bir bilgi bankası seçin' });
            return;
        }
        setSyncing(true);
        setMessage(null);
        try {
            const res = await axios.post(`${API_BASE}/retell/${workspaceId}/knowledge-bases/sync`, {
                agentId: selectedAgentId || undefined,
                instomerKbIds: selectedKbIds
            });
            setSyncedKbId(res.data.knowledgeBaseId);
            setLastSynced(new Date());
            setMessage({
                type: 'success',
                text: res.data.message
            });
            loadAll();
        } catch (e) {
            setMessage({ type: 'error', text: e.response?.data?.error || 'Sync başarısız' });
        } finally {
            setSyncing(false);
        }
    };

    if (loading) return (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
            <Loader size={20} className="spin" /> Yükleniyor...
        </div>
    );

    const syncedKbInfo = retellKbs.find(k => k.knowledge_base_id === syncedKbId);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {message && (
                <div style={{
                    padding: '10px 14px', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem',
                    background: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
                    color: message.type === 'success' ? '#065f46' : '#991b1b',
                    border: `1px solid ${message.type === 'success' ? '#a7f3d0' : '#fecaca'}`
                }}>
                    {message.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                    {message.text}
                </div>
            )}

            {/* Sync durumu */}
            {syncedKbId && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
                    <CheckCircle size={18} style={{ color: '#16a34a', flexShrink: 0 }} />
                    <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#166534' }}>Retell KB Bağlı</div>
                        <code style={{ fontSize: '0.78rem', color: '#6b7280' }}>{syncedKbId}</code>
                        {syncedKbInfo && <span style={{ fontSize: '0.78rem', color: '#6b7280', marginLeft: 8 }}>— {syncedKbInfo.knowledge_base_name}</span>}
                        {lastSynced && <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 }}>Son sync: {lastSynced.toLocaleString('tr-TR')}</div>}
                    </div>
                </div>
            )}

            {/* Instomer KB Seçimi */}
            <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BookOpen size={15} style={{ color: '#6366f1' }} />
                    Instomer Bilgi Bankalarım
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 400 }}>— Retell'e gönderilecekleri seçin</span>
                </div>
                {instomerKbs.length === 0 ? (
                    <div style={{ padding: '20px 16px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, fontSize: '0.82rem', color: '#92400e' }}>
                        ⚠️ Henüz bilgi bankası oluşturulmamış. <strong>Bilgi Bankası</strong> sayfasından ekleyebilirsiniz.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {instomerKbs.map(kb => (
                            <label key={kb.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                                background: selectedKbIds.includes(kb.id) ? '#f5f3ff' : '#f9fafb',
                                border: `1.5px solid ${selectedKbIds.includes(kb.id) ? '#c4b5fd' : '#e5e7eb'}`,
                                borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={selectedKbIds.includes(kb.id)}
                                    onChange={() => toggleKb(kb.id)}
                                    style={{ width: 15, height: 15 }}
                                />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.87rem', fontWeight: 600, color: '#1f2937' }}>{kb.title || kb.name || 'İsimsiz KB'}</div>
                                    {kb.description && <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{kb.description}</div>}
                                    {kb._count?.entries !== undefined && (
                                        <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{kb._count.entries} giriş</div>
                                    )}
                                </div>
                            </label>
                        ))}
                    </div>
                )}
            </div>

            {/* Agent Seçimi */}
            <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Link size={15} style={{ color: '#6366f1' }} />
                    Hangi Agent'a Bağlansın?
                </div>
                <select
                    value={selectedAgentId}
                    onChange={e => setSelectedAgentId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.87rem', background: '#fff' }}
                >
                    <option value="">— Varsayılan Agent (Retell ayarlarından) —</option>
                    {agents.map(a => (
                        <option key={a.agent_id} value={a.agent_id}>
                            {a.agent_name || a.agent_id}
                        </option>
                    ))}
                </select>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>
                    Boş bırakırsanız Retell Genel Ayarları'ndaki varsayılan agent kullanılır.
                </div>
            </div>

            {/* Sync Butonu */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
                <button
                    onClick={handleSync}
                    disabled={syncing || selectedKbIds.length === 0}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '11px 24px',
                        background: syncing ? '#9ca3af' : '#6366f1', color: '#fff', border: 'none',
                        borderRadius: 8, fontSize: '0.9rem', fontWeight: 600,
                        cursor: (syncing || selectedKbIds.length === 0) ? 'not-allowed' : 'pointer'
                    }}
                >
                    {syncing ? <Loader size={16} className="spin" /> : <RefreshCw size={16} />}
                    {syncing ? 'Retell\'e Gönderiliyor...' : `${selectedKbIds.length} KB'yi Retell'e Sync Et`}
                </button>
            </div>

            {/* Retell'deki tüm KB'ler */}
            {retellKbs.length > 0 && (
                <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Retell'deki Mevcut KB'ler
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {retellKbs.map(kb => (
                            <div key={kb.knowledge_base_id} style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                                background: kb.knowledge_base_id === syncedKbId ? '#f0fdf4' : '#f9fafb',
                                border: `1px solid ${kb.knowledge_base_id === syncedKbId ? '#bbf7d0' : '#e5e7eb'}`,
                                borderRadius: 6, fontSize: '0.82rem'
                            }}>
                                {kb.knowledge_base_id === syncedKbId && <CheckCircle size={13} style={{ color: '#16a34a', flexShrink: 0 }} />}
                                <span style={{ fontWeight: 500 }}>{kb.knowledge_base_name}</span>
                                <code style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: 'auto' }}>{kb.knowledge_base_id}</code>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

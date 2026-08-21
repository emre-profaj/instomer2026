import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';
import {
    Bot, Save, Loader, RefreshCw, CheckCircle, AlertCircle,
    ChevronDown, ChevronRight, BookOpen, Zap, Settings, Link,
    Play, Pause, Volume2
} from 'lucide-react';

const API_BASE = '/api';

// ─── Agent Yönetimi Sekmesi ─────────────────────────────────────────────────
export function RetellAgentManager({ workspaceId }) {
    const [agents, setAgents] = useState([]);
    const [wsSettings, setWsSettings] = useState(null);
    const [agentConfig, setAgentConfig] = useState({
        businessHourStart: 10,
        businessHourEnd: 21,
        callDelayMinutes: 15,
        fallbackToAi: true,
        fallbackDelayMinutes: 3,
        handlePool: false,
        handleUnassigned: false,
        handleTeamFallback: true,
        maxOverdueDays: 3
    });
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

    // Voice selection
    const [voices, setVoices] = useState([]);
    const [voiceId, setVoiceId] = useState('');
    const [voicesLoading, setVoicesLoading] = useState(false);
    const [playingVoiceId, setPlayingVoiceId] = useState(null);
    const audioRef = useRef(null);

    // Language selection
    const [language, setLanguage] = useState('tr-TR');

    // Behavior settings
    const [showBehavior, setShowBehavior] = useState(false);
    const [responsiveness, setResponsiveness] = useState(0.5);
    const [interruptionSensitivity, setInterruptionSensitivity] = useState(0.5);
    const [enableBackchannel, setEnableBackchannel] = useState(false);
    const [ambientSound, setAmbientSound] = useState('');
    const [endCallAfterSilenceMs, setEndCallAfterSilenceMs] = useState('');
    const [boostedKeywords, setBoostedKeywords] = useState('');

    const isConvFlow = agentDetail?.response_engine?.type !== 'retell-llm';

    const LANGUAGE_OPTIONS = [
        { value: 'tr-TR', label: 'Türkçe' },
        { value: 'en-US', label: 'İngilizce (ABD)' },
        { value: 'en-GB', label: 'İngilizce (İngiltere)' },
        { value: 'de-DE', label: 'Almanca' },
        { value: 'fr-FR', label: 'Fransızca' },
        { value: 'ar-SA', label: 'Arapça' },
        { value: 'multi', label: 'Çok Dilli' }
    ];

    const AMBIENT_SOUND_OPTIONS = [
        { value: '', label: 'Yok' },
        { value: 'coffee-shop', label: '☕ Kafe' },
        { value: 'convention-hall', label: '🏛️ Konferans Salonu' },
        { value: 'summer-outdoor', label: '🌿 Yaz Dış Mekan' },
        { value: 'call-center', label: '📞 Çağrı Merkezi' }
    ];

    useEffect(() => {
        if (workspaceId) {
            fetchAgents();
            fetchVoices();
        }
    }, [workspaceId]);

    const fetchAgents = async () => {
        try {
            const resSettings = await api.get(`/retell/${workspaceId}/settings`);
            setWsSettings(resSettings.data);
        } catch (e) {
            console.error('Settings fetch error', e);
        }

        try {
            const res = await api.get(`/retell/${workspaceId}/agents`);
            setAgents(res.data.agents || []);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchVoices = async () => {
        setVoicesLoading(true);
        try {
            const res = await api.get(`/retell/${workspaceId}/voices`);
            setVoices(res.data.voices || res.data || []);
        } catch (e) {
            console.error('Error fetching voices:', e);
            setVoices([]);
        } finally {
            setVoicesLoading(false);
        }
    };

    const selectAgent = async (agentId) => {
        if (!agentId) { setAgentDetail(null); setLlmDetail(null); return; }
        setSelectedAgentId(agentId);
        setLoading(true);
        setMessage(null);
        try {
            const res = await api.get(`/retell/${workspaceId}/agents/${agentId}`);
            const agent = res.data.agent;
            setAgentDetail(agent);
            setLlmDetail(res.data.llm);
            setAgentName(agent?.agent_name || '');
            setPrompt(res.data.llm?.general_prompt || '');
            setBeginMsg(res.data.llm?.begin_message || '');
            // Voice & language
            setVoiceId(agent?.voice_id || '');
            setLanguage(agent?.language || 'tr-TR');
            // Behavior
            setResponsiveness(agent?.responsiveness ?? 0.5);
            setInterruptionSensitivity(agent?.interruption_sensitivity ?? 0.5);
            setEnableBackchannel(agent?.enable_backchannel ?? false);
            setAmbientSound(agent?.ambient_sound || '');
            setEndCallAfterSilenceMs(agent?.end_call_after_silence_ms || '');
            setBoostedKeywords((agent?.boosted_keywords || []).join(', '));
        } catch (e) {
            setMessage({ type: 'error', text: 'Agent bilgisi alınamadı: ' + (e.response?.data?.error || e.message) });
        } finally {
            setLoading(false);
        }
    };

    const handlePlayVoice = (voice) => {
        const url = voice.preview_audio_url;
        if (!url) return;

        if (playingVoiceId === voice.voice_id) {
            // Stop
            if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
            setPlayingVoiceId(null);
            return;
        }
        // Stop previous
        if (audioRef.current) { audioRef.current.pause(); }
        const audio = new Audio(url);
        audioRef.current = audio;
        setPlayingVoiceId(voice.voice_id);
        audio.play().catch(() => {});
        audio.onended = () => { setPlayingVoiceId(null); audioRef.current = null; };
    };

    // Group voices: Turkish first, then English, then Other
    const groupedVoices = () => {
        const turkish = [];
        const english = [];
        const other = [];
        voices.forEach(v => {
            const lang = (v.language || v.accent || '').toLowerCase();
            if (lang.includes('tr') || lang.includes('turk')) {
                turkish.push(v);
            } else if (lang.includes('en') || lang.includes('eng')) {
                english.push(v);
            } else {
                other.push(v);
            }
        });
        return { turkish, english, other };
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
            // Voice & language
            payload.voiceId = voiceId;
            payload.language = language;
            // Behavior
            payload.responsiveness = responsiveness;
            payload.interruptionSensitivity = interruptionSensitivity;
            payload.enableBackchannel = enableBackchannel;
            payload.ambientSound = ambientSound;
            payload.endCallAfterSilenceMs = endCallAfterSilenceMs ? Number(endCallAfterSilenceMs) : undefined;
            payload.boostedKeywords = boostedKeywords ? boostedKeywords.split(',').map(k => k.trim()).filter(Boolean) : undefined;

            await api.patch(`/retell/${workspaceId}/agents/${selectedAgentId}/prompt`, payload);
            
            // Ayrıca Workspace Settings'e bu Agent'in konfigürasyonunu (arama gecikmesi vb.) kaydet
            if (wsSettings) {
                const triggers = wsSettings.retellAutoCallTriggers || {};
                const agentConfigs = triggers.agentConfigs || {};
                
                agentConfigs[selectedAgentId] = agentConfig;
                
                await api.post(`/retell/${workspaceId}/settings`, {
                    retellAutoCallTriggers: { ...triggers, agentConfigs }
                });
                
                // State'i güncelle
                setWsSettings(prev => ({
                    ...prev,
                    retellAutoCallTriggers: { ...triggers, agentConfigs }
                }));
            }
            
            setMessage({ type: 'success', text: '✅ Agent ve arama kuralları başarıyla kaydedildi!' });
        } catch (e) {
            setMessage({ type: 'error', text: e.response?.data?.error || 'Kayıt başarısız' });
        } finally {
            setSaving(false);
        }
    };

    // Slider component
    const SliderField = ({ label, value, onChange, min = 0, max = 1, step = 0.1, hint }) => (
        <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>{label}</label>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6366f1', background: '#eef2ff', padding: '1px 8px', borderRadius: 6 }}>{value}</span>
            </div>
            <input
                type="range"
                min={min} max={max} step={step}
                value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#6366f1' }}
            />
            {hint && <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 }}>{hint}</div>}
        </div>
    );

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
                                {isConvFlow ? 'Conversation Flow' : 'AI LLM'}
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

                    {/* ─── Ses Seçimi ──────────────────────────────────────────── */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                            <Volume2 size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                            Ses Seçimi
                        </label>
                        {voicesLoading ? (
                            <div style={{ padding: '8px 0', fontSize: '0.82rem', color: '#9ca3af' }}>
                                <Loader size={14} className="spin" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                                Sesler yükleniyor...
                            </div>
                        ) : voices.length === 0 ? (
                            <div style={{ padding: '10px 14px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, fontSize: '0.82rem', color: '#92400e' }}>
                                Ses listesi yüklenemedi veya boş.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <select
                                    value={voiceId}
                                    onChange={e => setVoiceId(e.target.value)}
                                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem', background: '#fff' }}
                                >
                                    <option value="">— Ses Seçin —</option>
                                    {(() => {
                                        const { turkish, english, other } = groupedVoices();
                                        return (
                                            <>
                                                {turkish.length > 0 && (
                                                    <optgroup label="🇹🇷 Türkçe">
                                                        {turkish.map(v => (
                                                            <option key={v.voice_id} value={v.voice_id}>
                                                                {v.gender === 'female' ? '♀' : '♂'} {v.voice_name || v.voice_id}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                                {english.length > 0 && (
                                                    <optgroup label="🇬🇧 English">
                                                        {english.map(v => (
                                                            <option key={v.voice_id} value={v.voice_id}>
                                                                {v.gender === 'female' ? '♀' : '♂'} {v.voice_name || v.voice_id}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                                {other.length > 0 && (
                                                    <optgroup label="🌍 Diğer">
                                                        {other.map(v => (
                                                            <option key={v.voice_id} value={v.voice_id}>
                                                                {v.gender === 'female' ? '♀' : '♂'} {v.voice_name || v.voice_id}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                            </>
                                        );
                                    })()}
                                </select>
                                {/* Play preview button */}
                                {voiceId && (() => {
                                    const selectedVoice = voices.find(v => v.voice_id === voiceId);
                                    if (!selectedVoice?.preview_audio_url) return null;
                                    return (
                                        <button
                                            onClick={() => handlePlayVoice(selectedVoice)}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                width: 36, height: 36, borderRadius: 8, border: '1px solid #e5e7eb',
                                                background: playingVoiceId === voiceId ? '#eef2ff' : '#fff',
                                                cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s'
                                            }}
                                            title="Sesi Dinle"
                                        >
                                            {playingVoiceId === voiceId
                                                ? <Pause size={14} style={{ color: '#6366f1' }} />
                                                : <Play size={14} style={{ color: '#6366f1' }} />
                                            }
                                        </button>
                                    );
                                })()}
                            </div>
                        )}
                    </div>

                    {/* ─── Dil Seçimi ──────────────────────────────────────────── */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Dil</label>
                        <select
                            value={language}
                            onChange={e => setLanguage(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.87rem', background: '#fff', boxSizing: 'border-box' }}
                        >
                            {LANGUAGE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Prompt Editörü */}
                    {isConvFlow ? (
                        <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', fontSize: '0.82rem', color: '#92400e' }}>
                            ⚠️ Bu agent <strong>Conversation Flow</strong> kullanıyor. Prompt düzenleme desteklenmiyor — sadece Agent Adı değiştirilebilir. Prompt'u Dashboard'dan düzenleyin.
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
                                    Bilgi Bankası Metni <span style={{ fontWeight: 400, color: '#9ca3af' }}>(Agent'ın davranış kuralları ve prompt bilgileri)</span>
                                </label>
                                <textarea
                                    value={prompt}
                                    onChange={e => setPrompt(e.target.value)}
                                    rows={14}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box', resize: 'vertical' }}
                                    placeholder="Sen Özel Sağlık Hastanesi'nin telefon asistanısın. Görevin..."
                                />
                                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 4 }}>
                                    {prompt.length} karakter — kaydettiğinizde anında aktif olur.
                                </div>
                                {/* Dynamic Variables Guide */}
                                <details style={{ marginTop: 8, fontSize: '0.78rem', color: '#6b7280' }}>
                                    <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#6366f1', userSelect: 'none' }}>
                                        🏷️ Dinamik Değişkenler — Prompt'ta kullanılabilir
                                    </summary>
                                    <div style={{ marginTop: 6, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e5e7eb', lineHeight: 1.8 }}>
                                        <div style={{ marginBottom: 4, fontWeight: 600, color: '#374151' }}>Arama başlatılırken otomatik doldurulur:</div>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{customer_name}}'}</code> — Müşteri adı<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{interest_topic}}'}</code> — İlgilendiği konu (form/sınıflandırma)<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{company_name}}'}</code> — Şirket/klinik adı<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{customer_email}}'}</code> — Müşteri e-posta<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{customer_tags}}'}</code> — Müşteri etiketleri<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{lead_source}}'}</code> — Lead kaynağı (WhatsApp, Form vb.)<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{form_data}}'}</code> — Form verileri özeti<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{last_customer_message}}'}</code> — Son müşteri mesajı<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{contact_channel}}'}</code> — İletişim kanalı<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{classification}}'}</code> — AI sınıflandırma sonucu<br/>
                                        <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#9ca3af' }}>
                                            💡 Örnek: "Merhaba {'{{customer_name}}'}, {'{{interest_topic}}'} hakkında bilgi almak istemiştiniz..."
                                        </div>
                                    </div>
                                </details>
                            </div>
                        </>
                    )}

                    {/* ─── Davranış Ayarları (Expandable) ─────────────────────── */}
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                        <button
                            onClick={() => setShowBehavior(!showBehavior)}
                            style={{
                                width: '100%', padding: '12px 16px', background: showBehavior ? '#f8faff' : '#f9fafb',
                                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                                fontSize: '0.85rem', fontWeight: 600, color: '#374151', transition: 'background 0.15s'
                            }}
                        >
                            <Settings size={15} style={{ color: '#6366f1' }} />
                            Davranış Ayarları
                            {showBehavior ? <ChevronDown size={15} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={15} style={{ marginLeft: 'auto' }} />}
                        </button>

                        {showBehavior && (
                            <div style={{ padding: '16px 16px 8px', borderTop: '1px solid #e5e7eb' }}>

                                {/* Responsiveness */}
                                <SliderField
                                    label="Yanıt Hızı"
                                    value={responsiveness}
                                    onChange={setResponsiveness}
                                    hint="Düşük = daha sabırlı bekler, Yüksek = hızlı yanıt verir"
                                />

                                {/* Interruption Sensitivity */}
                                <SliderField
                                    label="Kesme Hassasiyeti"
                                    value={interruptionSensitivity}
                                    onChange={setInterruptionSensitivity}
                                    hint="Düşük = kolay kesilmez, Yüksek = müşteri sözünü kolayca kesebilir"
                                />

                                {/* Backchannel Toggle */}
                                <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>Ara Onaylama (hmm, evet)</div>
                                        <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Dinlerken küçük onay sesleri çıkarır</div>
                                    </div>
                                    <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0 }}>
                                        <input
                                            type="checkbox"
                                            checked={enableBackchannel}
                                            onChange={e => setEnableBackchannel(e.target.checked)}
                                            style={{ opacity: 0, width: 0, height: 0 }}
                                        />
                                        <span style={{
                                            position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                            backgroundColor: enableBackchannel ? '#6366f1' : '#d1d5db',
                                            borderRadius: 24, transition: 'all 0.2s'
                                        }}>
                                            <span style={{
                                                position: 'absolute', content: '""', height: 18, width: 18,
                                                left: enableBackchannel ? 22 : 3, bottom: 3,
                                                backgroundColor: 'white', borderRadius: '50%', transition: 'all 0.2s',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                                            }} />
                                        </span>
                                    </label>
                                </div>

                                {/* Ambient Sound */}
                                <div style={{ marginBottom: 14 }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Arka Plan Sesi</label>
                                    <select
                                        value={ambientSound}
                                        onChange={e => setAmbientSound(e.target.value)}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem', background: '#fff', boxSizing: 'border-box' }}
                                    >
                                        {AMBIENT_SOUND_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* End Call After Silence */}
                                <div style={{ marginBottom: 14 }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                                        Sessizlikte Kapat (ms)
                                    </label>
                                    <input
                                        type="number"
                                        value={endCallAfterSilenceMs}
                                        onChange={e => setEndCallAfterSilenceMs(e.target.value)}
                                        placeholder="ör: 30000 (30 saniye)"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                    />
                                    <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 3 }}>
                                        Belirtilen süre boyunca sessizlik olursa arama otomatik sonlandırılır. Boş bırakırsanız devre dışı kalır.
                                    </div>
                                </div>

                                {/* Boosted Keywords */}
                                <div style={{ marginBottom: 8 }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                                        Vurgulanan Kelimeler
                                    </label>
                                    <input
                                        type="text"
                                        value={boostedKeywords}
                                        onChange={e => setBoostedKeywords(e.target.value)}
                                        placeholder="randevu, doktor, ameliyat, sigorta"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                    />
                                    <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 3 }}>
                                        Virgülle ayırarak yazın. Bu kelimeler ses tanıma sırasında önceliklendirilir.
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

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
                            {saving ? 'Kaydediliyor...' : 'Kaydet'}
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
    const [retellKbs, setRetellKbs] = useState([]);
    const [syncedKbId, setSyncedKbId] = useState(null);
    const [syncedKbText, setSyncedKbText] = useState('');
    const [agents, setAgents] = useState([]);
    const [selectedAgentId, setSelectedAgentId] = useState('');
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
            const [retellKbRes, agentRes] = await Promise.all([
                api.get(`/retell/${workspaceId}/knowledge-bases`).catch(() => ({ data: { knowledgeBases: [], syncedKbId: null, syncedKbText: '' } })),
                api.get(`/retell/${workspaceId}/agents`).catch(() => ({ data: { agents: [] } }))
            ]);
            setRetellKbs(retellKbRes.data.knowledgeBases || []);
            setSyncedKbId(retellKbRes.data.syncedKbId);
            setSyncedKbText(retellKbRes.data.syncedKbText || '');
            setAgents(agentRes.data.agents || []);
        } catch (e) {
            console.error('loadAll error:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        setMessage(null);
        try {
            const res = await api.post(`/retell/${workspaceId}/knowledge-bases/sync`, {
                agentId: selectedAgentId || undefined,
                kbText: syncedKbText
            });
            setSyncedKbId(res.data.knowledgeBaseId);
            setLastSynced(new Date());
            setMessage({
                type: 'success',
                text: 'Bilgi bankası Retell\'e başarıyla kaydedildi'
            });
            loadAll();
        } catch (e) {
            setMessage({ type: 'error', text: e.response?.data?.error || 'Kayıt başarısız' });
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
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#166534' }}>Bilgi Bankası Bağlı</div>
                        <code style={{ fontSize: '0.78rem', color: '#6b7280' }}>{syncedKbId}</code>
                        {syncedKbInfo && <span style={{ fontSize: '0.78rem', color: '#6b7280', marginLeft: 8 }}>— {syncedKbInfo.knowledge_base_name}</span>}
                        {lastSynced && <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 }}>Son senkronizasyon: {lastSynced.toLocaleString('tr-TR')}</div>}
                    </div>
                </div>
            )}

            {/* Metin Editörü */}
            <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BookOpen size={15} style={{ color: '#6366f1' }} />
                    Bilgi Bankası Metni
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 400 }}>— Agent'ın yararlanacağı tüm ek bilgiler</span>
                </div>
                <textarea
                    value={syncedKbText}
                    onChange={e => setSyncedKbText(e.target.value)}
                    rows={12}
                    placeholder="Örn: Özel Sağlık Hastanesi 2005 yılında kurulmuştur. Dahiliye bölümünde Dr. Ali Yılmaz görev yapmaktadır..."
                    style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box', resize: 'vertical' }}
                />
                <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>
                    Kaydettiğinizde bu metin doğrudan Retell üzerindeki bilgi bankasıyla eşitlenir.
                </div>
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
                    <option value="">— Varsayılan Agent (Genel Ayarlardan) —</option>
                    {agents.map(a => (
                        <option key={a.agent_id} value={a.agent_id}>
                            {a.agent_name || a.agent_id}
                        </option>
                    ))}
                </select>
            </div>

            {/* Sync Butonu */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
                <button
                    onClick={handleSync}
                    disabled={syncing}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '11px 24px',
                        background: syncing ? '#9ca3af' : '#6366f1', color: '#fff', border: 'none',
                        borderRadius: 8, fontSize: '0.9rem', fontWeight: 600,
                        cursor: syncing ? 'not-allowed' : 'pointer'
                    }}
                >
                    {syncing ? <Loader size={16} className="spin" /> : <RefreshCw size={16} />}
                    {syncing ? 'Kaydediliyor...' : `Retell'e Kaydet`}
                </button>
            </div>
        </div>
    );
}

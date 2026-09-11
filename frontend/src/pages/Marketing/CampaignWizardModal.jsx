import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import {
    Megaphone, Users, MessageSquare, Phone, Calendar, Clock,
    CheckCircle2, Sparkles, Upload, Image as ImageIcon, AlertCircle,
    ChevronRight, ArrowLeft, ArrowRight, X, Loader2, Tag, Layers
} from 'lucide-react';

export default function CampaignWizardModal({ workspaceId, isOpen, onClose, onSuccess }) {
    if (!isOpen) return null;

    // Wizard Step: 1 = Hedef Kitle, 2 = Kanallar & İçerik, 3 = Zamanlama & Hız, 4 = Özet & Başlat
    const [step, setStep] = useState(1);

    // Step 1: Campaign Info & Audience
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [budget, setBudget] = useState('');
    const [audienceType, setAudienceType] = useState('TAGS'); // 'TAGS' | 'SEGMENT' | 'LIST' | 'ALL'
    const [availableTags, setAvailableTags] = useState([]);
    const [selectedTags, setSelectedTags] = useState([]);
    const [tagSearch, setTagSearch] = useState('');
    const [smartSegments, setSmartSegments] = useState([]);
    const [selectedSegmentId, setSelectedSegmentId] = useState('');
    const [contactGroups, setContactGroups] = useState([]);
    const [selectedListId, setSelectedListId] = useState('');

    // Audience Preview State
    const [previewCount, setPreviewCount] = useState(null);
    const [previewSamples, setPreviewSamples] = useState([]);
    const [previewLoading, setPreviewLoading] = useState(false);

    // Step 2: Channels & Content
    const [channels, setChannels] = useState(['WHATSAPP']); // ['WHATSAPP'], ['AI_CALL'], or ['WHATSAPP', 'AI_CALL']

    // WhatsApp Configuration
    const [waMode, setWaMode] = useState('EXISTING_TEMPLATE'); // 'EXISTING_TEMPLATE' | 'NEW_TEMPLATE'
    const [waTemplates, setWaTemplates] = useState([]);
    const [selectedTemplateName, setSelectedTemplateName] = useState('');
    const [selectedTemplateObj, setSelectedTemplateObj] = useState(null);
    // New Template details
    const [newTemplateName, setNewTemplateName] = useState('');
    const [newTemplateBody, setNewTemplateBody] = useState('');
    const [uploadingMedia, setUploadingMedia] = useState(false);
    const [mediaHandle, setMediaHandle] = useState('');
    const [mediaUrl, setMediaUrl] = useState('');
    const [mediaPreview, setMediaPreview] = useState('');

    // AI Call Configuration
    const [retellAgents, setRetellAgents] = useState([]);
    const [selectedAgentId, setSelectedAgentId] = useState('');
    const [callTemplate, setCallTemplate] = useState('');

    // Step 3: Schedule & Speed
    const [scheduleType, setScheduleType] = useState('IMMEDIATE'); // 'IMMEDIATE' | 'SCHEDULED'
    const [scheduledAt, setScheduledAt] = useState('');
    const [sendRate, setSendRate] = useState(20);

    // Submitting State
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    // ─────────────────────────────────────────────────────────────────────────────
    // Initial Data Fetching
    // ─────────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!workspaceId) return;

        // 1. Fetch tags from contacts
        api.get(`/contacts/${workspaceId}?limit=1`)
            .then(res => {
                if (res.data?.allTags) setAvailableTags(res.data.allTags);
            })
            .catch(err => console.error('Error fetching tags:', err));

        // 2. Fetch Smart Segments
        api.get(`/smart-segments/${workspaceId}/segments/definitions`)
            .then(res => {
                if (res.data?.segments) setSmartSegments(res.data.segments);
            })
            .catch(err => console.error('Error fetching smart segments:', err));

        // 3. Fetch Contact Groups (Lists)
        api.get(`/contact-groups/${workspaceId}/groups`)
            .then(res => {
                const list = res.data?.groups || res.data || [];
                setContactGroups(Array.isArray(list) ? list : []);
            })
            .catch(err => console.error('Error fetching contact groups:', err));

        // 4. Fetch WhatsApp Templates
        api.get(`/automations/${workspaceId}/templates`)
            .then(res => {
                const tpls = res.data?.templates || [];
                setWaTemplates(tpls);
                const approved = tpls.filter(t => t.status === 'APPROVED');
                if (approved.length > 0) {
                    setSelectedTemplateName(approved[0].name);
                    setSelectedTemplateObj(approved[0]);
                } else if (tpls.length > 0) {
                    setSelectedTemplateName(tpls[0].name);
                    setSelectedTemplateObj(tpls[0]);
                }
            })
            .catch(err => console.error('Error fetching WA templates:', err));

        // 5. Fetch Retell Agents
        api.get(`/retell/${workspaceId}/agents`)
            .then(res => {
                const agents = res.data?.agents || res.data || [];
                setRetellAgents(Array.isArray(agents) ? agents : []);
                if (agents.length > 0) {
                    setSelectedAgentId(agents[0].agent_id || agents[0].id || '');
                }
            })
            .catch(err => console.error('Error fetching Retell agents:', err));

    }, [workspaceId]);

    // ─────────────────────────────────────────────────────────────────────────────
    // Audience Preview Handler
    // ─────────────────────────────────────────────────────────────────────────────

    const updateAudiencePreview = useCallback(async () => {
        if (!workspaceId) return;
        setPreviewLoading(true);
        try {
            const payload = {
                audienceType,
                tagNames: audienceType === 'TAGS' ? selectedTags : [],
                segmentId: audienceType === 'SEGMENT' ? selectedSegmentId : null,
                listId: audienceType === 'LIST' ? selectedListId : null
            };
            const res = await api.post(`/marketing-v2/${workspaceId}/preview-audience`, payload);
            if (res.data?.success) {
                setPreviewCount(res.data.count);
                setPreviewSamples(res.data.sampleContacts || []);
            }
        } catch (err) {
            console.error('Preview error:', err);
        } finally {
            setPreviewLoading(false);
        }
    }, [workspaceId, audienceType, selectedTags, selectedSegmentId, selectedListId]);

    useEffect(() => {
        const timeout = setTimeout(updateAudiencePreview, 250);
        return () => clearTimeout(timeout);
    }, [updateAudiencePreview]);

    // Toggle Tag Selection
    const toggleTag = (tagName) => {
        setSelectedTags(prev =>
            prev.includes(tagName) ? prev.filter(t => t !== tagName) : [...prev, tagName]
        );
    };

    // Toggle Channel
    const toggleChannel = (channelKey) => {
        setChannels(prev => {
            if (prev.includes(channelKey)) {
                if (prev.length === 1) return prev; // At least one channel required
                return prev.filter(c => c !== channelKey);
            } else {
                return [...prev, channelKey];
            }
        });
    };

    // Media Upload for New Template
    const handleMediaUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingMedia(true);
        setErrorMsg('');

        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await api.post(`/automations/${workspaceId}/templates/upload-media`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data?.handle) {
                setMediaHandle(res.data.handle);
                setMediaUrl(res.data.url || '');
                setMediaPreview(URL.createObjectURL(file));
            } else if (res.data?.url) {
                setMediaUrl(res.data.url);
                setMediaPreview(URL.createObjectURL(file));
            }
        } catch (err) {
            console.error('Media upload failed:', err);
            setErrorMsg(err.response?.data?.error || 'Görsel yüklenemedi');
        } finally {
            setUploadingMedia(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // Launch Campaign
    // ─────────────────────────────────────────────────────────────────────────────

    const handleLaunch = async () => {
        if (!name.trim()) {
            setErrorMsg('Lütfen kampanya adını girin');
            setStep(1);
            return;
        }

        if (channels.length === 0) {
            setErrorMsg('Lütfen en az bir kanal seçin');
            setStep(2);
            return;
        }

        if (channels.includes('WHATSAPP')) {
            if (waMode === 'EXISTING_TEMPLATE' && !selectedTemplateName) {
                setErrorMsg('Lütfen bir WhatsApp şablonu seçin');
                setStep(2);
                return;
            }
            if (waMode === 'NEW_TEMPLATE' && !newTemplateBody.trim()) {
                setErrorMsg('Lütfen yeni şablon metnini yazın');
                setStep(2);
                return;
            }
        }

        if (channels.includes('AI_CALL') && !selectedAgentId) {
            setErrorMsg('Lütfen sesli arama için bir AI Asistanı seçin');
            setStep(2);
            return;
        }

        setSubmitting(true);
        setErrorMsg('');

        try {
            const payload = {
                name: name.trim(),
                description: description.trim(),
                budget: budget ? parseFloat(budget) : null,
                audienceType,
                tagNames: selectedTags,
                segmentId: selectedSegmentId,
                listId: selectedListId,
                channels,
                whatsappConfig: channels.includes('WHATSAPP') ? {
                    mode: waMode,
                    templateName: waMode === 'EXISTING_TEMPLATE' ? selectedTemplateName : (newTemplateName || `${name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}_tpl`),
                    bodyText: waMode === 'NEW_TEMPLATE' ? newTemplateBody : (selectedTemplateObj?.bodyText || ''),
                    headerType: mediaHandle || mediaUrl ? 'IMAGE' : undefined,
                    headerHandle: mediaHandle,
                    headerMediaUrl: mediaUrl,
                    category: 'MARKETING'
                } : {},
                aiCallConfig: channels.includes('AI_CALL') ? {
                    agentId: selectedAgentId,
                    agentName: retellAgents.find(a => (a.agent_id || a.id) === selectedAgentId)?.agent_name || 'Asistan',
                    callTemplate
                } : {},
                sendRate: Number(sendRate),
                scheduleType,
                scheduledAt: scheduleType === 'SCHEDULED' && scheduledAt ? scheduledAt : null
            };

            const res = await api.post(`/marketing-v2/${workspaceId}/wizard-launch`, payload);

            if (res.data?.success) {
                onSuccess?.(res.data.campaign);
                onClose();
            } else {
                setErrorMsg(res.data?.error || 'Kampanya başlatılamadı');
            }
        } catch (err) {
            console.error('Launch failed:', err);
            setErrorMsg(err.response?.data?.error || 'Kampanya oluşturulurken bir hata oluştu');
        } finally {
            setSubmitting(false);
        }
    };

    // Filtered Tags list
    const filteredTags = availableTags.filter(t => t.toLowerCase().includes(tagSearch.toLowerCase()));

    return (
        <div className="mkt-modal-overlay" onClick={onClose}>
            <div
                className="grp-form-modal"
                style={{ width: 680, maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="grp-modal-header" style={{ padding: '18px 24px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Sparkles size={18} />
                            </div>
                            <h2 className="grp-modal-title" style={{ fontSize: 18 }}>Akıllı Kampanya Başlat</h2>
                        </div>
                        <p style={{ margin: '4px 0 0 40px', fontSize: 13, color: '#6b7280' }}>
                            Hedef kitlenizi seçin, kanalları belirleyin ve tek tıkla yayına alın.
                        </p>
                    </div>
                    <button className="grp-modal-close" onClick={onClose}><X size={16} /></button>
                </div>

                {/* Step Indicator */}
                <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', background: '#fafafa', padding: '10px 24px', gap: 8 }}>
                    {[
                        { num: 1, title: 'Hedef Kitle' },
                        { num: 2, title: 'Kanallar & İçerik' },
                        { num: 3, title: 'Zamanlama & Hız' },
                        { num: 4, title: 'Özet & Başlat' }
                    ].map(s => {
                        const active = step === s.num;
                        const passed = step > s.num;
                        return (
                            <div
                                key={s.num}
                                onClick={() => !submitting && setStep(s.num)}
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    background: active ? '#fff' : 'transparent',
                                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                                    border: active ? '1px solid #e5e7eb' : '1px solid transparent',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <span style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    background: passed ? '#10b981' : active ? '#2563eb' : '#e5e7eb',
                                    color: passed || active ? '#fff' : '#6b7280'
                                }}>
                                    {passed ? '✓' : s.num}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: active ? 600 : 500, color: active ? '#111827' : '#6b7280' }}>
                                    {s.title}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Error Banner */}
                {errorMsg && (
                    <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertCircle size={16} />
                        <span>{errorMsg}</span>
                    </div>
                )}

                {/* Modal Body with Scroll */}
                <div className="grp-modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

                    {/* ══════════════════════════════════════════════════════════════
                        STEP 1: HEDEF KİTLE (AUDIENCE)
                    ══════════════════════════════════════════════════════════════ */}
                    {step === 1 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                            {/* Campaign Info */}
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                                <div className="grp-field">
                                    <label className="grp-label">Kampanya Adı *</label>
                                    <input
                                        type="text"
                                        className="grp-input"
                                        placeholder="Örn: 2026 Bahar Kampanyası"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                <div className="grp-field">
                                    <label className="grp-label">Bütçe (TL) <span className="grp-label-opt">(Opsiyonel)</span></label>
                                    <input
                                        type="number"
                                        className="grp-input"
                                        placeholder="Örn: 5000"
                                        value={budget}
                                        onChange={e => setBudget(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="grp-field">
                                <label className="grp-label">Açıklama <span className="grp-label-opt">(Opsiyonel)</span></label>
                                <input
                                    type="text"
                                    className="grp-input"
                                    placeholder="Kampanyanın hedefi veya notlar"
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                />
                            </div>

                            {/* Audience Source Selector Tabs */}
                            <div>
                                <label className="grp-label" style={{ marginBottom: 8, display: 'block' }}>Hedef Kitle Kaynağı</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                                    {[
                                        { id: 'TAGS', label: 'Etiketler', icon: <Tag size={16} /> },
                                        { id: 'SEGMENT', label: 'Akıllı Segment', icon: <Sparkles size={16} /> },
                                        { id: 'LIST', label: 'Kayıtlı Liste', icon: <Users size={16} /> },
                                        { id: 'ALL', label: 'Tüm Kişiler', icon: <Layers size={16} /> }
                                    ].map(item => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => setAudienceType(item.id)}
                                            style={{
                                                padding: '10px 8px',
                                                border: audienceType === item.id ? '2px solid #2563eb' : '1px solid #e5e7eb',
                                                background: audienceType === item.id ? '#eff6ff' : '#fff',
                                                color: audienceType === item.id ? '#1e40af' : '#4b5563',
                                                borderRadius: 8,
                                                fontSize: 12,
                                                fontWeight: 600,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: 6,
                                                cursor: 'pointer',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            {item.icon}
                                            <span>{item.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Audience Specific Selectors */}
                            {audienceType === 'TAGS' && (
                                <div style={{ background: '#f9fafb', padding: 14, borderRadius: 10, border: '1px solid #e5e7eb' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                                            Kişiler Etiketleri ({selectedTags.length} seçildi)
                                        </span>
                                        <input
                                            type="text"
                                            placeholder="Etiket ara..."
                                            value={tagSearch}
                                            onChange={e => setTagSearch(e.target.value)}
                                            style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, outline: 'none', width: 140 }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 130, overflowY: 'auto' }}>
                                        {filteredTags.length === 0 ? (
                                            <div style={{ fontSize: 12, color: '#9ca3af', padding: 8 }}>Etiket bulunamadı</div>
                                        ) : (
                                            filteredTags.map(tag => {
                                                const isSelected = selectedTags.includes(tag);
                                                return (
                                                    <span
                                                        key={tag}
                                                        onClick={() => toggleTag(tag)}
                                                        style={{
                                                            padding: '5px 12px',
                                                            borderRadius: 16,
                                                            fontSize: 12,
                                                            fontWeight: 500,
                                                            cursor: 'pointer',
                                                            background: isSelected ? '#2563eb' : '#fff',
                                                            color: isSelected ? '#fff' : '#4b5563',
                                                            border: isSelected ? '1px solid #2563eb' : '1px solid #d1d5db',
                                                            boxShadow: isSelected ? '0 2px 4px rgba(37,99,235,0.2)' : 'none',
                                                            transition: 'all 0.1s'
                                                        }}
                                                    >
                                                        {isSelected && '✓ '}#{tag}
                                                    </span>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}

                            {audienceType === 'SEGMENT' && (
                                <div style={{ background: '#f9fafb', padding: 14, borderRadius: 10, border: '1px solid #e5e7eb' }}>
                                    <label className="grp-label" style={{ marginBottom: 8, display: 'block' }}>Akıllı Segment Seçin</label>
                                    <select
                                        className="grp-input"
                                        value={selectedSegmentId}
                                        onChange={e => setSelectedSegmentId(e.target.value)}
                                    >
                                        <option value="">-- Bir segment seçin --</option>
                                        {smartSegments.map(s => (
                                            <option key={s.id} value={s.id}>
                                                {s.icon || '⚡'} {s.label} ({s.group})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {audienceType === 'LIST' && (
                                <div style={{ background: '#f9fafb', padding: 14, borderRadius: 10, border: '1px solid #e5e7eb' }}>
                                    <label className="grp-label" style={{ marginBottom: 8, display: 'block' }}>Kayıtlı Liste Seçin</label>
                                    <select
                                        className="grp-input"
                                        value={selectedListId}
                                        onChange={e => setSelectedListId(e.target.value)}
                                    >
                                        <option value="">-- Bir liste seçin --</option>
                                        {contactGroups.map(g => (
                                            <option key={g.id} value={g.id}>
                                                {g.icon || '👥'} {g.name} ({g.members?.length || g._count?.members || 0} kişi)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Live Audience Preview Card */}
                            <div style={{
                                background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                                border: '1.5px solid #86efac',
                                borderRadius: 12,
                                padding: '14px 18px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>🎯 Tahmini Hedef Kitle:</span>
                                        {previewLoading ? (
                                            <Loader2 size={16} className="mkt-spin" style={{ color: '#16a34a' }} />
                                        ) : (
                                            <span style={{ fontSize: 17, fontWeight: 800, color: '#15803d' }}>
                                                {previewCount !== null ? `${previewCount} Kişi` : 'Hesaplanıyor...'}
                                            </span>
                                        )}
                                    </div>
                                    {previewSamples.length > 0 && (
                                        <div style={{ fontSize: 12, color: '#166534', marginTop: 4 }}>
                                            Örnek: {previewSamples.map(c => c.name || c.phone).slice(0, 3).join(', ')}
                                            {previewCount > 3 ? ` ve ${previewCount - 3} kişi daha` : ''}
                                        </div>
                                    )}
                                </div>
                                <span style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: 20, fontWeight: 600 }}>
                                    Otomatik Liste Eşleştirme
                                </span>
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════════════
                        STEP 2: KANALLAR & İÇERİK (CHANNELS & CONTENT)
                    ══════════════════════════════════════════════════════════════ */}
                    {step === 2 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                            {/* Channel Multi-selector Cards */}
                            <div>
                                <label className="grp-label" style={{ marginBottom: 8, display: 'block' }}>
                                    Gönderim Kanalları (Aynı anda ikisini de seçebilirsiniz)
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    {/* WhatsApp Card */}
                                    <div
                                        onClick={() => toggleChannel('WHATSAPP')}
                                        style={{
                                            border: channels.includes('WHATSAPP') ? '2px solid #25d366' : '1px solid #e5e7eb',
                                            background: channels.includes('WHATSAPP') ? '#f0fdf4' : '#fff',
                                            borderRadius: 10,
                                            padding: 14,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: 12,
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={channels.includes('WHATSAPP')}
                                            onChange={() => {}}
                                            style={{ marginTop: 3, accentColor: '#25d366' }}
                                        />
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#15803d', fontSize: 14 }}>
                                                <MessageSquare size={16} />
                                                <span>WhatsApp Şablonu</span>
                                            </div>
                                            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#4b5563' }}>
                                                Meta onaylı şablon mesajı veya görsel ile toplu iletim
                                            </p>
                                        </div>
                                    </div>

                                    {/* AI Call Card */}
                                    <div
                                        onClick={() => toggleChannel('AI_CALL')}
                                        style={{
                                            border: channels.includes('AI_CALL') ? '2px solid #6366f1' : '1px solid #e5e7eb',
                                            background: channels.includes('AI_CALL') ? '#eef2ff' : '#fff',
                                            borderRadius: 10,
                                            padding: 14,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: 12,
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={channels.includes('AI_CALL')}
                                            onChange={() => {}}
                                            style={{ marginTop: 3, accentColor: '#6366f1' }}
                                        />
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#4338ca', fontSize: 14 }}>
                                                <Phone size={16} />
                                                <span>AI Sesli Arama</span>
                                            </div>
                                            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#4b5563' }}>
                                                Yapay zeka sesli asistanı ile otomatik dış arama
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* WhatsApp Content Configuration */}
                            {channels.includes('WHATSAPP') && (
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#1e293b', fontSize: 14 }}>
                                            <MessageSquare size={16} color="#16a34a" />
                                            <span>WhatsApp Mesaj İçeriği</span>
                                        </div>
                                        {/* Mode Switcher */}
                                        <div style={{ display: 'flex', gap: 4, background: '#e2e8f0', padding: 2, borderRadius: 6 }}>
                                            <button
                                                type="button"
                                                onClick={() => setWaMode('EXISTING_TEMPLATE')}
                                                style={{
                                                    padding: '4px 10px',
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                    borderRadius: 4,
                                                    border: 'none',
                                                    background: waMode === 'EXISTING_TEMPLATE' ? '#fff' : 'transparent',
                                                    color: waMode === 'EXISTING_TEMPLATE' ? '#0f172a' : '#64748b',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Mevcut Şablon
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setWaMode('NEW_TEMPLATE')}
                                                style={{
                                                    padding: '4px 10px',
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                    borderRadius: 4,
                                                    border: 'none',
                                                    background: waMode === 'NEW_TEMPLATE' ? '#fff' : 'transparent',
                                                    color: waMode === 'NEW_TEMPLATE' ? '#0f172a' : '#64748b',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Yeni Şablon & Görsel
                                            </button>
                                        </div>
                                    </div>

                                    {waMode === 'EXISTING_TEMPLATE' ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            <label className="grp-label">Onaylı Şablon Seçin</label>
                                            <select
                                                className="grp-input"
                                                value={selectedTemplateName}
                                                onChange={e => {
                                                    setSelectedTemplateName(e.target.value);
                                                    setSelectedTemplateObj(waTemplates.find(t => t.name === e.target.value) || null);
                                                }}
                                            >
                                                {waTemplates.map(t => (
                                                    <option key={t.id || t.name} value={t.name}>
                                                        {t.name} ({t.status || 'APPROVED'}) - {t.language || 'tr'}
                                                    </option>
                                                ))}
                                            </select>

                                            {selectedTemplateObj && (
                                                <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#334155' }}>
                                                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>ŞABLON ÖNİZLEMESİ:</div>
                                                    <div style={{ whiteSpace: 'pre-wrap' }}>
                                                        {selectedTemplateObj.bodyText || selectedTemplateObj.components?.find(c => c.type === 'BODY')?.text || selectedTemplateObj.name}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            <div className="grp-field">
                                                <label className="grp-label">Şablon Adı (Meta uyumlu küçük harf ve alt çizgi)</label>
                                                <input
                                                    type="text"
                                                    className="grp-input"
                                                    placeholder="orn_bahar_kampanyasi"
                                                    value={newTemplateName}
                                                    onChange={e => setNewTemplateName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                                                />
                                            </div>

                                            <div className="grp-field">
                                                <label className="grp-label">Mesaj Metni *</label>
                                                <textarea
                                                    className="grp-input"
                                                    rows={3}
                                                    placeholder="Merhaba {{1}}, size özel teklifimiz için web sitemizi ziyaret edin..."
                                                    value={newTemplateBody}
                                                    onChange={e => setNewTemplateBody(e.target.value)}
                                                />
                                            </div>

                                            {/* Media Upload */}
                                            <div>
                                                <label className="grp-label" style={{ marginBottom: 6, display: 'block' }}>
                                                    Şablon Başlık Görseli <span className="grp-label-opt">(Meta'ya yüklenir)</span>
                                                </label>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    <label style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                        padding: '8px 14px',
                                                        background: '#fff',
                                                        border: '1.5px dashed #cbd5e1',
                                                        borderRadius: 8,
                                                        fontSize: 13,
                                                        fontWeight: 500,
                                                        color: '#475569',
                                                        cursor: uploadingMedia ? 'not-allowed' : 'pointer'
                                                    }}>
                                                        {uploadingMedia ? <Loader2 size={16} className="mkt-spin" /> : <Upload size={16} />}
                                                        <span>{uploadingMedia ? 'Yükleniyor...' : 'Görsel Seç'}</span>
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            style={{ display: 'none' }}
                                                            disabled={uploadingMedia}
                                                            onChange={handleMediaUpload}
                                                        />
                                                    </label>

                                                    {mediaPreview && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <img src={mediaPreview} alt="preview" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', border: '1px solid #cbd5e1' }} />
                                                            <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ Görsel hazır</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* AI Call Configuration */}
                            {channels.includes('AI_CALL') && (
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#1e293b', fontSize: 14, marginBottom: 12 }}>
                                        <Phone size={16} color="#4f46e5" />
                                        <span>AI Sesli Arama Yapılandırması</span>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div className="grp-field">
                                            <label className="grp-label">Arayacak AI Sesli Asistanı *</label>
                                            <select
                                                className="grp-input"
                                                value={selectedAgentId}
                                                onChange={e => setSelectedAgentId(e.target.value)}
                                            >
                                                {retellAgents.map(a => (
                                                    <option key={a.agent_id || a.id} value={a.agent_id || a.id}>
                                                        {a.agent_name || a.name || 'İsimsiz Asistan'} ({a.agent_id || a.id})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="grp-field">
                                            <label className="grp-label">Arama Konusu & Özel Talimat <span className="grp-label-opt">(Opsiyonel)</span></label>
                                            <textarea
                                                className="grp-input"
                                                rows={2}
                                                placeholder="Müşteriyi bahar kampanyamız hakkında bilgilendir ve randevu almayı teklif et."
                                                value={callTemplate}
                                                onChange={e => setCallTemplate(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════════════
                        STEP 3: ZAMANLAMA & HIZ (SCHEDULE & SPEED)
                    ══════════════════════════════════════════════════════════════ */}
                    {step === 3 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            {/* Schedule Type */}
                            <div>
                                <label className="grp-label" style={{ marginBottom: 8, display: 'block' }}>Gönderim Zamanı</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div
                                        onClick={() => setScheduleType('IMMEDIATE')}
                                        style={{
                                            border: scheduleType === 'IMMEDIATE' ? '2px solid #2563eb' : '1px solid #e5e7eb',
                                            background: scheduleType === 'IMMEDIATE' ? '#eff6ff' : '#fff',
                                            borderRadius: 10,
                                            padding: 14,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 12
                                        }}
                                    >
                                        <Clock size={20} color={scheduleType === 'IMMEDIATE' ? '#2563eb' : '#6b7280'} />
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>Hemen Başlat</div>
                                            <div style={{ fontSize: 12, color: '#6b7280' }}>Onay sonrası derhal gönderime başlar</div>
                                        </div>
                                    </div>

                                    <div
                                        onClick={() => setScheduleType('SCHEDULED')}
                                        style={{
                                            border: scheduleType === 'SCHEDULED' ? '2px solid #2563eb' : '1px solid #e5e7eb',
                                            background: scheduleType === 'SCHEDULED' ? '#eff6ff' : '#fff',
                                            borderRadius: 10,
                                            padding: 14,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 12
                                        }}
                                    >
                                        <Calendar size={20} color={scheduleType === 'SCHEDULED' ? '#2563eb' : '#6b7280'} />
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>İleri Bir Tarihte</div>
                                            <div style={{ fontSize: 12, color: '#6b7280' }}>Belirlediğiniz gün ve saatte başlar</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {scheduleType === 'SCHEDULED' && (
                                <div className="grp-field" style={{ background: '#f9fafb', padding: 14, borderRadius: 10, border: '1px solid #e5e7eb' }}>
                                    <label className="grp-label">Planlanan Tarih ve Saat *</label>
                                    <input
                                        type="datetime-local"
                                        className="grp-input"
                                        value={scheduledAt}
                                        onChange={e => setScheduledAt(e.target.value)}
                                    />
                                </div>
                            )}

                            {/* Send Rate */}
                            <div className="grp-field">
                                <label className="grp-label">Gönderim / Arama Hızı (Dakika Başına İşlem)</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 4 }}>
                                    {[
                                        { rate: 10, label: '10 / dk', desc: 'Güvenli' },
                                        { rate: 20, label: '20 / dk', desc: 'Önerilen' },
                                        { rate: 50, label: '50 / dk', desc: 'Hızlı' },
                                        { rate: 100, label: '100 / dk', desc: 'Maksimum' }
                                    ].map(item => (
                                        <button
                                            key={item.rate}
                                            type="button"
                                            onClick={() => setSendRate(item.rate)}
                                            style={{
                                                padding: '10px 8px',
                                                border: sendRate === item.rate ? '2px solid #2563eb' : '1px solid #e5e7eb',
                                                background: sendRate === item.rate ? '#eff6ff' : '#fff',
                                                borderRadius: 8,
                                                cursor: 'pointer',
                                                textAlign: 'center'
                                            }}
                                        >
                                            <div style={{ fontWeight: 700, fontSize: 13, color: sendRate === item.rate ? '#1d4ed8' : '#111827' }}>
                                                {item.label}
                                            </div>
                                            <div style={{ fontSize: 11, color: sendRate === item.rate ? '#2563eb' : '#9ca3af' }}>
                                                {item.desc}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <span style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
                                    Hız limiti, operatör ve yapay zeka sınırlarına takılmamak ve spam korumasını sağlamak için uygulanır.
                                </span>
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════════════
                        STEP 4: ÖZET & BAŞLAT (SUMMARY & LAUNCH)
                    ══════════════════════════════════════════════════════════════ */}
                    {step === 4 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 }}>
                                <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                                    Kampanya Başlatma Özeti
                                </h3>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                                        <span style={{ color: '#64748b' }}>Kampanya Adı:</span>
                                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{name}</span>
                                    </div>

                                    {budget && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                                            <span style={{ color: '#64748b' }}>Bütçe:</span>
                                            <span style={{ fontWeight: 600, color: '#0f172a' }}>{budget} TL</span>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                                        <span style={{ color: '#64748b' }}>Hedef Kitle:</span>
                                        <span style={{ fontWeight: 700, color: '#16a34a' }}>
                                            {previewCount !== null ? `~${previewCount} Kişi` : 'Hesaplanıyor'}
                                            {audienceType === 'TAGS' && ` (${selectedTags.join(', ') || 'Tüm etiketler'})`}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                                        <span style={{ color: '#64748b' }}>Aktif Kanallar:</span>
                                        <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                            {channels.map(c => c === 'WHATSAPP' ? 'WhatsApp' : 'AI Sesli Arama').join(' + ')}
                                        </span>
                                    </div>

                                    {channels.includes('WHATSAPP') && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                                            <span style={{ color: '#64748b' }}>WhatsApp Şablonu:</span>
                                            <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                                {waMode === 'EXISTING_TEMPLATE' ? selectedTemplateName : newTemplateName}
                                                {(mediaHandle || mediaUrl) && ' (📷 Görselli)'}
                                            </span>
                                        </div>
                                    )}

                                    {channels.includes('AI_CALL') && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                                            <span style={{ color: '#64748b' }}>AI Sesli Asistan:</span>
                                            <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                                {retellAgents.find(a => (a.agent_id || a.id) === selectedAgentId)?.agent_name || selectedAgentId}
                                            </span>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                                        <span style={{ color: '#64748b' }}>Zamanlama & Hız:</span>
                                        <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                            {scheduleType === 'IMMEDIATE' ? 'Hemen Başlat' : `Planlandı: ${scheduledAt}`} ({sendRate} / dk)
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Dual Channel Grouping Info Note */}
                            <div style={{
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                borderRadius: 10,
                                padding: 12,
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 10
                            }}>
                                <CheckCircle2 size={18} color="#2563eb" style={{ flexShrink: 0, marginTop: 2 }} />
                                <div style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.5 }}>
                                    <strong>Otomatik Çoklu Grup Mimarisi:</strong> Onay verdiğinizde, arka planda kampanya altına {channels.length} adet bağımsız reklam grubu (
                                    {channels.map(c => c === 'WHATSAPP' ? 'WhatsApp Grubu' : 'AI Arama Grubu').join(' ve ')}
                                    ) oluşturulacak ve gönderimler otomatik başlatılacaktır.
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Navigation Buttons */}
                <div className="grp-modal-footer" style={{ padding: '14px 24px', background: '#fafafa' }}>
                    {step > 1 && (
                        <button
                            type="button"
                            className="grp-btn-cancel"
                            disabled={submitting}
                            onClick={() => setStep(s => s - 1)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                            <ArrowLeft size={16} />
                            <span>Geri</span>
                        </button>
                    )}

                    <div style={{ flex: 1 }} />

                    <button
                        type="button"
                        className="grp-btn-cancel"
                        disabled={submitting}
                        onClick={onClose}
                    >
                        Vazgeç
                    </button>

                    {step < 4 ? (
                        <button
                            type="button"
                            className="grp-btn-save"
                            onClick={() => {
                                if (step === 1 && !name.trim()) {
                                    setErrorMsg('Lütfen kampanya adını girin');
                                    return;
                                }
                                setErrorMsg('');
                                setStep(s => s + 1);
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                            <span>İleri</span>
                            <ArrowRight size={16} />
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="grp-btn-save"
                            disabled={submitting}
                            onClick={handleLaunch}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                background: '#10b981',
                                border: 'none'
                            }}
                        >
                            {submitting ? <Loader2 size={16} className="mkt-spin" /> : <Sparkles size={16} />}
                            <span>{submitting ? 'Kampanya Başlatılıyor...' : '🚀 Kampanyayı Başlat'}</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

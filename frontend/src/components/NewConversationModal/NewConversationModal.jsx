import React, { useState, useEffect } from 'react';
import { X, Phone, User, Filter, Tag, Calendar, Target, MessageSquare } from 'lucide-react';
import { funnelAPI, contactAPI, conversationAPI } from '../../services/api';

const NewConversationModal = ({
    workspaceId,
    isOpen,
    onClose,
    onSuccess,
}) => {
    const [newConversationPhonePrefix, setNewConversationPhonePrefix] = useState('+90');
    const [newConversationPhone, setNewConversationPhone] = useState('');
    const [newConversationName, setNewConversationName] = useState('');
    const [newConversationTopic, setNewConversationTopic] = useState('');
    const [newConversationFunnel, setNewConversationFunnel] = useState('');
    const [newConversationFunnelStage, setNewConversationFunnelStage] = useState('');
    const [newConversationDate, setNewConversationDate] = useState('');
    const [newConversationMessage, setNewConversationMessage] = useState('');
    const [meetingType, setMeetingType] = useState('PHONE'); // PHONE veya WALK_IN
    const [leadSource, setLeadSource] = useState('');
    const [leadSourceDetail, setLeadSourceDetail] = useState('');
    
    const [creatingConversation, setCreatingConversation] = useState(false);
    const [isSearchingPhone, setIsSearchingPhone] = useState(false);
    const [phoneSearchResults, setPhoneSearchResults] = useState([]);
    const [funnelOptions, setFunnelOptions] = useState([]);

    const LEAD_SOURCES = [
        { value: 'INBOUND', label: '📞 Gelen Arama' },
        { value: 'SOCIAL_MEDIA', label: '📱 Sosyal Medya' },
        { value: 'FACEBOOK', label: '📘 Facebook' },
        { value: 'INSTAGRAM', label: '📸 Instagram' },
        { value: 'GOOGLE', label: '🔍 Google' },
        { value: 'REFERRAL', label: '🤝 Referans' },
        { value: 'WEBSITE', label: '🌐 Web Sitesi' },
        { value: 'WALK_IN', label: '🚶 Yüz Yüze' },
        { value: 'EVENT', label: '🎪 Etkinlik/Fuar' },
        { value: 'OTHER', label: '📋 Diğer' },
    ];

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setNewConversationPhonePrefix('+90');
            setNewConversationPhone('');
            setNewConversationName('');
            setNewConversationTopic('');
            setNewConversationFunnel('');
            setNewConversationFunnelStage('');
            setNewConversationDate('');
            setNewConversationMessage('');
            setMeetingType('PHONE');
            setLeadSource('');
            setLeadSourceDetail('');
            setPhoneSearchResults([]);
        }
    }, [isOpen]);

    // Fetch funnels
    useEffect(() => {
        if (!workspaceId || !isOpen) return;
        const fetchFunnels = async () => {
            try {
                const res = await funnelAPI.getAll(workspaceId);
                const opts = (res.data?.funnels || []).map(f => ({
                    value: f.id,
                    label: f.name,
                    stages: f.stages?.map(s => ({ value: s.id, label: s.name })) || []
                }));
                setFunnelOptions(opts);
            } catch (err) {
                console.error('Error fetching funnels:', err);
            }
        };
        fetchFunnels();
    }, [workspaceId, isOpen]);

    // Phone search effect
    useEffect(() => {
        if (!workspaceId || !isOpen || !newConversationPhone || newConversationPhone.length < 3) {
            setPhoneSearchResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearchingPhone(true);
            try {
                const prefix = newConversationPhonePrefix.replace('+', '');
                let searchPhone = newConversationPhone.replace(/[\s\-\(\)]/g, '');
                
                if (searchPhone.startsWith('0')) searchPhone = searchPhone.substring(1);

                const res = await contactAPI.getContacts(workspaceId, { 
                    search: searchPhone,
                    limit: 5 
                });
                
                setPhoneSearchResults(res.data?.contacts || []);
            } catch (e) {
                console.error(e);
            } finally {
                setIsSearchingPhone(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [workspaceId, isOpen, newConversationPhone, newConversationPhonePrefix]);

    const handleCreateNewConversation = async () => {
        if (!newConversationPhone || !workspaceId) return;

        setCreatingConversation(true);
        try {
            let phone = newConversationPhone.replace(/[\s\-\(\)]/g, '');
            
            if (!phone.startsWith('+')) {
                if (phone.startsWith('0')) {
                    phone = phone.substring(1);
                }
                const countryCode = newConversationPhonePrefix.replace('+', '');
                if (phone.startsWith(countryCode)) {
                    phone = '+' + phone;
                } else {
                    phone = newConversationPhonePrefix + phone;
                }
            }

            const response = await conversationAPI.createManual(workspaceId, {
                phone,
                name: newConversationName || `Müşteri ${phone.slice(-4)}`,
                description: newConversationMessage || null,
                meetingType,
                ...(leadSource && { leadSource }),
                ...(leadSourceDetail && { leadSourceDetail }),
                ...(newConversationTopic && { aiTopic: newConversationTopic }),
                ...(newConversationFunnel && { funnelType: newConversationFunnel }),
                ...(newConversationFunnelStage && { funnelStageId: newConversationFunnelStage }),
                ...(newConversationDate && { date: new Date(newConversationDate).toISOString() })
            });

            onClose();
            if (onSuccess && response?.data?.conversation) {
                onSuccess(response.data.conversation);
            }
        } catch (error) {
            console.error('Error creating conversation:', error);
            alert(error.response?.data?.error || 'Görüşme oluşturulurken bir hata oluştu');
        } finally {
            setCreatingConversation(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Yeni Görüşme Başlat</h2>
                    <button className="modal-close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    <div className="form-group">
                        <label>
                            <Phone size={18} />
                            Telefon Numarası <span className="required">*</span>
                        </label>
                        <div className="phone-input-with-prefix">
                            <select
                                className="phone-prefix-select"
                                value={newConversationPhonePrefix}
                                onChange={(e) => setNewConversationPhonePrefix(e.target.value)}
                            >
                                <option value="+90">🇹🇷 +90</option>
                                <option value="+44">🇬🇧 +44</option>
                                <option value="+49">🇩🇪 +49</option>
                                <option value="+1">🇺🇸 +1</option>
                                <option value="+33">🇫🇷 +33</option>
                                <option value="+39">🇮🇹 +39</option>
                                <option value="+34">🇪🇸 +34</option>
                                <option value="+31">🇳🇱 +31</option>
                                <option value="+46">🇸🇪 +46</option>
                                <option value="+47">🇳🇴 +47</option>
                                <option value="+45">🇩🇰 +45</option>
                                <option value="+43">🇦🇹 +43</option>
                                <option value="+41">🇨🇭 +41</option>
                                <option value="+32">🇧🇪 +32</option>
                                <option value="+48">🇵🇱 +48</option>
                                <option value="+30">🇬🇷 +30</option>
                                <option value="+7">🇷🇺 +7</option>
                                <option value="+380">🇺🇦 +380</option>
                                <option value="+966">🇸🇦 +966</option>
                                <option value="+971">🇦🇪 +971</option>
                                <option value="+974">🇶🇦 +974</option>
                                <option value="+973">🇧🇭 +973</option>
                                <option value="+965">🇰🇼 +965</option>
                                <option value="+962">🇯🇴 +962</option>
                                <option value="+961">🇱🇧 +961</option>
                                <option value="+964">🇮🇶 +964</option>
                                <option value="+98">🇮🇷 +98</option>
                                <option value="+20">🇪🇬 +20</option>
                                <option value="+212">🇲🇦 +212</option>
                                <option value="+213">🇩🇿 +213</option>
                                <option value="+216">🇹🇳 +216</option>
                                <option value="+91">🇮🇳 +91</option>
                                <option value="+86">🇨🇳 +86</option>
                                <option value="+81">🇯🇵 +81</option>
                                <option value="+82">🇰🇷 +82</option>
                                <option value="+55">🇧🇷 +55</option>
                                <option value="+61">🇦🇺 +61</option>
                            </select>
                            <input
                                type="tel"
                                placeholder="5xxxxxxxxx"
                                value={newConversationPhone}
                                onChange={(e) => setNewConversationPhone(e.target.value)}
                            />
                        </div>
                        {isSearchingPhone && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Kişilerde aranıyor...</div>}
                        {phoneSearchResults.length > 0 && (
                            <div className="phone-search-results" style={{
                                border: '1px solid #e2e8f0', borderRadius: 6, marginTop: 4, maxHeight: 150, overflowY: 'auto', backgroundColor: '#fff'
                            }}>
                                {phoneSearchResults.map(c => (
                                    <div 
                                        key={c.id} 
                                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}
                                        onClick={() => {
                                            let p = c.phone || '';
                                            const prefix = newConversationPhonePrefix;
                                            if (p.startsWith(prefix)) {
                                                p = p.substring(prefix.length);
                                            } else if (p.startsWith(prefix.substring(1))) {
                                                p = p.substring(prefix.length - 1);
                                            }
                                            setNewConversationPhone(p);
                                            setNewConversationName(c.name);
                                            setPhoneSearchResults([]);
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <strong>{c.name}</strong> <span style={{color: '#64748b', marginLeft: 6}}>{c.phone}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="form-group">
                        <label>
                            <User size={18} />
                            Müşteri Adı
                        </label>
                        <input
                            type="text"
                            placeholder="İsim Soyisim"
                            value={newConversationName}
                            onChange={(e) => setNewConversationName(e.target.value)}
                        />
                    </div>
                    
                    {/* Görüşme Tipi */}
                    <div className="form-group">
                        <label style={{ marginBottom: 8 }}>
                            📋 Görüşme Tipi
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                type="button"
                                onClick={() => setMeetingType('PHONE')}
                                style={{
                                    flex: 1, padding: '10px 16px', borderRadius: 8, border: '2px solid',
                                    borderColor: meetingType === 'PHONE' ? '#3b82f6' : '#e2e8f0',
                                    backgroundColor: meetingType === 'PHONE' ? '#eff6ff' : '#fff',
                                    cursor: 'pointer', fontSize: 14, fontWeight: 500,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                }}
                            >
                                📞 Arama
                            </button>
                            <button
                                type="button"
                                onClick={() => setMeetingType('WALK_IN')}
                                style={{
                                    flex: 1, padding: '10px 16px', borderRadius: 8, border: '2px solid',
                                    borderColor: meetingType === 'WALK_IN' ? '#3b82f6' : '#e2e8f0',
                                    backgroundColor: meetingType === 'WALK_IN' ? '#eff6ff' : '#fff',
                                    cursor: 'pointer', fontSize: 14, fontWeight: 500,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                }}
                            >
                                🤝 Yüz Yüze
                            </button>
                        </div>
                    </div>

                    {/* Kaynak */}
                    <div className="form-group">
                        <label>
                            📍 Bizi Nereden Buldunuz?
                        </label>
                        <select
                            value={leadSource}
                            onChange={(e) => setLeadSource(e.target.value)}
                        >
                            <option value="">-- Kaynak Seç --</option>
                            {LEAD_SOURCES.map(s => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                        </select>
                        {leadSource && (
                            <input
                                type="text"
                                placeholder="Detay (opsiyonel): Instagram reklamı, Ahmet Bey referansı..."
                                value={leadSourceDetail}
                                onChange={(e) => setLeadSourceDetail(e.target.value)}
                                style={{ marginTop: 6 }}
                            />
                        )}
                    </div>

                    <div className="form-group">
                        <label>
                            <Filter size={18} />
                            Akış (Funnel) Seçimi
                        </label>
                        <select
                            value={newConversationFunnel}
                            onChange={(e) => {
                                setNewConversationFunnel(e.target.value);
                                setNewConversationFunnelStage(''); // Reset stage on funnel change
                            }}
                        >
                            <option value="">-- Akış Seç --</option>
                            {funnelOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Stage Selection - Only show if selected funnel has stages */}
                    {newConversationFunnel && funnelOptions.find(f => f.value === newConversationFunnel)?.stages && (
                        <div className="form-group">
                            <label>
                                <Tag size={18} />
                                Aşama Seçimi
                            </label>
                            <select
                                value={newConversationFunnelStage}
                                onChange={(e) => setNewConversationFunnelStage(e.target.value)}
                            >
                                <option value="">-- Aşama Seç --</option>
                                {funnelOptions.find(f => f.value === newConversationFunnel).stages.map(stage => (
                                    <option key={stage.value} value={stage.value}>{stage.label}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    
                    <div className="form-group">
                        <label>
                            <Calendar size={18} />
                            Görüşme Tarihi (Geçmişe Dönük Kayıt İçin)
                        </label>
                        <input
                            type="datetime-local"
                            value={newConversationDate}
                            onChange={(e) => setNewConversationDate(e.target.value)}
                        />
                        <small style={{display: 'block', marginTop: '4px', color: '#6b7280', fontSize: '11px'}}>Varsayılan olarak şu anki zaman seçilidir.</small>
                    </div>

                    <div className="form-group">
                        <label>
                            <Target size={18} />
                            Konu Başlığı *
                        </label>
                        <input
                            type="text"
                            placeholder="Örn: Doğum Paketi Bilgi, Fiyat Talebi..."
                            value={newConversationTopic}
                            onChange={(e) => setNewConversationTopic(e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label>
                            <MessageSquare size={18} />
                            İlk Mesaj
                        </label>
                        <textarea
                            placeholder="Merhaba! Size nasıl yardımcı olabilirim?"
                            value={newConversationMessage}
                            onChange={(e) => setNewConversationMessage(e.target.value)}
                            rows={3}
                        />
                    </div>
                </div>
                <div className="modal-footer">
                    <button
                        className="btn-cancel"
                        onClick={onClose}
                    >
                        İptal
                    </button>
                    <button
                        className="btn-submit"
                        onClick={handleCreateNewConversation}
                        disabled={!newConversationPhone || !newConversationTopic.trim() || creatingConversation}
                    >
                        {creatingConversation ? 'Oluşturuluyor...' : 'Görüşme Başlat'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NewConversationModal;

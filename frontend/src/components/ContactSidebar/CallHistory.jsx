import { useState, useEffect } from 'react';
import { Phone, Clock, ChevronRight, Play, Pause, Smile, Frown, Meh, FileText, Loader, X, PhoneCall, Mic, Calendar, Trash2 } from 'lucide-react';
import { retellAPI } from '../../services/api';

const sentimentConfig = {
    'Positive': { icon: Smile, color: '#10b981', label: 'Olumlu', bg: '#ecfdf5' },
    'Negative': { icon: Frown, color: '#ef4444', label: 'Olumsuz', bg: '#fef2f2' },
    'Neutral': { icon: Meh, color: '#6b7280', label: 'Nötr', bg: '#f3f4f6' }
};

const statusLabels = {
    'PENDING': { label: 'Bekliyor', color: '#f59e0b', bg: '#fffbeb' },
    'COMPLETED': { label: 'Tamamlandı', color: '#10b981', bg: '#ecfdf5' },
    'FAILED': { label: 'Başarısız', color: '#ef4444', bg: '#fef2f2' },
    'CANCELLED': { label: 'İptal', color: '#6b7280', bg: '#f3f4f6' }
};

const CallHistory = ({ workspaceId, contactId, refreshKey = 0 }) => {
    const [calls, setCalls] = useState([]);
    const [scheduledCalls, setScheduledCalls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCall, setSelectedCall] = useState(null);
    const [playingAudio, setPlayingAudio] = useState(false);

    useEffect(() => {
        if (!workspaceId || !contactId) return;
        loadCalls();
        loadScheduledCalls();
    }, [workspaceId, contactId, refreshKey]);

    const loadCalls = async () => {
        try {
            setLoading(true);
            const res = await retellAPI.getCallHistory(workspaceId, { contactId, limit: 10 });
            setCalls(res.data.calls || []);
        } catch (err) {
            console.error('Error loading call history:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadScheduledCalls = async () => {
        try {
            const res = await retellAPI.getScheduledCalls(workspaceId);
            // Filter for this contact's scheduled calls
            const contactCalls = (res.data.scheduledCalls || []).filter(sc =>
                sc.contactId === contactId && sc.status === 'PENDING'
            );
            setScheduledCalls(contactCalls);
        } catch (err) {
            console.error('Error loading scheduled calls:', err);
        }
    };

    const cancelScheduledCall = async (id) => {
        if (!confirm('Bu planlanmış aramayı iptal etmek istiyor musunuz?')) return;
        try {
            await retellAPI.cancelScheduledCall(workspaceId, id);
            setScheduledCalls(prev => prev.filter(sc => sc.id !== id));
        } catch (err) {
            alert('İptal başarısız');
        }
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '0sn';
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        return min > 0 ? `${min}dk ${sec}sn` : `${sec}sn`;
    };

    const formatDate = (date) => {
        const d = new Date(date);
        const now = new Date();
        const diffMs = now - d;
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours < 1) return `${Math.round(diffMs / (1000 * 60))} dk önce`;
        if (diffHours < 24) return `${Math.round(diffHours)} saat önce`;

        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const formatScheduledDate = (date) => {
        return new Date(date).toLocaleDateString('tr-TR', {
            day: '2-digit', month: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const formatFullDate = (date) => {
        return new Date(date).toLocaleDateString('tr-TR', {
            day: '2-digit', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const toggleAudio = () => {
        const audio = document.getElementById('call-detail-audio');
        if (!audio) return;
        if (playingAudio) {
            audio.pause();
            setPlayingAudio(false);
        } else {
            audio.play();
            setPlayingAudio(true);
            audio.onended = () => setPlayingAudio(false);
        }
    };

    if (loading) {
        return (
            <div style={{ padding: '12px', textAlign: 'center', color: '#9ca3af' }}>
                <Loader size={16} className="spin" /> Yükleniyor...
            </div>
        );
    }

    if (calls.length === 0 && scheduledCalls.length === 0) {
        return (
            <div style={{ padding: '12px 16px', color: '#9ca3af', fontSize: '0.8rem', textAlign: 'center' }}>
                Henüz arama kaydı yok
            </div>
        );
    }

    return (
        <>
            {/* Scheduled Calls */}
            {scheduledCalls.length > 0 && (
                <div className="scheduled-calls-section">
                    <div className="scheduled-calls-label">
                        <Calendar size={12} /> PLANLANMIŞ GÖREVLER
                    </div>
                    {scheduledCalls.map(sc => (
                        <div key={sc.id} className="scheduled-call-item">
                            <div className="scheduled-call-info">
                                <Calendar size={14} style={{ color: '#3b82f6' }} />
                                <span className="scheduled-call-date">{formatScheduledDate(sc.scheduledAt)}</span>
                                <span className="scheduled-call-status" style={{ background: statusLabels.PENDING.bg, color: statusLabels.PENDING.color }}>
                                    {statusLabels.PENDING.label}
                                </span>
                            </div>
                            <button className="scheduled-call-cancel" onClick={() => cancelScheduledCall(sc.id)} title="İptal Et">
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Call list in sidebar */}
            <div className="call-history-list">
                {calls.map(call => {
                    const sentiment = sentimentConfig[call.sentiment];
                    const SentimentIcon = sentiment?.icon || Meh;

                    return (
                        <div
                            key={call.id}
                            className="call-history-item"
                            onClick={() => { setSelectedCall(call); setPlayingAudio(false); }}
                        >
                            <div className="call-history-header">
                                <div className="call-history-info">
                                    <div className="call-history-top">
                                        <Phone size={14} style={{ color: call.status === 'ended' ? '#10b981' : '#f59e0b' }} />
                                        <span className="call-history-date">{formatDate(call.createdAt)}</span>
                                        <span className="call-history-duration">{formatDuration(call.duration)}</span>
                                    </div>
                                    <div className="call-history-bottom">
                                        {call.sentiment && (
                                            <span className="call-sentiment-badge" style={{ background: sentiment?.bg, color: sentiment?.color }}>
                                                <SentimentIcon size={12} />
                                                {sentiment?.label}
                                            </span>
                                        )}
                                        {call.callSuccessful !== null && (
                                            <span className={`call-success-badge ${call.callSuccessful ? 'success' : 'failed'}`}>
                                                {call.callSuccessful ? '✓ Başarılı' : '✗ Başarısız'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <ChevronRight size={16} style={{ color: '#9ca3af' }} />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Call Detail Modal */}
            {selectedCall && (
                <div className="call-modal-overlay" onClick={() => setSelectedCall(null)}>
                    <div className="call-modal" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="call-modal-header">
                            <div className="call-modal-title">
                                <PhoneCall size={22} style={{ color: '#10b981' }} />
                                <div>
                                    <h2>Arama Detayı</h2>
                                    <span className="call-modal-date">{formatFullDate(selectedCall.createdAt)}</span>
                                </div>
                            </div>
                            <button className="call-modal-close" onClick={() => setSelectedCall(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Stats bar */}
                        <div className="call-modal-stats">
                            <div className="call-stat">
                                <Clock size={16} />
                                <span>{formatDuration(selectedCall.duration)}</span>
                            </div>
                            <div className="call-stat">
                                <Phone size={16} />
                                <span>{selectedCall.toNumber}</span>
                            </div>
                            {selectedCall.sentiment && (() => {
                                const s = sentimentConfig[selectedCall.sentiment];
                                const SIcon = s?.icon || Meh;
                                return (
                                    <div className="call-stat" style={{ color: s?.color }}>
                                        <SIcon size={16} />
                                        <span>{s?.label}</span>
                                    </div>
                                );
                            })()}
                            {selectedCall.callSuccessful !== null && (
                                <div className={`call-stat ${selectedCall.callSuccessful ? 'stat-success' : 'stat-failed'}`}>
                                    <span>{selectedCall.callSuccessful ? '✓ Başarılı' : '✗ Başarısız'}</span>
                                </div>
                            )}
                        </div>

                        {/* Content */}
                        <div className="call-modal-content">
                            {/* Summary */}
                            {selectedCall.summary && (
                                <div className="call-modal-section">
                                    <h3><FileText size={16} /> Arama Özeti</h3>
                                    <div className="call-modal-summary">
                                        {selectedCall.summary}
                                    </div>
                                </div>
                            )}

                            {/* Audio Player */}
                            {selectedCall.recordingUrl && (
                                <div className="call-modal-section">
                                    <h3><Mic size={16} /> Ses Kaydı</h3>
                                    <div className="call-audio-player">
                                        <button className="call-audio-btn" onClick={toggleAudio}>
                                            {playingAudio ? <Pause size={18} /> : <Play size={18} />}
                                        </button>
                                        <audio
                                            id="call-detail-audio"
                                            src={selectedCall.recordingUrl}
                                            preload="none"
                                            controls
                                            style={{ flex: 1, height: 36 }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Transcript */}
                            {selectedCall.transcript && (
                                <div className="call-modal-section">
                                    <h3><FileText size={16} /> Konuşma Transkripti</h3>
                                    <div className="call-modal-transcript">
                                        {selectedCall.transcript.split('\n').filter(l => l.trim()).map((line, i) => {
                                            const isAgent = line.startsWith('Agent:') || line.startsWith('AI:');
                                            const speaker = isAgent ? 'Agent' : 'Müşteri';
                                            const text = line.replace(/^(Agent:|AI:|User:|Customer:)\s*/i, '');

                                            return (
                                                <div key={i} className={`transcript-bubble ${isAgent ? 'agent' : 'user'}`}>
                                                    <span className="transcript-speaker">{speaker}</span>
                                                    <p className="transcript-text">{text || line}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* No data message */}
                            {!selectedCall.summary && !selectedCall.transcript && !selectedCall.recordingUrl && (
                                <div className="call-modal-empty">
                                    <Meh size={32} style={{ color: '#d1d5db' }} />
                                    <p>Bu arama için henüz detay bilgisi yok.</p>
                                    <span>Arama tamamlandıktan sonra transkript ve analiz otomatik olarak eklenecektir.</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default CallHistory;

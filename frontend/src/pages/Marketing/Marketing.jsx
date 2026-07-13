import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import './Marketing.css';

const STATUS_COLORS = {
    SENT:      { bg: '#eff6ff', text: '#2563eb', label: 'Gönderildi' },
    DELIVERED: { bg: '#f0fdf4', text: '#16a34a', label: 'Teslim Edildi' },
    READ:      { bg: '#fef9c3', text: '#ca8a04', label: 'Okundu' },
    FAILED:    { bg: '#fef2f2', text: '#dc2626', label: 'Başarısız' },
};

const DAY_OPTIONS = [7, 14, 30, 90];

function StatBig({ icon, label, value, sub, color }) {
    return (
        <div className="mkt-stat-card">
            <div className="mkt-stat-icon" style={{ background: color + '18' }}>{icon}</div>
            <div>
                <div className="mkt-stat-value" style={{ color }}>{value}</div>
                <div className="mkt-stat-label">{label}</div>
                {sub && <div className="mkt-stat-sub">{sub}</div>}
            </div>
        </div>
    );
}

function MiniBar({ value, max, color }) {
    const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    return (
        <div className="mkt-mini-bar-wrap">
            <div className="mkt-mini-bar-bg">
                <div className="mkt-mini-bar-fill" style={{ width: pct + '%', background: color }} />
            </div>
            <span className="mkt-mini-bar-pct">{pct}%</span>
        </div>
    );
}

export default function Marketing() {
    const { currentWorkspace } = useAuth();
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedTemplate, setSelectedTemplate] = useState(null);

    const wsId = currentWorkspace?.id;

    const fetchAnalytics = useCallback(async () => {
        if (!wsId) return;
        setLoading(true);
        try {
            const res = await api.get(`/marketing/${wsId}/template-analytics?days=${days}`);
            setData(res.data);
            setSelectedTemplate(null);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    }, [wsId, days]);

    useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

    const overall = data?.overall || {};
    const templates = data?.templates || [];
    const sel = selectedTemplate ? templates.find(t => t.templateName === selectedTemplate) : null;

    const readRate = overall.totalSent > 0
        ? Math.round((overall.totalRead / overall.totalSent) * 100) : 0;
    const deliveryRate = overall.totalSent > 0
        ? Math.round((overall.totalDelivered / overall.totalSent) * 100) : 0;

    return (
        <div className="mkt-page">
            {/* Header */}
            <div className="mkt-header">
                <div className="mkt-header-left">
                    <span className="mkt-header-icon">📊</span>
                    <div>
                        <h1 className="mkt-header-title">Pazarlama Analizi</h1>
                        <p className="mkt-header-sub">WhatsApp şablon mesaj istatistikleri</p>
                    </div>
                </div>
                <div className="mkt-header-actions">
                    <div className="mkt-day-selector">
                        {DAY_OPTIONS.map(d => (
                            <button
                                key={d}
                                className={`mkt-day-btn ${days === d ? 'active' : ''}`}
                                onClick={() => setDays(d)}
                            >
                                Son {d} gün
                            </button>
                        ))}
                    </div>
                    <button className="mkt-refresh-btn" onClick={fetchAnalytics} disabled={loading}>
                        {loading ? '⏳' : '🔄'} Yenile
                    </button>
                </div>
            </div>

            {/* Overall Stats */}
            <div className="mkt-stats-row">
                <StatBig
                    icon="📤"
                    label="Toplam Gönderim"
                    value={overall.totalSent ?? 0}
                    sub={`${overall.uniqueTemplates ?? 0} farklı şablon`}
                    color="#2563eb"
                />
                <StatBig
                    icon="📦"
                    label="Teslim Edildi"
                    value={overall.totalDelivered ?? 0}
                    sub={`%${deliveryRate} teslim oranı`}
                    color="#16a34a"
                />
                <StatBig
                    icon="👁"
                    label="Okundu"
                    value={overall.totalRead ?? 0}
                    sub={`%${readRate} okunma oranı`}
                    color="#ca8a04"
                />
                <StatBig
                    icon="❌"
                    label="Başarısız"
                    value={overall.totalFailed ?? 0}
                    sub={overall.totalSent > 0 ? `%${Math.round((overall.totalFailed / overall.totalSent) * 100)} hata oranı` : ''}
                    color="#dc2626"
                />
            </div>

            {/* Content */}
            <div className="mkt-content">
                {loading && (
                    <div className="mkt-loading">
                        <div className="mkt-loading-spinner" />
                        Veriler yükleniyor...
                    </div>
                )}

                {!loading && templates.length === 0 && (
                    <div className="mkt-empty">
                        <div className="mkt-empty-icon">📭</div>
                        <p>Son {days} günde gönderilmiş şablon mesajı bulunamadı.</p>
                        <small>Otomasyonlar sayfasından WhatsApp şablonu gönderdiğinizde burada görünecek.</small>
                    </div>
                )}

                {!loading && templates.length > 0 && (
                    <div className="mkt-analytics-layout">
                        {/* Template list */}
                        <div className="mkt-template-list">
                            <div className="mkt-list-title">Şablonlar ({templates.length})</div>
                            {templates.map(t => (
                                <div
                                    key={t.templateName}
                                    className={`mkt-template-row ${selectedTemplate === t.templateName ? 'selected' : ''}`}
                                    onClick={() => setSelectedTemplate(
                                        selectedTemplate === t.templateName ? null : t.templateName
                                    )}
                                >
                                    <div className="mkt-tpl-top">
                                        <span className="mkt-tpl-name">{t.templateName}</span>
                                        <span className="mkt-tpl-total">{t.total} gönderim</span>
                                    </div>
                                    <div className="mkt-tpl-bars">
                                        <div className="mkt-tpl-bar-row">
                                            <span>Teslim</span>
                                            <MiniBar value={t.delivered + t.read} max={t.total} color="#16a34a" />
                                        </div>
                                        <div className="mkt-tpl-bar-row">
                                            <span>Okundu</span>
                                            <MiniBar value={t.read} max={t.total} color="#ca8a04" />
                                        </div>
                                        {t.failed > 0 && (
                                            <div className="mkt-tpl-bar-row">
                                                <span>Başarısız</span>
                                                <MiniBar value={t.failed} max={t.total} color="#dc2626" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="mkt-tpl-date">
                                        Son: {t.lastSentAt ? new Date(t.lastSentAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Detail panel */}
                        {sel ? (
                            <div className="mkt-detail-panel">
                                <div className="mkt-detail-title">
                                    <span>📄 {sel.templateName}</span>
                                    <button className="mkt-close-btn" onClick={() => setSelectedTemplate(null)}>✕</button>
                                </div>

                                {/* Big numbers */}
                                <div className="mkt-detail-grid">
                                    <div className="mkt-detail-stat">
                                        <div className="mkt-detail-stat-value" style={{ color: '#2563eb' }}>{sel.total}</div>
                                        <div className="mkt-detail-stat-label">Toplam Gönderim</div>
                                    </div>
                                    <div className="mkt-detail-stat">
                                        <div className="mkt-detail-stat-value" style={{ color: '#16a34a' }}>{sel.delivered + sel.read}</div>
                                        <div className="mkt-detail-stat-label">Teslim Edildi</div>
                                    </div>
                                    <div className="mkt-detail-stat">
                                        <div className="mkt-detail-stat-value" style={{ color: '#ca8a04' }}>{sel.read}</div>
                                        <div className="mkt-detail-stat-label">Okundu</div>
                                    </div>
                                    <div className="mkt-detail-stat">
                                        <div className="mkt-detail-stat-value" style={{ color: '#dc2626' }}>{sel.failed}</div>
                                        <div className="mkt-detail-stat-label">Başarısız</div>
                                    </div>
                                </div>

                                {/* Rate bars */}
                                <div className="mkt-rate-section">
                                    <div className="mkt-rate-row">
                                        <span className="mkt-rate-label">📦 Teslim Oranı</span>
                                        <div className="mkt-rate-bar-bg">
                                            <div className="mkt-rate-bar-fill" style={{ width: sel.deliveryRate + '%', background: '#16a34a' }} />
                                        </div>
                                        <span className="mkt-rate-pct" style={{ color: '#16a34a' }}>%{sel.deliveryRate}</span>
                                    </div>
                                    <div className="mkt-rate-row">
                                        <span className="mkt-rate-label">👁 Okunma Oranı</span>
                                        <div className="mkt-rate-bar-bg">
                                            <div className="mkt-rate-bar-fill" style={{ width: sel.readRate + '%', background: '#ca8a04' }} />
                                        </div>
                                        <span className="mkt-rate-pct" style={{ color: '#ca8a04' }}>%{sel.readRate}</span>
                                    </div>
                                    <div className="mkt-rate-row">
                                        <span className="mkt-rate-label">❌ Hata Oranı</span>
                                        <div className="mkt-rate-bar-bg">
                                            <div className="mkt-rate-bar-fill" style={{ width: sel.failRate + '%', background: '#dc2626' }} />
                                        </div>
                                        <span className="mkt-rate-pct" style={{ color: '#dc2626' }}>%{sel.failRate}</span>
                                    </div>
                                </div>

                                {/* Funnel */}
                                <div className="mkt-funnel">
                                    <div className="mkt-funnel-title">📈 Dönüşüm Hunisi</div>
                                    <div className="mkt-funnel-steps">
                                        <div className="mkt-funnel-step" style={{ '--w': '100%', '--c': '#2563eb' }}>
                                            <span>Gönderildi</span><strong>{sel.total}</strong>
                                        </div>
                                        <div className="mkt-funnel-step" style={{ '--w': sel.deliveryRate + '%', '--c': '#16a34a' }}>
                                            <span>Teslim Edildi</span><strong>{sel.delivered + sel.read}</strong>
                                        </div>
                                        <div className="mkt-funnel-step" style={{ '--w': sel.readRate + '%', '--c': '#ca8a04' }}>
                                            <span>Okundu</span><strong>{sel.read}</strong>
                                        </div>
                                        {sel.failed > 0 && (
                                            <div className="mkt-funnel-step failed" style={{ '--w': sel.failRate + '%', '--c': '#dc2626' }}>
                                                <span>Başarısız</span><strong>{sel.failed}</strong>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="mkt-detail-panel mkt-detail-empty">
                                <div className="mkt-empty-icon">👈</div>
                                <p>Detay görmek için sol listeden bir şablon seçin.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

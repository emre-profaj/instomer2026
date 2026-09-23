import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, FileText, ChevronRight, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { contactAPI } from '../../services/api';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';
import '../Analytics/reportDesign.css';
import './SalesReport.css';

const tr = (n) => Number(n || 0).toLocaleString('tr-TR');
const money = (n) => Number(n || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

const AttributionReport = () => {
    const navigate = useNavigate();
    const { currentWorkspace } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('source');
    
    const [dateFilter, setDateFilter] = useState(() => sessionStorage.getItem('attrDateFilter') || 'thisMonth');
    const [startDate, setStartDate] = useState(() => sessionStorage.getItem('attrStartDate') || '');
    const [endDate, setEndDate] = useState(() => sessionStorage.getItem('attrEndDate') || '');
    
    const [openSource, setOpenSource] = useState({});

    useEffect(() => {
        sessionStorage.setItem('attrDateFilter', dateFilter);
        sessionStorage.setItem('attrStartDate', startDate);
        sessionStorage.setItem('attrEndDate', endDate);
    }, [dateFilter, startDate, endDate]);

    const fetchData = async () => {
        if (!currentWorkspace?.id) return;
        setLoading(true);
        try {
            const res = await contactAPI.getAttributionReport(
                currentWorkspace.id, getDateRangeLogic(dateFilter, startDate, endDate)
            );
            setData(res.data);
        } catch (err) {
            console.error('Attribution report error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate]);

    if (loading && !data) {
        return (
            <div className="ra-page">
                <div className="ra-loading">
                    <RefreshCw className="ra-spin" size={30} />
                    <p style={{ fontWeight: 600, marginTop: 14, fontSize: '0.85rem' }}>Kaynak & Attribution Raporu yükleniyor…</p>
                </div>
            </div>
        );
    }

    const {
        totalCases = 0,
        totalContacts = 0,
        totalRevenue = 0,
        totalOrders = 0,
        sourceGroups = [],
        channelGroups = [],
        firstTouchAttribution = [],
        lastTouchAttribution = []
    } = data || {};

    const toggleSource = (name) => {
        setOpenSource(p => ({ ...p, [name]: !p[name] }));
    };

    const renderTabNav = () => (
        <div className="ra-tabs" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #e2e8f0', marginBottom: '1.5rem', paddingBottom: '0.5rem' }}>
            {[
                { id: 'source', label: '🎯 Kaynak Bazlı' },
                { id: 'channel', label: '📡 Kanal Bazlı' },
                { id: 'touch', label: '🔄 First-Touch vs Last-Touch' },
                { id: 'detail', label: '📋 Detay' }
            ].map(t => (
                <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    style={{
                        padding: '0.5rem 1rem',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeTab === t.id ? '2px solid #3b82f6' : '2px solid transparent',
                        color: activeTab === t.id ? '#1e293b' : '#64748b',
                        fontWeight: activeTab === t.id ? '600' : '400',
                        cursor: 'pointer',
                        fontSize: '0.95rem'
                    }}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );

    const renderSourceTab = (isDetail = false) => (
        <div className="ra-surface">
            <div className="ra-slist head" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr 1fr' }}>
                <span>Kaynak</span>
                <span style={{ textAlign: 'right' }}>Başvuru</span>
                <span style={{ textAlign: 'right' }}>Müşteri</span>
                <span style={{ textAlign: 'right' }}>Sipariş</span>
                <span style={{ textAlign: 'right' }}>Gelir (₺)</span>
                <span style={{ textAlign: 'right' }}>Dönüşüm</span>
            </div>
            {sourceGroups.length === 0 ? (
                <div className="ra-empty">Kayıt bulunamadı.</div>
            ) : (
                sourceGroups.map((s, i) => {
                    const isOpen = isDetail || openSource[s.name];
                    const conversion = s.cases > 0 ? ((s.contacts / s.cases) * 100).toFixed(1) : 0;
                    return (
                        <React.Fragment key={i}>
                            <div className="ra-slist clickable" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr 1fr', fontWeight: '500', alignItems: 'center' }} onClick={() => !isDetail && toggleSource(s.name)}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {!isDetail && <ChevronRight size={14} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />}
                                    {s.name || 'Bilinmeyen'}
                                </div>
                                <span style={{ textAlign: 'right' }}>{tr(s.cases)}</span>
                                <span style={{ textAlign: 'right' }}>{tr(s.contacts)}</span>
                                <span style={{ textAlign: 'right' }}>{tr(s.orders)}</span>
                                <span style={{ textAlign: 'right', fontWeight: '600' }}>{money(s.revenue)}</span>
                                <span style={{ textAlign: 'right' }}>%{conversion}</span>
                            </div>
                            {isOpen && (s.campaigns || []).map((c, ci) => (
                                <div className="ra-slist" key={`${i}-${ci}`} style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr 1fr', background: '#f8fafc', fontSize: '0.9rem' }}>
                                    <div style={{ paddingLeft: '2rem', color: '#64748b' }}>└ {c.name || 'Bilinmeyen Kampanya'}</div>
                                    <span style={{ textAlign: 'right' }}>{tr(c.cases)}</span>
                                    <span style={{ textAlign: 'right' }}>{tr(c.contacts)}</span>
                                    <span style={{ textAlign: 'right' }}>{tr(c.orders)}</span>
                                    <span style={{ textAlign: 'right' }}>{money(c.revenue)}</span>
                                    <span style={{ textAlign: 'right' }}>—</span>
                                </div>
                            ))}
                        </React.Fragment>
                    );
                })
            )}
        </div>
    );

    const renderChannelTab = () => (
        <div className="ra-surface">
            <div className="ra-slist head" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr' }}>
                <span>Kanal</span>
                <span style={{ textAlign: 'right' }}>Başvuru</span>
                <span style={{ textAlign: 'right' }}>Müşteri</span>
                <span style={{ textAlign: 'right' }}>Sipariş</span>
                <span style={{ textAlign: 'right' }}>Gelir (₺)</span>
            </div>
            {channelGroups.length === 0 ? (
                <div className="ra-empty">Kayıt bulunamadı.</div>
            ) : (
                channelGroups.map((c, i) => (
                    <div className="ra-slist" key={i} style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr' }}>
                        <div>{c.name || 'Bilinmeyen'}</div>
                        <span style={{ textAlign: 'right' }}>{tr(c.cases)}</span>
                        <span style={{ textAlign: 'right' }}>{tr(c.contacts)}</span>
                        <span style={{ textAlign: 'right' }}>{tr(c.orders)}</span>
                        <span style={{ textAlign: 'right', fontWeight: '600' }}>{money(c.revenue)}</span>
                    </div>
                ))
            )}
        </div>
    );

    const renderTouchTab = () => (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="ra-surface">
                <div className="ra-sec"><h2>İlk Temas (First-Touch)</h2></div>
                <div className="ra-slist head" style={{ gridTemplateColumns: '2fr 1fr 1.5fr' }}>
                    <span>Kaynak</span>
                    <span style={{ textAlign: 'right' }}>Adet</span>
                    <span style={{ textAlign: 'right' }}>Gelir (₺)</span>
                </div>
                {firstTouchAttribution.length === 0 ? (
                    <div className="ra-empty">Kayıt bulunamadı.</div>
                ) : (
                    firstTouchAttribution.map((t, i) => (
                        <div className="ra-slist" key={i} style={{ gridTemplateColumns: '2fr 1fr 1.5fr' }}>
                            <div>{t.name || 'Bilinmeyen'}</div>
                            <span style={{ textAlign: 'right' }}>{tr(t.count)}</span>
                            <span style={{ textAlign: 'right' }}>{money(t.revenue)}</span>
                        </div>
                    ))
                )}
            </div>
            <div className="ra-surface">
                <div className="ra-sec"><h2>Son Temas (Last-Touch)</h2></div>
                <div className="ra-slist head" style={{ gridTemplateColumns: '2fr 1fr 1.5fr' }}>
                    <span>Kaynak</span>
                    <span style={{ textAlign: 'right' }}>Adet</span>
                    <span style={{ textAlign: 'right' }}>Gelir (₺)</span>
                </div>
                {lastTouchAttribution.length === 0 ? (
                    <div className="ra-empty">Kayıt bulunamadı.</div>
                ) : (
                    lastTouchAttribution.map((t, i) => (
                        <div className="ra-slist" key={i} style={{ gridTemplateColumns: '2fr 1fr 1.5fr' }}>
                            <div>{t.name || 'Bilinmeyen'}</div>
                            <span style={{ textAlign: 'right' }}>{tr(t.count)}</span>
                            <span style={{ textAlign: 'right' }}>{money(t.revenue)}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );

    return (
        <div className="ra-page">
            <div className="ra-wrap">

                <div className="ra-head" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button className="ra-btn" onClick={() => navigate('/general-report')} style={{ padding: '0.5rem' }}>
                            <ArrowLeft size={18} />
                        </button>
                        <div>
                            <div className="ra-eyebrow">Raporlar</div>
                            <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, fontSize: '1.75rem' }}>
                                📊 Kaynak & Attribution Raporu
                            </h1>
                            <p style={{ margin: '0.25rem 0 0 0', color: '#64748b' }}>Pazarlama kaynakları ve kanalların gelir katkısı</p>
                        </div>
                    </div>
                    <div className="ra-head-actions">
                        <button className="ra-btn" onClick={fetchData} disabled={loading}>
                            <RefreshCw className={loading ? 'ra-spin' : ''} size={14} /> Güncelle
                        </button>
                        <button className="ra-btn ra-btn-primary" onClick={() => window.print()}>
                            <FileText size={14} /> İndir
                        </button>
                    </div>
                </div>

                <div className="ra-filters">
                    <div className="ra-pills">
                        {dateFilterOptions.map(o => (
                            <button key={o.key} className={`ra-pill${dateFilter === o.key ? ' active' : ''}`}
                                onClick={() => setDateFilter(o.key)}>{o.label}</button>
                        ))}
                    </div>
                    {dateFilter === 'custom' && (
                        <div className="ra-dates">
                            <input type="date" className="ra-date-input" value={startDate}
                                onChange={e => setStartDate(e.target.value)} />
                            <span style={{ color: '#cbd5e1' }}>—</span>
                            <input type="date" className="ra-date-input" value={endDate}
                                onChange={e => setEndDate(e.target.value)} />
                        </div>
                    )}
                </div>

                <div className="ra-surface ra-strip" style={{ marginBottom: 22, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                    <div className="ra-cell">
                        <div className="ra-cell-label"><i className="ra-cell-dot" style={{ background: '#3b82f6' }} />Toplam Başvuru</div>
                        <div className="ra-cell-value">{tr(totalCases)}</div>
                        <div className="ra-cell-sub">lead / talep</div>
                    </div>
                    <div className="ra-cell">
                        <div className="ra-cell-label"><i className="ra-cell-dot" style={{ background: '#10b981' }} />Toplam Müşteri</div>
                        <div className="ra-cell-value">{tr(totalContacts)}</div>
                        <div className="ra-cell-sub">kazanılan kişi</div>
                    </div>
                    <div className="ra-cell">
                        <div className="ra-cell-label"><i className="ra-cell-dot" style={{ background: '#f59e0b' }} />Toplam Sipariş</div>
                        <div className="ra-cell-value">{tr(totalOrders)}</div>
                        <div className="ra-cell-sub">satış adedi</div>
                    </div>
                    <div className="ra-cell">
                        <div className="ra-cell-label"><i className="ra-cell-dot" style={{ background: '#8b5cf6' }} />Toplam Gelir</div>
                        <div className="ra-cell-value">{money(totalRevenue)}</div>
                        <div className="ra-cell-sub">toplam ciro</div>
                    </div>
                </div>

                {renderTabNav()}

                {activeTab === 'source' && renderSourceTab(false)}
                {activeTab === 'channel' && renderChannelTab()}
                {activeTab === 'touch' && renderTouchTab()}
                {activeTab === 'detail' && renderSourceTab(true)}

            </div>
        </div>
    );
};

export default AttributionReport;

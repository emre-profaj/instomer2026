import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Search, FileText, TrendingDown, TrendingUp, RefreshCw, Eye, CheckCircle, XCircle, Clock, Send, Mail, Trash2, Download, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { realEstateAPI, companyAPI, workspaceAPI } from '../../services/api';
import './RealEstate.css';

const fmt = (n) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0);

const STATUS_MAP = {
    DRAFT:    { label: 'Taslak',  cls: 'draft',    icon: <Clock size={12} /> },
    SENT:     { label: 'Gönderildi', cls: 'sent',  icon: <FileText size={12} /> },
    ACCEPTED: { label: 'Kabul',   cls: 'accepted', icon: <CheckCircle size={12} /> },
    REJECTED: { label: 'Red',     cls: 'rejected', icon: <XCircle size={12} /> },
    EXPIRED:  { label: 'Süresi Doldu', cls: 'expired', icon: <Clock size={12} /> },
};

function StatusBadge({ status }) {
    const s = STATUS_MAP[status] || STATUS_MAP.DRAFT;
    return (
        <span className={`re-status-badge ${s.cls}`}>
            {s.icon} {s.label}
        </span>
    );
}

export default function RealEstateOffers() {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const wid = currentWorkspace?.id;

    const [offers, setOffers] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [selectedOffer, setSelectedOffer] = useState(null);
    const [sending, setSending] = useState(false);
    const [sendMsg, setSendMsg] = useState({ type: '', text: '' });
    const [companyInfo, setCompanyInfo] = useState(null);

    const load = async (reset = false) => {
        if (!wid) return;
        setLoading(true);
        try {
            // Paralel API çağrıları
            const pg = reset ? 1 : page;
            const [resOffers, resCompany] = await Promise.all([
                realEstateAPI.getOffers(wid, {
                    page: pg,
                    limit: 20,
                    search: search || undefined,
                    status: statusFilter || undefined,
                }),
                workspaceAPI.getCompanyInfo(wid).catch(() => ({ data: {} })) // Hata olsa bile patlamasın
            ]);

            setOffers(resOffers.data.offers || []);
            setTotal(resOffers.data.total || 0);
            if (resCompany.data?.companyInfo) {
                setCompanyInfo(resCompany.data.companyInfo);
            }
            if (reset) setPage(1);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load(true);
    }, [wid, search, statusFilter]);

    useEffect(() => {
        load();
    }, [page]);

    const handleStatusChange = async (offerId, newStatus) => {
        try {
            await realEstateAPI.updateOfferStatus(wid, offerId, newStatus);
            setOffers(o => o.map(x => x.id === offerId ? { ...x, status: newStatus } : x));
            if (selectedOffer?.id === offerId) setSelectedOffer(o => ({ ...o, status: newStatus }));
        } catch (e) {
            console.error(e);
        }
    };

    const totalPages = Math.ceil(total / 20);

    const handleSendEmail = async (offerId) => {
        setSending(true);
        setSendMsg({ type: '', text: '' });
        try {
            const res = await realEstateAPI.sendOfferEmail(wid, offerId);
            setSendMsg({ type: 'success', text: res.data.message || 'Teklif gönderildi!' });
            // Durumu SENT olarak güncelle
            setOffers(o => o.map(x => x.id === offerId ? { ...x, status: 'SENT' } : x));
            if (selectedOffer?.id === offerId) setSelectedOffer(o => ({ ...o, status: 'SENT' }));
            setTimeout(() => setSendMsg({ type: '', text: '' }), 5000);
        } catch (e) {
            const msg = e.response?.data?.message || 'Teklif gönderilemedi.';
            setSendMsg({ type: 'error', text: msg });
        } finally {
            setSending(false);
        }
    };

    const handleDeleteOffer = async (offerId) => {
        if (!window.confirm('Bu teklifi silmek istediğinize emin misiniz? (Bu işlem geri alınamaz)')) return;
        try {
            await realEstateAPI.deleteOffer(wid, offerId);
            setOffers(o => o.filter(x => x.id !== offerId));
            if (selectedOffer?.id === offerId) setSelectedOffer(null);
        } catch (e) {
            console.error('Silme hatası', e);
            alert('Teklif silinemedi.');
        }
    };

    const printRef = React.useRef(null);

    const handleDownloadPDF = (offer = null) => {
        const target = offer ? null : printRef.current;
        if (offer) {
            setSelectedOffer(offer);
            setTimeout(() => doPrint(), 150);
        } else {
            doPrint();
        }
    };

    const doPrint = () => {
        const el = printRef.current;
        if (!el) return;
        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) return;
        printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Teklif</title><style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #2c3e50; }
            .re-summary-header { background: linear-gradient(135deg, #1a2f45, #1a5276); padding: 20px 24px; color: white; border-radius: 10px 10px 0 0; display: flex; align-items: center; justify-content: space-between; }
            .re-summary-header h3 { margin: 0 0 4px; font-size: 1rem; font-weight: 700; }
            .re-summary-header p { margin: 0; font-size: 0.8125rem; opacity: 0.7; display: flex; align-items: center; gap: 8px; }
            .re-summary-body { padding: 24px; }
            .re-summary-price-block { background: linear-gradient(135deg, rgba(26,82,118,0.05), rgba(41,128,185,0.05)); border: 1px solid rgba(26,82,118,0.15); border-radius: 10px; padding: 16px; margin-bottom: 16px; text-align: center; }
            .re-summary-price-label { font-size: 0.75rem; font-weight: 600; color: #5d6d7e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
            .re-summary-price-value { font-size: 1.75rem; font-weight: 900; color: #1a5276; }
            .re-summary-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #e8ecef; }
            .re-summary-row:last-of-type { border-bottom: none; }
            .re-summary-row .label { font-size: 0.8125rem; color: #5d6d7e; }
            .re-summary-row .value { font-size: 0.9375rem; font-weight: 600; color: #2c3e50; }
            .re-discount-badge { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 8px; font-size: 0.875rem; font-weight: 600; margin-bottom: 16px; }
            .re-discount-badge.discount { background: #d5f5e3; color: #1e8449; border: 1px solid rgba(30,132,73,0.2); }
            .re-discount-badge.surcharge { background: #fef9e7; color: #b7950b; border: 1px solid rgba(183,149,11,0.2); }
            .re-schedule-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; margin-top: 8px; }
            .re-schedule-table th, .re-schedule-table td { padding: 8px 12px; text-align: right; border-bottom: 1px solid #e8ecef; }
            .re-schedule-table th { background: #f8f9fa; font-weight: 700; color: #5d6d7e; font-size: 0.75rem; text-transform: uppercase; }
            .re-schedule-table td:first-child, .re-schedule-table th:first-child { text-align: left; }
            .re-schedule-table tr.type-down_payment td { color: #1a5276; font-weight: 600; }
            .re-schedule-table tr.type-interim td { color: #b7950b; font-weight: 600; }
            .no-print { display: none !important; }
            .print-logo { display: block !important; margin-bottom: 12px; }
            .print-logo img { max-height: 60px; max-width: 150px; object-fit: contain; }
            @media print { @page { margin: 15mm; } }
        </style></head><body>`);
        printWindow.document.write(el.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.onload = () => {
            printWindow.print();
            printWindow.close();
        };
    };

    const logoUrl = companyInfo?.companyLogo ? `${import.meta.env.VITE_API_URL || ''}${companyInfo.companyLogo}` : null;

    return (
        <div className="re-page">
            {/* Header */}
            <div className="re-page-header">
                <div className="re-page-title">
                    <div className="re-page-title-icon"><FileText size={22} /></div>
                    <div>
                        <h1>Teklifler</h1>
                        <p>Oluşturulan tüm ödeme teklifleri</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <button className="re-btn re-btn-primary" onClick={() => navigate('/real-estate/wizard')}>
                        <Plus size={16} style={{ marginRight: 6 }} /> Yeni Teklif
                    </button>
                    <button className="re-btn re-btn-outline" onClick={() => load(true)}>
                        <RefreshCw size={16} style={{ marginRight: 6 }} /> Yenile
                    </button>
                </div>
            </div>

            {/* Filtreler */}
            <div className="re-offers-filters">
                <div className="re-offers-search">
                    <Search size={16} />
                    <input
                        className="re-input"
                        placeholder="Müşteri adı, telefon veya e-posta ara..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <select className="re-input re-select" style={{ width: 180 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">Tüm Durumlar</option>
                    <option value="DRAFT">Taslak</option>
                    <option value="SENT">Gönderildi</option>
                    <option value="ACCEPTED">Kabul Edildi</option>
                    <option value="REJECTED">Reddedildi</option>
                    <option value="EXPIRED">Süresi Doldu</option>
                </select>
                <button className="re-btn re-btn-outline re-btn-sm" onClick={() => load(true)} disabled={loading}>
                    <RefreshCw size={14} className={loading ? 'spin' : ''} /> Yenile
                </button>
            </div>

            <div style={{ display: 'block' }}>
                {/* Tablo */}
                <div className="re-card" style={{ padding: 0, overflow: 'hidden' }}>
                    {loading ? (
                        <div className="re-loading"><RefreshCw size={28} className="spin" /><span>Yükleniyor...</span></div>
                    ) : offers.length === 0 ? (
                        <div className="re-empty">
                            <FileText size={52} />
                            <h3>Teklif Bulunamadı</h3>
                            <p>Henüz hiç teklif oluşturulmadı veya filtrelere uyan sonuç yok.</p>
                            <a href="/real-estate/wizard" className="re-btn re-btn-primary">İlk Teklifi Oluştur</a>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="re-offers-table">
                                <thead>
                                    <tr>
                                        <th>Müşteri</th>
                                        <th>Proje / Daire</th>
                                        <th>Kampanya</th>
                                        <th>Net Fiyat</th>
                                        <th>Peşin Fiyat</th>
                                        <th>Fark</th>
                                        <th>Vade</th>
                                        <th>Durum</th>
                                        <th>Tarih</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {offers.map(o => {
                                        const isDiscount = o.discountAmount > 0;
                                        return (
                                            <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedOffer(o)}>
                                                <td>
                                                    <div style={{ fontWeight: 600 }}>{o.customerName}</div>
                                                    {o.customerPhone && <div style={{ fontSize: '0.75rem', color: 'var(--re-muted)' }}>{o.customerPhone}</div>}
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 500 }}>{o.project?.name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--re-muted)' }}>
                                                        {o.apartmentType?.name || o.unit?.unitCode || '—'}
                                                    </div>
                                                </td>
                                                <td style={{ fontSize: '0.8125rem' }}>{o.campaign?.name || '—'}</td>
                                                <td style={{ fontWeight: 700, color: 'var(--re-primary)' }}>{fmt(o.netPrice)}</td>
                                                <td style={{ fontSize: '0.8125rem', color: 'var(--re-muted)' }}>{fmt(o.cashPrice)}</td>
                                                <td>
                                                    {o.discountAmount !== 0 && (
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8125rem', color: isDiscount ? 'var(--re-success)' : 'var(--re-warning)', fontWeight: 600 }}>
                                                            {isDiscount ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                                                            %{Math.abs(o.discountRate).toFixed(1)}
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ fontSize: '0.8125rem' }}>
                                                    {o.installmentCount > 0 ? `${o.installmentCount} Ay` : 'Peşin'}
                                                </td>
                                                <td><StatusBadge status={o.status} /></td>
                                                <td style={{ fontSize: '0.75rem', color: 'var(--re-muted)', whiteSpace: 'nowrap' }}>
                                                    {new Date(o.createdAt).toLocaleDateString('tr-TR')}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <button className="re-btn re-btn-ghost re-btn-sm" title="Görüntüle" onClick={e => { e.stopPropagation(); setSelectedOffer(o); }}>
                                                            <Eye size={15} />
                                                        </button>
                                                        <button className="re-btn re-btn-ghost re-btn-sm" title="PDF İndir" onClick={e => { e.stopPropagation(); handleDownloadPDF(o); }}>
                                                            <Download size={15} />
                                                        </button>
                                                        <button className="re-btn re-btn-ghost re-btn-sm" title="Sil" onClick={e => { e.stopPropagation(); handleDeleteOffer(o.id); }} style={{ color: 'var(--re-danger)' }}>
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '16px', borderTop: '1px solid var(--re-border)' }}>
                            <button className="re-btn re-btn-outline re-btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Önceki</button>
                            <span style={{ padding: '6px 12px', fontSize: '0.875rem', color: 'var(--re-muted)' }}>{page} / {totalPages}</span>
                            <button className="re-btn re-btn-outline re-btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Sonraki →</button>
                        </div>
                    )}
                </div>

                {/* Detay Paneli (Modal Popup) */}
                {selectedOffer && (
                    <div className="re-modal-overlay" onClick={() => setSelectedOffer(null)}>
                        <div ref={printRef} className="re-card re-summary-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 800, margin: '20px auto', maxHeight: '90vh', overflowY: 'auto' }}>
                            <div className="re-summary-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                {logoUrl && (
                                    <div className="print-logo" style={{ display: 'none' }}>
                                        <img src={logoUrl} alt="Logo" style={{ maxHeight: 60, maxWidth: 150, objectFit: 'contain' }} />
                                    </div>
                                )}
                                <div>
                                    <h3>{selectedOffer.customerName}</h3>
                                    <p style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span>{selectedOffer.project?.name} — {selectedOffer.apartmentType?.name || selectedOffer.unit?.unitCode}</span>
                                        {selectedOffer.validUntil && (
                                            <span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.2)', borderRadius: 4, fontSize: '0.75rem' }}>
                                                Geçerlilik: {new Date(selectedOffer.validUntil).toLocaleDateString('tr-TR')}
                                            </span>
                                        )}
                                    </p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} className="no-print">
                                <button className="re-btn re-btn-ghost re-btn-sm" title="PDF İndir" onClick={() => handleDownloadPDF(selectedOffer)} style={{ color: 'rgba(255,255,255,0.8)' }}><Download size={15} /></button>
                                <button className="re-btn re-btn-ghost re-btn-sm" title="Sil" onClick={() => handleDeleteOffer(selectedOffer.id)} style={{ color: 'rgba(255,255,255,0.8)' }}><Trash2 size={15} /></button>
                                <button className="re-btn re-btn-ghost re-btn-sm" onClick={() => setSelectedOffer(null)} style={{ color: 'rgba(255,255,255,0.7)', marginLeft: 8 }}>✕</button>
                            </div>
                        </div>
                        <div className="re-summary-body">
                            {selectedOffer.apartmentType && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, background: '#f8f9fa', padding: '12px 16px', borderRadius: 8, marginBottom: 20, fontSize: '0.85rem' }}>
                                    <div><strong>Oda Sayısı:</strong> {selectedOffer.apartmentType.roomCount || '—'}</div>
                                    <div><strong>Kat:</strong> {selectedOffer.apartmentType.floor || '—'}</div>
                                    <div><strong>Brüt:</strong> {selectedOffer.apartmentType.grossArea ? `${selectedOffer.apartmentType.grossArea}m²` : '—'}</div>
                                    <div><strong>Net:</strong> {selectedOffer.apartmentType.netArea ? `${selectedOffer.apartmentType.netArea}m²` : '—'}</div>
                                </div>
                            )}

                            <div className="re-summary-price-block">
                                <div className="re-summary-price-label">Teklif Satış Fiyatı</div>
                                <div className="re-summary-price-value">{fmt(selectedOffer.netPrice)}</div>
                            </div>

                            {selectedOffer.discountAmount !== 0 && (
                                <div className={`re-discount-badge ${selectedOffer.discountAmount > 0 ? 'discount' : 'surcharge'}`}>
                                    {selectedOffer.discountAmount > 0 ? <TrendingDown size={15} /> : <TrendingUp size={15} />}
                                    {selectedOffer.discountAmount > 0
                                        ? `Liste fiyatından ${fmt(selectedOffer.discountAmount)} İndirim (%${Math.abs(selectedOffer.discountRate).toFixed(1)})`
                                        : `Liste fiyatına ${fmt(Math.abs(selectedOffer.discountAmount))} Vade Farkı (+%${Math.abs(selectedOffer.discountRate).toFixed(1)})`}
                                </div>
                            )}

                            {[
                                ['Liste Fiyatı', fmt(selectedOffer.listPrice)],
                                ['Peşin Fiyat', fmt(selectedOffer.cashPrice)],
                                ['Peşinat', fmt(selectedOffer.downPayment)],
                                ['Taksit', selectedOffer.installmentCount > 0 ? `${selectedOffer.installmentCount} × ${fmt(selectedOffer.monthlyPayment)}` : 'Peşin'],
                                ['Ort. Vade', `${selectedOffer.avgVadeMonth?.toFixed(2)} Ay`],
                            ].map(([label, value]) => (
                                <div className="re-summary-row" key={label}>
                                    <span className="label">{label}</span>
                                    <span className="value">{value}</span>
                                </div>
                            ))}

                            {/* Ödeme Planı Tablosu */}
                            {(() => {
                                let schedule = [];
                                try {
                                    schedule = typeof selectedOffer.paymentSchedule === 'string'
                                        ? JSON.parse(selectedOffer.paymentSchedule)
                                        : (selectedOffer.paymentSchedule || []);
                                } catch { schedule = []; }
                                if (!schedule.length) return null;

                                return (
                                    <div style={{ marginTop: 20 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: 10, color: 'var(--re-text)' }}>
                                            📋 Ödeme Planı
                                        </div>
                                        <table className="re-schedule-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ textAlign: 'left' }}>Açıklama</th>
                                                    <th>Tarih</th>
                                                    <th>Tutar</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {schedule.map((item, idx) => (
                                                    <tr key={idx} className={`type-${item.type?.toLowerCase()}`}>
                                                        <td style={{ textAlign: 'left' }}>{item.label}</td>
                                                        <td>{item.date ? new Date(item.date).toLocaleDateString('tr-TR') : '—'}</td>
                                                        <td>{fmt(item.amount)}</td>
                                                    </tr>
                                                ))}
                                                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--re-primary)' }}>
                                                    <td style={{ textAlign: 'left' }}>Toplam</td>
                                                    <td></td>
                                                    <td>{fmt(schedule.reduce((s, i) => s + (i.amount || 0), 0))}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })()}

                            {/* Durum Değiştir */}
                            <div className="re-form-group no-print" style={{ marginTop: 16 }}>
                                <label>Durum Güncelle</label>
                                <select className="re-input re-select" value={selectedOffer.status}
                                    onChange={e => handleStatusChange(selectedOffer.id, e.target.value)}>
                                    <option value="DRAFT">Taslak</option>
                                    <option value="SENT">Gönderildi</option>
                                    <option value="ACCEPTED">Kabul Edildi</option>
                                    <option value="REJECTED">Reddedildi</option>
                                    <option value="EXPIRED">Süresi Doldu</option>
                                </select>
                            </div>

                            {/* Teklifi Gönder Butonu */}
                            {selectedOffer.customerEmail ? (
                                <button
                                    className="re-btn re-btn-primary no-print"
                                    style={{ width: '100%', marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                                    onClick={() => handleSendEmail(selectedOffer.id)}
                                    disabled={sending}
                                >
                                    {sending ? (
                                        <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> Gönderiliyor...</>
                                    ) : (
                                        <><Send size={15} /> Teklifi E-Posta ile Gönder</>
                                    )}
                                </button>
                            ) : (
                                <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(255,193,7,0.1)', border: '1px solid rgba(255,193,7,0.2)', borderRadius: 8, fontSize: '0.8125rem', color: '#b7950b', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Mail size={15} /> Müşterinin e-posta adresi girilmemiş
                                </div>
                            )}

                            {sendMsg.text && (
                                <div style={{
                                    marginTop: 10, padding: '10px 14px', borderRadius: 8, fontSize: '0.8125rem',
                                    background: sendMsg.type === 'success' ? '#d5f5e3' : '#fadbd8',
                                    color: sendMsg.type === 'success' ? '#1e8449' : '#922b21',
                                    display: 'flex', alignItems: 'center', gap: 8,
                                }}>
                                    {sendMsg.type === 'success' ? <CheckCircle size={15} /> : <XCircle size={15} />}
                                    {sendMsg.text}
                                </div>
                            )}

                            <div style={{ fontSize: '0.75rem', color: 'var(--re-muted)', marginTop: 8 }}>
                                Oluşturulma: {new Date(selectedOffer.createdAt).toLocaleString('tr-TR')}
                            </div>
                        </div>
                    </div>
                  </div>
                )}
            </div>

            <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

import React, { useState, useEffect } from 'react';
import { Rss, X, RefreshCw, CheckCircle2, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { productFeedAPI } from '../../services/api';

/**
 * Google Merchant Center / Google Shopping ürün feed'i.
 *
 * Merchant Center'ın kendi API'si (Content API for Shopping) her müşteri için
 * Google Cloud projesi, OAuth ve merchant ID istiyor; feed'de olmayan bir şey
 * de vermiyor. Mağaza GMC'ye zaten bir XML feed veriyor — biz de aynı adresi
 * okuyoruz. Böylece Shopify, Ticimax, ikas, İdeasoft ve WooCommerce tek
 * yoldan, fotoğraflarıyla birlikte içeri alınıyor.
 */
export default function ProductFeedModal({ isOpen, onClose, workspaceId, onSyncComplete }) {
    const [feedUrl, setFeedUrl] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [yukleniyor, setYukleniyor] = useState(false);
    const [testSonucu, setTestSonucu] = useState(null);
    const [aktarimSonucu, setAktarimSonucu] = useState(null);
    const [hata, setHata] = useState('');

    useEffect(() => {
        if (!isOpen || !workspaceId) {
            setTestSonucu(null);
            setAktarimSonucu(null);
            setHata('');
            return;
        }
        productFeedAPI.getConfig(workspaceId)
            .then(res => {
                setFeedUrl(res.data?.feedUrl || '');
                setIsActive(res.data?.isActive !== false);
            })
            .catch(() => {});
    }, [isOpen, workspaceId]);

    if (!isOpen) return null;

    const testEt = async () => {
        setHata(''); setTestSonucu(null); setAktarimSonucu(null); setYukleniyor(true);
        try {
            const res = await productFeedAPI.test(workspaceId, feedUrl.trim());
            setTestSonucu(res.data);
        } catch (err) {
            setHata(err.response?.data?.error || 'Feed okunamadı.');
        } finally {
            setYukleniyor(false);
        }
    };

    const kaydetVeAktar = async () => {
        setHata(''); setAktarimSonucu(null); setYukleniyor(true);
        try {
            await productFeedAPI.saveConfig(workspaceId, { feedUrl: feedUrl.trim(), isActive });
            const res = await productFeedAPI.sync(workspaceId);
            setAktarimSonucu(res.data);
            if (onSyncComplete) onSyncComplete();
        } catch (err) {
            setHata(err.response?.data?.error || 'İçe aktarma başarısız.');
        } finally {
            setYukleniyor(false);
        }
    };

    const kutu = {
        display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10,
        fontSize: '0.82rem', lineHeight: 1.5, marginTop: 14
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%', maxWidth: 560, background: '#fff', borderRadius: 16,
                    boxShadow: '0 24px 60px rgba(15,23,42,0.24)', overflow: 'hidden'
                }}
            >
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '16px 20px', borderBottom: '1px solid #f1f5f9'
                }}>
                    <Rss size={18} color="#7c3aed" />
                    <div style={{ flexGrow: 1 }}>
                        <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0f172a' }}>
                            Ürün Feed'i
                        </h3>
                        <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#64748b' }}>
                            Google Merchant Center / Google Shopping XML
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Kapat"
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div style={{ padding: 20 }}>
                    <label htmlFor="feed-url" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                        Feed adresi
                    </label>
                    <input
                        id="feed-url"
                        type="url"
                        value={feedUrl}
                        onChange={e => setFeedUrl(e.target.value)}
                        placeholder="https://magazaniz.com/google-merchant.xml"
                        style={{
                            width: '100%', boxSizing: 'border-box', padding: '11px 13px',
                            border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.85rem', outline: 'none'
                        }}
                    />
                    <small style={{ display: 'block', marginTop: 6, fontSize: '0.74rem', color: '#64748b', lineHeight: 1.5 }}>
                        Merchant Center'a verdiğiniz XML adresinin aynısı. Shopify, Ticimax, ikas, İdeasoft ve
                        WooCommerce bu adresi hazır üretir; ayrı bir kurulum veya Google yetkisi gerekmez.
                    </small>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: '0.82rem', color: '#334155', cursor: 'pointer' }}>
                        <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                        Bu feed aktif olsun
                    </label>

                    {hata && (
                        <div style={{ ...kutu, background: '#fef2f2', color: '#991b1b' }}>
                            <AlertCircle size={16} style={{ flex: 'none', marginTop: 1 }} />
                            <span>{hata}</span>
                        </div>
                    )}

                    {testSonucu?.ok && (
                        <div style={{ ...kutu, background: '#f0fdf4', color: '#166534', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
                                <CheckCircle2 size={16} />
                                <span>{testSonucu.toplam} ürün okundu</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                                    <ImageIcon size={13} /> {testSonucu.gorselli} tanesi fotoğraflı
                                </span>
                            </div>
                            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                                {(testSonucu.ornekler || []).map((o, i) => (
                                    <li key={i} style={{ fontSize: '0.78rem' }}>
                                        {o.name}{o.price != null ? ` — ${o.price}` : ''}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {aktarimSonucu && (
                        <div style={{ ...kutu, background: '#eff6ff', color: '#1e40af' }}>
                            <CheckCircle2 size={16} style={{ flex: 'none', marginTop: 1 }} />
                            <span>
                                {aktarimSonucu.eklenen} yeni, {aktarimSonucu.guncellenen} güncellendi,
                                {' '}{aktarimSonucu.pasiflenen} stok dışı
                                {aktarimSonucu.hatali > 0 ? `, ${aktarimSonucu.hatali} hatalı` : ''}.
                            </span>
                        </div>
                    )}
                </div>

                <div style={{
                    display: 'flex', justifyContent: 'flex-end', gap: 8,
                    padding: '14px 20px', borderTop: '1px solid #f1f5f9', background: '#fbfafa'
                }}>
                    <button
                        type="button"
                        onClick={testEt}
                        disabled={yukleniyor || !feedUrl.trim()}
                        style={{
                            padding: '10px 16px', borderRadius: 9, border: '1px solid #e2e8f0',
                            background: '#fff', fontSize: '0.82rem', fontWeight: 600, color: '#334155',
                            cursor: yukleniyor || !feedUrl.trim() ? 'not-allowed' : 'pointer',
                            opacity: yukleniyor || !feedUrl.trim() ? 0.6 : 1
                        }}
                    >
                        Feed'i test et
                    </button>
                    <button
                        type="button"
                        onClick={kaydetVeAktar}
                        disabled={yukleniyor || !feedUrl.trim()}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '10px 16px', borderRadius: 9, border: 0,
                            background: '#0f172a', fontSize: '0.82rem', fontWeight: 600, color: '#fff',
                            cursor: yukleniyor || !feedUrl.trim() ? 'not-allowed' : 'pointer',
                            opacity: yukleniyor || !feedUrl.trim() ? 0.6 : 1
                        }}
                    >
                        <RefreshCw size={14} className={yukleniyor ? 'spin' : ''} />
                        {yukleniyor ? 'Çalışıyor...' : 'Kaydet ve içe aktar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

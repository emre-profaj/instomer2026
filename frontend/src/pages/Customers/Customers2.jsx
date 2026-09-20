/**
 * KİŞİLER 2 — deneysel liste görünümü (yalnız SUPER_ADMIN)
 *
 * Mevcut Kişiler sayfasının yerine geçmez; aynı uç noktadan (contactAPI.getAll)
 * beslenen alternatif bir sunum. Amaç tasarımı canlı veriyle denemek.
 *
 * Tasarım dili: pages/Analytics/reportDesign.css (.ra-page / .ra-head)
 * Kutu yerine yüzey: her kişiye ayrı kart yerine tek beyaz yüzey ve
 * aralarında saç teli ayraç.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI, funnelAPI } from '../../services/api';
import {
    Search, Plus, Download, Phone, MessageSquare, StickyNote, Bot,
    ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
    List, KanbanSquare, BarChart3
} from 'lucide-react';
import Customers2Bulk from './Customers2Bulk';
import './Customers2.css';

const LIMIT = 25;

const KANAL_RENK = {
    WHATSAPP: '#25d366', INSTAGRAM: '#e1306c', FACEBOOK: '#1877f2', MESSENGER: '#1877f2',
    WIDGET: '#0ea5e9', FORM: '#0ea5e9', WEB_FORM: '#0ea5e9', LEAD: '#6366f1',
    FACEBOOK_LEAD: '#1877f2', EMAIL: '#64748b', MANUAL: '#94a3b8'
};
const ASAMA_RENK = {
    'Yeni Başvuru': '#0ea5e9', 'Fırsat': '#d97706', 'Sıcak Fırsat': '#dc2626',
    'Bilgi Verildi': '#64748b', 'Görüşme Planlandı': '#7c3aed', 'Teklif Aşaması': '#0d9488',
    'Satış': '#16a34a', 'Ulaşılamadı': '#94a3b8', 'Kayıp': '#94a3b8'
};
const DONEM_ETIKET = {
    TODAY: 'Bugün gelen',
    WEEK: 'Bu hafta gelen',
    MONTH: 'Bu ay gelen',
    YEAR: 'Bu yıl gelen',
    ALL: 'Toplam kişi'
};
const AVATAR_RENK = ['#6366f1', '#0ea5e9', '#14b8a6', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981', '#f97316', '#3b82f6'];

/* API activeCase içinde yalnız funnelStageId / funnelType döndürüyor — ikisi de
   kimlik. Aşama adını huni listesinden çözüyoruz; çözülemezse ham kimliği
   ekrana basmaktansa hiç göstermiyoruz. */
const KIMLIK_RE = /^(c[a-z0-9]{20,}|[0-9a-f]{8}-[0-9a-f]{4}-)/i;
const kimlikMi = (v) => KIMLIK_RE.test(String(v || ''));

const sayi = (n) => (n === null || n === undefined || isNaN(n)) ? '0' : Number(n).toLocaleString('tr-TR');
const gun = (d) => {
    if (!d) return null;
    const t = new Date(d);
    return isNaN(t) ? null : t.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};
const saatli = (d) => {
    if (!d) return '';
    const t = new Date(d);
    return isNaN(t) ? '' : t.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const gunFark = (d) => {
    if (!d) return null;
    const t = new Date(d);
    return isNaN(t) ? null : Math.floor((Date.now() - t.getTime()) / 86400000);
};
const basHarf = (ad) => {
    const p = String(ad || '').replace(/[.@_-]/g, ' ').split(' ').filter(Boolean);
    return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
};
const renkSec = (id) => {
    let h = 0;
    for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return AVATAR_RENK[h % AVATAR_RENK.length];
};
const yumusak = (c, oran = 12) => ({
    background: `color-mix(in srgb, ${c} ${oran}%, #ffffff)`,
    color: `color-mix(in srgb, ${c} 58%, #0b1220)`
});
const etiketler = (raw) => {
    if (Array.isArray(raw)) return raw;
    try { const p = JSON.parse(raw || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
};

/* Kişinin aktivite dökümü — arama / not / AI */
function aktiviteDokumu(kisi) {
    const list = kisi.activities || [];
    return {
        arama: list.filter(a => a.type === 'CALL').length,
        not: list.filter(a => a.type === 'NOTE').length,
        ai: list.filter(a => a.source === 'AI' || a.assignedByType === 'AI').length
    };
}

function AktiviteHucresi({ dokum }) {
    const oge = (Icon, n, baslik) => (
        <span className={n ? '' : 'zr'} title={baslik}>
            <Icon size={13} />{n ? <b>{n}</b> : '0'}
        </span>
    );
    return (
        <div className="ak2">
            {oge(Phone, dokum.arama, 'arama')}
            {oge(StickyNote, dokum.not, 'not')}
            {oge(Bot, dokum.ai, 'AI araması')}
        </div>
    );
}

function Avatar({ kisi, kanal }) {
    return (
        <div className="av" style={{ background: renkSec(kisi.id) }}>
            {basHarf(kisi.name)}
            <i style={{ background: KANAL_RENK[kanal] || '#94a3b8' }} />
        </div>
    );
}

export default function Customers2() {
    const { currentWorkspace } = useAuth();

    const [view, setView] = useState('list');
    const [kisiler, setKisiler] = useState([]);
    const [toplam, setToplam] = useState(0);
    const [stats, setStats] = useState({});
    const [tumEtiketler, setTumEtiketler] = useState([]);
    const [yukleniyor, setYukleniyor] = useState(true);
    const [hata, setHata] = useState(null);
    const [acik, setAcik] = useState(null);
    const [sayfa, setSayfa] = useState(1);
    // Seçim sayfa değişince kaybolmasın diye id→kişi haritası tutuluyor
    const [secim, setSecim] = useState(new Map());
    const [hepsiSeciliyor, setHepsiSeciliyor] = useState(false);

    // Süzgeçler — hepsi uç noktaya birebir geçiyor
    const [arama, setArama] = useState('');
    const [aramaGec, setAramaGec] = useState('');
    const [hizli, setHizli] = useState(null);
    const [kaynak, setKaynak] = useState('ALL');
    const [etiket, setEtiket] = useState('ALL');
    const [atama, setAtama] = useState('all');
    const [tarih, setTarih] = useState('MONTH');
    const [acikTalep, setAcikTalep] = useState(false);
    const [sirala, setSirala] = useState('lastMessageAt');

    useEffect(() => {
        const t = setTimeout(() => { setAramaGec(arama); setSayfa(1); }, 350);
        return () => clearTimeout(t);
    }, [arama]);

    // funnelStageId → aşama adı
    const [asamaAdlari, setAsamaAdlari] = useState({});
    useEffect(() => {
        if (!currentWorkspace?.id) return;
        funnelAPI.getAll(currentWorkspace.id)
            .then(r => {
                const liste = r.data.funnels || r.data || [];
                const harita = {};
                for (const f of liste) {
                    for (const st of (f.stages || [])) harita[st.id] = st.name;
                    if (f.id && f.name) harita[f.id] = f.name;
                }
                setAsamaAdlari(harita);
            })
            .catch(() => {});
    }, [currentWorkspace?.id]);

    const asamaAdi = useCallback((k) => {
        const c = k.activeCase;
        if (!c) return null;
        const cozulmus = asamaAdlari[c.funnelStageId] || asamaAdlari[c.funnelType];
        if (cozulmus) return cozulmus;
        // Çözülemedi: funnelType okunabilir bir etiketse onu kullan, kimlikse hiç gösterme
        return (c.funnelType && !kimlikMi(c.funnelType)) ? c.funnelType : null;
    }, [asamaAdlari]);

    const hizliParam = useMemo(() => {
        switch (hizli) {
            case 'HAS_PHONE':   return { contactInfo: 'HAS_PHONE' };
            case 'NO_PHONE':    return { contactInfo: 'NO_PHONE' };
            case 'AGENT_CALLS': return { callStatus: 'ended' };
            case 'NO_ACTIVITY': return { callStatus: 'no_call' };
            case 'AI_CALLS':    return { callStatus: 'ai_called' };
            default:            return {};
        }
    }, [hizli]);

    const getir = useCallback(async () => {
        if (!currentWorkspace?.id) return;
        setYukleniyor(true);
        setHata(null);
        try {
            const { data } = await contactAPI.getAll(currentWorkspace.id, {
                search: aramaGec,
                source: kaynak,
                tag: etiket,
                assignmentFilter: atama !== 'all' ? atama : undefined,
                onlyOpenCases: acikTalep.toString(),
                sortField: sirala,
                sortDir: 'desc',
                limit: LIMIT,
                offset: (sayfa - 1) * LIMIT,
                dateFilter: tarih !== 'ALL' ? tarih : undefined,
                tzOffset: new Date().getTimezoneOffset(),
                ...hizliParam
            });
            setKisiler(data.contacts || []);
            setToplam(data.total || 0);
            if (data.quickStats) setStats(data.quickStats);
            if (data.allTags) setTumEtiketler(data.allTags);
        } catch (e) {
            setHata(e?.response?.data?.message || e.message || 'Kişiler yüklenemedi.');
            setKisiler([]);
        } finally {
            setYukleniyor(false);
        }
    }, [currentWorkspace?.id, aramaGec, kaynak, etiket, atama, acikTalep, sirala, sayfa, tarih, hizliParam]);

    useEffect(() => { getir(); }, [getir]);

    const secili = (id) => secim.has(id);
    const secimDegistir = (k) => setSecim(m => {
        const y = new Map(m);
        if (y.has(k.id)) y.delete(k.id); else y.set(k.id, k);
        return y;
    });
    const sayfaHepsi = kisiler.length > 0 && kisiler.every(k => secim.has(k.id));
    const sayfaSec = () => setSecim(m => {
        const y = new Map(m);
        if (sayfaHepsi) kisiler.forEach(k => y.delete(k.id));
        else kisiler.forEach(k => y.set(k.id, k));
        return y;
    });

    // Süzgece uyan TÜM kişileri seç — sayfadakiler değil
    const tumunuSec = async () => {
        setHepsiSeciliyor(true);
        try {
            const { data } = await contactAPI.getAll(currentWorkspace.id, {
                search: aramaGec, source: kaynak, tag: etiket,
                assignmentFilter: atama !== 'all' ? atama : undefined,
                onlyOpenCases: acikTalep.toString(),
                sortField: sirala, sortDir: 'desc',
                limit: 10000, offset: 0,
                dateFilter: tarih !== 'ALL' ? tarih : undefined,
                tzOffset: new Date().getTimezoneOffset(),
                ...hizliParam
            });
            setSecim(new Map((data.contacts || []).map(c => [c.id, c])));
        } catch (e) {
            setHata(e?.response?.data?.message || e.message || 'Tümü seçilemedi.');
        } finally {
            setHepsiSeciliyor(false);
        }
    };

    const metrikler = [
        { key: null,           lb: DONEM_ETIKET[tarih] || 'Dönem', vl: stats.periodCount },
        { key: 'HAS_PHONE',    lb: 'Numaralı',   vl: stats.withPhoneCount },
        { key: 'NO_PHONE',     lb: 'Numarasız',  vl: stats.noPhoneCount },
        { key: 'AGENT_CALLS',  lb: 'Aranan',     vl: stats.agentCalledCount },
        { key: 'NO_ACTIVITY',  lb: 'Aranmayan',  vl: stats.noActivityCount },
        { key: 'AI_CALLS',     lb: 'AI araması', vl: stats.aiCalledCount }
    ];

    const sonSayfa = Math.max(1, Math.ceil(toplam / LIMIT));

    /* ── tek kişi satırı ── */
    const satir = (k) => {
        const dokum = aktiviteDokumu(k);
        const kanal = (k.channels?.[0]) || k.source;
        const asamaAd = asamaAdi(k);
        const asamaRenk = ASAMA_RENK[asamaAd] || '#64748b';
        const ilk = gun(k.firstMessageAt);
        const son = gun(k.lastMessageAt);
        const sessizGun = gunFark(k.lastMessageAt);
        const sessiz = sessizGun !== null && sessizGun > 14;
        const et = etiketler(k.tags).slice(0, 2);
        const buAcik = acik === k.id;

        return (
            <div key={k.id}>
                <div className={`rw${buAcik ? ' exp' : ''}${secili(k.id) ? ' sel' : ''}`} onClick={() => setAcik(buAcik ? null : k.id)}>
                    <button
                        className={`cb${secili(k.id) ? ' on' : ''}`}
                        onClick={e => { e.stopPropagation(); secimDegistir(k); }}
                        aria-label={secili(k.id) ? 'Seçimi kaldır' : 'Seç'}
                    />
                    <Avatar kisi={k} kanal={kanal} />
                    <div className="who">
                        <div className="nm">{k.name || 'İsimsiz'}</div>
                        <div className="mu">
                            {k.phone ? <b>{k.phone}</b> : <span style={{ color: '#cbd5e1' }}>numara yok</span>}
                            {k.email ? ` · ${k.email}` : ''}{kanal ? ` · ${kanal}` : ''}
                        </div>
                    </div>
                    <div className="tp">
                        <div className="tp-t">{k.aiTopic || k.activeCase?.title || '—'}</div>
                        <div className="tp-c">
                            {k.activeCase?.caseNumber ? `CSE-${k.activeCase.caseNumber}` : ''}
                            {et.map(t => (
                                <span key={t} className="stg" style={{ ...yumusak('#64748b', 10), padding: '3px 8px', fontSize: '10.5px', marginLeft: 6 }}>{t}</span>
                            ))}
                        </div>
                    </div>
                    <div>
                        {asamaAd
                            ? <span className="stg" style={yumusak(asamaRenk)}><i style={{ background: asamaRenk }} />{asamaAd}</span>
                            : <span className="tp-c">—</span>}
                    </div>
                    <AktiviteHucresi dokum={dokum} />
                    <div className="tm">{ilk || '—'}<em>ilk yazma</em></div>
                    <div className={`tm${sessiz ? ' old' : ''}`}>{son || '—'}<em>{sessiz ? `${sessizGun} gündür sessiz` : 'son yazma'}</em></div>
                    <div className="qa" onClick={e => e.stopPropagation()}>
                        {k.phone && (
                            <a href={`https://wa.me/${String(k.phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                                <button title="WhatsApp"><MessageSquare size={13} /></button>
                            </a>
                        )}
                        {k.phone && <a href={`tel:${k.phone}`}><button title="Ara"><Phone size={13} /></button></a>}
                        <button title={buAcik ? 'Kapat' : 'Aç'}>{buAcik ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
                    </div>
                </div>

                {buAcik && (
                    <div className="dt">
                        <div className="dt-h">
                            Aktiviteler{k.activeCase?.caseNumber ? ` · CSE-${k.activeCase.caseNumber}` : ''}
                        </div>
                        {(k.activities || []).length === 0
                            ? <div className="tp-c">Bu kişi için kayıtlı aktivite yok.</div>
                            : (
                                <div className="jr">
                                    {(k.activities || []).slice(0, 8).map((a, idx) => (
                                        <div key={a.id || idx} className={`jr-i${idx === 0 ? ' ac' : ''}`}>
                                            <div className="jr-t">
                                                {a.title || a.type}
                                                {a.type === 'CALL' && a.callSuccessful === true ? ' — ulaşıldı' : ''}
                                                {a.type === 'CALL' && a.callSuccessful === false ? ' — cevapsız' : ''}
                                            </div>
                                            <div className="jr-m">
                                                {saatli(a.createdAt)}
                                                {a.assignee?.name ? ` · ${a.assignee.name}` : (a.creator?.name ? ` · ${a.creator.name}` : '')}
                                                {a.source === 'AI' ? ' · AI' : ''}
                                            </div>
                                            {a.description && <div className="jr-b">{a.description}</div>}
                                        </div>
                                    ))}
                                </div>
                            )}
                    </div>
                )}
            </div>
        );
    };

    /* ── kart ── */
    const kart = (k) => {
        const dokum = aktiviteDokumu(k);
        const kanal = (k.channels?.[0]) || k.source;
        const asamaAd = asamaAdi(k);
        const asamaRenk = ASAMA_RENK[asamaAd] || '#64748b';
        return (
            <div className="cd sr" key={k.id}>
                <div className="cd-h">
                    <Avatar kisi={k} kanal={kanal} />
                    <div className="cd-n">
                        <div className="nm">{k.name || 'İsimsiz'}</div>
                        <div className="mu">{k.phone ? <b>{k.phone}</b> : 'numara yok'}{kanal ? ` · ${kanal}` : ''}</div>
                    </div>
                    {asamaAd && <span className="stg" style={yumusak(asamaRenk)}><i style={{ background: asamaRenk }} />{asamaAd}</span>}
                </div>
                <div className="cd-m">
                    <span className="cd-t">{k.aiTopic || k.activeCase?.title || '—'}</span>
                    <span className="tp-c">{k.activeCase?.caseNumber ? `CSE-${k.activeCase.caseNumber}` : ''}</span>
                </div>
                <div className="cd-f">
                    <AktiviteHucresi dokum={dokum} />
                    <span className="cd-d" style={{ marginLeft: 'auto' }}>
                        İlk <b>{gun(k.firstMessageAt) || '—'}</b> · Son <b>{gun(k.lastMessageAt) || '—'}</b>
                    </span>
                </div>
            </div>
        );
    };

    /* ── pipeline: sayfadaki kişileri aşamaya göre grupla ── */
    const asamalar = useMemo(() => {
        const g = new Map();
        for (const k of kisiler) {
            const ad = asamaAdi(k) || 'Aşamasız';
            if (!g.has(ad)) g.set(ad, []);
            g.get(ad).push(k);
        }
        return [...g.entries()];
    }, [kisiler, asamaAdi]);

    const gorunumAnahtari = (
        <div className="vsw">
            {[
                { key: 'list', lbl: 'Tablo', Icon: List },
                { key: 'card', lbl: 'Kart', Icon: KanbanSquare },
                { key: 'pipeline', lbl: 'Pipeline', Icon: BarChart3 }
            ].map(v => (
                <button key={v.key} className={view === v.key ? 'on' : ''} onClick={() => setView(v.key)}>
                    <v.Icon size={14} />{v.lbl}
                </button>
            ))}
        </div>
    );

    return (
        <div className="k2-page">
            <div className="hd">
                <div>
                    <p className="eb">Müşteriler</p>
                    <h1>Kişiler 2</h1>
                    <p className="ld">
                        {currentWorkspace?.name || '—'} · {sayi(toplam)} kişi
                        {stats.periodCount ? `, bu dönemde ${sayi(stats.periodCount)} kayıt.` : '.'}
                    </p>
                </div>
                <div className="hd-act">
                    <button className="btn"><Download size={14} />Dışa aktar</button>
                    <button className="btn pri"><Plus size={14} strokeWidth={2.4} />Kişi ekle</button>
                </div>
            </div>

            <div className="mt sr">
                {metrikler.map(m => (
                    <button
                        key={m.lb}
                        className={`${hizli === m.key && m.key ? 'on' : ''}${!m.vl ? ' bos' : ''}`}
                        onClick={() => { setHizli(hizli === m.key ? null : m.key); setSayfa(1); }}
                    >
                        <span className="lb">{m.lb}</span>
                        <span className="vl">{sayi(m.vl)}</span>
                    </button>
                ))}
            </div>

            <div className="fb sr">
                <div className="fb-r">
                    <label className="srch">
                        <Search size={15} />
                        <input
                            placeholder="Ad, telefon, e-posta veya talep no ara…"
                            value={arama}
                            onChange={e => setArama(e.target.value)}
                        />
                    </label>
                    <select className="sel" value={tarih} onChange={e => { setTarih(e.target.value); setSayfa(1); }}>
                        <option value="ALL">Tüm zamanlar</option>
                        <option value="TODAY">Bugün</option>
                        <option value="WEEK">Bu hafta</option>
                        <option value="MONTH">Bu ay</option>
                        <option value="YEAR">Bu yıl</option>
                    </select>
                    <select className="sel" value={sirala} onChange={e => { setSirala(e.target.value); setSayfa(1); }}>
                        <option value="lastMessageAt">Sırala: Son yazma</option>
                        <option value="firstMessageAt">Sırala: İlk yazma</option>
                        <option value="createdAt">Sırala: Kayıt tarihi</option>
                        <option value="name">Sırala: Ad</option>
                    </select>
                    <button className={`tg${acikTalep ? ' on' : ''}`} onClick={() => { setAcikTalep(!acikTalep); setSayfa(1); }}>
                        <s />Sadece açık talepler
                    </button>
                </div>
                <div className="fb-r">
                    <span className="fb-lb">Gelişmiş</span>
                    <select className="sel" value={atama} onChange={e => { setAtama(e.target.value); setSayfa(1); }}>
                        <option value="all">Tüm atamalar</option>
                        <option value="unassigned">Atanmamışlar</option>
                        <option value="mine">Bana atananlar</option>
                    </select>
                    <select className="sel" value={kaynak} onChange={e => { setKaynak(e.target.value); setSayfa(1); }}>
                        <option value="ALL">Tüm kaynaklar</option>
                        <option value="WHATSAPP">WhatsApp</option>
                        <option value="INSTAGRAM">Instagram</option>
                        <option value="FACEBOOK">Facebook</option>
                        <option value="FACEBOOK_LEAD">Facebook Lead</option>
                        <option value="WEB_FORM">Web formu</option>
                        <option value="WIDGET">Widget</option>
                        <option value="MANUAL">Elle eklenen</option>
                    </select>
                    <select className="sel" value={etiket} onChange={e => { setEtiket(e.target.value); setSayfa(1); }}>
                        <option value="ALL">Tüm etiketler</option>
                        {tumEtiketler.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {(aramaGec || hizli || kaynak !== 'ALL' || etiket !== 'ALL' || atama !== 'all' || acikTalep || tarih !== 'MONTH') && (
                        <button
                            className="lnk"
                            onClick={() => {
                                setArama(''); setHizli(null); setKaynak('ALL'); setEtiket('ALL');
                                setAtama('all'); setAcikTalep(false); setTarih('MONTH'); setSayfa(1);
                            }}
                        >Süzgeçleri temizle</button>
                    )}
                </div>
            </div>

            <div className="vw">
                <span className="vw-t">
                    {view === 'list' ? 'Satır listesi' : view === 'card' ? 'Talep odaklı kartlar' : 'Huni aşamalarına göre'}
                </span>
                {gorunumAnahtari}
            </div>

            {hata && <div className="fb sr" style={{ color: '#b91c1c' }}>{hata}</div>}

            {view === 'list' && (
                <>
                    <div className="ls sr">
                        <div className="lh">
                            <button
                                className={`cb${sayfaHepsi ? ' on' : ''}`}
                                onClick={sayfaSec}
                                aria-label={sayfaHepsi ? 'Sayfadaki seçimi kaldır' : 'Sayfadakilerin hepsini seç'}
                            />
                            <span /><span>Kişi</span><span>Talep</span><span>Aşama</span>
                            <span>Aktivite</span><span>İlk yazma</span><span>Son yazma</span><span />
                        </div>
                        {yukleniyor
                            ? <div style={{ padding: '28px 20px', fontSize: 13, color: '#94a3b8' }}>Yükleniyor…</div>
                            : kisiler.length === 0
                                ? <div style={{ padding: '28px 20px', fontSize: 13, color: '#94a3b8' }}>Bu süzgeçlerle kişi bulunamadı.</div>
                                : kisiler.map(satir)}
                    </div>
                    <div className="ft sr">
                        <span><b>{kisiler.length ? (sayfa - 1) * LIMIT + 1 : 0}–{(sayfa - 1) * LIMIT + kisiler.length}</b> / <b>{sayi(toplam)}</b> kişi</span>
                        {secim.size > 0 && secim.size < toplam && (
                            <button className="lnk" style={{ marginLeft: 0 }} onClick={tumunuSec} disabled={hepsiSeciliyor}>
                                {hepsiSeciliyor ? 'Seçiliyor…' : `Süzgece uyan ${sayi(toplam)} kişinin hepsini seç`}
                            </button>
                        )}
                        <div className="pg">
                            <button disabled={sayfa === 1} onClick={() => setSayfa(s => Math.max(1, s - 1))}><ChevronLeft size={14} /></button>
                            <button className="on">{sayfa}</button>
                            <span style={{ alignSelf: 'center', fontSize: 12.5 }}>/ {sayi(sonSayfa)}</span>
                            <button disabled={sayfa >= sonSayfa} onClick={() => setSayfa(s => s + 1)}><ChevronRight size={14} /></button>
                        </div>
                    </div>
                </>
            )}

            {view === 'card' && (
                yukleniyor
                    ? <div className="fb sr" style={{ color: '#94a3b8' }}>Yükleniyor…</div>
                    : <div className="cg">{kisiler.map(kart)}</div>
            )}

            {view === 'pipeline' && (
                yukleniyor
                    ? <div className="fb sr" style={{ color: '#94a3b8' }}>Yükleniyor…</div>
                    : (
                        <div className="pl">
                            {asamalar.map(([ad, liste]) => {
                                const renk = ASAMA_RENK[ad] || '#94a3b8';
                                return (
                                    <div className="pc" key={ad}>
                                        <div className="pc-h"><i style={{ background: renk }} /><span>{ad}</span><b>{sayi(liste.length)}</b></div>
                                        <div className="pc-b">
                                            {liste.slice(0, 4).map(k => {
                                                const d = aktiviteDokumu(k);
                                                return (
                                                    <div className="mc" key={k.id}>
                                                        <div className="mc-n">{k.name || 'İsimsiz'}</div>
                                                        <div className="mc-m">{k.aiTopic || k.phone || '—'}</div>
                                                        <div className="mc-f">
                                                            <span><Phone size={12} /> {d.arama}</span>
                                                            <span><StickyNote size={12} /> {d.not}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {liste.length > 4 && <div className="pc-mr">+{sayi(liste.length - 4)} kişi daha</div>}
                                    </div>
                                );
                            })}
                        </div>
                    )
            )}

            <Customers2Bulk
                workspaceId={currentWorkspace?.id}
                secilenler={[...secim.values()]}
                onTemizle={() => setSecim(new Map())}
                onYenile={getir}
            />

            <p className="tp-c" style={{ marginTop: 18 }}>
                Bu sayfa deneyseldir ve yalnızca SUPER_ADMIN tarafından görülür. Mevcut Kişiler sayfası değişmedi.
            </p>
        </div>
    );
}

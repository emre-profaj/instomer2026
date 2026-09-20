/**
 * KİŞİLER 2 — toplu işlem çubuğu
 *
 * Mevcut Kişiler sayfasındaki toplu gönderimin aynısı, tek yerde toplanmış.
 * Dört kanalın hepsi marketingV2API.quickBulkCampaign'e gidiyor: uç nokta
 * grubu ve kampanyayı kendisi kuruyor, gönderimi arka planda yürütüyor.
 * Kişi başına döngü kurmuyoruz — o yol 500 ms'lik beklemelerle ilerliyor
 * ve sekme kapanınca yarıda kalıyor.
 */
import { useState, useEffect } from 'react';
import {
    X, MessageSquare, Mail, PhoneCall, Download, Trash2, Loader2, CheckCircle2
} from 'lucide-react';
import { marketingV2API, automationAPI, emailAPI, retellAPI, contactAPI } from '../../services/api';

const KANAL = {
    WHATSAPP: { ad: 'WhatsApp şablonu', Icon: MessageSquare, alan: 'phone' },
    EMAIL:    { ad: 'E-posta',          Icon: Mail,          alan: 'email' },
    AI_CALL:  { ad: 'AI sesli arama',   Icon: PhoneCall,     alan: 'phone' }
};

const zamanAdi = (etiket) => {
    const n = new Date();
    return `${etiket} - ${n.toLocaleDateString('tr-TR')} ${n.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
};

export default function Customers2Bulk({ workspaceId, secilenler, onTemizle, onYenile }) {
    const [kanal, setKanal] = useState(null);      // WHATSAPP | EMAIL | AI_CALL
    const [silOnay, setSilOnay] = useState(false);
    const [gonderiliyor, setGonderiliyor] = useState(false);
    const [sonuc, setSonuc] = useState(null);
    const [hata, setHata] = useState(null);

    const [kampanyaAdi, setKampanyaAdi] = useState('');
    const [sablon, setSablon] = useState('');
    const [sablonlar, setSablonlar] = useState([]);
    const [epostaKanali, setEpostaKanali] = useState('');
    const [epostaKanallari, setEpostaKanallari] = useState([]);
    const [konu, setKonu] = useState('');
    const [govde, setGovde] = useState('');
    const [ajan, setAjan] = useState('');
    const [ajanlar, setAjanlar] = useState([]);
    const [listeYukleniyor, setListeYukleniyor] = useState(false);

    const sayi = secilenler.length;
    const cfg = kanal ? KANAL[kanal] : null;
    const uygun = cfg ? secilenler.filter(c => c[cfg.alan]) : [];
    const eksik = sayi - uygun.length;

    // Kanal seçilince o kanalın seçenek listesini getir
    useEffect(() => {
        if (!kanal || !workspaceId) return;
        let iptal = false;
        (async () => {
            setListeYukleniyor(true);
            setHata(null);
            try {
                if (kanal === 'WHATSAPP') {
                    const r = await automationAPI.getTemplates(workspaceId);
                    const t = r.data.templates || r.data || [];
                    if (!iptal) setSablonlar(t.filter(x => x.status === 'APPROVED'));
                } else if (kanal === 'EMAIL') {
                    const r = await emailAPI.getChannels(workspaceId);
                    const k = r.data.emailChannels || r.data.channels || r.data || [];
                    if (!iptal) { setEpostaKanallari(k); if (k[0]) setEpostaKanali(k[0].id); }
                } else if (kanal === 'AI_CALL') {
                    const r = await retellAPI.getAgents(workspaceId);
                    const a = r.data.agents || [];
                    if (!iptal) { setAjanlar(a); if (a[0]) setAjan(a[0].agent_id || a[0].id); }
                }
            } catch (e) {
                if (!iptal) setHata(e?.response?.data?.error || e.message || 'Liste alınamadı.');
            } finally {
                if (!iptal) setListeYukleniyor(false);
            }
        })();
        return () => { iptal = true; };
    }, [kanal, workspaceId]);

    const ac = (k) => {
        setKanal(k);
        setSonuc(null); setHata(null);
        setKampanyaAdi(zamanAdi(`Toplu ${KANAL[k].ad}`));
        setSablon(''); setKonu(''); setGovde('');
    };

    const kapat = () => {
        if (gonderiliyor) return;
        setKanal(null); setSilOnay(false); setSonuc(null); setHata(null);
    };

    const gonder = async () => {
        setGonderiliyor(true);
        setHata(null);
        try {
            const { data } = await marketingV2API.quickBulkCampaign(workspaceId, {
                channel: kanal,
                campaignName: kampanyaAdi,
                contactIds: uygun.map(c => c.id),
                ...(kanal === 'WHATSAPP' ? { templateName: sablon } : {}),
                ...(kanal === 'EMAIL' ? { emailSubject: konu, emailBody: govde, emailChannelId: epostaKanali } : {}),
                ...(kanal === 'AI_CALL' ? { agentId: ajan } : {})
            });
            setSonuc({
                ad: data.campaign?.name || kampanyaAdi,
                grup: data.group?.name,
                toplam: data.totalEligible ?? uygun.length
            });
        } catch (e) {
            setHata(e?.response?.data?.error || e.message || 'Kampanya oluşturulamadı.');
        } finally {
            setGonderiliyor(false);
        }
    };

    const disaAktar = () => {
        const basliklar = ['Ad', 'Telefon', 'E-posta', 'Kaynak', 'Talep', 'İlk yazma', 'Son yazma'];
        const tarih = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '';
        const kacir = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const satirlar = secilenler.map(c => [
            c.name, c.phone, c.email, c.source,
            c.aiTopic || c.activeCase?.title || '', tarih(c.firstMessageAt), tarih(c.lastMessageAt)
        ].map(kacir).join(';'));
        // BOM: Excel Türkçe karakterleri doğru açsın
        const csv = '﻿' + [basliklar.join(';'), ...satirlar].join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `kisiler-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const sil = async () => {
        setGonderiliyor(true);
        let hatali = 0;
        for (const c of secilenler) {
            try { await contactAPI.delete(workspaceId, c.id); } catch { hatali++; }
        }
        setGonderiliyor(false);
        setSilOnay(false);
        onTemizle();
        onYenile();
        if (hatali) setHata(`${hatali} kişi silinemedi.`);
    };

    const gonderilebilir = !gonderiliyor && uygun.length > 0 && (
        kanal === 'WHATSAPP' ? !!sablon :
        kanal === 'EMAIL'    ? (!!konu && !!govde && !!epostaKanali) :
        kanal === 'AI_CALL'  ? !!ajan : false
    );

    if (sayi === 0) return null;

    return (
        <>
            <div className="bb">
                <button className="bb-x" onClick={onTemizle} title="Seçimi temizle"><X size={15} /></button>
                <span className="bb-n"><b>{sayi}</b> kişi seçildi</span>
                <span className="bb-sep" />
                <button className="bb-a" onClick={() => ac('WHATSAPP')}><MessageSquare size={14} />Şablon gönder</button>
                <button className="bb-a" onClick={() => ac('EMAIL')}><Mail size={14} />E-posta</button>
                <button className="bb-a" onClick={() => ac('AI_CALL')}><PhoneCall size={14} />AI arama</button>
                <button className="bb-a" onClick={disaAktar}><Download size={14} />Dışa aktar</button>
                <button className="bb-a dgr" onClick={() => setSilOnay(true)}><Trash2 size={14} />Sil</button>
            </div>

            {(kanal || silOnay) && (
                <div className="ov" onClick={kapat}>
                    <div className="md" onClick={e => e.stopPropagation()}>
                        {silOnay ? (
                            <>
                                <div className="md-h">
                                    <span className="md-i dgr"><Trash2 size={17} /></span>
                                    <div><h2>Kişileri sil</h2><p>{sayi} kişi kalıcı olarak silinecek.</p></div>
                                    <button className="md-x" onClick={kapat}><X size={15} /></button>
                                </div>
                                <div className="md-b">
                                    <p className="md-uy">Bu işlem geri alınamaz. Kişilerin konuşmaları ve talepleri de erişilemez hâle gelir.</p>
                                </div>
                                <div className="md-f">
                                    <span className="sp" />
                                    <button className="btn" onClick={kapat} disabled={gonderiliyor}>Vazgeç</button>
                                    <button className="btn dan" onClick={sil} disabled={gonderiliyor}>
                                        {gonderiliyor ? <><Loader2 size={14} className="spn" />Siliniyor…</> : `Evet, ${sayi} kişiyi sil`}
                                    </button>
                                </div>
                            </>
                        ) : sonuc ? (
                            <>
                                <div className="md-h">
                                    <span className="md-i ok"><CheckCircle2 size={17} /></span>
                                    <div><h2>Kampanya oluşturuldu</h2><p>{sonuc.ad}</p></div>
                                    <button className="md-x" onClick={kapat}><X size={15} /></button>
                                </div>
                                <div className="md-b">
                                    <p className="md-uy ok">
                                        <b>{sonuc.toplam}</b> kişi kampanyaya alındı ve gönderim arka planda başladı.
                                        {sonuc.grup ? <> Grup: <b>{sonuc.grup}</b>.</> : null} İlerlemeyi Pazarlama sayfasından izleyebilirsin.
                                    </p>
                                </div>
                                <div className="md-f"><span className="sp" /><button className="btn pri" onClick={() => { kapat(); onTemizle(); }}>Tamam</button></div>
                            </>
                        ) : (
                            <>
                                <div className="md-h">
                                    <span className="md-i"><cfg.Icon size={17} /></span>
                                    <div><h2>{cfg.ad} — toplu gönderim</h2>
                                        <p>{uygun.length} kişiye gönderilecek{eksik > 0 ? ` · ${eksik} kişide ${cfg.alan === 'phone' ? 'numara' : 'e-posta'} yok` : ''}</p></div>
                                    <button className="md-x" onClick={kapat}><X size={15} /></button>
                                </div>
                                <div className="md-b">
                                    <div className="md-f2">
                                        <label className="tk-l" htmlFor="b-ad">Kampanya adı</label>
                                        <input id="b-ad" className="tk-i" value={kampanyaAdi} onChange={e => setKampanyaAdi(e.target.value)} />
                                    </div>

                                    {kanal === 'WHATSAPP' && (
                                        <div className="md-f2">
                                            <label className="tk-l" htmlFor="b-sb">Onaylı şablon</label>
                                            <select id="b-sb" className="tk-i" value={sablon} onChange={e => setSablon(e.target.value)} disabled={listeYukleniyor}>
                                                <option value="">{listeYukleniyor ? 'Yükleniyor…' : 'Şablon seçin'}</option>
                                                {sablonlar.map(t => <option key={t.name || t.id} value={t.name}>{t.name}</option>)}
                                            </select>
                                            {!listeYukleniyor && sablonlar.length === 0 && (
                                                <span className="tk-h">Onaylı şablon bulunamadı. Kanallar sayfasından şablonları senkronla.</span>
                                            )}
                                        </div>
                                    )}

                                    {kanal === 'EMAIL' && (
                                        <>
                                            <div className="md-f2">
                                                <label className="tk-l" htmlFor="b-ek">Gönderen hesap</label>
                                                <select id="b-ek" className="tk-i" value={epostaKanali} onChange={e => setEpostaKanali(e.target.value)} disabled={listeYukleniyor}>
                                                    <option value="">{listeYukleniyor ? 'Yükleniyor…' : 'Hesap seçin'}</option>
                                                    {epostaKanallari.map(k => <option key={k.id} value={k.id}>{k.email || k.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="md-f2">
                                                <label className="tk-l" htmlFor="b-ko">Konu</label>
                                                <input id="b-ko" className="tk-i" value={konu} onChange={e => setKonu(e.target.value)} placeholder="E-posta konusu" />
                                            </div>
                                            <div className="md-f2">
                                                <label className="tk-l" htmlFor="b-gv">İçerik</label>
                                                <textarea id="b-gv" className="tk-i" rows={6} value={govde} onChange={e => setGovde(e.target.value)} placeholder="Mesaj metni…" />
                                            </div>
                                        </>
                                    )}

                                    {kanal === 'AI_CALL' && (
                                        <div className="md-f2">
                                            <label className="tk-l" htmlFor="b-aj">AI ajanı</label>
                                            <select id="b-aj" className="tk-i" value={ajan} onChange={e => setAjan(e.target.value)} disabled={listeYukleniyor}>
                                                <option value="">{listeYukleniyor ? 'Yükleniyor…' : 'Ajan seçin'}</option>
                                                {ajanlar.map(a => <option key={a.agent_id || a.id} value={a.agent_id || a.id}>{a.agent_name || a.name}</option>)}
                                            </select>
                                        </div>
                                    )}

                                    {eksik > 0 && (
                                        <p className="md-uy">
                                            Seçili {sayi} kişiden <b>{eksik}</b> tanesinde {cfg.alan === 'phone' ? 'telefon numarası' : 'e-posta adresi'} yok; onlar atlanacak.
                                        </p>
                                    )}
                                    {hata && <p className="md-uy dgr">{hata}</p>}
                                </div>
                                <div className="md-f">
                                    <span className="sp" />
                                    <button className="btn" onClick={kapat} disabled={gonderiliyor}>Vazgeç</button>
                                    <button className="btn pri" onClick={gonder} disabled={!gonderilebilir}>
                                        {gonderiliyor ? <><Loader2 size={14} className="spn" />Oluşturuluyor…</> : `${uygun.length} kişiye gönder`}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

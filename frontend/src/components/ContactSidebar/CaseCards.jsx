import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { caseAPI, funnelAPI, conversationAPI, contactAPI, productAPI, appointmentConfigAPI } from '../../services/api';
import { Briefcase, Plus, ChevronDown, ChevronRight, User, Users, Loader, X, Check, AlertTriangle, Building2 } from 'lucide-react';
import { PICKABLE_SOURCES } from '../../utils/leadSource';

const STATUS_LABELS = {
    ACTIVE: { label: 'Aktif', color: '#3b82f6', bg: '#eff6ff' },
    WON: { label: 'Kazandı', color: '#10b981', bg: '#ecfdf5' },
    LOST: { label: 'Kaybetti', color: '#ef4444', bg: '#fef2f2' },
    CLOSED: { label: 'Kapandı', color: '#6b7280', bg: '#f3f4f6' }
};

const PRIORITY_ICONS = {
    LOW: '🔵',
    NORMAL: '',
    HIGH: '🟠',
    URGENT: '🔴'
};

const getScoreColor = (temp) => ({
  COLD: '#3b82f6', COOL: '#22c55e', WARM: '#eab308', HOT: '#f97316', FIRE: '#ef4444'
})[temp] || '#94a3b8';

const getScoreBgColor = (temp) => ({
  COLD: '#eff6ff', COOL: '#f0fdf4', WARM: '#fefce8', HOT: '#fff7ed', FIRE: '#fef2f2'
})[temp] || '#f1f5f9';

const getScoreEmoji = (temp) => ({
  COLD: '🔵', COOL: '🟢', WARM: '🟡', HOT: '🟠', FIRE: '🔴'
})[temp] || '⬜';

const getScoreLabel = (temp) => ({
  COLD: 'Soğuk', COOL: 'Ilık', WARM: 'Sıcak', HOT: 'Çok Sıcak', FIRE: 'Yanıyor'
})[temp] || '';

const CaseCards = ({ workspaceId, contactId, members = [], teams = [], conversationId, activeCaseId = null, onCaseLinked, inline = false, onStageChanged = null, onCaseInfo = null, onCasesLoaded = null, showOnly = null }) => {
    // Flatten hierarchical teams
    const flatTeams = (() => {
        const result = [];
        const flatten = (list) => {
            for (const t of list) {
                result.push(t);
                if (t.children?.length) flatten(t.children);
            }
        };
        flatten(teams);
        return result;
    })();
    const [cases, setCases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newLeadSource, setNewLeadSource] = useState('');
    const [newLeadSourceDetail, setNewLeadSourceDetail] = useState('');
    const [funnels, setFunnels] = useState([]);
    const [editingCaseId, setEditingCaseId] = useState(null);
    const [assigningCaseId, setAssigningCaseId] = useState(null);
    const [showInlineCreate, setShowInlineCreate] = useState(false);
    const [inlineNewTitle, setInlineNewTitle] = useState('');
    const [inlineCreating, setInlineCreating] = useState(false);
    const [showCaseSwitch, setShowCaseSwitch] = useState(false);
    const [categories, setCategories] = useState([]);
    const [branches, setBranches] = useState([]);

    // Ürün Seçici State
    const [catalogProducts, setCatalogProducts] = useState([]);
    const [showProductPicker, setShowProductPicker] = useState(null);
    const [productSearch, setProductSearch] = useState('');

    // Mega menü state (inline mode) — must be before any early returns to respect Rules of Hooks
    const [megaOpen, setMegaOpen] = useState(false);
    const [megaPos, setMegaPos] = useState({ top: 0, left: 0 });
    const [megaHoverFunnel, setMegaHoverFunnel] = useState(null);
    const megaRef = useRef(null);

    const loadCategories = async () => {
        try {
            const { default: api } = await import('../../services/api');
            const res = await api.get(`/topic-categories/${workspaceId}`);
            setCategories(res.data || []);
        } catch (e) { /* opsiyonel */ }
    };

    const loadBranches = async () => {
        try {
            const res = await appointmentConfigAPI.getBranches(workspaceId);
            setBranches(res.data?.branches || []);
        } catch (e) { /* opsiyonel */ }
    };

    useEffect(() => {
        if (workspaceId && contactId) {
            fetchCases();
            loadFunnels();
            loadCategories();
            loadBranches();
        }
    }, [workspaceId, contactId]);

    useEffect(() => {
        if (workspaceId) {
            productAPI.getAll(workspaceId, { isGroup: false, limit: 500 }).then(res => {
                setCatalogProducts(res.data?.products || res.data || []);
            }).catch(() => {});
        }
    }, [workspaceId]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (!e.target.closest('.product-search-wrapper')) {
                setShowProductPicker(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Listen for funnel stage updates from Inbox header or socket to keep local case state in sync
    useEffect(() => {
        const handler = (e) => {
            const { conversationId: updatedConvId, contactId: updatedContactId, funnelStageId } = e.detail || {};
            if (!funnelStageId) return;
            
            // If we know this update belongs to the active contact, reload to get fresh data
            if (updatedContactId === contactId) {
                loadCases();
                return;
            }

            // Update local case that owns this conversation
            setCases(prev => prev.map(c => {
                const ownsConv = c.conversations?.some(cv => cv.id === updatedConvId);
                if (!ownsConv) return c;
                // Find which funnel this stage belongs to
                let funnelType = c.funnelType;
                for (const f of funnels) {
                    if ((f.stages || []).some(s => s.id === funnelStageId)) {
                        funnelType = f.id;
                        break;
                    }
                }
                return { ...c, funnelStageId, funnelType };
            }));
        };
        window.addEventListener('websocket:funnel_stage_updated', handler);
        return () => window.removeEventListener('websocket:funnel_stage_updated', handler);
    }, [conversationId, contactId, funnels]);

    // Refresh cases when case_updated or case_cards_refresh is received
    useEffect(() => {
        const handleCaseUpdated = (e) => {
            const { caseId, changes } = e.detail || {};
            if (!caseId) return;
            // Update matching case locally
            setCases(prev => prev.map(c => {
                if (c.id !== caseId) return c;
                const updates = {};
                if (changes?.title !== undefined) updates.title = changes.title;
                if (changes?.status !== undefined) updates.status = changes.status;
                if (changes?.funnelType !== undefined) updates.funnelType = changes.funnelType;
                if (changes?.funnelStageId !== undefined) updates.funnelStageId = changes.funnelStageId;
                if (changes?.assignedToId !== undefined) updates.assignedToId = changes.assignedToId;
                if (changes?.assignedTeamId !== undefined) updates.assignedTeamId = changes.assignedTeamId;
                return Object.keys(updates).length > 0 ? { ...c, ...updates } : c;
            }));
            // Parent'ı bilgilendir — sidebar status pill anında güncellensin
            if (onCaseInfo && changes) {
                // closingStages ve openStages bilgisini de gönder
                const updatedCase = cases.find(c => c.id === caseId);
                const ft = changes?.funnelType || updatedCase?.funnelType;
                const currentFunnel = ft ? funnels.find(f => f.id === ft) : null;
                const closingStages = currentFunnel?.stages
                    ?.filter(s => s.isClosing)
                    ?.map(s => ({ id: s.id, name: s.name, color: s.color, statusType: s.statusType }))
                    || [];
                const openStages = currentFunnel?.stages
                    ?.filter(s => !s.isClosing)
                    ?.map(s => ({ id: s.id, name: s.name, color: s.color }))
                    || [];
                onCaseInfo({ caseId, ...changes, closingStages, openStages });
            }
        };
        const handleRefresh = () => { setTimeout(() => fetchCases(), 500); };
        const handleScoreUpdated = (e) => {
            const { caseId, score, temperature } = e.detail || {};
            if (!caseId) return;
            setCases(prev => prev.map(c =>
                c.id === caseId ? { ...c, leadScore: score, leadTemperature: temperature } : c
            ));
        };

        window.addEventListener('websocket:case_updated', handleCaseUpdated);
        window.addEventListener('case_cards_refresh', handleRefresh);
        window.addEventListener('websocket:case_score_updated', handleScoreUpdated);
        return () => {
            window.removeEventListener('websocket:case_updated', handleCaseUpdated);
            window.removeEventListener('case_cards_refresh', handleRefresh);
            window.removeEventListener('websocket:case_score_updated', handleScoreUpdated);
        };
    }, [workspaceId, contactId]);

    const fetchCases = async () => {
        try {
            const res = await caseAPI.getByContact(workspaceId, contactId);
            // Boş ya da kimliksiz kayıt gelirse aşağıdaki listeler c.title
            // okurken çöküyor ve tüm kişi kartı hata ekranına düşüyordu.
            const fetched = (Array.isArray(res.data) ? res.data : []).filter(c => c && c.id);
            setCases(fetched);
            if (onCasesLoaded) onCasesLoaded(fetched);
            // Re-fetch sonrası linked case bilgisini parent'a ilet
            if (onCaseInfo && conversationId && fetched.length > 0) {
                const linkedCase = (activeCaseId && fetched.find(c => c.id === activeCaseId))
                    || fetched.find(c => c.conversations?.some(cv => cv.id === conversationId))
                    || fetched.find(c => c.status === 'ACTIVE')
                    || fetched[0];
                if (linkedCase) {
                    // İlgili akışın kapanış adımlarını bul
                    const currentFunnel = funnels.find(f => f.id === linkedCase.funnelType);
                    const closingStages = currentFunnel?.stages
                        ?.filter(s => s.isClosing)
                        ?.map(s => ({ id: s.id, name: s.name, color: s.color, statusType: s.statusType }))
                        || [];
                    const openStages = currentFunnel?.stages
                        ?.filter(s => !s.isClosing)
                        ?.map(s => ({ id: s.id, name: s.name, color: s.color }))
                        || [];
                    onCaseInfo({
                        caseId: linkedCase.id,
                        caseNumber: linkedCase?.caseNumber,
                        title: linkedCase.title,
                        type: linkedCase.type || null,
                        status: linkedCase.status,
                        funnelType: linkedCase.funnelType,
                        funnelStageId: linkedCase.funnelStageId,
                        assignedToId: linkedCase.assignedToId,
                        assignedTeamId: linkedCase.assignedTeamId,
                        assignedTo: linkedCase.assignedTo || null,
                        leadScore: linkedCase.leadScore ?? null,
                        leadTemperature: linkedCase.leadTemperature ?? null,
                        products: linkedCase.products || null,
                        categoryId: linkedCase.categoryId || null,
                        branchId: linkedCase.branchId || null,
                        branch: linkedCase.branch || null,
                        closingStages,
                        openStages,
                    });
                }
            }
        } catch (err) {
            console.error('Case fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadFunnels = async () => {
        try {
            const res = await funnelAPI.getAll(workspaceId);
            setFunnels(Array.isArray(res.data) ? res.data : (res.data?.funnels || []));
        } catch { }
    };

    const handleCreate = async () => {
        if (!newTitle.trim()) return;
        setCreating(true);
        try {
            await caseAPI.create(workspaceId, contactId, {
                title: newTitle.trim(),
                conversationId: conversationId || null,
                leadSource: newLeadSource || null,
                leadSourceDetail: newLeadSourceDetail || null
            });
            setNewTitle('');
            setNewLeadSource('');
            setNewLeadSourceDetail('');
            setShowCreateForm(false);
            fetchCases();
        } catch (err) {
            console.error('Case create error:', err);
            alert('Case oluşturulamadı');
        } finally {
            setCreating(false);
        }
    };

    const handleInlineCreate = async () => {
        if (!inlineNewTitle.trim()) return;
        setInlineCreating(true);
        try {
            await caseAPI.create(workspaceId, contactId, {
                title: inlineNewTitle.trim(),
                conversationId: conversationId || null,
                leadSource: newLeadSource || null,
                leadSourceDetail: newLeadSourceDetail || null
            });
            setInlineNewTitle('');
            setNewLeadSource('');
            setNewLeadSourceDetail('');
            setShowInlineCreate(false);
            fetchCases();
            window.dispatchEvent(new CustomEvent('case_cards_refresh'));
        } catch (err) {
            console.error('Inline case create error:', err);
        } finally {
            setInlineCreating(false);
        }
    };

    const handleUpdateStage = async (caseId, funnelType, funnelStageId) => {
        try {
            // Find the selected stage to check isClosing / statusType
            let selectedStage = null;
            let stageName = '', stageColor = '#6366f1';
            for (const f of funnels) {
                const s = (f.stages || []).find(s => s.id === funnelStageId);
                if (s) { selectedStage = s; stageName = s.name; stageColor = s.color || '#6366f1'; break; }
            }

            // Kapanış aşaması mı? Case status'ünü otomatik güncelle
            const newStatus = selectedStage?.isClosing
                ? (selectedStage.statusType || 'CLOSED')
                : 'ACTIVE';

            await caseAPI.update(workspaceId, caseId, { funnelType, funnelStageId, status: newStatus });
            setCases(prev => prev.map(c => c.id === caseId ? { ...c, funnelType, funnelStageId, status: newStatus } : c));

            // Also sync conversation's funnelStageId + status (bidirectional sync)
            if (conversationId && workspaceId) {
                try {
                    await conversationAPI.updateFunnel(workspaceId, conversationId, { funnelStageId, funnelType });
                    // Kapanış aşamasına geçtiyse conversation'ı da RESOLVED yap
                    // Açık aşamaya geçtiyse conversation'ı OPEN yap
                    if (selectedStage?.isClosing) {
                        await conversationAPI.updateStatus(workspaceId, conversationId, { status: 'RESOLVED' });
                    } else {
                        await conversationAPI.updateStatus(workspaceId, conversationId, { status: 'OPEN' });
                    }
                } catch (_) {}
            }

            // Notify parent — sidebar status pill + funnel pill güncellensin
            if (onCaseInfo) {
                // İlgili akışın kapanış adımlarını bul
                const currentFunnel = funnels.find(f => f.id === funnelType);
                const closingStages = currentFunnel?.stages
                    ?.filter(s => s.isClosing)
                    ?.map(s => ({ id: s.id, name: s.name, color: s.color, statusType: s.statusType }))
                    || [];
                const openStages = currentFunnel?.stages
                    ?.filter(s => !s.isClosing)
                    ?.map(s => ({ id: s.id, name: s.name, color: s.color }))
                    || [];
                onCaseInfo({ caseId, funnelType, funnelStageId, status: newStatus, closingStages, openStages });
            }
            if (onStageChanged) {
                onStageChanged({ funnelType, funnelStageId, stageName, stageColor });
            }

            // Dispatch events for all listeners
            window.dispatchEvent(new CustomEvent('websocket:case_updated', {
                detail: { caseId, changes: { funnelType, funnelStageId, status: newStatus } }
            }));
            window.dispatchEvent(new CustomEvent('websocket:funnel_stage_updated', {
                detail: { conversationId, contactId, funnelType, funnelStageId, stageName, stageColor }
            }));
            window.dispatchEvent(new CustomEvent('case_cards_refresh'));
        } catch (err) {
            console.error('Stage update error:', err);
        }
    };

    const handleAssign = async (caseId, assignedToId, assignedTeamId) => {
        try {
            const res = await caseAPI.assign(workspaceId, caseId, { assignedToId, assignedTeamId });
            const updatedAssignedTo = members.find(m => (m.user?.id || m.userId || m.id) === assignedToId)?.user || null;
            const updatedTeam = flatTeams.find(t => t.id === assignedTeamId) || null;
            setCases(prev => prev.map(c => c.id === caseId ? {
                ...c,
                assignedToId,
                assignedTeamId,
                assignedTo: updatedAssignedTo,
                team: updatedTeam
            } : c));
            setAssigningCaseId(null);
            // Parent'ı bilgilendir — tablo + sidebar güncellensin
            if (onCaseInfo) {
                onCaseInfo({
                    caseId,
                    assignedToId,
                    assignedTeamId,
                    assignedTo: updatedAssignedTo,
                    assignedToName: updatedAssignedTo?.name || null,
                    team: updatedTeam
                });
            }
            // Inbox header'ı bilgilendir — conversation ataması anında güncellensin
            window.dispatchEvent(new CustomEvent('websocket:case_assignment_updated', {
                detail: {
                    caseId,
                    assignedToId,
                    assignedTeamId,
                    assignedToName: updatedAssignedTo?.name || null
                }
            }));
            window.dispatchEvent(new CustomEvent('case_cards_refresh'));
            // Conversation'ın assignedTo'sunu da güncelle
            if (conversationId && workspaceId && assignedToId) {
                try {
                    await conversationAPI.updateFunnel(workspaceId, conversationId, {
                        assignedToId,
                        confirmAssignmentUpdate: true
                    });
                } catch (_) {}
            }
            if (res.data?.cascaded) {
                const { conversations, activities } = res.data.cascaded;
                if (conversations > 0 || activities > 0) {
                    // Silently cascade - no alert needed
                }
            }
        } catch (err) {
            console.error('Assign error:', err);
            alert('Atama yapılamadı');
        }
    };

    const handleStatusChange = async (caseId, status) => {
        try {
            await caseAPI.update(workspaceId, caseId, { status });
            setCases(prev => prev.map(c => c.id === caseId ? { ...c, status } : c));
            // Parent'ı bilgilendir — sidebar'daki status pill güncellensin
            if (onCaseInfo) {
                onCaseInfo({ caseId, status });
            }
            window.dispatchEvent(new CustomEvent('case_cards_refresh'));
        } catch (err) {
            console.error('Status update error:', err);
        }
    };

    const handleLinkCurrentConversation = async (caseId) => {
        if (!conversationId) return;
        try {
            await caseAPI.linkConversation(workspaceId, caseId, conversationId);
            fetchCases();
            if (onCaseLinked) onCaseLinked(caseId);
        } catch (err) {
            console.error('Link error:', err);
        }
    };

    const activeCases = cases.filter(c => c.status === 'ACTIVE');
    const closedCases = cases.filter(c => c.status !== 'ACTIVE');

    // Find current case for current conversation
    const currentConvCase = conversationId ? cases.find(c =>
        c.conversations?.some(cv => cv.id === conversationId)
    ) : null;

    // Compute displayCase for inline mode (needed for the useEffect below)
    const displayCase = inline ? (currentConvCase || activeCases[0] || cases[0]) : null;

    const handleMergeCases = async () => {
        const allActiveCaseIds = activeCases.map(c => c.id);
        if (allActiveCaseIds.length < 2) return;
        if (!window.confirm(`${allActiveCaseIds.length} case birleştirilsin mi?`)) return;
        try {
            await caseAPI.merge(workspaceId, { caseIds: allActiveCaseIds, contactId });
            fetchCases();
            window.dispatchEvent(new CustomEvent('case_cards_refresh'));
        } catch (err) {
            console.error('Merge error:', err);
            alert('Case birleştirme başarısız oldu.');
        }
    };

    const handleAddProduct = async (caseItem, product) => {
        try {
            const currentProducts = typeof caseItem.products === 'string' ? JSON.parse(caseItem.products || '[]') : caseItem.products || [];
            if (currentProducts.some(p => p.productId === product.id)) return;
            const newProducts = [...currentProducts, {
                productId: product.id,
                name: product.name,
                groupName: product.groupName || null,
                quantity: 1,
                unitPrice: product.price || 0
            }];
            await caseAPI.update(workspaceId, caseItem.id, { products: JSON.stringify(newProducts) });
            setCases(prev => prev.map(c => c.id === caseItem.id ? { ...c, products: JSON.stringify(newProducts) } : c));
            if (onCaseInfo) onCaseInfo({ caseId: caseItem.id, products: JSON.stringify(newProducts) });
            setProductSearch('');
        } catch (err) {
            console.error('Ürün ekleme hatası:', err);
        }
    };

    const handleRemoveProduct = async (caseItem, productId) => {
        try {
            const currentProducts = typeof caseItem.products === 'string' ? JSON.parse(caseItem.products || '[]') : caseItem.products || [];
            const newProducts = currentProducts.filter(p => p.productId !== productId);
            await caseAPI.update(workspaceId, caseItem.id, { products: JSON.stringify(newProducts) });
            setCases(prev => prev.map(c => c.id === caseItem.id ? { ...c, products: JSON.stringify(newProducts) } : c));
            if (onCaseInfo) onCaseInfo({ caseId: caseItem.id, products: JSON.stringify(newProducts) });
        } catch (err) {
            console.error('Ürün silme hatası:', err);
        }
    };

    const handleSplitCase = async (caseIdToSplit = null) => {
        const targetCaseId = typeof caseIdToSplit === 'string' ? caseIdToSplit : displayCase?.id;
        if (!targetCaseId || !conversationId) return;
        if (!window.confirm("Bu konuşmayı ayrı case'e çıkar?")) return;
        try {
            await caseAPI.split(workspaceId, { caseId: targetCaseId, conversationIds: [conversationId] });
            fetchCases();
            window.dispatchEvent(new CustomEvent('case_cards_refresh'));
        } catch (err) {
            console.error('Split error:', err);
            alert('Case ayırma başarısız oldu.');
        }
    };

    // Notify parent about the active case info (for header display) — MUST be at top level, not inside conditional
    useEffect(() => {
        if (inline && displayCase && onCaseInfo) {
            onCaseInfo({
                caseNumber: displayCase.caseNumber,
                caseId: displayCase.id,
                title: displayCase.title,
                type: displayCase.type || null,
                status: displayCase.status,
                funnelType: displayCase.funnelType || null,
                funnelStageId: displayCase.funnelStageId || null,
                assignedToId: displayCase.assignedToId || null,
                assignedTeamId: displayCase.assignedTeamId || null,
                assignedTo: displayCase.assignedTo || null,
                team: displayCase.team || null,
                leadScore: displayCase.leadScore ?? null,
                leadTemperature: displayCase.leadTemperature ?? null,
                products: displayCase.products || null,
                categoryId: displayCase.categoryId || null,
                branchId: displayCase.branchId || null,
                branch: displayCase.branch || null,
            });
        }
    }, [inline, displayCase?.caseNumber, displayCase?.id, displayCase?.status, displayCase?.title, displayCase?.assignedToId, displayCase?.assignedTeamId, displayCase?.funnelType, displayCase?.funnelStageId, displayCase?.products, displayCase?.branchId]);

    if (loading) {
        if (showOnly === 'actions') return null;
        return (
            <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, color: '#9ca3af', fontSize: '0.82rem' }}>
                <Loader size={14} className="spin" /> Case'ler yükleniyor...
            </div>
        );
    }

    const getFunnelStageLabel = (c) => {
        if (!c.funnelStageId) return null;
        for (const f of funnels) {
            const stage = (f.stages || []).find(s => s.id === c.funnelStageId);
            if (stage) return { name: stage.name, color: stage.color || '#6366f1', funnelName: f.name };
        }
        return null;
    };



    // ── inline mode: case otomatik oluşuyor, sadece mevcut case bilgisini göster ──
    if (inline) {
        if (!displayCase) return null;

        const stageInfo = getFunnelStageLabel(displayCase);
        const statusInfo = STATUS_LABELS[displayCase.status] || STATUS_LABELS.ACTIVE;

        // Seçili akış ve aşama bilgisini bul
        const activeFunnel = funnels.find(f => (f.stages || []).some(s => s.id === displayCase.funnelStageId));
        const activeStageLabel = stageInfo?.name || null;
        const currentStageColor = stageInfo?.color || '#6366f1';
        const pillLabel = activeFunnel && activeStageLabel
            ? `${activeFunnel.name} / ${activeStageLabel}`
            : activeStageLabel || 'Akış seç...';

        return (
            <>
                {/* ── Akış / Aşama Mega Menü Trigger ── */}
                {(!showOnly || showOnly === 'stages') && (
                    <div style={{ padding: 0 }}>
                        <div ref={megaRef} style={{ position: 'relative' }}>
                            <button
                                onClick={e => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setMegaPos({ top: rect.bottom + 4, right: Math.max(10, window.innerWidth - rect.right) });
                                    setMegaHoverFunnel(activeFunnel?.id || null);
                                    setMegaOpen(v => !v);
                                }}
                                style={{
                                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                                background: '#ffffff', border: '1px solid #e2e8f0',
                                borderRadius: inline ? 8 : 10, padding: inline ? '0 8px' : '0 10px', height: inline ? 28 : 32,
                                cursor: 'pointer', fontSize: inline ? '0.72rem' : '0.76rem', fontWeight: 600, color: '#374151',
                                whiteSpace: 'nowrap', overflow: 'hidden'
                                }}
                            >
                                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: currentStageColor }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, textAlign: 'left' }}>
                                    {activeFunnel ? (
                                        <><span style={{ color: '#94a3b8', fontWeight: 500 }}>{activeFunnel.name}</span><span style={{ color: '#94a3b8', margin: '0 3px' }}>/</span><span>{activeStageLabel || 'Aşama Seç'}</span></>
                                    ) : (pillLabel)}
                                </span>
                                <ChevronDown size={14} color="#64748b" style={{ marginLeft: 'auto', flexShrink: 0 }} />
                            </button>

                            {/* ── Mega Menü Portal ── */}
                            {megaOpen && ReactDOM.createPortal(
                                <>
                                    {/* Backdrop */}
                                    <div
                                        style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
                                        onClick={() => { setMegaOpen(false); setMegaHoverFunnel(null); }}
                                    />
                                    <div style={{
                                        position: 'fixed',
                                        top: megaPos.top,
                                        right: megaPos.right,
                                        zIndex: 99999,
                                        background: '#fff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: 12,
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                                        padding: 6,
                                        display: 'flex',
                                        flexDirection: 'row',
                                        gap: 2,
                                        minWidth: 280,
                                        maxWidth: 380,
                                    }}>
                                        {/* Sol panel: Akışlar */}
                                        <div style={{ minWidth: 120, maxWidth: 150, borderRight: '1px solid #f1f5f9', paddingRight: 6 }}>
                                            <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '4px 6px 6px' }}>Akış</div>
                                            {funnels.map(funnel => {
                                                const isActive = activeFunnel?.id === funnel.id;
                                                const isHovered = megaHoverFunnel === funnel.id;
                                                const isHighlighted = isActive || isHovered;
                                                return (
                                                    <button
                                                        key={funnel.id}
                                                        onMouseEnter={() => setMegaHoverFunnel(funnel.id)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                                                            padding: '5px 7px', borderRadius: 7, border: 'none', cursor: 'pointer',
                                                            fontSize: '0.75rem', fontWeight: isActive ? 700 : 500,
                                                            background: isHighlighted ? '#eff6ff' : 'transparent',
                                                            color: isHighlighted ? '#1d4ed8' : '#374151',
                                                            transition: 'background 0.1s'
                                                        }}
                                                    >
                                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: funnel.color || '#6366f1', flexShrink: 0 }} />
                                                        {funnel.name}
                                                        <svg width="12" height="12" viewBox="0 0 12 12" style={{ marginLeft: 'auto', opacity: 0.4 }}><path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Sağ panel: Aşamalar */}
                                        {(() => {
                                            const displayFunnel = megaHoverFunnel
                                                ? funnels.find(f => f.id === megaHoverFunnel)
                                                : (activeFunnel || funnels[0]);
                                            if (!displayFunnel) return null;
                                            const stages = displayFunnel.stages || [];
                                            const isActiveFunnel = activeFunnel?.id === displayFunnel.id;
                                            return (
                                                <div style={{ minWidth: 120, maxWidth: 160 }}>
                                                    <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '4px 6px 6px' }}>{displayFunnel.name}</div>
                                                    {stages.map(stage => {
                                                        const isSelected = displayCase.funnelStageId === stage.id && isActiveFunnel;
                                                        return (
                                                            <button
                                                                key={stage.id}
                                                                onClick={() => {
                                                                    handleUpdateStage(displayCase.id, displayFunnel.id, stage.id);
                                                                    setMegaOpen(false);
                                                                    setMegaHoverFunnel(null);
                                                                }}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                                                                    padding: '5px 7px', borderRadius: 7, border: 'none', cursor: 'pointer',
                                                                    fontSize: '0.75rem', fontWeight: isSelected ? 700 : 400,
                                                                    background: isSelected ? (stage.color || '#6366f1') + '18' : 'transparent',
                                                                    color: isSelected ? (stage.color || '#6366f1') : '#374151',
                                                                    transition: 'background 0.1s'
                                                                }}
                                                                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
                                                                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                                            >
                                                                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: stage.color || '#6366f1' }} />
                                                                {stage.name}
                                                                {isSelected && <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: stage.color || '#6366f1' }}>✓</span>}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </>,
                                document.body
                            )}
                        </div>
                    </div>
                )}

                {/* ── Kategori + Ürün ── */}
                {!showOnly && displayCase && (
                    <div style={{ padding: '4px 0 0' }}>
                        {/* Kategori Seçimi — sadece tam modda (header'da zaten badge olarak var) */}
                        {!showOnly && (
                            <select
                                value={displayCase.categoryId || ''}
                                onChange={async (e) => {
                                    try {
                                        await caseAPI.update(workspaceId, displayCase.id, { categoryId: e.target.value || null });
                                        fetchCases();
                                    } catch (err) { console.error('Kategori güncelleme hatası:', err); }
                                }}
                                style={{
                                    width: '100%', padding: '4px 8px', fontSize: '0.72rem',
                                    border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer',
                                    color: displayCase.categoryId ? '#3730a3' : '#9ca3af',
                                    background: displayCase.categoryId ? '#eef2ff' : '#fff', outline: 'none',
                                    marginBottom: 4
                                }}
                            >
                                <option value="">📁 Kategori seç...</option>
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.icon || '📁'} {cat.name}</option>
                                ))}
                            </select>
                        )}

                        {/* Şube Seçimi */}
                        {!showOnly && (
                            <select
                                value={displayCase.branchId || ''}
                                onChange={async (e) => {
                                    try {
                                        await caseAPI.update(workspaceId, displayCase.id, { branchId: e.target.value || null });
                                        fetchCases();
                                        window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                    } catch (err) { console.error('Şube güncelleme hatası:', err); }
                                }}
                                style={{
                                    width: '100%', padding: '4px 8px', fontSize: '0.72rem',
                                    border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer',
                                    color: displayCase.branchId ? '#16a34a' : '#9ca3af',
                                    background: displayCase.branchId ? '#f0fdf4' : '#fff', outline: 'none',
                                    marginBottom: 4
                                }}
                            >
                                <option value="">🏢 Şube seç...</option>
                                {branches.map(b => (
                                    <option key={b.id} value={b.id}>🏢 {b.name}</option>
                                ))}
                            </select>
                        )}

                        {/* Ürün Ekleme */}
                        <div style={{ position: 'relative' }}>
                            <label style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>📦 Ürünler</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 3 }}>
                                {(() => {
                                    try {
                                        const prods = typeof displayCase.products === 'string' ? JSON.parse(displayCase.products || '[]') : displayCase.products || [];
                                        return prods.map((p, i) => (
                                            <span key={i} style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                                padding: '1px 6px', borderRadius: 10, background: '#fef3c7',
                                                border: '1px solid #fde68a', fontSize: '0.68rem', fontWeight: 600, color: '#92400e'
                                            }}>
                                                📦 {p.name}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleRemoveProduct(displayCase, p.productId); }}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 12, padding: 0, lineHeight: 1 }}
                                                >×</button>
                                            </span>
                                        ));
                                    } catch { return null; }
                                })()}
                            </div>
                            <div className="product-search-wrapper">
                                <input
                                    type="text"
                                    placeholder="Ürün ara ve ekle..."
                                    value={showProductPicker === displayCase.id ? productSearch : ''}
                                    onFocus={() => setShowProductPicker(displayCase.id)}
                                    onChange={e => { setShowProductPicker(displayCase.id); setProductSearch(e.target.value); }}
                                    style={{
                                        width: '100%', padding: '3px 8px', fontSize: '0.72rem',
                                        border: '1px solid #e5e7eb', borderRadius: 6, outline: 'none'
                                    }}
                                />
                                {showProductPicker === displayCase.id && productSearch.length > 0 && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0,
                                        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: 160, overflowY: 'auto'
                                    }}>
                                        {catalogProducts
                                            .filter(cp => cp.name.toLowerCase().includes(productSearch.toLowerCase()))
                                            .slice(0, 6)
                                            .map(cp => (
                                                <div
                                                    key={cp.id}
                                                    onClick={() => handleAddProduct(displayCase, cp)}
                                                    style={{
                                                        padding: '5px 10px', cursor: 'pointer', fontSize: '0.72rem',
                                                        display: 'flex', justifyContent: 'space-between',
                                                        borderBottom: '1px solid #f1f5f9'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                                >
                                                    <span>{cp.name}</span>
                                                    {cp.price > 0 && <span style={{ color: '#16a34a', fontWeight: 600 }}>{cp.price.toLocaleString('tr-TR')} ₺</span>}
                                                </div>
                                            ))
                                        }
                                        {catalogProducts.filter(cp => cp.name.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                                            <div style={{ padding: '8px 10px', fontSize: '0.72rem', color: '#9ca3af' }}>Ürün bulunamadı</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {(!showOnly || showOnly === 'actions') && (
                    <>
                        <div style={{ padding: showOnly === 'actions' ? '0' : '0 12px 4px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => { setShowInlineCreate(v => !v); setShowCaseSwitch(false); }}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    fontSize: '0.68rem', fontWeight: 600, color: '#8b5cf6',
                                    display: 'flex', alignItems: 'center', gap: 3, padding: '2px 4px'
                                }}
                            >
                                <Plus size={11} /> Yeni Case
                            </button>
                            {cases.filter(c => c.id !== displayCase?.id && c.status === 'ACTIVE').length > 0 && (
                                <button
                                    onClick={() => { setShowCaseSwitch(v => !v); setShowInlineCreate(false); }}
                                    style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        fontSize: '0.68rem', fontWeight: 500, color: '#6b7280',
                                        display: 'flex', alignItems: 'center', gap: 3, padding: '2px 4px'
                                    }}
                                >
                                    ↔ Değiştir
                                </button>
                            )}
                            {activeCases.length > 1 && (
                                <button
                                    onClick={handleMergeCases}
                                    style={{
                                        padding: '5px 10px', fontSize: '11px', fontWeight: 600,
                                        backgroundColor: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd',
                                        borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                                    }}
                                >
                                    🔗 Birleştir
                                </button>
                            )}
                            {displayCase && displayCase.conversations?.length > 1 && (
                                <button
                                    onClick={() => handleSplitCase()}
                                    style={{
                                        padding: '5px 10px', fontSize: '11px', fontWeight: 600,
                                        backgroundColor: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3',
                                        borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                                    }}
                                >
                                    ✂️ Böl
                                </button>
                            )}
                        </div>

                        {/* Yeni Case Form */}
                        {showInlineCreate && (
                            <div style={{ padding: showOnly === 'actions' ? '4px 0' : '0 12px 6px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <input
                                    type="text"
                                    value={inlineNewTitle}
                                    onChange={e => setInlineNewTitle(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && inlineNewTitle.trim()) {
                                            handleInlineCreate();
                                        } else if (e.key === 'Escape') {
                                            setShowInlineCreate(false);
                                            setInlineNewTitle('');
                                            setNewLeadSource('');
                                            setNewLeadSourceDetail('');
                                        }
                                    }}
                                    placeholder="Case başlığı..."
                                    autoFocus
                                    style={{
                                        width: '100%', boxSizing: 'border-box', fontSize: '0.74rem', padding: '6px 8px',
                                        border: '1px solid #e2e8f0', borderRadius: 6, outline: 'none'
                                    }}
                                />
                                <select value={newLeadSource} onChange={e => setNewLeadSource(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.74rem' }}>
                                    <option value="">Kaynak seçin (opsiyonel)</option>
                                    <optgroup label="Manuel">
                                        <option value="INBOUND">📞 Telefon</option>
                                        <option value="WALK_IN">🚶 Yüz Yüze</option>
                                        <option value="REFERRAL">🤝 Referans</option>
                                    </optgroup>
                                    <optgroup label="Dijital">
                                        <option value="GOOGLE">🔍 Google</option>
                                        <option value="FACEBOOK">📘 Facebook</option>
                                        <option value="INSTAGRAM">📸 Instagram</option>
                                        <option value="WHATSAPP">📱 WhatsApp</option>
                                        <option value="SMS">✉️ SMS</option>
                                        <option value="EMAIL">📧 E-posta</option>
                                        <option value="WEB_FORM">📝 Web Formu</option>
                                        <option value="WEBSITE">🌐 Web Sitesi</option>
                                    </optgroup>
                                    <optgroup label="Diğer">
                                        <option value="EVENT">🎪 Etkinlik/Fuar</option>
                                        <option value="OTHER">📍 Diğer</option>
                                    </optgroup>
                                </select>
                                {newLeadSource && (
                                    <input
                                        type="text"
                                        placeholder="Detay: hangi reklam, kim referans etti..."
                                        value={newLeadSourceDetail}
                                        onChange={e => setNewLeadSourceDetail(e.target.value)}
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.74rem' }}
                                    />
                                )}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                                    <button
                                        onClick={() => { setShowInlineCreate(false); setInlineNewTitle(''); setNewLeadSource(''); setNewLeadSourceDetail(''); }}
                                        style={{
                                            background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb',
                                            borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '0.72rem'
                                        }}
                                    >İptal</button>
                                    <button
                                        onClick={() => handleInlineCreate()}
                                        disabled={inlineCreating || !inlineNewTitle.trim()}
                                        style={{
                                            background: '#8b5cf6', color: '#fff', border: 'none',
                                            borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                                            fontSize: '0.72rem', fontWeight: 600, opacity: inlineCreating ? 0.6 : 1
                                        }}
                                    >
                                        {inlineCreating ? '...' : 'Oluştur'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Case Değiştir Dropdown */}
                        {showCaseSwitch && (
                            <div style={{
                                padding: showOnly === 'actions' ? '4px 0' : '4px 12px 6px', display: 'flex', flexDirection: 'column', gap: 2
                            }}>
                                <div style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>
                                    Diğer Case'ler
                                </div>
                                {cases.filter(c => c.id !== displayCase?.id && c.status === 'ACTIVE').map(c => (
                                    <button
                                        key={c.id}
                                        onClick={async () => {
                                            try {
                                                await caseAPI.linkConversation(workspaceId, c.id, conversationId);
                                                await fetchCases();
                                                setShowCaseSwitch(false);
                                                window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                            } catch (err) { console.error('Case switch error:', err); }
                                        }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            background: '#f8fafc', border: '1px solid #e2e8f0',
                                            borderRadius: 6, padding: '5px 8px', cursor: 'pointer',
                                            fontSize: '0.72rem', fontWeight: 500, color: '#374151',
                                            textAlign: 'left', width: '100%'
                                        }}
                                    >
                                        <Briefcase size={11} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                                        <span style={{ fontSize: '0.6rem', color: '#a1a1aa', fontFamily: 'monospace' }}>{c?.caseNumber}</span>
                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c?.title}</span>
                                    </button>
                                ))}
                                {cases.filter(c => c.id !== displayCase?.id && c.status === 'ACTIVE').length === 0 && (
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', padding: '4px 0' }}>
                                        Başka aktif case yok
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Kaynak — silik gösterim (admin/rapor amaçlı) */}
                        {displayCase?.source && (
                            <div style={{
                                padding: showOnly === 'actions' ? '4px 0' : '4px 12px 2px',
                                fontSize: '0.6rem', color: '#94a3b8', opacity: 0.5,
                                display: 'flex', alignItems: 'center', gap: 4,
                                borderTop: '1px solid #f1f5f9', marginTop: 4, paddingTop: 6,
                            }}>
                                <span>📡</span>
                                <span>
                                    {{ GOOGLE_ADS: 'Google Ads', META_ADS: 'Meta Ads', WHATSAPP_AD: 'WhatsApp Reklam', FORM: 'Form', CAMPAIGN: 'Kampanya', COLD_CALL: 'Cold Call', REFERRAL: 'Referans', ORGANIC: 'Organik', MANUAL: 'Manuel' }[displayCase.source] || displayCase.source}
                                </span>
                                {displayCase.campaign?.name && (
                                    <span style={{ color: '#cbd5e1' }}>• {displayCase.campaign.name}</span>
                                )}
                            </div>
                        )}
                    </>
                )}
            </>
        );
    }

    // ── Normal (standalone) mode ──
    return (
        <div style={{ margin: '4px 0' }}>
            {/* Header */}
            <div
                onClick={() => setExpanded(!expanded)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px',
                    cursor: 'pointer', userSelect: 'none'
                }}
            >
                {expanded ? <ChevronDown size={14} style={{ color: '#6b7280' }} /> : <ChevronRight size={14} style={{ color: '#6b7280' }} />}
                <Briefcase size={14} style={{ color: '#8b5cf6' }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>
                    Case'ler
                </span>
                <span style={{
                    fontSize: '0.7rem', fontWeight: 600, color: '#fff',
                    background: activeCases.length > 0 ? '#8b5cf6' : '#9ca3af',
                    borderRadius: 10, padding: '1px 7px', marginLeft: 'auto'
                }}>
                    {activeCases.length}
                </span>
                <button
                    onClick={(e) => { e.stopPropagation(); setShowCreateForm(!showCreateForm); }}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                        color: '#8b5cf6', display: 'flex', alignItems: 'center'
                    }}
                    title="Yeni Case"
                >
                    <Plus size={16} />
                </button>
            </div>

            {expanded && (
                <div style={{ padding: '0 16px' }}>
                    {/* Create Form */}
                    {showCreateForm && (
                        <div style={{
                            background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10,
                            padding: 12, marginBottom: 8
                        }}>
                            <input
                                value={newTitle}
                                onChange={e => setNewTitle(e.target.value)}
                                placeholder="Case başlığı (ör: Gastroenteroloji Randevu)"
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                style={{
                                    width: '100%', padding: '8px 12px', border: '1px solid #d8b4fe',
                                    borderRadius: 8, fontSize: '0.85rem', outline: 'none',
                                    boxSizing: 'border-box', background: '#fff', marginBottom: 8
                                }}
                            />
                            <select value={newLeadSource} onChange={e => setNewLeadSource(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', marginBottom: newLeadSource ? 8 : 0, boxSizing: 'border-box' }}>
                                <option value="">Kaynak seçin (opsiyonel)</option>
                                <optgroup label="Manuel">
                                    <option value="INBOUND">📞 Telefon</option>
                                    <option value="WALK_IN">🚶 Yüz Yüze</option>
                                    <option value="REFERRAL">🤝 Referans</option>
                                </optgroup>
                                <optgroup label="Dijital">
                                    <option value="GOOGLE">🔍 Google</option>
                                    <option value="FACEBOOK">📘 Facebook</option>
                                    <option value="INSTAGRAM">📸 Instagram</option>
                                    <option value="WHATSAPP">📱 WhatsApp</option>
                                    <option value="SMS">✉️ SMS</option>
                                    <option value="EMAIL">📧 E-posta</option>
                                    <option value="WEB_FORM">📝 Web Formu</option>
                                    <option value="WEBSITE">🌐 Web Sitesi</option>
                                </optgroup>
                                <optgroup label="Diğer">
                                    <option value="EVENT">🎪 Etkinlik/Fuar</option>
                                    <option value="OTHER">📍 Diğer</option>
                                </optgroup>
                            </select>
                            {newLeadSource && (
                                <input
                                    type="text"
                                    placeholder="Detay: hangi reklam, kim referans etti..."
                                    value={newLeadSourceDetail}
                                    onChange={e => setNewLeadSourceDetail(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', boxSizing: 'border-box' }}
                                />
                            )}
                            <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => { setShowCreateForm(false); setNewTitle(''); }}
                                    style={{
                                        padding: '5px 12px', borderRadius: 6, border: '1px solid #e5e7eb',
                                        background: '#fff', fontSize: '0.78rem', cursor: 'pointer', color: '#6b7280'
                                    }}
                                >İptal</button>
                                <button
                                    onClick={handleCreate}
                                    disabled={creating || !newTitle.trim()}
                                    style={{
                                        padding: '5px 12px', borderRadius: 6, border: 'none',
                                        background: '#8b5cf6', color: '#fff', fontSize: '0.78rem',
                                        cursor: creating ? 'wait' : 'pointer', opacity: creating ? 0.6 : 1
                                    }}
                                >{creating ? 'Oluşturuluyor...' : 'Oluştur'}</button>
                            </div>
                        </div>
                    )}

                    {/* No cases */}
                    {cases.length === 0 && !showCreateForm && (
                        <div style={{
                            padding: '12px', textAlign: 'center', fontSize: '0.8rem',
                            color: '#9ca3af', borderRadius: 8
                        }}>
                            Henüz case yok
                        </div>
                    )}

                    {/* Case Cards */}
                    {activeCases.length > 1 && (
                        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end', paddingRight: '4px' }}>
                            <button
                                onClick={handleMergeCases}
                                style={{
                                    padding: '5px 10px', fontSize: '11px', fontWeight: 600,
                                    backgroundColor: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd',
                                    borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                                }}
                            >
                                🔗 Birleştir
                            </button>
                        </div>
                    )}
                    {activeCases.map(c => {
                        const stageInfo = getFunnelStageLabel(c);
                        const statusInfo = STATUS_LABELS[c.status] || STATUS_LABELS.ACTIVE;
                        const isCurrentConv = currentConvCase?.id === c.id;
                        const prioIcon = PRIORITY_ICONS[c.priority] || '';

                        return (
                            <div
                                key={c.id}
                                style={{
                                    background: isCurrentConv ? '#faf5ff' : '#f8fafc',
                                    border: isCurrentConv ? '1.5px solid #c4b5fd' : '1px solid #e5e7eb',
                                    borderRadius: 10, padding: '10px 12px', marginBottom: 6,
                                    transition: 'all 0.15s'
                                }}
                            >
                                {/* Case Header */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                    <span style={{ fontSize: '0.68rem', color: '#a78bfa', fontWeight: 600, fontFamily: 'monospace' }}>
                                        {c?.caseNumber}
                                    </span>
                                    {prioIcon && <span style={{ fontSize: '0.7rem' }}>{prioIcon}</span>}
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                                        {/* Status badge */}
                                        <select
                                            value={c.status}
                                            onChange={e => handleStatusChange(c.id, e.target.value)}
                                            style={{
                                                fontSize: '0.68rem', fontWeight: 600, padding: '1px 4px',
                                                borderRadius: 4, border: 'none', cursor: 'pointer',
                                                color: statusInfo.color, background: statusInfo.bg
                                            }}
                                        >
                                            {Object.entries(STATUS_LABELS).map(([k, v]) => (
                                                <option key={k} value={k}>{v.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Title */}
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1f2937', lineHeight: 1.3, marginBottom: 6 }}>
                                    {c?.title}
                                </div>
                                {/* Kategori Badge */}
                                {c.categoryId && categories?.find(cat => cat.id === c.categoryId) && (
                                    <div style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        padding: '2px 6px', borderRadius: 12, background: '#f3f4f6', border: '1px solid #e5e7eb',
                                        fontSize: '10px', fontWeight: 600, color: '#4b5563', whiteSpace: 'nowrap',
                                        marginBottom: 6, marginRight: 4
                                    }}>
                                        <span>📁</span> {categories.find(cat => cat.id === c.categoryId)?.name}
                                    </div>
                                )}
                                {(c.branch || branches?.find(b => b.id === c.branchId)) && (
                                    <div style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        padding: '2px 6px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0',
                                        fontSize: '10px', fontWeight: 600, color: '#16a34a', whiteSpace: 'nowrap',
                                        marginBottom: 6, marginRight: 4
                                    }}>
                                        <Building2 size={10} /> {c.branch?.name || branches?.find(b => b.id === c.branchId)?.name}
                                    </div>
                                )}
                                {/* Ürün Badgeleri */}
                                {c.products && (typeof c.products === 'string' ? JSON.parse(c.products) : c.products).map((p, i) => (
                                    <div key={i} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        padding: '2px 6px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0',
                                        fontSize: '10px', fontWeight: 600, color: '#166534', whiteSpace: 'nowrap',
                                        marginBottom: 6, marginRight: 4
                                    }}>
                                        <span>📦</span> {p.name}
                                    </div>
                                ))}

                                {/* Skorlama (Case bazlı) */}
                                {(c.leadScore != null && c.leadScore > 0) && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '6px 10px', margin: '4px 0',
                                        background: getScoreBgColor(c.leadTemperature),
                                        borderRadius: 8, border: `1px solid ${getScoreColor(c.leadTemperature)}25`
                                    }}>
                                        <span style={{ fontSize: '18px', fontWeight: 800, color: getScoreColor(c.leadTemperature) }}>
                                            {c.leadScore}
                                        </span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{ fontSize: '10px' }}>{getScoreEmoji(c.leadTemperature)}</span>
                                                <span style={{ fontSize: '11px', fontWeight: 600, color: getScoreColor(c.leadTemperature) }}>
                                                    {getScoreLabel(c.leadTemperature)}
                                                </span>
                                            </div>
                                            <div style={{ width: '100%', height: '4px', backgroundColor: '#e2e8f0', borderRadius: 2, marginTop: 3 }}>
                                                <div style={{
                                                    width: `${c.leadScore}%`, height: '100%',
                                                    backgroundColor: getScoreColor(c.leadTemperature),
                                                    borderRadius: 2, transition: 'width 0.5s ease'
                                                }} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Arama Özeti */}
                                {c._callSummary && c._callSummary.totalCalls > 0 && (() => {
                                    const cs = c._callSummary;
                                    const sentimentMap = {
                                        Positive: { emoji: '😊', label: 'Olumlu', color: '#10b981' },
                                        Neutral: { emoji: '😐', label: 'Nötr', color: '#f59e0b' },
                                        Negative: { emoji: '😞', label: 'Olumsuz', color: '#ef4444' }
                                    };
                                    const sent = sentimentMap[cs.lastCallSentiment];
                                    return (
                                        <div style={{
                                            padding: '8px 10px', margin: '4px 0',
                                            background: '#f0f9ff', borderRadius: 8,
                                            border: '1px solid #bae6fd'
                                        }}>
                                            {/* Arama durumu */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: cs.lastCallNote ? 6 : 0 }}>
                                                <span style={{ fontSize: 13 }}>📞</span>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: '#0369a1' }}>
                                                    {cs.completedCalls > 0
                                                        ? `✅ Arandı (${cs.completedCalls} kez)`
                                                        : `⏳ Planlandı (${cs.totalCalls} arama)`}
                                                </span>
                                                {cs.completedCalls > 0 && (
                                                    <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto' }}>
                                                        {cs.reachedCalls}/{cs.completedCalls} ulaşıldı
                                                    </span>
                                                )}
                                            </div>
                                            {/* Son sonuç + duygu */}
                                            {cs.lastCallSuccessful !== null && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: cs.lastCallNote ? 4 : 0 }}>
                                                    <span style={{
                                                        fontSize: 11, fontWeight: 600,
                                                        color: cs.lastCallSuccessful ? '#10b981' : '#ef4444'
                                                    }}>
                                                        {cs.lastCallSuccessful ? '✅ Ulaşıldı' : '❌ Ulaşılamadı'}
                                                    </span>
                                                    {sent && (
                                                        <>
                                                            <span style={{ color: '#cbd5e1' }}>•</span>
                                                            <span style={{ fontSize: 12 }}>{sent.emoji}</span>
                                                            <span style={{ fontSize: 11, fontWeight: 600, color: sent.color }}>{sent.label}</span>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                            {/* Not */}
                                            {cs.lastCallNote && (
                                                <div style={{
                                                    fontSize: 11, color: '#334155', lineHeight: 1.4,
                                                    padding: '4px 6px', background: '#fff', borderRadius: 4,
                                                    borderLeft: '2px solid #0ea5e9',
                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                    maxWidth: '100%'
                                                }}>
                                                    📝 "{cs.lastCallNote}"
                                                </div>
                                            )}
                                            {/* Son arama tarihi */}
                                            {cs.lastCallDate && (
                                                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                                                    📅 Son Arama: {new Date(cs.lastCallDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* Pipeline Stage */}
                                <div style={{ marginBottom: 6 }}>
                                    <select
                                        value={c.funnelStageId || ''}
                                        onChange={e => {
                                            const stageId = e.target.value;
                                            if (!stageId) {
                                                handleUpdateStage(c.id, null, null);
                                                return;
                                            }
                                            // Find funnel for this stage
                                            for (const f of funnels) {
                                                const stage = (f.stages || []).find(s => s.id === stageId);
                                                if (stage) {
                                                    handleUpdateStage(c.id, f.id, stageId);
                                                    break;
                                                }
                                            }
                                        }}
                                        style={{
                                            width: '100%', padding: '4px 8px', fontSize: '0.78rem',
                                            border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer',
                                            color: stageInfo ? stageInfo.color : '#6b7280',
                                            background: '#fff', outline: 'none'
                                        }}
                                    >
                                        <option value="">Aşama seç...</option>
                                        {funnels.map(f => (
                                            <optgroup key={f.id} label={`${f.icon || '📁'} ${f.name}`}>
                                                {(f.stages || []).map(s => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>

                                {/* Kategori Seçimi */}
                                <select
                                    value={c.categoryId || ''}
                                    onChange={async (e) => {
                                        try {
                                            await caseAPI.update(workspaceId, c.id, { categoryId: e.target.value || null });
                                            fetchCases();
                                        } catch (err) { console.error('Kategori güncelleme hatası:', err); }
                                    }}
                                    style={{
                                        width: '100%', padding: '4px 8px', fontSize: '0.75rem',
                                        border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer',
                                        color: c.categoryId ? '#3730a3' : '#9ca3af',
                                        background: c.categoryId ? '#eef2ff' : '#fff', outline: 'none',
                                        marginTop: 4, marginBottom: 6
                                    }}
                                >
                                    <option value="">📁 Kategori seç...</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.icon || '📁'} {cat.name}</option>
                                    ))}
                                </select>

                                {/* Şube Seçimi */}
                                <select
                                    value={c.branchId || ''}
                                    onChange={async (e) => {
                                        try {
                                            await caseAPI.update(workspaceId, c.id, { branchId: e.target.value || null });
                                            fetchCases();
                                            window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                        } catch (err) { console.error('Şube güncelleme hatası:', err); }
                                    }}
                                    style={{
                                        width: '100%', padding: '4px 8px', fontSize: '0.75rem',
                                        border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer',
                                        color: c.branchId ? '#16a34a' : '#9ca3af',
                                        background: c.branchId ? '#f0fdf4' : '#fff', outline: 'none',
                                        marginTop: 4, marginBottom: 6
                                    }}
                                >
                                    <option value="">🏢 Şube seç...</option>
                                    {branches.map(b => (
                                        <option key={b.id} value={b.id}>🏢 {b.name}</option>
                                    ))}
                                </select>

                                {/* Ürün Seçimi */}
                                <div className="case-product-picker">
                                    <label style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>🏷️ Ürünler</label>
                                    {/* Mevcut ürünler */}
                                    <div className="case-product-tags">
                                        {(() => {
                                            try {
                                                const prods = typeof c.products === 'string' ? JSON.parse(c.products || '[]') : c.products || [];
                                                return prods.map((p, i) => (
                                                    <span key={i} className="case-product-tag">
                                                        {p.name}
                                                        {p.quantity > 1 && <span className="product-qty">×{p.quantity}</span>}
                                                        <button
                                                            className="product-remove-btn"
                                                            onClick={(e) => { e.stopPropagation(); handleRemoveProduct(c, p.productId); }}
                                                        >×</button>
                                                    </span>
                                                ));
                                            } catch { return null; }
                                        })()}
                                    </div>
                                    {/* Ürün arama/ekleme */}
                                    <div className="product-search-wrapper">
                                        <input
                                            type="text"
                                            placeholder="Ürün ara ve ekle..."
                                            value={showProductPicker === c.id ? productSearch : ''}
                                            onFocus={() => setShowProductPicker(c.id)}
                                            onChange={e => { setShowProductPicker(c.id); setProductSearch(e.target.value); }}
                                            className="product-search-input"
                                        />
                                        {showProductPicker === c.id && productSearch.length > 0 && (
                                            <div className="product-search-dropdown">
                                                {catalogProducts
                                                    .filter(cp => cp.name.toLowerCase().includes(productSearch.toLowerCase()))
                                                    .slice(0, 8)
                                                    .map(cp => (
                                                        <div
                                                            key={cp.id}
                                                            className="product-search-item"
                                                            onClick={() => handleAddProduct(c, cp)}
                                                        >
                                                            <span>{cp.name}</span>
                                                            {cp.price > 0 && <span className="product-price">{cp.price.toLocaleString('tr-TR')} ₺</span>}
                                                        </div>
                                                    ))
                                                }
                                                {catalogProducts.filter(cp => cp.name.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                                                    <div className="product-search-empty">Ürün bulunamadı</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Assignment */}
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                                    {/* Agent */}
                                    <select
                                        value={c.assignedToId || ''}
                                        onChange={e => handleAssign(c.id, e.target.value || null, c.assignedTeamId)}
                                        style={{
                                            flex: 1, padding: '3px 6px', fontSize: '0.75rem',
                                            border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer',
                                            background: '#fff', outline: 'none', minWidth: 0
                                        }}
                                    >
                                        <option value="">👤 Kişi ata...</option>
                                        {members.map(m => {
                                            const uid = m.user?.id || m.userId || m.id;
                                            const uname = m.user?.name || m.name || 'Bilinmeyen';
                                            return (
                                                <option key={uid} value={uid}>{uname}</option>
                                            );
                                        })}
                                    </select>
                                    {/* Team */}
                                    <select
                                        value={c.assignedTeamId || ''}
                                        onChange={e => handleAssign(c.id, c.assignedToId, e.target.value || null)}
                                        style={{
                                            flex: 1, padding: '3px 6px', fontSize: '0.75rem',
                                            border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer',
                                            background: '#fff', outline: 'none', minWidth: 0
                                        }}
                                    >
                                        <option value="">👥 Takım...</option>
                                        {flatTeams.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Stats */}
                                <div style={{ display: 'flex', gap: 8, fontSize: '0.7rem', color: '#9ca3af' }}>
                                    <span>💬 {c._conversationCount || 0}</span>
                                    <span>📋 {c._totalActivityCount || 0}</span>
                                    {c._pendingActivityCount > 0 && (
                                        <span style={{ color: '#f59e0b' }}>⏳ {c._pendingActivityCount} bekliyor</span>
                                    )}
                                </div>

                                {/* Link current conversation */}
                                {conversationId && !isCurrentConv && (
                                    <button
                                        onClick={() => handleLinkCurrentConversation(c.id)}
                                        style={{
                                            marginTop: 4, width: '100%', padding: '4px 0',
                                            fontSize: '0.72rem', color: '#8b5cf6', background: 'none',
                                            border: '1px dashed #c4b5fd', borderRadius: 6,
                                            cursor: 'pointer', display: 'flex', alignItems: 'center',
                                            justifyContent: 'center', gap: 4
                                        }}
                                    >
                                        <Plus size={12} /> Bu yazışmayı bağla
                                    </button>
                                )}
                                {/* Split conversation */}
                                {conversationId && isCurrentConv && c.conversations?.length > 1 && (
                                    <button
                                        onClick={() => handleSplitCase(c.id)}
                                        style={{
                                            marginTop: 4, width: '100%', padding: '4px 0',
                                            fontSize: '11px', fontWeight: 600,
                                            backgroundColor: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3',
                                            borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                            justifyContent: 'center', gap: 4
                                        }}
                                    >
                                        ✂️ Böl
                                    </button>
                                )}

                                {/* Kaynak — silik gösterim */}
                                {c.source && (
                                    <div style={{
                                        fontSize: '0.58rem', color: '#94a3b8', opacity: 0.45,
                                        display: 'flex', alignItems: 'center', gap: 3,
                                        marginTop: 4, paddingTop: 4, borderTop: '1px solid #f1f5f9',
                                    }}>
                                        <span>📡</span>
                                        {{ GOOGLE_ADS: 'Google Ads', META_ADS: 'Meta Ads', WHATSAPP_AD: 'WhatsApp Reklam', FORM: 'Form', CAMPAIGN: 'Kampanya', COLD_CALL: 'Cold Call', REFERRAL: 'Referans', ORGANIC: 'Organik', MANUAL: 'Manuel' }[c.source] || c.source}
                                        {c.campaign?.name && <span style={{ color: '#cbd5e1' }}>• {c.campaign.name}</span>}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Closed Cases */}
                    {closedCases.length > 0 && cases.length === 1 ? (
                        /* Tek case varsa her zaman açık göster */
                        closedCases.map(c => {
                            const stageInfo = getFunnelStageLabel(c);
                            const statusInfo = STATUS_LABELS[c.status] || STATUS_LABELS.CLOSED;
                            const isCurrentConv = currentConvCase?.id === c.id;
                            const prioIcon = PRIORITY_ICONS[c.priority] || '';
                            return (
                                <div
                                    key={c.id}
                                    style={{
                                        background: isCurrentConv ? '#faf5ff' : '#f8fafc',
                                        border: isCurrentConv ? '1.5px solid #c4b5fd' : '1px solid #e5e7eb',
                                        borderRadius: 10, padding: '10px 12px', marginBottom: 6,
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        <span style={{ fontSize: '0.68rem', color: '#a78bfa', fontWeight: 600, fontFamily: 'monospace' }}>
                                            {c?.caseNumber}
                                        </span>
                                        {prioIcon && <span style={{ fontSize: '0.7rem' }}>{prioIcon}</span>}
                                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                                            <select
                                                value={c.status}
                                                onChange={e => handleStatusChange(c.id, e.target.value)}
                                                style={{
                                                    fontSize: '0.68rem', fontWeight: 600, padding: '1px 4px',
                                                    borderRadius: 4, border: 'none', cursor: 'pointer',
                                                    color: statusInfo.color, background: statusInfo.bg
                                                }}
                                            >
                                                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                                                    <option key={k} value={k}>{v.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1f2937', lineHeight: 1.3, marginBottom: 6 }}>
                                        {c?.title}
                                    </div>
                                    {/* Kategori Badge */}
                                    {c.categoryId && categories?.find(cat => cat.id === c.categoryId) && (
                                        <div style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            padding: '2px 6px', borderRadius: 12, background: '#f3f4f6', border: '1px solid #e5e7eb',
                                            fontSize: '10px', fontWeight: 600, color: '#4b5563', whiteSpace: 'nowrap',
                                            marginBottom: 6, marginRight: 4
                                        }}>
                                            <span>📁</span> {categories.find(cat => cat.id === c.categoryId)?.name}
                                        </div>
                                    )}
                                    {(c.branch || branches?.find(b => b.id === c.branchId)) && (
                                        <div style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            padding: '2px 6px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0',
                                            fontSize: '10px', fontWeight: 600, color: '#16a34a', whiteSpace: 'nowrap',
                                            marginBottom: 6, marginRight: 4
                                        }}>
                                            <Building2 size={10} /> {c.branch?.name || branches?.find(b => b.id === c.branchId)?.name}
                                        </div>
                                    )}
                                    {/* Ürün Badgeleri */}
                                    {c.products && (typeof c.products === 'string' ? JSON.parse(c.products) : c.products).map((p, i) => (
                                        <div key={i} style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            padding: '2px 6px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0',
                                            fontSize: '10px', fontWeight: 600, color: '#166534', whiteSpace: 'nowrap',
                                            marginBottom: 6, marginRight: 4
                                        }}>
                                            <span>📦</span> {p.name}
                                        </div>
                                    ))}
                                    <div style={{ display: 'flex', gap: 8, fontSize: '0.7rem', color: '#9ca3af' }}>
                                        <span>💬 {c._conversationCount || 0}</span>
                                        <span>📋 {c._totalActivityCount || 0}</span>
                                    </div>
                                </div>
                            );
                        })
                    ) : closedCases.length > 0 ? (
                        /* Birden fazla case varsa kapalıları akordiyona al */
                        <details style={{ marginTop: 4 }}>
                            <summary style={{
                                fontSize: '0.75rem', color: '#9ca3af', cursor: 'pointer',
                                padding: '4px 0', listStyle: 'none', display: 'flex',
                                alignItems: 'center', gap: 4
                            }}>
                                <ChevronRight size={12} />
                                {closedCases.length} kapalı case
                            </summary>
                            {closedCases.map(c => {
                                const statusInfo = STATUS_LABELS[c.status] || STATUS_LABELS.CLOSED;
                                return (
                                    <div
                                        key={c.id}
                                        style={{
                                            background: '#f9fafb', border: '1px solid #f3f4f6',
                                            borderRadius: 8, padding: '6px 10px', marginTop: 4,
                                            opacity: 0.75
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: '0.68rem', color: '#d1d5db', fontFamily: 'monospace' }}>
                                                {c?.caseNumber}
                                            </span>
                                            <span style={{
                                                fontSize: '0.68rem', fontWeight: 600,
                                                color: statusInfo.color, background: statusInfo.bg,
                                                padding: '1px 6px', borderRadius: 4
                                            }}>
                                                {statusInfo.label}
                                            </span>
                                            <select
                                                value={c.status}
                                                onChange={e => handleStatusChange(c.id, e.target.value)}
                                                style={{
                                                    fontSize: '0.65rem', marginLeft: 'auto', padding: '1px 3px',
                                                    borderRadius: 4, border: '1px solid #e5e7eb', cursor: 'pointer',
                                                    color: '#9ca3af', background: '#fff'
                                                }}
                                            >
                                                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                                                    <option key={k} value={k}>{v.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2 }}>
                                            {c?.title}
                                        </div>
                                        {/* Kategori Badge */}
                                        {c.categoryId && categories?.find(cat => cat.id === c.categoryId) && (
                                            <div style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                padding: '2px 6px', borderRadius: 12, background: '#f3f4f6', border: '1px solid #e5e7eb',
                                                fontSize: '10px', fontWeight: 600, color: '#4b5563', whiteSpace: 'nowrap',
                                                marginBottom: 4, marginRight: 4
                                            }}>
                                                <span>📁</span> {categories.find(cat => cat.id === c.categoryId)?.name}
                                            </div>
                                        )}
                                        {(c.branch || branches?.find(b => b.id === c.branchId)) && (
                                            <div style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                padding: '2px 6px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0',
                                                fontSize: '10px', fontWeight: 600, color: '#16a34a', whiteSpace: 'nowrap',
                                                marginBottom: 4, marginRight: 4
                                            }}>
                                                <Building2 size={10} /> {c.branch?.name || branches?.find(b => b.id === c.branchId)?.name}
                                            </div>
                                        )}
                                        {/* Ürün Badgeleri */}
                                        {c.products && (typeof c.products === 'string' ? JSON.parse(c.products) : c.products).map((p, i) => (
                                            <div key={i} style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                padding: '2px 6px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0',
                                                fontSize: '10px', fontWeight: 600, color: '#166534', whiteSpace: 'nowrap',
                                                marginBottom: 4, marginRight: 4
                                            }}>
                                                <span>📦</span> {p.name}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </details>
                    ) : null}
                </div>
            )}
        </div>
    );
};

export default CaseCards;

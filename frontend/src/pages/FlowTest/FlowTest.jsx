import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
    Plus, Play, ZoomIn, ZoomOut, Maximize2, Trash2,
    Settings, X, Shield, Download, Clock, Zap, Bot,
    MessageSquare, GitBranch, Phone, UserCheck, Terminal,
    Layers, Check, Save, RefreshCw, Users, FileText, Tag,
    PhoneCall, ArrowRight, CornerDownRight
} from 'lucide-react';
import {
    teamAPI, workspaceAPI, automationAPI, aiAPI,
    flowAPI, funnelAPI
} from '../../services/api';
import { useToast } from '../../components/Toast/Toast';
import './FlowTest.css';

// ─── Instomer Sistemine Birebir Uyumlu Adım Tanımları ────────────────────────
const STEP_TYPES = {
    // Tetikleyiciler
    FIRST_MSG:      { group: 'trigger', label: 'Gelen Mesaj',            icon: MessageSquare, color: '#3b82f6', desc: 'Müşteriden yeni mesaj geldiğinde' },
    NEW_FORM:       { group: 'trigger', label: 'Yeni Form Kaydı',        icon: FileText,       color: '#3b82f6', desc: 'Web form doldurulduğunda' },
    TAG_ADDED:      { group: 'trigger', label: 'Etiket Eklendi',         icon: Tag,            color: '#3b82f6', desc: 'Kişiye etiket atandığında' },
    HAS_PHONE:      { group: 'trigger', label: 'Numara Bıraktıysa',      icon: Phone,          color: '#3b82f6', desc: 'Kişi telefon numarası bıraktığında' },
    NO_REPLY:       { group: 'trigger', label: 'Yanıt Vermedi (Süre)',   icon: Clock,          color: '#3b82f6', desc: 'Belirlenen süre boyunca yanıt yoksa' },
    STAGE_CHANGED:  { group: 'trigger', label: 'Aşama Değiştiğinde',     icon: GitBranch,      color: '#3b82f6', desc: 'CRM fırsat aşaması değiştiğinde' },
    FLOW_ENTERED:   { group: 'trigger', label: 'Akışa Girdiğinde',       icon: Layers,         color: '#3b82f6', desc: 'Bu akışa yönlendirildiğinde' },

    // Aksiyonlar
    WA_SEND:        { group: 'action',  label: 'WhatsApp Gönder',        icon: MessageSquare, color: '#10b981', desc: 'Meta onaylı WhatsApp şablonu gönder' },
    SEND_MESSAGE:   { group: 'action',  label: 'Mesaj / Soru Sor',       icon: MessageSquare, color: '#10b981', desc: 'Müşteriye metin veya soru gönder' },
    ASSIGN_BOT:     { group: 'action',  label: 'AI Bot Ata',             icon: Bot,            color: '#8b5cf6', desc: 'Instomer AI Botu konuşmayı devralır' },
    AI_CALL:        { group: 'action',  label: 'AI Araması Başlat',      icon: PhoneCall,      color: '#10b981', desc: 'Sesli AI arama botu başlat' },
    RETRY_CALL:     { group: 'action',  label: 'Hatırlatma Araması',     icon: RefreshCw,      color: '#10b981', desc: 'Açılmayan çağrıyı tekrar ara' },
    ASSIGN_TEAM:    { group: 'action',  label: 'Ekibe Ata',              icon: Users,          color: '#06b6d4', desc: 'Takıma yönlendir (Sıralı / Manuel)' },
    ASSIGN_AGENT:   { group: 'action',  label: 'Temsilci Ata',           icon: UserCheck,      color: '#0284c7', desc: 'Doğrudan temsilciye ata' },
    CONVERT_TO_OPP: { group: 'action',  label: 'Fırsata Çevir',          icon: Zap,            color: '#10b981', desc: 'Müşteriyi CRM fırsatına dönüştür' },
    SWITCH_FLOW:    { group: 'action',  label: 'Akışa Geç',              icon: GitBranch,      color: '#f97316', desc: 'Başka bir akışı tetikle' },

    // Mantık
    WAIT:           { group: 'logic',   label: 'Bekleme Süresi',         icon: Clock,          color: '#f59e0b', desc: 'Belirlenen süre kadar bekler' },
    CONDITION:      { group: 'logic',   label: 'Koşul (Eğer)',           icon: GitBranch,      color: '#ec4899', isConditional: true, desc: 'EVET ve HAYIR dallanması' },
};

const CONDITION_OPTIONS = [
    { value: 'MSG_READ',        label: 'Mesaj Görüldü mü?' },
    { value: 'MSG_REPLIED',     label: 'Mesaj Yanıtlandı mı?' },
    { value: 'MSG_CONTAINS',    label: 'Mesaj şu kelimeleri içeriyorsa' },
    { value: 'HAS_TAG',         label: 'Etiket var mı?' },
    { value: 'IS_LEAD',         label: 'Lead mi?' },
    { value: 'HAS_PHONE',       label: 'Telefon numarası var mı?' },
    { value: 'IS_OPPORTUNITY',  label: 'Fırsat aşamasında mı?' },
    { value: 'CALL_UNANSWERED', label: 'Arama açılmadı mı?' },
];

function makeStepConfig(type) {
    if (type === 'WAIT')           return { amount: 5, unit: 'dakika' };
    if (type === 'CONDITION')      return { condition: 'MSG_READ', keywords: '', matchMode: 'any', tag: '' };
    if (type === 'WA_SEND')        return { templateName: '', detail: '' };
    if (type === 'SEND_MESSAGE')   return { message: '' };
    if (type === 'ASSIGN_AGENT')   return { agentId: '', agentName: '' };
    if (type === 'ASSIGN_TEAM')    return { teamId: '', teamName: '', assignMode: 'ROUND_ROBIN' };
    if (type === 'ASSIGN_BOT')     return { botId: '', botName: '' };
    if (type === 'AI_CALL')        return { detail: 'Geri Dönüş Ara' };
    if (type === 'RETRY_CALL')     return { maxRetries: 3, waitAmount: 1, waitUnit: 'saat' };
    if (type === 'CONVERT_TO_OPP') return { targetStage: '' };
    if (type === 'SWITCH_FLOW')    return { flowId: '', flowName: '' };
    if (type === 'NO_REPLY')       return { amount: 1, unit: 'saat' };
    if (type === 'STAGE_CHANGED')  return { fromStage: '', toStage: '' };
    if (type === 'FLOW_ENTERED')   return { funnelId: '', funnelName: '' };
    if (type === 'TAG_ADDED')      return { tag: '' };
    return {};
}

const FlowTest = () => {
    const { user, currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const { showSuccess, showError } = useToast();

    // Sistem Verileri (Backend)
    const [systemFlows, setSystemFlows] = useState([]);
    const [selectedFlowId, setSelectedFlowId] = useState('new');
    const [teams, setTeams] = useState([]);
    const [members, setMembers] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [bots, setBots] = useState([]);
    const [funnelList, setFunnelList] = useState([]);
    const [isDataLoading, setIsDataLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Akış Başlığı
    const [flowName, setFlowName] = useState('Yeni Akış');

    // Düğümler & Bağlantılar State
    const [nodes, setNodes] = useState([]);
    const [connections, setConnections] = useState([]);

    // Seçili Düğüm
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const selectedNode = nodes.find(n => n.id === selectedNodeId);

    // Tuval Gezinme
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0 });

    // Düğüm Sürükleme
    const [draggingNodeId, setDraggingNodeId] = useState(null);
    const dragOffsetRef = useRef({ x: 0, y: 0 });

    // Kablo Çekme
    const [draggingWire, setDraggingWire] = useState(null);
    const canvasRef = useRef(null);

    // Modal
    const [isAddNodeModalOpen, setIsAddNodeModalOpen] = useState(false);
    const [searchFilter, setSearchFilter] = useState('');

    // Test & Simülasyon State
    const [isSimulating, setIsSimulating] = useState(false);
    const [simulationLogs, setSimulationLogs] = useState([]);
    const [isSimPanelOpen, setIsSimPanelOpen] = useState(false);

    // Yetki Kontrolü
    const isSuperAdmin = user?.role === 'SUPER_ADMIN';

    // ─── Backend Verilerini Çek ───────────────────────────────────────────────
    const loadSystemData = useCallback(async () => {
        if (!currentWorkspace?.id) return;
        setIsDataLoading(true);
        try {
            const wsId = currentWorkspace.id;
            const [flowsRes, teamsRes, membersRes, templatesRes, botsRes, funnelsRes] =
                await Promise.allSettled([
                    flowAPI.getAll(wsId),
                    teamAPI.getWorkspaceTeams(wsId),
                    workspaceAPI.getMembers(wsId),
                    automationAPI.getTemplates(wsId),
                    aiAPI.getBots(wsId),
                    funnelAPI.getAll(wsId)
                ]);

            if (flowsRes.status === 'fulfilled') {
                const list = flowsRes.value.data?.flows || flowsRes.value.data || [];
                setSystemFlows(Array.isArray(list) ? list : []);
            }
            if (teamsRes.status === 'fulfilled') {
                const list = teamsRes.value.data?.teams || teamsRes.value.data || [];
                setTeams(Array.isArray(list) ? list : []);
            }
            if (membersRes.status === 'fulfilled') {
                const list = membersRes.value.data?.members || membersRes.value.data || [];
                setMembers(Array.isArray(list) ? list : []);
            }
            if (templatesRes.status === 'fulfilled') {
                const list = templatesRes.value.data?.templates || templatesRes.value.data || [];
                setTemplates(Array.isArray(list) ? list : []);
            }
            if (botsRes.status === 'fulfilled') {
                const list = botsRes.value.data?.bots || botsRes.value.data || [];
                setBots(Array.isArray(list) ? list : []);
            }
            if (funnelsRes.status === 'fulfilled') {
                const list = funnelsRes.value.data?.funnels || funnelsRes.value.data || [];
                setFunnelList(Array.isArray(list) ? list : []);
            }
        } catch (err) {
            console.error('Sistem verileri yükleme hatası:', err);
        } finally {
            setIsDataLoading(false);
        }
    }, [currentWorkspace?.id]);

    useEffect(() => {
        loadSystemData();
    }, [loadSystemData]);

    // Varsayılan ilk başlangıç (eğer boşsa)
    useEffect(() => {
        if (nodes.length === 0) {
            const initNodes = [
                {
                    id: 'node-trigger',
                    type: 'FIRST_MSG',
                    title: 'Gelen Mesaj',
                    subtitle: 'Müşteri yazdığında tetiklenir',
                    category: 'Tetikleyici',
                    color: '#3b82f6',
                    x: 80,
                    y: 200,
                    config: {},
                    status: 'ready'
                },
                {
                    id: 'node-condition',
                    type: 'CONDITION',
                    title: 'Koşul (Eğer)',
                    subtitle: 'Mesaj içeriği kontrolü',
                    category: 'Mantık',
                    color: '#ec4899',
                    isConditional: true,
                    x: 440,
                    y: 200,
                    config: { condition: 'MSG_READ' },
                    status: 'ready'
                },
                {
                    id: 'node-team',
                    type: 'ASSIGN_TEAM',
                    title: 'Ekibe Ata',
                    subtitle: 'Sohbeti takıma dağıt',
                    category: 'Aksiyon',
                    color: '#06b6d4',
                    x: 820,
                    y: 120,
                    config: { teamId: '', teamName: '', assignMode: 'ROUND_ROBIN' },
                    status: 'ready'
                },
                {
                    id: 'node-bot',
                    type: 'ASSIGN_BOT',
                    title: 'AI Bot Ata',
                    subtitle: 'Bot devralsın',
                    category: 'Aksiyon',
                    color: '#8b5cf6',
                    x: 820,
                    y: 280,
                    config: { botId: '', botName: '' },
                    status: 'ready'
                }
            ];

            const initConns = [
                { id: 'c-1', fromNodeId: 'node-trigger', fromPort: 'out', toNodeId: 'node-condition', toPort: 'in' },
                { id: 'c-2', fromNodeId: 'node-condition', fromPort: 'out-true', toNodeId: 'node-team', toPort: 'in' },
                { id: 'c-3', fromNodeId: 'node-condition', fromPort: 'out-false', toNodeId: 'node-bot', toPort: 'in' }
            ];

            setNodes(initNodes);
            setConnections(initConns);
        }
    }, [nodes.length]);

    // ─── Sistemdeki Bir Akışı Seç ve Tuvale Yükle ──────────────────────────────
    const handleSelectSystemFlow = (flowId) => {
        setSelectedFlowId(flowId);
        if (flowId === 'new') {
            setFlowName('Yeni Akış');
            setNodes([]);
            setConnections([]);
            setSelectedNodeId(null);
            return;
        }

        const flow = systemFlows.find(f => f.id === flowId);
        if (!flow) return;

        setFlowName(flow.name || 'İsimsiz Akış');
        setSelectedNodeId(null);

        let flowSteps = flow.steps;
        if (typeof flowSteps === 'string') {
            try { flowSteps = JSON.parse(flowSteps); } catch { flowSteps = []; }
        }

        // Eğer görsel canvas formatında kaydedilmişse
        if (flowSteps && flowSteps.nodes && Array.isArray(flowSteps.nodes)) {
            setNodes(flowSteps.nodes);
            setConnections(flowSteps.connections || []);
            showSuccess?.(`'${flow.name}' akışı yüklendi.`);
            return;
        }

        // Klasik FlowBuilder formatından tuvale uyarla
        if (Array.isArray(flowSteps) && flowSteps.length > 0) {
            const convertedNodes = [];
            const convertedConns = [];

            flowSteps.forEach((step, idx) => {
                const def = STEP_TYPES[step.type] || {
                    label: step.type,
                    desc: 'Akış Adımı',
                    color: '#6366f1',
                    group: 'action'
                };

                const stepId = String(step.id || `step-${idx}`);
                convertedNodes.push({
                    id: stepId,
                    type: step.type,
                    title: def.label,
                    subtitle: step.config?.detail || def.desc,
                    category: def.group === 'trigger' ? 'Tetikleyici' : def.group === 'logic' ? 'Mantık' : 'Aksiyon',
                    color: def.color,
                    isConditional: step.type === 'CONDITION',
                    x: 80 + idx * 340,
                    y: 200,
                    config: step.config || {},
                    status: 'ready'
                });

                if (idx > 0) {
                    const prevStep = flowSteps[idx - 1];
                    convertedConns.push({
                        id: `conn-auto-${idx}`,
                        fromNodeId: String(prevStep.id || `step-${idx - 1}`),
                        fromPort: prevStep.type === 'CONDITION' ? 'out-true' : 'out',
                        toNodeId: stepId,
                        toPort: 'in'
                    });
                }
            });

            setNodes(convertedNodes);
            setConnections(convertedConns);
            showSuccess?.(`'${flow.name}' görsel tuvale yüklendi.`);
        } else {
            setNodes([]);
            setConnections([]);
        }
    };

    // Graph'ı backend'in doğrudan çalıştırabileceği hiyerarşik steps dizisine derle
    const compileGraphToSteps = (nodeList, connList) => {
        const triggerNode = nodeList.find(n => n.category === 'Tetikleyici') || nodeList[0];
        if (!triggerNode) return [];

        const buildBranch = (currentNodeId, visited = new Set()) => {
            if (!currentNodeId || visited.has(currentNodeId)) return [];
            visited.add(currentNodeId);

            const node = nodeList.find(n => n.id === currentNodeId);
            if (!node) return [];

            const step = {
                id: node.id,
                type: node.type,
                config: { ...node.config }
            };

            if (node.isConditional) {
                const yesConn = connList.find(c => c.fromNodeId === node.id && c.fromPort === 'out-true');
                step.config.yesBranch = yesConn ? buildBranch(yesConn.toNodeId, new Set(visited)) : [];

                const noConn = connList.find(c => c.fromNodeId === node.id && c.fromPort === 'out-false');
                step.config.noBranch = noConn ? buildBranch(noConn.toNodeId, new Set(visited)) : [];

                return [step];
            } else {
                const nextConn = connList.find(c => c.fromNodeId === node.id && (c.fromPort === 'out' || !c.fromPort));
                const nextSteps = nextConn ? buildBranch(nextConn.toNodeId, visited) : [];
                return [step, ...nextSteps];
            }
        };

        return buildBranch(triggerNode.id);
    };

    // ─── Sisteme Kaydet (Database Persistence) ────────────────────────────────
    const handleSaveToSystem = async () => {
        if (!currentWorkspace?.id) return;
        if (!flowName.trim()) {
            showError?.('Lütfen akış adı girin.');
            return;
        }

        setIsSaving(true);
        try {
            const wsId = currentWorkspace.id;
            const triggerNode = nodes.find(n => n.category === 'Tetikleyici');
            const flowTrigger = triggerNode?.type || 'FIRST_MSG';

            const compiledSteps = compileGraphToSteps(nodes, connections);
            const linearSteps = nodes.map(n => ({
                id: n.id,
                type: n.type,
                config: n.config || {},
                x: n.x,
                y: n.y
            }));

            const payload = {
                name: flowName.trim(),
                trigger: flowTrigger,
                isActive: true,
                steps: {
                    nodes,
                    connections,
                    compiledSteps,
                    linearSteps
                }
            };

            if (selectedFlowId !== 'new') {
                await flowAPI.update(wsId, selectedFlowId, payload);
                showSuccess?.('Akış başarıyla güncellendi ve canlıya alındı!');
            } else {
                const res = await flowAPI.create(wsId, payload);
                const created = res.data?.flow;
                if (created?.id) setSelectedFlowId(created.id);
                showSuccess?.('Yeni akış sisteme kaydedildi ve canlıya alındı!');
            }

            loadSystemData();
        } catch (err) {
            console.error('Akış kaydetme hatası:', err);
            showError?.(err.response?.data?.error || 'Akış kaydedilemedi.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isSuperAdmin) {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '70vh', color: '#94a3b8', gap: 16
            }}>
                <Shield size={64} color="#ef4444" />
                <h2 style={{ color: '#f8fafc', margin: 0 }}>Erişim Yetkiniz Bulunmuyor</h2>
                <p style={{ margin: 0 }}>Bu sayfa yalnızca <strong>SUPERADMIN</strong> yetkisine sahip kullanıcılar içindir.</p>
                <button className="flow-btn flow-btn-secondary" onClick={() => navigate('/inbox')}>
                    Ana Sayfaya Dön
                </button>
            </div>
        );
    }

    // ─── Tuval Mouse Olayları (Pan / Drag / Cable) ────────────────────────────
    const handleCanvasMouseDown = (e) => {
        if (e.target.closest('.flow-node') || e.target.closest('.flow-port') || e.target.closest('.flow-canvas-controls')) return;
        setIsPanning(true);
        panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    };

    const handleCanvasMouseMove = (e) => {
        if (isPanning) {
            setPan({ x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y });
            return;
        }
        if (draggingNodeId) {
            const canvasRect = canvasRef.current.getBoundingClientRect();
            const rawX = (e.clientX - canvasRect.left - pan.x) / zoom;
            const rawY = (e.clientY - canvasRect.top - pan.y) / zoom;
            setNodes(prev => prev.map(n => n.id === draggingNodeId ? {
                ...n,
                x: Math.round(rawX - dragOffsetRef.current.x),
                y: Math.round(rawY - dragOffsetRef.current.y)
            } : n));
            return;
        }
        if (draggingWire) {
            const canvasRect = canvasRef.current.getBoundingClientRect();
            const mouseX = (e.clientX - canvasRect.left - pan.x) / zoom;
            const mouseY = (e.clientY - canvasRect.top - pan.y) / zoom;
            setDraggingWire(prev => ({ ...prev, mouseX, mouseY }));
        }
    };

    const handleCanvasMouseUp = () => {
        setIsPanning(false);
        setDraggingNodeId(null);
        if (draggingWire) setDraggingWire(null);
    };

    const handleNodeMouseDown = (e, node) => {
        e.stopPropagation();
        if (e.target.closest('.flow-port') || e.target.closest('.flow-node-action-btn')) return;
        setDraggingNodeId(node.id);
        setSelectedNodeId(node.id);
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const mouseX = (e.clientX - canvasRect.left - pan.x) / zoom;
        const mouseY = (e.clientY - canvasRect.top - pan.y) / zoom;
        dragOffsetRef.current = { x: mouseX - node.x, y: mouseY - node.y };
    };

    const handlePortMouseDown = (e, nodeId, portType) => {
        e.stopPropagation();
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const mouseX = (e.clientX - canvasRect.left - pan.x) / zoom;
        const mouseY = (e.clientY - canvasRect.top - pan.y) / zoom;
        setDraggingWire({ fromNodeId: nodeId, fromPort: portType, mouseX, mouseY });
    };

    const handlePortMouseUp = (e, targetNodeId, targetPort) => {
        e.stopPropagation();
        if (!draggingWire) return;
        if (draggingWire.fromNodeId === targetNodeId) {
            setDraggingWire(null);
            return;
        }
        const exists = connections.some(c =>
            c.fromNodeId === draggingWire.fromNodeId &&
            c.fromPort === draggingWire.fromPort &&
            c.toNodeId === targetNodeId &&
            c.toPort === targetPort
        );
        if (!exists) {
            setConnections(prev => [...prev, {
                id: `conn-${Date.now()}`,
                fromNodeId: draggingWire.fromNodeId,
                fromPort: draggingWire.fromPort,
                toNodeId: targetNodeId,
                toPort: targetPort
            }]);
        }
        setDraggingWire(null);
    };

    const handleDeleteConnection = (connId) => {
        setConnections(prev => prev.filter(c => c.id !== connId));
    };

    const handleDeleteNode = (nodeId, e) => {
        if (e) e.stopPropagation();
        setNodes(prev => prev.filter(n => n.id !== nodeId));
        setConnections(prev => prev.filter(c => c.fromNodeId !== nodeId && c.toNodeId !== nodeId));
        if (selectedNodeId === nodeId) setSelectedNodeId(null);
    };

    const handleAddNode = (type) => {
        const def = STEP_TYPES[type];
        if (!def) return;
        const newId = `step-${Date.now()}`;
        const newNode = {
            id: newId,
            type,
            title: def.label,
            subtitle: def.desc,
            category: def.group === 'trigger' ? 'Tetikleyici' : def.group === 'logic' ? 'Mantık' : 'Aksiyon',
            color: def.color,
            isConditional: !!def.isConditional,
            x: Math.round(-pan.x / zoom + 260 + Math.random() * 40),
            y: Math.round(-pan.y / zoom + 200 + Math.random() * 40),
            config: makeStepConfig(type),
            status: 'ready'
        };
        setNodes(prev => [...prev, newNode]);
        setSelectedNodeId(newId);
        setIsAddNodeModalOpen(false);
    };

    const getNodePortPos = (node, portType) => {
        const nodeWidth = 260;
        const nodeHeight = 110;
        if (portType === 'in') return { x: node.x, y: node.y + nodeHeight / 2 };
        if (portType === 'out') return { x: node.x + nodeWidth, y: node.y + nodeHeight / 2 };
        if (portType === 'out-true') return { x: node.x + nodeWidth, y: node.y + nodeHeight * 0.36 };
        if (portType === 'out-false') return { x: node.x + nodeWidth, y: node.y + nodeHeight * 0.66 };
        return { x: node.x + nodeWidth, y: node.y + nodeHeight / 2 };
    };

    const makeBezierPath = (start, end) => {
        const dx = Math.abs(end.x - start.x) * 0.5;
        const cp1x = start.x + Math.max(dx, 40);
        const cp1y = start.y;
        const cp2x = end.x - Math.max(dx, 40);
        const cp2y = end.y;
        return `M ${start.x} ${start.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${end.x} ${end.y}`;
    };

    // ─── Akış Test & Simülasyon Motoru ────────────────────────────────────────
    const handleRunSimulation = async () => {
        if (isSimulating) return;
        setIsSimulating(true);
        setIsSimPanelOpen(true);
        setSimulationLogs([]);

        const log = (msg, type = 'info', payload = null) => {
            setSimulationLogs(prev => [
                ...prev,
                { time: new Date().toLocaleTimeString(), msg, type, payload }
            ]);
        };

        log(`🚀 [${currentWorkspace?.name || 'Workspace'}] Akış simülasyonu başlatıldı...`, 'info');

        setNodes(prev => prev.map(n => ({ ...n, status: 'ready' })));

        const triggerNode = nodes.find(n => n.category === 'Tetikleyici') || nodes[0];
        if (!triggerNode) {
            log('❌ Akışta tetikleyici adım bulunamadı!', 'error');
            setIsSimulating(false);
            return;
        }

        const wait = (ms) => new Promise(res => setTimeout(res, ms));
        let currentNode = triggerNode;
        const visitedNodeIds = new Set();

        while (currentNode && !visitedNodeIds.has(currentNode.id)) {
            visitedNodeIds.add(currentNode.id);
            setNodes(prev => prev.map(n => n.id === currentNode.id ? { ...n, status: 'running' } : n));

            let stepDesc = `[${currentNode.type}] '${currentNode.title}' çalıştırılıyor...`;
            if (currentNode.type === 'WA_SEND' && currentNode.config?.templateName) {
                stepDesc += ` (Şablon: ${currentNode.config.templateName})`;
            } else if (currentNode.type === 'ASSIGN_TEAM' && currentNode.config?.teamName) {
                stepDesc += ` (Ekip: ${currentNode.config.teamName} · ${currentNode.config.assignMode})`;
            } else if (currentNode.type === 'ASSIGN_BOT' && currentNode.config?.botName) {
                stepDesc += ` (Bot: ${currentNode.config.botName})`;
            } else if (currentNode.type === 'WAIT') {
                stepDesc += ` (${currentNode.config.amount || 5} ${currentNode.config.unit || 'dakika'} bekleme simüle edildi)`;
            }

            log(stepDesc, 'info', currentNode.config);
            await wait(750);

            setNodes(prev => prev.map(n => n.id === currentNode.id ? { ...n, status: 'success' } : n));
            log(`✔ '${currentNode.title}' tamamlandı.`, 'success', {
                status: 'OK',
                executedAt: new Date().toISOString()
            });

            let nextConn = null;
            if (currentNode.isConditional) {
                nextConn = connections.find(c => c.fromNodeId === currentNode.id && c.fromPort === 'out-true') ||
                           connections.find(c => c.fromNodeId === currentNode.id);
            } else {
                nextConn = connections.find(c => c.fromNodeId === currentNode.id);
            }

            if (nextConn) {
                currentNode = nodes.find(n => n.id === nextConn.toNodeId);
                await wait(300);
            } else {
                currentNode = null;
            }
        }

        log('🎉 Akış testi başarıyla tamamlandı!', 'success');
        setIsSimulating(false);
    };

    return (
        <div className="flow-test-container">
            {/* ─── Üst Toolbar ──────────────────────────────────────────────── */}
            <div className="flow-test-header">
                <div className="flow-test-header-left">
                    <span className="flow-badge-superadmin">
                        <Shield size={14} /> SUPERADMIN
                    </span>

                    {/* Sistem Akışları Seçici Dropdown */}
                    <select
                        className="flow-select-system"
                        value={selectedFlowId}
                        onChange={(e) => handleSelectSystemFlow(e.target.value)}
                        title="Sistemdeki Akışları Yükle"
                    >
                        <option value="new">+ Yeni Akış Oluştur</option>
                        <optgroup label="Sistemdeki Kayıtlı Akışlar">
                            {systemFlows.map(f => (
                                <option key={f.id} value={f.id}>
                                    {f.name} {f.isActive ? '●' : '○'}
                                </option>
                            ))}
                        </optgroup>
                    </select>

                    <input
                        type="text"
                        className="flow-title-input"
                        value={flowName}
                        onChange={(e) => setFlowName(e.target.value)}
                        title="Akış Adı"
                    />

                    {/* Sistem Entegrasyon Göstergesi */}
                    <div className="flow-sync-indicator" title="Sistem Kaynakları">
                        <span className={`flow-sync-dot ${isDataLoading ? 'loading' : ''}`} />
                        <span>
                            {isDataLoading ? 'Yükleniyor...' : `${teams.length} Takım · ${templates.length} Şablon · ${bots.length} Bot`}
                        </span>
                        <button
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                            onClick={loadSystemData}
                            title="Kaynakları Yenile"
                        >
                            <RefreshCw size={12} className={isDataLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                <div className="flow-test-header-actions">
                    {/* Düğüm Ekle */}
                    <button
                        className="flow-btn flow-btn-primary"
                        onClick={() => setIsAddNodeModalOpen(true)}
                    >
                        <Plus size={16} /> Adım Ekle
                    </button>

                    {/* Sisteme Kaydet */}
                    <button
                        className="flow-btn flow-btn-primary"
                        style={{ background: '#3b82f6' }}
                        onClick={handleSaveToSystem}
                        disabled={isSaving}
                    >
                        <Save size={16} />
                        {isSaving ? 'Kaydediliyor...' : 'Sisteme Kaydet'}
                    </button>

                    {/* Akışı Test Et */}
                    <button
                        className="flow-btn flow-btn-success"
                        onClick={handleRunSimulation}
                        disabled={isSimulating}
                    >
                        <Play size={16} fill={isSimulating ? 'none' : 'currentColor'} />
                        {isSimulating ? 'Test Ediliyor...' : 'Akışı Test Et'}
                    </button>

                    {/* JSON İndir */}
                    <button
                        className="flow-btn flow-btn-secondary"
                        onClick={() => {
                            const data = JSON.stringify({ name: flowName, nodes, connections }, null, 2);
                            const blob = new Blob([data], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${flowName.toLowerCase().replace(/\s+/g, '_')}.json`;
                            a.click();
                        }}
                        title="JSON İndir"
                    >
                        <Download size={16} />
                    </button>
                </div>
            </div>

            {/* ─── Görsel Tuval (Canvas) ────────────────────────────────────── */}
            <div
                ref={canvasRef}
                className={`flow-canvas-wrapper ${isPanning ? 'is-panning' : ''}`}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
            >
                <div
                    className="flow-canvas-viewport"
                    style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                >
                    {/* SVG Bağlantı Kabloları */}
                    <svg className="flow-connections-layer">
                        <defs>
                            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
                            </marker>
                            <marker id="arrowhead-active" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="#10b981" />
                            </marker>
                        </defs>

                        {connections.map(conn => {
                            const fromNode = nodes.find(n => n.id === conn.fromNodeId);
                            const toNode = nodes.find(n => n.id === conn.toNodeId);
                            if (!fromNode || !toNode) return null;

                            const start = getNodePortPos(fromNode, conn.fromPort);
                            const end = getNodePortPos(toNode, conn.toPort);
                            const pathData = makeBezierPath(start, end);
                            const isExecuting = isSimulating && (fromNode.status === 'running' || fromNode.status === 'success');

                            return (
                                <g key={conn.id}>
                                    <path
                                        d={pathData}
                                        className={`flow-wire ${isExecuting ? 'wire-executing' : ''}`}
                                        markerEnd={isExecuting ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm('Bu bağlantıyı silmek istiyor musunuz?')) {
                                                handleDeleteConnection(conn.id);
                                            }
                                        }}
                                    />
                                </g>
                            );
                        })}

                        {draggingWire && (() => {
                            const fromNode = nodes.find(n => n.id === draggingWire.fromNodeId);
                            if (!fromNode) return null;
                            const start = getNodePortPos(fromNode, draggingWire.fromPort);
                            const end = { x: draggingWire.mouseX, y: draggingWire.mouseY };
                            return <path d={makeBezierPath(start, end)} className="flow-wire-dragging" />;
                        })()}
                    </svg>

                    {/* Düğümler (Nodes) */}
                    {nodes.map(node => {
                        const isSelected = selectedNodeId === node.id;
                        const isExecuting = node.status === 'running';
                        const hasExecuted = node.status === 'success';

                        // Gösterilecek açıklama
                        let descText = node.subtitle;
                        if (node.type === 'WA_SEND') {
                            descText = node.config?.templateName ? `Şablon: ${node.config.templateName}` : 'Şablon seçilmedi';
                        } else if (node.type === 'SEND_MESSAGE') {
                            descText = node.config?.message ? (node.config.message.slice(0, 32) + '...') : 'Mesaj yazın...';
                        } else if (node.type === 'ASSIGN_TEAM') {
                            descText = node.config?.teamName ? `Takım: ${node.config.teamName}` : 'Takım seçilmedi';
                        } else if (node.type === 'ASSIGN_BOT') {
                            descText = node.config?.botName ? `Bot: ${node.config.botName}` : 'Bot seçilmedi';
                        } else if (node.type === 'WAIT') {
                            descText = `${node.config?.amount || 5} ${node.config?.unit || 'dakika'} bekle`;
                        } else if (node.type === 'CONDITION') {
                            const cOpt = CONDITION_OPTIONS.find(o => o.value === node.config?.condition);
                            descText = cOpt ? cOpt.label : 'Koşul seçilmedi';
                        }

                        return (
                            <div
                                key={node.id}
                                className={`flow-node ${isSelected ? 'is-selected' : ''} ${isExecuting ? 'is-executing' : ''} ${hasExecuted ? 'has-executed' : ''}`}
                                style={{ left: `${node.x}px`, top: `${node.y}px` }}
                                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                            >
                                {/* Giriş Portu */}
                                {node.category !== 'Tetikleyici' && (
                                    <div
                                        className="flow-port flow-port-input"
                                        title="Girdi Noktası"
                                        onMouseUp={(e) => handlePortMouseUp(e, node.id, 'in')}
                                    />
                                )}

                                {/* Düğüm Başlığı */}
                                <div className="flow-node-header">
                                    <div className="flow-node-header-left">
                                        <div className="flow-node-icon" style={{ background: node.color }}>
                                            <Zap size={15} />
                                        </div>
                                        <span className="flow-node-type-label">{node.category}</span>
                                    </div>
                                    <div className="flow-node-actions">
                                        <button
                                            className="flow-node-action-btn"
                                            title="Ayarları Aç"
                                            onClick={(e) => { e.stopPropagation(); setSelectedNodeId(node.id); }}
                                        >
                                            <Settings size={14} />
                                        </button>
                                        <button
                                            className="flow-node-action-btn btn-delete"
                                            title="Sil"
                                            onClick={(e) => handleDeleteNode(node.id, e)}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Düğüm Gövdesi */}
                                <div className="flow-node-body">
                                    <div className="flow-node-title">{node.title}</div>
                                    <div className="flow-node-desc">{descText}</div>
                                </div>

                                {/* Düğüm Alt Durumu */}
                                <div className="flow-node-footer">
                                    <span className={`flow-node-status-badge status-${node.status || 'ready'}`}>
                                        {node.status === 'running' && 'Çalışıyor...'}
                                        {node.status === 'success' && 'Başarılı ✓'}
                                        {(!node.status || node.status === 'ready') && 'Hazır'}
                                    </span>
                                    <span>ID: {node.id.slice(-4)}</span>
                                </div>

                                {/* Çıkış Portları */}
                                {node.isConditional ? (
                                    <>
                                        <div
                                            className="flow-port flow-port-output flow-port-output-true"
                                            title="EVET Çıkışı (Bağlamak için sürükleyin)"
                                            onMouseDown={(e) => handlePortMouseDown(e, node.id, 'out-true')}
                                        />
                                        <span className="flow-port-label label-true">EVET</span>

                                        <div
                                            className="flow-port flow-port-output flow-port-output-false"
                                            title="HAYIR Çıkışı (Bağlamak için sürükleyin)"
                                            onMouseDown={(e) => handlePortMouseDown(e, node.id, 'out-false')}
                                        />
                                        <span className="flow-port-label label-false">HAYIR</span>
                                    </>
                                ) : (
                                    <div
                                        className="flow-port flow-port-output"
                                        title="Çıktı Noktası (Kablo çekmek için sürükleyin)"
                                        onMouseDown={(e) => handlePortMouseDown(e, node.id, 'out')}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Tuval Zoom / Reset Kontrolleri */}
                <div className="flow-canvas-controls">
                    <button className="flow-control-btn" onClick={() => setZoom(z => Math.min(z + 0.15, 1.8))} title="Yakınlaştır">
                        <ZoomIn size={16} />
                    </button>
                    <span className="flow-zoom-display">{Math.round(zoom * 100)}%</span>
                    <button className="flow-control-btn" onClick={() => setZoom(z => Math.max(z - 0.15, 0.4))} title="Uzaklaştır">
                        <ZoomOut size={16} />
                    </button>
                    <button className="flow-control-btn" onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); }} title="Görünümü Sıfırla">
                        <Maximize2 size={16} />
                    </button>
                </div>

                <div className="flow-stats-badge">
                    <span>Adımlar: <strong>{nodes.length}</strong></span>
                    <span>Bağlantılar: <strong>{connections.length}</strong></span>
                </div>
            </div>

            {/* ─── Sağ Görev Yapılandırma Çekmecesi ──────────────────────────── */}
            {selectedNode && (
                <div className="flow-drawer">
                    <div className="flow-drawer-header">
                        <div className="flow-drawer-title">
                            <div className="flow-node-icon" style={{ background: selectedNode.color, width: 32, height: 32 }}>
                                <Zap size={18} />
                            </div>
                            <div>
                                <h3>{selectedNode.title}</h3>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                    {selectedNode.category} Yapılandırması
                                </span>
                            </div>
                        </div>
                        <button className="flow-drawer-close" onClick={() => setSelectedNodeId(null)}>
                            <X size={18} />
                        </button>
                    </div>

                    <div className="flow-drawer-content">
                        {/* Başlık Değiştirme */}
                        <div className="flow-form-group">
                            <label>Adım Adı</label>
                            <input
                                type="text"
                                className="flow-input"
                                value={selectedNode.title}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, title: val } : n));
                                }}
                            />
                        </div>

                        {/* 1. WA_SEND (WhatsApp Şablonu) */}
                        {selectedNode.type === 'WA_SEND' && (
                            <>
                                <div className="flow-form-group">
                                    <label>Gönderilecek WhatsApp Şablonu</label>
                                    <select
                                        className="flow-select"
                                        value={selectedNode.config?.templateName || ''}
                                        onChange={(e) => {
                                            const tplName = e.target.value;
                                            const found = templates.find(t => t.name === tplName);
                                            setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                                ...n,
                                                config: {
                                                    ...n.config,
                                                    templateName: tplName,
                                                    templateId: found?.id || '',
                                                    templateBody: found?.bodyText || ''
                                                }
                                            } : n));
                                        }}
                                    >
                                        <option value="">Şablon seçin...</option>
                                        {templates.map(tpl => (
                                            <option key={tpl.id} value={tpl.name}>
                                                {tpl.name} {tpl.status === 'APPROVED' ? '✅' : tpl.status === 'PENDING' ? '⏳' : ''}
                                            </option>
                                        ))}
                                    </select>
                                    {templates.length === 0 && (
                                        <p className="flow-hint" style={{ color: '#fbbf24' }}>
                                            Henüz şablon bulunamadı. Otomasyonlar → Şablonlar sekmesinden ekleyin.
                                        </p>
                                    )}
                                </div>

                                {selectedNode.config?.templateName && (() => {
                                    const tpl = templates.find(t => t.name === selectedNode.config.templateName);
                                    return (
                                        <div className="flow-template-preview-box">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <span className={`flow-template-badge ${tpl?.status === 'APPROVED' ? 'approved' : 'pending'}`}>
                                                    {tpl?.status || 'APPROVED'}
                                                </span>
                                                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{tpl?.language || 'tr'}</span>
                                            </div>
                                            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
                                                {tpl?.bodyText || selectedNode.config.templateBody || 'Şablon metni'}
                                            </div>
                                        </div>
                                    );
                                })()}

                                <div className="flow-form-group">
                                    <label>Açıklama (İsteğe bağlı)</label>
                                    <input
                                        type="text"
                                        className="flow-input"
                                        placeholder="Örn: Katalog Gönder"
                                        value={selectedNode.config?.detail || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                                ...n, config: { ...n.config, detail: val }
                                            } : n));
                                        }}
                                    />
                                </div>
                            </>
                        )}

                        {/* 2. SEND_MESSAGE (Mesaj / Soru Sor) */}
                        {selectedNode.type === 'SEND_MESSAGE' && (
                            <div className="flow-form-group">
                                <label>Bot Mesajı / Sorusu ✏️</label>
                                <textarea
                                    className="flow-textarea"
                                    rows={5}
                                    placeholder="Mesaj metnini buraya yazın..."
                                    value={selectedNode.config?.message || ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                            ...n, config: { ...n.config, message: val }
                                        } : n));
                                    }}
                                />
                                <span className="flow-hint">Bot bu mesajı kullanıcıya gönderir. Bir sonraki adımda yanıtı koşul ile kontrol edebilirsiniz.</span>
                            </div>
                        )}

                        {/* 3. ASSIGN_TEAM (Ekibe Ata) */}
                        {selectedNode.type === 'ASSIGN_TEAM' && (
                            <>
                                <div className="flow-form-group">
                                    <label>Takım Seç</label>
                                    <select
                                        className="flow-select"
                                        value={selectedNode.config?.teamId || ''}
                                        onChange={(e) => {
                                            const tId = e.target.value;
                                            const found = teams.find(t => t.id === tId);
                                            setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                                ...n,
                                                config: { ...n.config, teamId: tId, teamName: found?.name || '' }
                                            } : n));
                                        }}
                                    >
                                        <option value="">Takım seçin...</option>
                                        {teams.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flow-form-group">
                                    <label>Atama Dağıtım Modu</label>
                                    <select
                                        className="flow-select"
                                        value={selectedNode.config?.assignMode || 'ROUND_ROBIN'}
                                        onChange={(e) => {
                                            const mode = e.target.value;
                                            setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                                ...n, config: { ...n.config, assignMode: mode }
                                            } : n));
                                        }}
                                    >
                                        <option value="ROUND_ROBIN">🔄 Ekibe Sırayla Ata (Round-Robin)</option>
                                        <option value="MANUAL">✋ Manuel Elle Aktar (Takım Havuzu)</option>
                                        <option value="PHONE_ROUND_ROBIN">📞 Numaralı Sırayla Ata</option>
                                    </select>
                                </div>
                            </>
                        )}

                        {/* 4. ASSIGN_BOT (AI Bot Ata) */}
                        {selectedNode.type === 'ASSIGN_BOT' && (
                            <div className="flow-form-group">
                                <label>AI Bot Seç 🤖</label>
                                <select
                                    className="flow-select"
                                    value={selectedNode.config?.botId || ''}
                                    onChange={(e) => {
                                        const bId = e.target.value;
                                        const b = bots.find(x => x.id === bId);
                                        setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                            ...n, config: { ...n.config, botId: bId, botName: b?.name || '' }
                                        } : n));
                                    }}
                                >
                                    <option value="">Bot seçin...</option>
                                    {bots.map(b => (
                                        <option key={b.id} value={b.id}>
                                            {b.name} {b.isActive === false ? '(Pasif)' : ''}
                                        </option>
                                    ))}
                                </select>
                                <span className="flow-hint">Bu adımdan itibaren seçilen AI bot konuşmayı devralır.</span>
                            </div>
                        )}

                        {/* 5. ASSIGN_AGENT (Temsilci Ata) */}
                        {selectedNode.type === 'ASSIGN_AGENT' && (
                            <div className="flow-form-group">
                                <label>Temsilci Seç 👤</label>
                                <select
                                    className="flow-select"
                                    value={selectedNode.config?.agentId || ''}
                                    onChange={(e) => {
                                        const aId = e.target.value;
                                        const m = members.find(x => x.user?.id === aId || x.id === aId);
                                        const name = m?.user?.name || m?.name || aId;
                                        setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                            ...n, config: { ...n.config, agentId: aId, agentName: name }
                                        } : n));
                                    }}
                                >
                                    <option value="">Temsilci seçin...</option>
                                    {members.map(m => {
                                        const id = m.user?.id || m.id;
                                        const name = m.user?.name || m.name || id;
                                        return (
                                            <option key={id} value={id}>
                                                {name} {m.role ? `(${m.role})` : ''}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        )}

                        {/* 6. AI_CALL & RETRY_CALL */}
                        {selectedNode.type === 'AI_CALL' && (
                            <div className="flow-form-group">
                                <label>Açıklama (İsteğe bağlı)</label>
                                <input
                                    type="text"
                                    className="flow-input"
                                    placeholder="Örn: Geri Dönüş Ara"
                                    value={selectedNode.config?.detail || ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                            ...n, config: { ...n.config, detail: val }
                                        } : n));
                                    }}
                                />
                            </div>
                        )}

                        {selectedNode.type === 'RETRY_CALL' && (
                            <>
                                <div className="flow-form-group">
                                    <label>Maksimum Tekrar Sayısı</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={10}
                                        className="flow-input"
                                        value={selectedNode.config?.maxRetries || 3}
                                        onChange={(e) => {
                                            const val = Number(e.target.value);
                                            setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                                ...n, config: { ...n.config, maxRetries: val }
                                            } : n));
                                        }}
                                    />
                                </div>
                                <div className="flow-form-group">
                                    <label>Tekrarlar Arası Bekleme</label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input
                                            type="number"
                                            min={1}
                                            className="flow-input"
                                            style={{ width: 100 }}
                                            value={selectedNode.config?.waitAmount || 1}
                                            onChange={(e) => {
                                                const val = Number(e.target.value);
                                                setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                                    ...n, config: { ...n.config, waitAmount: val }
                                                } : n));
                                            }}
                                        />
                                        <select
                                            className="flow-select"
                                            value={selectedNode.config?.waitUnit || 'saat'}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                                    ...n, config: { ...n.config, waitUnit: val }
                                                } : n));
                                            }}
                                        >
                                            <option value="dakika">Dakika</option>
                                            <option value="saat">Saat</option>
                                            <option value="gün">Gün</option>
                                        </select>
                                    </div>
                                    <span className="flow-hint">Arama açılmadıysa belirlenen süre sonra tekrar aranır.</span>
                                </div>
                            </>
                        )}

                        {/* 7. CONVERT_TO_OPP (Fırsata Çevir) */}
                        {selectedNode.type === 'CONVERT_TO_OPP' && (
                            <div className="flow-form-group">
                                <label>Hedef Aşama / Funnel</label>
                                <select
                                    className="flow-select"
                                    value={selectedNode.config?.targetStage || ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                            ...n, config: { ...n.config, targetStage: val }
                                        } : n));
                                    }}
                                >
                                    <option value="">Aşama seçin...</option>
                                    {funnelList.flatMap(fn => (fn.stages || []).map(stg => (
                                        <option key={stg.id} value={stg.name}>
                                            {fn.name} → {stg.name}
                                        </option>
                                    )))}
                                </select>
                            </div>
                        )}

                        {/* 8. SWITCH_FLOW (Akışa Geç) */}
                        {selectedNode.type === 'SWITCH_FLOW' && (
                            <div className="flow-form-group">
                                <label>Geçilecek Akış</label>
                                <select
                                    className="flow-select"
                                    value={selectedNode.config?.flowId || ''}
                                    onChange={(e) => {
                                        const fId = e.target.value;
                                        const f = systemFlows.find(x => x.id === fId);
                                        setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                            ...n, config: { ...n.config, flowId: fId, flowName: f?.name || '' }
                                        } : n));
                                    }}
                                >
                                    <option value="">Akış seçin...</option>
                                    {systemFlows.map(f => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* 9. WAIT (Bekleme) */}
                        {selectedNode.type === 'WAIT' && (
                            <div className="flow-form-group">
                                <label>Bekleme Süresi</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input
                                        type="number"
                                        min={1}
                                        className="flow-input"
                                        style={{ width: 100 }}
                                        value={selectedNode.config?.amount || 5}
                                        onChange={(e) => {
                                            const val = Number(e.target.value);
                                            setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                                ...n, config: { ...n.config, amount: val }
                                            } : n));
                                        }}
                                    />
                                    <select
                                        className="flow-select"
                                        value={selectedNode.config?.unit || 'dakika'}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                                ...n, config: { ...n.config, unit: val }
                                            } : n));
                                        }}
                                    >
                                        <option value="saniye">Saniye</option>
                                        <option value="dakika">Dakika</option>
                                        <option value="saat">Saat</option>
                                        <option value="gün">Gün</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* 10. CONDITION (Koşul - Eğer) */}
                        {selectedNode.type === 'CONDITION' && (
                            <>
                                <div className="flow-form-group">
                                    <label>Koşul</label>
                                    <select
                                        className="flow-select"
                                        value={selectedNode.config?.condition || 'MSG_READ'}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                                ...n, config: { ...n.config, condition: val }
                                            } : n));
                                        }}
                                    >
                                        {CONDITION_OPTIONS.map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {selectedNode.config?.condition === 'MSG_CONTAINS' && (
                                    <>
                                        <div className="flow-form-group">
                                            <label>Aranacak Kelimeler (virgülle ayırın)</label>
                                            <textarea
                                                className="flow-textarea"
                                                rows={3}
                                                placeholder="fiyat, randevu, teklif"
                                                value={selectedNode.config?.keywords || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                                        ...n, config: { ...n.config, keywords: val }
                                                    } : n));
                                                }}
                                            />
                                        </div>
                                        <div className="flow-form-group">
                                            <label>Eşleşme Modu</label>
                                            <select
                                                className="flow-select"
                                                value={selectedNode.config?.matchMode || 'any'}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setNodes(prev => prev.map(n => n.id === selectedNode.id ? {
                                                        ...n, config: { ...n.config, matchMode: val }
                                                    } : n));
                                                }}
                                            >
                                                <option value="any">Herhangi biri varsa (VEYA)</option>
                                                <option value="all">Hepsi varsa (VE)</option>
                                            </select>
                                        </div>
                                    </>
                                )}
                                <span className="flow-hint">Koşul sağlanırsa EVET dalı, sağlanmazsa HAYIR dalı çalışır.</span>
                            </>
                        )}
                    </div>

                    <div className="flow-drawer-footer">
                        <button
                            className="flow-btn flow-btn-danger"
                            onClick={(e) => handleDeleteNode(selectedNode.id, e)}
                        >
                            <Trash2 size={14} /> Adımı Sil
                        </button>
                        <button
                            className="flow-btn flow-btn-primary"
                            onClick={() => setSelectedNodeId(null)}
                        >
                            <Check size={14} /> Tamamla
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Adım Ekleme Modalı (Sadece Sistemdeki Gerçek Adımlar) ───── */}
            {isAddNodeModalOpen && (
                <div className="flow-modal-overlay" onClick={() => setIsAddNodeModalOpen(false)}>
                    <div className="flow-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="flow-modal-header">
                            <h2><Plus size={20} /> Akışa Yeni Adım Ekle</h2>
                            <button className="flow-drawer-close" onClick={() => setIsAddNodeModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flow-modal-search">
                            <input
                                type="text"
                                className="flow-modal-search-input"
                                placeholder="Adım ara (WhatsApp, AI Bot, Ekip, Koşul)..."
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className="flow-modal-categories">
                            {['TETİKLEYİCİLER', 'AKSİYONLAR', 'MANTIK & KONTROL'].map(groupName => {
                                const groupKey = groupName === 'TETİKLEYİCİLER' ? 'trigger'
                                    : groupName === 'AKSİYONLAR' ? 'action' : 'logic';

                                const items = Object.entries(STEP_TYPES)
                                    .filter(([type, def]) => def.group === groupKey)
                                    .filter(([type, def]) =>
                                        def.label.toLowerCase().includes(searchFilter.toLowerCase()) ||
                                        def.desc.toLowerCase().includes(searchFilter.toLowerCase())
                                    );

                                if (items.length === 0) return null;

                                return (
                                    <div key={groupName}>
                                        <div className="flow-category-title">{groupName}</div>
                                        <div className="flow-node-templates-grid">
                                            {items.map(([type, def]) => {
                                                const IconComponent = def.icon;
                                                return (
                                                    <div
                                                        key={type}
                                                        className="flow-template-card"
                                                        onClick={() => handleAddNode(type)}
                                                    >
                                                        <div className="flow-template-card-header">
                                                            <div className="flow-node-icon" style={{ background: def.color }}>
                                                                <IconComponent size={16} />
                                                            </div>
                                                            <div className="flow-template-card-name">{def.label}</div>
                                                        </div>
                                                        <div className="flow-template-card-desc">{def.desc}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Test Simülasyon Paneli (Alt Konsol) ──────────────────────── */}
            {isSimPanelOpen && (
                <div className="flow-simulation-panel" style={{ height: '260px' }}>
                    <div className="flow-sim-header">
                        <div className="flow-sim-header-left">
                            <Terminal size={16} color="#38bdf8" />
                            <span>Akış Test Konsolu</span>
                            {isSimulating && (
                                <span style={{ color: '#34d399', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                                    Test Ediliyor...
                                </span>
                            )}
                        </div>
                        <div className="flow-sim-header-actions">
                            <button className="flow-btn flow-btn-secondary" style={{ padding: '3px 8px', fontSize: '0.74rem' }} onClick={() => setSimulationLogs([])}>
                                Temizle
                            </button>
                            <button className="flow-node-action-btn" onClick={() => setIsSimPanelOpen(false)}>
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="flow-sim-content">
                        {simulationLogs.length === 0 ? (
                            <div style={{ color: '#64748b', fontStyle: 'italic', padding: '12px 0' }}>
                                Henüz test çalıştırılmadı. Yukarıdaki "Akışı Test Et" butonuna basarak simülasyonu başlatabilirsiniz.
                            </div>
                        ) : (
                            simulationLogs.map((log, index) => (
                                <div key={index} className={`flow-log-entry log-${log.type}`}>
                                    <span className="flow-log-time">{log.time}</span>
                                    <div style={{ flex: 1 }}>
                                        <div className="flow-log-msg">{log.msg}</div>
                                        {log.payload && (
                                            <div className="flow-log-payload">
                                                {JSON.stringify(log.payload, null, 2)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FlowTest;

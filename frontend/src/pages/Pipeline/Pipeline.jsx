import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI } from '../../services/api';
import {
    Kanban,
    User,
    Phone,
    Mail,
    MessageSquare,
    Instagram,
    Facebook,
    Globe,
    Search,
    RefreshCw,
    ChevronDown,
    X,
    ArrowRight,
    Layers,
    Flame,
    CheckCircle,
    XCircle,
    Clock,
    Users
} from 'lucide-react';
import './Pipeline.css';

const PIPELINE_COLUMNS = [
    {
        id: 'NEW',
        label: 'Gelen Leadler',
        emoji: '📥',
        color: '#6b7280',
        gradient: 'linear-gradient(135deg, #6b7280, #4b5563)',
        bg: '#f9fafb',
        borderColor: '#d1d5db',
        icon: Layers
    },
    {
        id: 'CONTACTED',
        label: 'İletişime Geçildi',
        emoji: '📞',
        color: '#3b82f6',
        gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
        bg: '#eff6ff',
        borderColor: '#bfdbfe',
        icon: Phone
    },
    {
        id: 'OPPORTUNITY',
        label: 'Görüşme',
        emoji: '💬',
        color: '#8b5cf6',
        gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
        bg: '#f5f3ff',
        borderColor: '#ddd6fe',
        icon: MessageSquare
    },
    {
        id: 'HOT_OPPORTUNITY',
        label: 'Sıcak Fırsat',
        emoji: '🔥',
        color: '#f59e0b',
        gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
        bg: '#fffbeb',
        borderColor: '#fde68a',
        icon: Flame
    },
    {
        id: 'CLOSED',
        label: 'Kazanıldı',
        emoji: '✅',
        color: '#10b981',
        gradient: 'linear-gradient(135deg, #10b981, #059669)',
        bg: '#ecfdf5',
        borderColor: '#a7f3d0',
        icon: CheckCircle
    },
    {
        id: 'LOST',
        label: 'Kaybedildi',
        emoji: '❌',
        color: '#ef4444',
        gradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
        bg: '#fef2f2',
        borderColor: '#fecaca',
        icon: XCircle
    }
];

const CHANNEL_ICONS = {
    WHATSAPP: { icon: Phone, color: '#25D366', label: 'WhatsApp' },
    INSTAGRAM: { icon: Instagram, color: '#E1306C', label: 'Instagram' },
    FACEBOOK: { icon: Facebook, color: '#1877F2', label: 'Facebook' },
    EMAIL: { icon: Mail, color: '#6b7280', label: 'E-posta' },
    WIDGET: { icon: Globe, color: '#8b5cf6', label: 'Web Widget' },
    PHONE: { icon: Phone, color: '#0ea5e9', label: 'Telefon' },
    LEAD: { icon: Facebook, color: '#1877F2', label: 'Lead' },
    MANUAL: { icon: User, color: '#6b7280', label: 'Manuel' }
};

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
        return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
        return 'Dün';
    } else if (diffDays < 7) {
        return date.toLocaleDateString('tr-TR', { weekday: 'short' });
    } else {
        return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    }
};

const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
};

const ContactCard = ({ contact, onDragStart }) => {
    const channelInfo = CHANNEL_ICONS[contact.channel] || CHANNEL_ICONS.MANUAL;
    const ChannelIcon = channelInfo.icon;

    return (
        <div
            className="pipeline-card"
            draggable
            onDragStart={(e) => onDragStart(e, contact)}
            id={`card-${contact.id}`}
        >
            <div className="pipeline-card-header">
                <div className="pipeline-card-avatar">
                    {contact.name ? getInitials(contact.name) : '?'}
                </div>
                <div className="pipeline-card-info">
                    <span className="pipeline-card-name">{contact.name || 'İsimsiz'}</span>
                    <span className="pipeline-card-channel" style={{ color: channelInfo.color }}>
                        <ChannelIcon size={10} />
                        {channelInfo.label}
                    </span>
                </div>
                <span className="pipeline-card-time">
                    <Clock size={10} />
                    {formatDate(contact.updatedAt || contact.createdAt)}
                </span>
            </div>

            <div className="pipeline-card-body">
                {contact.phone && (
                    <div className="pipeline-card-detail">
                        <Phone size={11} />
                        <span>{contact.phone}</span>
                    </div>
                )}
                {contact.email && (
                    <div className="pipeline-card-detail">
                        <Mail size={11} />
                        <span>{contact.email}</span>
                    </div>
                )}
                {!contact.phone && !contact.email && (
                    <div className="pipeline-card-detail muted">
                        <User size={11} />
                        <span>İletişim bilgisi yok</span>
                    </div>
                )}
            </div>

            {(() => {
                // tags is stored as JSON string in DB, parse it safely
                let tags = [];
                try {
                    if (Array.isArray(contact.tags)) {
                        tags = contact.tags;
                    } else if (typeof contact.tags === 'string' && contact.tags) {
                        tags = JSON.parse(contact.tags);
                    }
                } catch { tags = []; }
                if (!tags || tags.length === 0) return null;
                return (
                    <div className="pipeline-card-tags">
                        {tags.slice(0, 2).map((tag, i) => (
                            <span key={i} className="pipeline-card-tag">{tag}</span>
                        ))}
                        {tags.length > 2 && (
                            <span className="pipeline-card-tag-more">+{tags.length - 2}</span>
                        )}
                    </div>
                );
            })()}
        </div>
    );
};

const PipelineColumn = ({ column, contacts, onDragStart, onDragOver, onDrop, isDragOver }) => {
    const ColIcon = column.icon;

    return (
        <div
            className={`pipeline-column ${isDragOver ? 'drag-over' : ''}`}
            onDragOver={(e) => onDragOver(e, column.id)}
            onDrop={(e) => onDrop(e, column.id)}
            id={`col-${column.id}`}
        >
            <div className="pipeline-column-header" style={{ background: column.gradient }}>
                <div className="pipeline-column-title">
                    <span className="pipeline-column-emoji">{column.emoji}</span>
                    <span className="pipeline-column-label">{column.label}</span>
                </div>
                <span className="pipeline-column-count">{contacts.length}</span>
            </div>

            <div className="pipeline-column-body" style={{ background: column.bg }}>
                {contacts.length === 0 ? (
                    <div className="pipeline-column-empty">
                        <ColIcon size={24} style={{ color: column.color, opacity: 0.3 }} />
                        <p>Kişi yok</p>
                    </div>
                ) : (
                    contacts.map(contact => (
                        <ContactCard
                            key={contact.id}
                            contact={contact}
                            onDragStart={onDragStart}
                        />
                    ))
                )}

                {/* Drop target indicator when empty and dragging over */}
                {isDragOver && contacts.length === 0 && (
                    <div className="pipeline-drop-indicator">
                        <ArrowRight size={20} />
                        <span>Buraya bırak</span>
                    </div>
                )}
            </div>
        </div>
    );
};

const Pipeline = () => {
    const { currentWorkspace } = useAuth();
    const [contacts, setContacts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [dragOverColumn, setDragOverColumn] = useState(null);
    const dragContact = useRef(null);
    const [totalCount, setTotalCount] = useState(0);

    useEffect(() => {
        if (currentWorkspace) {
            loadContacts();
        }
    }, [currentWorkspace]);

    const loadContacts = async () => {
        try {
            setLoading(true);
            const response = await contactAPI.getAll(currentWorkspace.id, { limit: 500 });
            const data = response.data;
            // Handle both { contacts } and direct array responses
            const list = data.contacts || data || [];
            setContacts(list);
            setTotalCount(data.total || list.length);
        } catch (error) {
            console.error('Pipeline: Error loading contacts:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDragStart = (e, contact) => {
        dragContact.current = contact;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('contactId', contact.id);
        // Add dragging class after a small delay so the card still renders
        setTimeout(() => {
            const el = document.getElementById(`card-${contact.id}`);
            if (el) el.classList.add('dragging');
        }, 0);
    };

    const handleDragOver = (e, columnId) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverColumn(columnId);
    };

    const handleDrop = async (e, targetColumnId) => {
        e.preventDefault();
        setDragOverColumn(null);

        const contact = dragContact.current;
        if (!contact || contact.status === targetColumnId) return;

        // Optimistic update
        setContacts(prev =>
            prev.map(c => c.id === contact.id ? { ...c, status: targetColumnId } : c)
        );

        try {
            await contactAPI.update(currentWorkspace.id, contact.id, { status: targetColumnId });
        } catch (error) {
            console.error('Pipeline: Failed to update status:', error);
            // Revert on error
            setContacts(prev =>
                prev.map(c => c.id === contact.id ? { ...c, status: contact.status } : c)
            );
        }

        dragContact.current = null;
    };

    const handleDragEnd = () => {
        // Remove dragging class from all cards
        document.querySelectorAll('.pipeline-card.dragging').forEach(el => {
            el.classList.remove('dragging');
        });
        setDragOverColumn(null);
    };

    const filteredContacts = contacts.filter(c => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            (c.name || '').toLowerCase().includes(q) ||
            (c.phone || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q)
        );
    });

    const groupedContacts = PIPELINE_COLUMNS.reduce((acc, col) => {
        acc[col.id] = filteredContacts.filter(c => c.status === col.id);
        return acc;
    }, {});

    if (!currentWorkspace) {
        return (
            <div className="pipeline-empty-state">
                <p>Lütfen bir workspace seçin</p>
            </div>
        );
    }

    return (
        <div className="pipeline-page" onDragEnd={handleDragEnd}>
            {/* Header */}
            <div className="pipeline-header">
                <div className="pipeline-header-left">
                    <Kanban size={22} className="pipeline-header-icon" />
                    <div>
                        <h1 className="pipeline-title">Pipeline</h1>
                        <span className="pipeline-subtitle">
                            {loading ? 'Yükleniyor...' : `${totalCount} kişi`}
                        </span>
                    </div>
                </div>

                <div className="pipeline-header-right">
                    <div className="pipeline-search">
                        <Search size={14} className="pipeline-search-icon" />
                        <input
                            type="text"
                            placeholder="Kişi ara..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pipeline-search-input"
                        />
                        {search && (
                            <button className="pipeline-search-clear" onClick={() => setSearch('')}>
                                <X size={12} />
                            </button>
                        )}
                    </div>
                    <button
                        className="pipeline-refresh-btn"
                        onClick={loadContacts}
                        disabled={loading}
                        title="Yenile"
                    >
                        <RefreshCw size={15} className={loading ? 'spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Stats bar */}
            <div className="pipeline-stats-bar">
                {PIPELINE_COLUMNS.map(col => {
                    const count = groupedContacts[col.id]?.length || 0;
                    return (
                        <div key={col.id} className="pipeline-stat-chip" style={{ borderColor: col.borderColor }}>
                            <span className="pipeline-stat-dot" style={{ background: col.color }} />
                            <span className="pipeline-stat-label">{col.label}</span>
                            <span className="pipeline-stat-count" style={{ color: col.color }}>{count}</span>
                        </div>
                    );
                })}
            </div>

            {/* Board */}
            {loading ? (
                <div className="pipeline-loading">
                    <div className="pipeline-loading-spinner" />
                    <p>Pipeline yükleniyor...</p>
                </div>
            ) : (
                <div className="pipeline-board">
                    {PIPELINE_COLUMNS.map(col => (
                        <PipelineColumn
                            key={col.id}
                            column={col}
                            contacts={groupedContacts[col.id] || []}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            isDragOver={dragOverColumn === col.id}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default Pipeline;

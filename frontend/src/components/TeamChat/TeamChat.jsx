import { useState, useEffect, useCallback } from 'react';
import { Users, ChevronUp, Circle, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { workspaceAPI } from '../../services/api';
import './TeamChat.css';

const TeamChat = ({ isCollapsed }) => {
    const { currentWorkspace, user, onlineUsers } = useAuth();
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [members, setMembers] = useState([]);

    // Fetch workspace members
    useEffect(() => {
        const fetchMembers = async () => {
            if (!currentWorkspace?.id) return;
            try {
                const res = await workspaceAPI.getMembers(currentWorkspace.id);
                const raw = res.data?.members || res.data || [];
                const others = raw
                    .filter(m => m.user && m.userId !== user?.id)
                    .map(m => ({
                        userId: m.userId,
                        name: m.user?.name || m.user?.email || 'Bilinmeyen',
                        avatar: m.user?.avatar || null,
                        role: m.role,
                        email: m.user?.email
                    }));
                setMembers(others);
            } catch (e) {
                console.error('TeamChat: members fetch error', e);
            }
        };
        fetchMembers();
    }, [currentWorkspace?.id, user?.id]);

    const isUserOnline = useCallback((userId) => {
        return onlineUsers.get(userId)?.isOnline || false;
    }, [onlineUsers]);

    const onlineCount = members.filter(m => isUserOnline(m.userId)).length;

    // Sort: online first, then alphabetical
    const sortedMembers = [...members].sort((a, b) => {
        const aOnline = isUserOnline(a.userId) ? 0 : 1;
        const bOnline = isUserOnline(b.userId) ? 0 : 1;
        if (aOnline !== bOnline) return aOnline - bOnline;
        return (a.name || '').localeCompare(b.name || '', 'tr');
    });

    const handleMemberClick = (member) => {
        // Navigate to inbox - use replace + custom event to ensure it opens
        if (window.location.pathname === '/inbox') {
            // Already on inbox — dispatch event to focus
            window.dispatchEvent(new CustomEvent('inbox_focus', { detail: { agentId: member.userId } }));
        } else {
            navigate('/inbox');
        }
        setIsOpen(false);
    };

    // Collapsed sidebar: just show icon
    if (isCollapsed) {
        return (
            <div className="team-panel-wrapper">
                <button
                    className="team-panel-trigger collapsed"
                    onClick={() => {
                        if (window.location.pathname === '/inbox') {
                            window.dispatchEvent(new CustomEvent('inbox_focus'));
                        } else {
                            navigate('/inbox');
                        }
                    }}
                    title={`Ekip (${onlineCount} çevrimiçi)`}
                >
                    <MessageSquare size={20} className="nav-icon" />
                    {onlineCount > 0 && (
                        <span className="team-panel-online-dot" />
                    )}
                </button>
            </div>
        );
    }

    return (
        <div className="team-panel-wrapper">
            {/* Gmail-style header bar */}
            <button
                className={`team-panel-header-bar ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen(v => !v)}
            >
                <MessageSquare size={16} />
                <span className="team-panel-title">Chat</span>
                <span className="team-panel-online-count">
                    <Circle size={7} fill="#10b981" stroke="none" />
                    {onlineCount}
                </span>
                <ChevronUp
                    size={14}
                    className="team-panel-chevron"
                    style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(180deg)' }}
                />
            </button>

            {/* Expandable member list */}
            {isOpen && (
                <div className="team-panel-list">
                    {sortedMembers.map(m => (
                        <button
                            key={m.userId}
                            className="team-panel-member"
                            onClick={() => handleMemberClick(m)}
                            title={`${m.name} — Inbox'a git`}
                        >
                            <div className="team-panel-avatar">
                                {m.avatar ? (
                                    <img src={m.avatar} alt={m.name} />
                                ) : (
                                    <span className="team-panel-avatar-letter">
                                        {m.name?.charAt(0)?.toUpperCase() || '?'}
                                    </span>
                                )}
                                <span className={`team-panel-status ${isUserOnline(m.userId) ? 'online' : 'offline'}`} />
                            </div>
                            <span className="team-panel-name">{m.name}</span>
                        </button>
                    ))}
                    {members.length === 0 && (
                        <div className="team-panel-empty">Ekip üyesi yok</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TeamChat;

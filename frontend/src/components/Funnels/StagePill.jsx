import { Settings, Bot, Users, User } from 'lucide-react';

const StagePill = ({ stage, count = 0, isSelected, onClick, onSettingsClick, teams = [], members = [], bots = [] }) => {
    const assignedTeam = (teams || []).find(t => t.id === stage.assignedTeamId);
    const assignedUser = (members || []).find(m => m.id === stage.assignedUserId);
    const assignedBot = (bots || []).find(b => b.id === stage.assignedBotId);

    return (
        <div
            className={`stage-pill${isSelected ? ' active' : ''}`}
            onClick={() => onClick?.(stage)}
            title={stage.name}
        >
            <span className="stage-color-dot" style={{ backgroundColor: stage.color || '#6b7280' }} />
            <span className="stage-name">{stage.name}</span>
            {/* Sorumlu mini rozetleri */}
            {(stage.assignedBotId || stage.assignedTeamId || stage.assignedUserId) && (
                <span
                    className="stage-assign-icons"
                    title={[
                        assignedTeam ? `Takım: ${assignedTeam.name}` : null,
                        assignedUser ? `Kişi: ${assignedUser.name || assignedUser.email}` : null,
                        assignedBot ? `Bot: ${assignedBot.name}` : null,
                    ].filter(Boolean).join(' · ')}
                >
                    {stage.assignedTeamId && (
                        <span className="stage-assign-badge team" title={`Takım: ${assignedTeam?.name || 'Takım'}`}>
                            <Users size={9} />
                            {assignedTeam?.name && <span className="stage-assign-name">{assignedTeam.name}</span>}
                        </span>
                    )}
                    {stage.assignedUserId && (
                        <span className="stage-assign-badge user" title={`Kişi: ${assignedUser?.name || assignedUser?.email || 'Kişi'}`}>
                            <User size={9} />
                            {assignedUser?.name && <span className="stage-assign-name">{assignedUser.name}</span>}
                        </span>
                    )}
                    {stage.assignedBotId && (
                        <span className="stage-assign-badge bot" title={`Bot: ${assignedBot?.name || 'Bot'}`}>
                            <Bot size={9} />
                            {assignedBot?.name && <span className="stage-assign-name">{assignedBot.name}</span>}
                        </span>
                    )}
                </span>
            )}
            {count > 0 && (
                <span className="stage-count" style={{ backgroundColor: stage.color || '#6b7280' }}>
                    {count > 999 ? '999+' : count}
                </span>
            )}
            {stage.statusType && (
                <span className={`stage-status-indicator ${stage.statusType.toLowerCase()}`}>
                    {stage.statusType === 'WON' ? '✓' : stage.statusType === 'LOST' ? '✗' : '●'}
                </span>
            )}
            <button
                className="stage-settings-btn"
                onClick={e => { e.stopPropagation(); onSettingsClick?.(stage); }}
                title="Aşama Ayarları"
            >
                <Settings size={10} />
            </button>
        </div>
    );
};

export default StagePill;

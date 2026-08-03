import { Settings, Bot, Users, User } from 'lucide-react';

const StagePill = ({ stage, count = 0, isSelected, onClick, onSettingsClick }) => {
    return (
        <div
            className={`stage-pill${isSelected ? ' active' : ''}`}
            onClick={() => onClick?.(stage)}
            title={stage.name}
        >
            <span className="stage-color-dot" style={{ backgroundColor: stage.color || '#6b7280' }} />
            <span className="stage-name">{stage.name}</span>
            {/* Sorumlu mini ikonları */}
            {(stage.assignedBotId || stage.assignedTeamId || stage.assignedUserId) && (
                <span className="stage-assign-icons">
                    {stage.assignedBotId && <Bot size={9} />}
                    {stage.assignedTeamId && <Users size={9} />}
                    {stage.assignedUserId && <User size={9} />}
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

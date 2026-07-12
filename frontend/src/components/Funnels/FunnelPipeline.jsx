import { useState } from 'react';
import { Settings, ChevronRight, ChevronDown } from 'lucide-react';
import StagePill from './StagePill';

const FunnelPipeline = ({
    funnel,
    stageCounts = {},
    selectedStage,
    onStageClick,
    onStageSettingsClick,
    onFunnelSettingsClick,
    onAddStageClick,
    children, // sub-funnels rendered as children
}) => {
    const [isExpanded, setIsExpanded] = useState(funnel.funnelType === 'MAIN');
    const stages = (funnel.stages || []).sort((a, b) => a.order - b.order);
    const totalCount = stages.reduce((sum, s) => sum + (stageCounts[s.id] || 0), 0);

    return (
        <div className={`funnel-card${funnel.funnelType === 'MAIN' ? ' main-funnel' : ''}`}>
            <div className="funnel-card-header" onClick={() => setIsExpanded(prev => !prev)}>
                <span style={{ fontSize: 18 }}>{funnel.icon || '📁'}</span>
                <span className="funnel-name">{funnel.name}</span>
                {funnel.funnelType === 'MAIN' && <span className="funnel-badge">ANA AKIŞ</span>}
                <div className="funnel-header-right">
                    <span className="funnel-stage-count">
                        {totalCount} kişi · {stages.length} aşama
                    </span>
                    <button
                        className="funnel-settings-btn"
                        onClick={e => { e.stopPropagation(); onFunnelSettingsClick?.(funnel); }}
                        title="Akış Ayarları"
                    >
                        <Settings size={15} />
                    </button>
                    <span className={`expand-chevron${isExpanded ? ' expanded' : ''}`}>
                        <ChevronDown size={16} />
                    </span>
                </div>
            </div>

            {isExpanded && (
                <div className="pipeline-container">
                    <div className="pipeline-stages">
                        {stages.map((stage, i) => (
                            <span key={stage.id} style={{ display: 'contents' }}>
                                <StagePill
                                    stage={stage}
                                    count={stageCounts[stage.id] || 0}
                                    isSelected={selectedStage === stage.id}
                                    onClick={onStageClick}
                                    onSettingsClick={onStageSettingsClick}
                                />
                                {i < stages.length - 1 && (
                                    <span className="stage-arrow">
                                        <ChevronRight size={14} />
                                    </span>
                                )}
                            </span>
                        ))}
                        {/* Add stage button at the end */}
                        {stages.length > 0 && (
                            <span className="stage-arrow">
                                <ChevronRight size={14} />
                            </span>
                        )}
                        <button
                            className="add-stage-pill"
                            onClick={e => { e.stopPropagation(); onAddStageClick?.(funnel); }}
                            title="Yeni Aşama Ekle"
                        >
                            + Ekle
                        </button>
                    </div>
                </div>
            )}

            {isExpanded && children && (
                <div className="sub-funnels">
                    {children}
                </div>
            )}
        </div>
    );
};

export default FunnelPipeline;

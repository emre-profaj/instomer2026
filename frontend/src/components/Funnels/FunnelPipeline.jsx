import { useState } from 'react';
import { Settings, ChevronRight, ChevronDown, GripVertical } from 'lucide-react';
import StagePill from './StagePill';

const FunnelPipeline = ({
    funnel,
    stageCounts = {},
    selectedStage,
    onStageClick,
    onStageSettingsClick,
    onFunnelSettingsClick,
    onAddStageClick,
    onStageReorder,
    onFunnelDrop,
    depth = 0,
    isLast = false,
    connectorLines = [],
    children,
}) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [dropHighlight, setDropHighlight] = useState(false);
    const stages = (funnel.stages || []).sort((a, b) => a.order - b.order);
    const totalCount = stages.reduce((sum, s) => sum + (stageCounts[s.id] || 0), 0);

    const INDENT = 32;

    return (
        <div className="funnel-tree-node" style={{ position: 'relative' }}>
            {/* Tree connector lines for ancestors */}
            {connectorLines.map((showLine, i) => (
                showLine && (
                    <div
                        key={i}
                        className="tree-line-vertical"
                        style={{ left: i * INDENT + 15 }}
                    />
                )
            ))}

            {/* Branch connector: horizontal line + corner for this node */}
            {depth > 0 && (
                <>
                    <div
                        className={`tree-line-branch ${isLast ? 'last' : ''}`}
                        style={{ left: (depth - 1) * INDENT + 15 }}
                    />
                    <div
                        className="tree-line-horizontal"
                        style={{ left: (depth - 1) * INDENT + 15, width: INDENT - 8 }}
                    />
                </>
            )}

            {/* Funnel card */}
            <div
                className={`funnel-card${funnel.funnelType === 'MAIN' ? ' main-funnel' : ''}${depth > 0 ? ' sub-funnel' : ''}${dropHighlight ? ' drop-highlight' : ''}`}
                style={{ marginLeft: depth * INDENT }}
                onDragOver={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const dragType = e.dataTransfer.types.includes('funnelid');
                    if (dragType) setDropHighlight(true);
                }}
                onDragLeave={e => { e.stopPropagation(); setDropHighlight(false); }}
                onDrop={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDropHighlight(false);
                    const draggedFunnelId = e.dataTransfer.getData('funnelId');
                    if (draggedFunnelId && draggedFunnelId !== funnel.id) {
                        onFunnelDrop?.(draggedFunnelId, funnel.id);
                    }
                }}
            >
                <div
                    className="funnel-card-header"
                    draggable={funnel.funnelType !== 'MAIN'}
                    onDragStart={e => {
                        if (funnel.funnelType === 'MAIN') { e.preventDefault(); return; }
                        e.dataTransfer.setData('funnelId', funnel.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.currentTarget.closest('.funnel-card').classList.add('dragging-funnel');
                    }}
                    onDragEnd={e => {
                        e.currentTarget.closest('.funnel-card')?.classList.remove('dragging-funnel');
                    }}
                    onClick={() => setIsExpanded(prev => !prev)}
                >
                    {funnel.funnelType !== 'MAIN' && (
                        <span className="funnel-drag-handle" title="Sürükleyerek taşı">
                            <GripVertical size={14} />
                        </span>
                    )}
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
                                <>
                                    <div
                                        key={stage.id}
                                        draggable
                                        onDragStart={e => {
                                            e.stopPropagation();
                                            e.dataTransfer.setData('stageId', stage.id);
                                            e.dataTransfer.setData('stageFunnelId', funnel.id);
                                            e.dataTransfer.effectAllowed = 'move';
                                            e.currentTarget.classList.add('dragging');
                                        }}
                                        onDragEnd={e => e.currentTarget.classList.remove('dragging')}
                                        onDragOver={e => {
                                            if (e.dataTransfer.types.includes('stagefunnelid')) {
                                                e.preventDefault();
                                                e.currentTarget.classList.add('drag-over');
                                            }
                                        }}
                                        onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                                        onDrop={e => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            e.currentTarget.classList.remove('drag-over');
                                            const draggedStageId = e.dataTransfer.getData('stageId');
                                            const draggedFunnelId = e.dataTransfer.getData('stageFunnelId');
                                            if (draggedFunnelId === funnel.id && draggedStageId !== stage.id) {
                                                onStageReorder?.(funnel.id, draggedStageId, stage.order);
                                            }
                                        }}
                                        className="stage-drag-wrapper"
                                    >
                                        <StagePill
                                            stage={stage}
                                            count={stageCounts[stage.id] || 0}
                                            isSelected={selectedStage === stage.id}
                                            onClick={onStageClick}
                                            onSettingsClick={onStageSettingsClick}
                                        />
                                    </div>
                                    {i < stages.length - 1 && (
                                        <span className="stage-arrow">
                                            <ChevronRight size={14} />
                                        </span>
                                    )}
                                </>
                            ))}
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
            </div>

            {/* Children (sub-funnels) */}
            {isExpanded && children && (
                <div className="sub-funnels">
                    {children}
                </div>
            )}
        </div>
    );
};

export default FunnelPipeline;

import React from 'react';
import './OnlineUsersWidget.css';

const OnlineUsersWidget = ({ onlineUsers = [] }) => {
    if (!onlineUsers || onlineUsers.length === 0) return null;

    return (
        <div className="online-widget">
            <div className="online-widget-header">
                <span className="online-dot" />
                <span className="online-count">{onlineUsers.length} çevrimiçi</span>
            </div>
            <div className="online-avatars">
                {onlineUsers.slice(0, 8).map((u, i) => (
                    <div key={u.userId || i} className="online-avatar" title={u.name}>
                        {u.avatar ? (
                            <img src={u.avatar} alt={u.name} />
                        ) : (
                            <span className="online-avatar-letter">
                                {u.name?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                        )}
                        <span className="online-indicator" />
                    </div>
                ))}
                {onlineUsers.length > 8 && (
                    <div className="online-avatar online-more">
                        +{onlineUsers.length - 8}
                    </div>
                )}
            </div>
        </div>
    );
};

export default OnlineUsersWidget;

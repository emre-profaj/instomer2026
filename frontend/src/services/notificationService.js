// Browser Push Notification Service

class NotificationService {
    constructor() {
        this.permission = 'Notification' in window ? Notification.permission : 'denied';
        this.isSupported = 'Notification' in window;
    }

    // Check if notifications are supported
    checkSupport() {
        if (!this.isSupported) {
            console.warn('Bu tarayıcı bildirimleri desteklemiyor.');
            return false;
        }
        return true;
    }

    // Request notification permission
    async requestPermission() {
        if (!this.checkSupport()) return false;

        try {
            const permission = await Notification.requestPermission();
            this.permission = permission;
            
            if (permission === 'granted') {
                console.log('✅ Bildirim izni verildi');
                // Show test notification immediately
                setTimeout(() => {
                    this.showNotification('🔔 Bildirimler Aktif!', {
                        body: 'Artık yeni mesajlardan haberdar olacaksınız.',
                        tag: 'permission-granted',
                        requireInteraction: true
                    });
                }, 500);
                return true;
            } else if (permission === 'denied') {
                console.warn('❌ Bildirim izni reddedildi');
                return false;
            }
            return false;
        } catch (error) {
            console.error('Bildirim izni hatası:', error);
            return false;
        }
    }

    // Check if permission is granted
    isPermissionGranted() {
        return this.permission === 'granted';
    }

    // Check if permission is denied
    isPermissionDenied() {
        return this.permission === 'denied';
    }

    // Check if permission is default (not asked yet)
    isPermissionDefault() {
        return this.permission === 'default';
    }

    // Show a notification
    showNotification(title, options = {}) {
        if (!this.checkSupport()) {
            console.warn('Notifications not supported');
            return null;
        }
        
        // Refresh permission state
        this.permission = Notification.permission;
        
        if (!this.isPermissionGranted()) {
            console.warn('Bildirim izni verilmedi, mevcut izin:', this.permission);
            return null;
        }

        const notificationOptions = {
            body: options.body || '',
            tag: options.tag || undefined,
            requireInteraction: options.requireInteraction || false,
            silent: options.silent || false,
            data: options.data || {}
        };

        // Only add icon if specified and exists
        if (options.icon) {
            notificationOptions.icon = options.icon;
        }

        try {
            console.log('📢 Bildirim gösteriliyor:', title, notificationOptions);
            const notification = new Notification(title, notificationOptions);

            // Handle notification click
            notification.onclick = (event) => {
                event.preventDefault();
                window.focus();
                
                // If there's a URL to navigate to
                if (options.data?.url) {
                    window.location.href = options.data.url;
                }
                
                // If there's a custom click handler
                if (options.onClick) {
                    options.onClick(event);
                }

                notification.close();
            };

            // Auto close after 8 seconds (longer for better visibility)
            if (!options.requireInteraction) {
                setTimeout(() => {
                    notification.close();
                }, 8000);
            }

            return notification;
        } catch (error) {
            console.error('Bildirim gösterme hatası:', error);
            return null;
        }
    }

    // Show new message notification
    showNewMessageNotification(message, conversation, contact) {
        const senderName = contact?.name || 'Bilinmeyen';
        const channelEmoji = this.getChannelEmoji(conversation?.channel);
        
        return this.showNotification(`${channelEmoji} ${senderName}`, {
            body: this.truncateText(message.content || 'Yeni mesaj', 100),
            tag: `conversation-${conversation?.id}`, // Prevents duplicate notifications
            renotify: true,
            data: {
                url: `/inbox?conversationId=${conversation?.id}`,
                conversationId: conversation?.id,
                contactId: contact?.id
            }
        });
    }

    // Show new comment notification
    showNewCommentNotification(comment, post) {
        return this.showNotification('💬 Yeni Yorum', {
            body: this.truncateText(comment.message || 'Yeni yorum', 100),
            tag: `comment-${comment.id}`,
            renotify: true,
            data: {
                url: `/inbox?commentId=${comment.id}`,
                commentId: comment.id
            }
        });
    }

    // Get channel emoji
    getChannelEmoji(channel) {
        const emojis = {
            'WHATSAPP': '💬',
            'FACEBOOK': '📘',
            'INSTAGRAM': '📸',
            'EMAIL': '📧',
            'WIDGET': '🌐'
        };
        return emojis[channel] || '💬';
    }

    // Truncate text
    truncateText(text, maxLength) {
        if (!text) return '';
        // Strip HTML tags
        const strippedText = text.replace(/<[^>]*>/g, '');
        if (strippedText.length <= maxLength) return strippedText;
        return strippedText.substring(0, maxLength) + '...';
    }
}

// Singleton instance
const notificationService = new NotificationService();
export default notificationService;


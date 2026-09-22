import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useRef } from 'react';
import {
    MessageCircle,
    Facebook,
    Instagram,
    Send,
    Trash2,
    Edit2,
    ExternalLink,
    RefreshCw,
    MoreVertical,
    ThumbsUp,
    MessageSquare,
    Share2,
    Clock,
    X,
    Image as ImageIcon,
    Wifi
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { facebookAPI } from '../../services/api';
import { io } from 'socket.io-client';
import './Comments.css';

const Comments = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const [pages, setPages] = useState([]);
    const [selectedPage, setSelectedPage] = useState(null);
    const [posts, setPosts] = useState([]);
    const [selectedPost, setSelectedPost] = useState(null);
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [threadLoading, setThreadLoading] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [editingComment, setEditingComment] = useState(null);
    const [activeChannel, setActiveChannel] = useState('FACEBOOK'); // 'FACEBOOK' or 'INSTAGRAM'
    const commentsEndRef = useRef(null);

    useEffect(() => {
        if (currentWorkspace) {
            setSelectedPage(null);
            setSelectedPost(null);
            setPosts([]);
            setComments([]);
            loadPages();
        }
    }, [currentWorkspace?.id]);

    // Auto-scroll to bottom of comments
    useEffect(() => {
        if (commentsEndRef.current) {
            commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [comments]);

    // WebSocket connection for real-time comment updates
    const [socketConnected, setSocketConnected] = useState(false);
    const socketRef = useRef(null);
    const selectedPostRef = useRef(null);
    const selectedPageRef = useRef(null);
    
    // Keep refs updated
    useEffect(() => {
        selectedPostRef.current = selectedPost;
    }, [selectedPost]);
    
    useEffect(() => {
        selectedPageRef.current = selectedPage;
    }, [selectedPage]);
    
    // Socket connection - only once on mount, joins workspace room
    useEffect(() => {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5008';
        const socketUrl = API_URL.replace('/api', '');
        
        console.log('🔌 Connecting to WebSocket:', socketUrl);
        
        const socket = io(socketUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            // 5 denemeden sonra pes ediyordu; kısa bir ağ kesintisi bağlantıyı
            // kalıcı olarak öldürüyor, ekran ancak yenilenince güncelleniyordu.
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('✅ Comments WebSocket connected, ID:', socket.id);
            setSocketConnected(true);
            // Join workspace room
            if (currentWorkspace?.id) {
                socket.emit('join_workspace', currentWorkspace.id);
                console.log(`📦 Joined workspace room: ${currentWorkspace.id}`);
            }
        });

        socket.on('disconnect', (reason) => {
            console.log('❌ Comments WebSocket disconnected, reason:', reason);
            setSocketConnected(false);
        });

        socket.on('connect_error', (error) => {
            console.error('❌ WebSocket connection error:', error.message);
        });

        socket.on('new_comment', (data) => {
            console.log('📬 New comment received via WebSocket:', data);
            const currentPost = selectedPostRef.current;
            const currentPage = selectedPageRef.current;
            
            // Update the preview for this post immediately
            if (data.postId && data.message && data.from) {
                setPostPreviews(prev => ({
                    ...prev,
                    [data.postId]: {
                        message: data.message,
                        from: data.from.name || 'Bilinmeyen'
                    }
                }));
            }
            
            // Refresh comments if we have a selected post
            if (currentPost) {
                console.log('🔄 Refreshing comments for post:', currentPost.id);
                loadComments(currentPost.id);
            }
            
            // Also refresh posts list to update comment counts
            if (currentPage) {
                loadPosts(currentPage.pageId);
            }
        });

        return () => {
            console.log('🔌 Disconnecting WebSocket');
            socket.disconnect();
        };
    }, []); // Empty array - only on mount

    const loadPages = async () => {
        try {
            setLoading(true);
            const response = await facebookAPI.getPages(currentWorkspace.id);
            setPages(response.data.pages || []);
        } catch (error) {
            console.error('Error loading pages:', error);
        } finally {
            setLoading(false);
        }
    };

    // Kanal değiştiğinde uygun sayfayı seç
    useEffect(() => {
        if (pages.length > 0) {
            if (activeChannel === 'INSTAGRAM') {
                // Instagram bağlı olan ilk sayfayı seç
                const instagramPage = pages.find(p => p.instagramBusinessId);
                setSelectedPage(instagramPage || null);
            } else {
                // Facebook için ilk sayfayı seç
                setSelectedPage(pages[0]);
            }
            setSelectedPost(null);
            setPosts([]);
            setComments([]);
        }
    }, [activeChannel, pages]);

    useEffect(() => {
        if (selectedPage) {
            loadPosts();
        }
    }, [selectedPage, activeChannel]);

    const loadPosts = async () => {
        if (!selectedPage) return;
        
        try {
            setLoading(true);
            let response;
            if (activeChannel === 'INSTAGRAM' && selectedPage?.instagramBusinessId) {
                // Instagram postlarını yükle
                console.log('📸 Loading Instagram posts for:', selectedPage.instagramBusinessId);
                response = await facebookAPI.getInstagramPosts(selectedPage.instagramBusinessId, currentWorkspace.id);
            } else {
                // Facebook postlarını yükle
                console.log('📘 Loading Facebook posts for:', selectedPage.pageId);
                response = await facebookAPI.getPosts(selectedPage.pageId);
            }
            setPosts(response.data.posts || response.data.media || []);
        } catch (error) {
            console.error('Error loading posts:', error);
            setPosts([]);
        } finally {
            setLoading(false);
        }
    };

    // Filtrelenmiş sayfalar (aktif kanala göre)
    const filteredPages = activeChannel === 'INSTAGRAM' 
        ? pages.filter(p => p.instagramBusinessId) 
        : pages;

    const loadComments = async (postId) => {
        try {
            setThreadLoading(true);
            const response = await facebookAPI.getPostComments(postId, currentWorkspace.id, selectedPage?.pageId);
            setComments(response.data.comments || []);
        } catch (error) {
            console.error('Error loading comments:', error);
        } finally {
            setThreadLoading(false);
        }
    };

    const [postPreviews, setPostPreviews] = useState({}); // Store last comment for each post

    const handleSelectPost = (post) => {
        setSelectedPost(post);
        loadComments(post.id);
    };

    // Load last comment preview for each post
    const loadPostPreview = async (postId) => {
        try {
            const response = await facebookAPI.getPostComments(postId, currentWorkspace.id, selectedPage?.pageId);
            const comments = response.data.comments || [];
            if (comments.length > 0) {
                const lastComment = comments[comments.length - 1];
                setPostPreviews(prev => ({
                    ...prev,
                    [postId]: {
                        message: lastComment.message,
                        from: lastComment.from?.name || 'Bilinmeyen'
                    }
                }));
            }
        } catch (error) {
            console.error('Error loading post preview:', error);
        }
    };

    // Load previews when posts change
    useEffect(() => {
        if (posts.length > 0 && selectedPage) {
            posts.forEach(post => {
                if (!postPreviews[post.id]) {
                    loadPostPreview(post.id);
                }
            });
        }
    }, [posts, selectedPage]);

    const handleSendComment = async () => {
        if (!replyText || !selectedPost) return;

        try {
            if (editingComment) {
                await facebookAPI.updateComment(editingComment.id, currentWorkspace.id, {
                    message: replyText,
                    workspaceId: currentWorkspace.id
                });
            } else {
                await facebookAPI.createComment(selectedPost.id, {
                    message: replyText,
                    workspaceId: currentWorkspace.id,
                    pageId: selectedPage?.pageId
                });
            }

            setReplyText('');
            setEditingComment(null);
            loadComments(selectedPost.id); // Reload thread
        } catch (error) {
            console.error('Error sending comment:', error);
            const msg = error.response?.data?.error || 'Yorum gönderilemedi.';
            alert(msg);
        }
    };

    const handleDeleteComment = async (commentId) => {
        if (!confirm('Are you sure you want to delete this comment?')) return;
        try {
            await facebookAPI.deleteComment(commentId, currentWorkspace.id);
            loadComments(selectedPost.id);
        } catch (error) {
            console.error('Error deleting comment:', error);
            alert('Yorum silinemedi.');
        }
    };

    const handleEditComment = (comment) => {
        setEditingComment(comment);
        setReplyText(comment.message);
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleString('tr-TR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatRelativeTime = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    };

    if (!currentWorkspace) return <div className="comments-page empty-state">Lütfen bir workspace seçin.</div>;

    return (
        <div className="comments-page">
            {/* COLUMN 1: POSTS LIST */}
            <div className="comments-list">
                <div className="comments-header">
                    <div className="comments-header-top">
                        <h2>Yorumlar</h2>
                        <div className="channel-filters">
                            <button
                                className={`channel-filter-btn facebook ${activeChannel === 'FACEBOOK' ? 'active' : ''}`}
                                onClick={() => setActiveChannel('FACEBOOK')}
                                title="Facebook"
                            >
                                <Facebook size={18} />
                            </button>
                            <button
                                className={`channel-filter-btn instagram ${activeChannel === 'INSTAGRAM' ? 'active' : ''}`}
                                onClick={() => setActiveChannel('INSTAGRAM')}
                                title="Instagram"
                            >
                                <Instagram size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="page-selector-wrapper">
                        {activeChannel === 'FACEBOOK' ? (
                            <Facebook size={16} color="#1877F2" style={{ fill: '#1877F2', color: 'white' }} />
                        ) : (
                            <Instagram size={16} color="#E4405F" />
                        )}
                        <select
                            className="page-selector"
                            value={selectedPage?.pageId || ''}
                            onChange={(e) => setSelectedPage(filteredPages.find(p => p.pageId === e.target.value))}
                            disabled={loading || filteredPages.length === 0}
                        >
                            {filteredPages.length === 0 ? (
                                <option>
                                    {activeChannel === 'INSTAGRAM' ? 'Instagram Hesabı Bulunamadı' : 'Sayfa Bulunamadı'}
                                </option>
                            ) : null}
                            {filteredPages.map(page => (
                                <option key={page.pageId} value={page.pageId}>
                                    {activeChannel === 'INSTAGRAM' && page.instagramUsername 
                                        ? `@${page.instagramUsername}` 
                                        : page.pageName}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="posts-list">
                    {loading && posts.length === 0 ? (
                        <div className="empty-state-icon">
                            <RefreshCw className="animate-spin" />
                            <span>Loading...</span>
                        </div>
                    ) : posts.length > 0 ? (
                        posts.map(post => (
                            <div
                                key={post.id}
                                className={`post-item ${selectedPost?.id === post.id ? 'active' : ''}`}
                                onClick={() => handleSelectPost(post)}
                            >
                                {post.full_picture ? (
                                    <img src={post.full_picture} alt="post" className="post-thumbnail-mini" />
                                ) : (
                                    <div className="post-thumbnail-mini" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <ImageIcon size={20} color="#9ca3af" />
                                    </div>
                                )}
                                <div className="post-item-content">
                                    <div className="post-item-message">{post.message || 'Görsel Paylaşımı'}</div>
                                    {postPreviews[post.id] && (
                                        <div className="post-last-comment">
                                            <span className="last-comment-author">{postPreviews[post.id].from}:</span>
                                            <span className="last-comment-text">{postPreviews[post.id].message}</span>
                                        </div>
                                    )}
                                    <div className="post-item-meta">
                                        <span>{new Date(post.created_time).toLocaleDateString()}</span>
                                        <span>{post.comments?.summary?.total_count || 0} Yorum</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="empty-state-icon">
                            <span>{t('comments.noPosts')}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* COLUMN 2: COMMENTS THREAD */}
            <div className="comments-main">
                {selectedPost ? (
                    <>
                        <div className="thread-header">
                            <div className="current-post-info">
                                <MessageCircle size={18} color="#ef4444" />
                                <span>{comments.length} Yorum</span>
                                <span className={`auto-refresh-badge ${socketConnected ? 'connected' : 'disconnected'}`}>
                                    <Wifi size={12} />
                                    {socketConnected ? 'Canlı' : 'Bağlantı kesik'}
                                </span>
                            </div>
                            <button 
                                className="refresh-comments-btn" 
                                onClick={() => loadComments(selectedPost.id)}
                                disabled={threadLoading}
                                title="Yorumları Yenile"
                            >
                                <RefreshCw size={16} className={threadLoading ? 'animate-spin' : ''} />
                            </button>
                        </div>

                        <div className="comments-scroller">
                            {threadLoading ? (
                                <div className="empty-state-icon">
                                    <RefreshCw className="animate-spin" />
                                    <span>{t('comments.loading')}</span>
                                </div>
                            ) : comments.length > 0 ? (
                                comments.map(comment => (
                                    <React.Fragment key={comment.id}>
                                        {/* Main Comment */}
                                        <div className="comment-bubble-wrapper">
                                            <img
                                                src={`https://graph.facebook.com/${comment.from?.id}/picture?type=square`}
                                                alt="avatar"
                                                className="comment-avatar"
                                                onError={(e) => e.target.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(comment.from?.name || 'U')}
                                            />
                                            <div className="comment-content">
                                                <div className="comment-header">
                                                    <span className="comment-author">{comment.from?.name}</span>
                                                    <span className="comment-date">{formatDate(comment.created_time)}</span>
                                                </div>
                                                <div className="comment-bubble">
                                                    {comment.message}
                                                </div>
                                                <div className="comment-actions">
                                                    <button className="comment-action-btn" onClick={() => handleEditComment(comment)}>{t('comments.replyEdit')}</button>
                                                    <button className="comment-action-btn" onClick={() => handleDeleteComment(comment.id)}>Delete</button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Replies */}
                                        {comment.comments?.data?.map(reply => (
                                            <div key={reply.id} className="comment-bubble-wrapper reply">
                                                <img
                                                    src={`https://graph.facebook.com/${reply.from?.id}/picture?type=square`}
                                                    alt="avatar"
                                                    className="comment-avatar"
                                                    style={{ width: '24px', height: '24px' }}
                                                    onError={(e) => e.target.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(reply.from?.name || 'U')}
                                                />
                                                <div className="comment-content">
                                                    <div className="comment-header">
                                                        <span className="comment-author">{reply.from?.name}</span>
                                                        <span className="comment-date">{formatDate(reply.created_time)}</span>
                                                    </div>
                                                    <div className="comment-bubble" style={{ backgroundColor: '#f3f4f6' }}>
                                                        {reply.message}
                                                    </div>
                                                    <div className="comment-actions">
                                                        <button className="comment-action-btn" onClick={() => handleEditComment(reply)}>Edit</button>
                                                        <button className="comment-action-btn" onClick={() => handleDeleteComment(reply.id)}>Delete</button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </React.Fragment>
                                ))
                            ) : (
                                <div className="empty-state-icon">
                                    <MessageSquare size={48} />
                                    <p>{t('comments.noComments')}</p>
                                </div>
                            )}
                            <div ref={commentsEndRef} />
                        </div>

                        <div className="comment-input-area">
                            {editingComment && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', color: '#64748b' }}>
                                    <span>Düzenleniyor: {editingComment.message.substring(0, 30)}...</span>
                                    <button onClick={() => { setEditingComment(null); setReplyText(''); }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={14} /></button>
                                </div>
                            )}
                            <div className="comment-input-wrapper">
                                <textarea
                                    className="comment-input"
                                    placeholder="Bir yorum yazın..."
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendComment();
                                        }
                                    }}
                                />
                                <button className="comment-send-btn" onClick={handleSendComment} disabled={!replyText.trim()}>
                                    <Send size={16} />
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="empty-state-icon">
                        <MessageCircle size={64} style={{ opacity: 0.2 }} />
                        <p>Yorumları görüntülemek için soldan bir gönderi seçin.</p>
                    </div>
                )}
            </div>

        </div>
    );
};

export default Comments;

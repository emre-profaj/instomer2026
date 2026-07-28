import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { authAPI, workspaceAPI, conversationAPI } from '../services/api';
import { io } from 'socket.io-client';

const AuthContext = createContext(null);

// Helper to get the active storage
const getStorage = () => {
    // Check if 'rememberMe' flag was set
    const remember = localStorage.getItem('rememberMe');
    return remember === 'true' ? localStorage : sessionStorage;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentWorkspace, setCurrentWorkspace] = useState(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [onlineUsers, setOnlineUsers] = useState(new Map());

    useEffect(() => {
        const initializeAuth = async () => {
            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
            const savedWorkspace = localStorage.getItem('currentWorkspace') || sessionStorage.getItem('currentWorkspace');

            if (token) {
                try {
                    // Always fetch fresh user data on mount to avoid stale roles
                    const response = await authAPI.getCurrentUser();
                    const freshUser = response.data.user;

                    setUser(freshUser);
                    getStorage().setItem('user', JSON.stringify(freshUser));

                    // Önce localStorage'daki workspace'i hemen göster (hızlı render için)
                    if (savedWorkspace) {
                        try {
                            setCurrentWorkspace(JSON.parse(savedWorkspace));
                        } catch {}
                    }

                    // Sonra API'den taze workspace listesini çek — realEstateEnabled gibi
                    // sonradan eklenen alanların güncel değerleri yansısın
                    try {
                        const wsResponse = await workspaceAPI.getAll();
                        const workspaces = wsResponse.data.workspaces || [];
                        if (workspaces.length > 0) {
                            let parsed = null;
                            try { parsed = savedWorkspace ? JSON.parse(savedWorkspace) : null; } catch {}
                            const match = parsed?.id
                                ? workspaces.find(w => w.id === parsed.id) || workspaces[0]
                                : workspaces[0];
                            setCurrentWorkspace(match);
                            getStorage().setItem('currentWorkspace', JSON.stringify(match));
                        }
                    } catch (wsErr) {
                        // API hatası: localStorage verisiyle devam et
                        console.warn('Workspace refresh failed, using cached data:', wsErr.message);
                        if (!savedWorkspace) {
                            await loadUserWorkspace();
                        }
                    }
                } catch (error) {
                    console.error('Auth initialization error:', error);
                    // 401 → interceptor handles redirect, don't double-handle
                    // Only logout for 403 (explicitly forbidden — user/token truly invalid)
                    if (error.response?.status === 403) {
                        logout();
                    } else if (error.response?.status !== 401) {
                        // Transient error (429, 500, network error) — use cached user data
                        // This prevents logout during PM2 restart or rate limiting
                        const cachedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
                        if (cachedUser) {
                            try {
                                setUser(JSON.parse(cachedUser));
                                console.warn('⚠️ Using cached user data due to transient error');
                                if (savedWorkspace) {
                                    setCurrentWorkspace(JSON.parse(savedWorkspace));
                                }
                            } catch (e) {
                                console.error('Failed to parse cached user:', e);
                            }
                        }
                    }
                }
            }
            setLoading(false);
        };

        initializeAuth();
    }, []);

    // WebSocket connection - Global level with workspace room support
    const socketRef = useRef(null);

    useEffect(() => {
        if (!user) return; // Only connect if user is logged in

        const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5008';
        const SOCKET_URL = BASE_URL.replace('/api', '');

        console.log('🔌 [AuthContext] Connecting to WebSocket:', SOCKET_URL);
        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling']
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('✅ [AuthContext] WebSocket connected:', socket.id);
            // Join user room for presence tracking
            if (user?.id) {
                socket.emit('join_user', user.id);
                console.log(`👤 [AuthContext] Joined user room: ${user.id}`);
            }
            // Join current workspace room if available
            if (currentWorkspace?.id) {
                socket.emit('join_workspace', currentWorkspace.id);
                console.log(`📦 [AuthContext] Joined workspace room: ${currentWorkspace.id}`);
            }
        });

        socket.on('new_message', (data) => {
            console.log('📨 [AuthContext] New message received:', data);

            // Increment unread count only for direct messages (FACEBOOK, INSTAGRAM, WHATSAPP)
            // Exclude: WIDGET, LEAD, EMAIL, COMMENT channels
            const messageChannels = ['FACEBOOK', 'INSTAGRAM', 'WHATSAPP'];
            if (data.message?.isFromContact && messageChannels.includes(data.channel)) {
                setUnreadCount(prev => prev + 1);
            }

            // Dispatch custom event for components to listen
            window.dispatchEvent(new CustomEvent('websocket:new_message', { detail: data }));
        });

        socket.on('new_conversation', (data) => {
            console.log('📨 [AuthContext] New conversation received:', data);
            window.dispatchEvent(new CustomEvent('websocket:new_conversation', { detail: data }));
        });

        socket.on('contact_updated', (data) => {
            console.log('👤 [AuthContext] Contact updated:', data);
            window.dispatchEvent(new CustomEvent('websocket:contact_updated', { detail: data }));
        });

        socket.on('funnel_stage_updated', (data) => {
            window.dispatchEvent(new CustomEvent('websocket:funnel_stage_updated', { detail: data }));
        });

        socket.on('case_updated', (data) => {
            window.dispatchEvent(new CustomEvent('websocket:case_updated', { detail: data }));
        });

        socket.on('case_assignment_updated', (data) => {
            window.dispatchEvent(new CustomEvent('websocket:case_assignment_updated', { detail: data }));
        });

        socket.on('case_score_updated', (data) => {
            window.dispatchEvent(new CustomEvent('websocket:case_score_updated', { detail: data }));
        });

        socket.on('contact_score_updated', (data) => {
            window.dispatchEvent(new CustomEvent('websocket:contact_score_updated', { detail: data }));
        });

        socket.on('new_notification', (data) => {
            console.log('🔔 [AuthContext] New notification:', data);
            window.dispatchEvent(new CustomEvent('websocket:new_notification', { detail: data }));
        });

        // Online/offline status tracking
        socket.on('user_status_changed', (data) => {
            console.log(`${data.isOnline ? '🟢' : '🔴'} [AuthContext] User status changed:`, data.userId, data.isOnline ? 'ONLINE' : 'OFFLINE');
            setOnlineUsers(prev => {
                const next = new Map(prev);
                next.set(data.userId, { isOnline: data.isOnline, lastSeenAt: data.lastSeenAt });
                return next;
            });
            window.dispatchEvent(new CustomEvent('websocket:user_status_changed', { detail: data }));
        });

        socket.on('disconnect', () => {
            console.log('❌ [AuthContext] WebSocket disconnected');
        });

        socket.on('connect_error', (error) => {
            console.error('❌ [AuthContext] WebSocket connection error:', error);
        });

        return () => {
            console.log('🔌 [AuthContext] Disconnecting WebSocket');
            socket.disconnect();
            socketRef.current = null;
        };
    }, [user]);

    // Join new workspace room when workspace changes
    useEffect(() => {
        if (socketRef.current?.connected && currentWorkspace?.id) {
            socketRef.current.emit('join_workspace', currentWorkspace.id);
            console.log(`📦 [AuthContext] Switched to workspace room: ${currentWorkspace.id}`);
        }
    }, [currentWorkspace?.id]);

    // Load unread count when workspace changes
    useEffect(() => {
        const loadUnreadCount = async () => {
            if (!currentWorkspace?.id) return;

            try {
                const response = await conversationAPI.getUnreadCount(currentWorkspace.id);
                setUnreadCount(response.data.unreadCount || 0);
                console.log('📬 [AuthContext] Initial unread count:', response.data.unreadCount);
            } catch (error) {
                console.error('Error loading unread count:', error);
            }
        };

        loadUnreadCount();
    }, [currentWorkspace?.id]);

    const loadUserWorkspace = async () => {
        try {
            const response = await workspaceAPI.getAll();
            const workspaces = response.data.workspaces;

            if (workspaces && workspaces.length > 0) {
                // Automatically select first workspace (user's own workspace)
                const workspace = workspaces[0];
                setCurrentWorkspace(workspace);
                getStorage().setItem('currentWorkspace', JSON.stringify(workspace));
            }
        } catch (error) {
            console.error('Error loading workspace:', error);
        }
    };

    const login = async (credentials) => {
        try {
            const { rememberMe, ...loginData } = credentials;
            const response = await authAPI.login(loginData);
            const { user, token, workspace } = response.data;

            // Store rememberMe preference
            if (rememberMe) {
                localStorage.setItem('rememberMe', 'true');
            } else {
                localStorage.removeItem('rememberMe');
            }

            const storage = rememberMe ? localStorage : sessionStorage;
            storage.setItem('token', token);
            storage.setItem('user', JSON.stringify(user));
            setUser(user);

            // Automatically set workspace if returned
            if (workspace) {
                setCurrentWorkspace(workspace);
                storage.setItem('currentWorkspace', JSON.stringify(workspace));
            } else {
                // Load workspace if not returned
                await loadUserWorkspace();
            }

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || 'Giriş başarısız, lütfen tekrar deneyin'
            };
        }
    };

    const register = async (data) => {
        try {
            const response = await authAPI.register(data);
            const { user, token, workspace } = response.data;

            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            setUser(user);

            // Automatically set workspace
            if (workspace) {
                setCurrentWorkspace(workspace);
                localStorage.setItem('currentWorkspace', JSON.stringify(workspace));
            }

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || 'Registration failed'
            };
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('currentWorkspace');
        localStorage.removeItem('rememberMe');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('currentWorkspace');
        setUser(null);
        setCurrentWorkspace(null);
    };

    const switchWorkspace = async (workspaceOrId) => {
        let workspace = workspaceOrId;

        // If only ID is passed, fetch the full workspace data
        if (typeof workspaceOrId === 'string') {
            try {
                const response = await workspaceAPI.getById(workspaceOrId);
                workspace = response.data.workspace;
            } catch (error) {
                console.error('Error fetching workspace:', error);
                return;
            }
        }

        if (workspace) {
            setCurrentWorkspace(workspace);
            getStorage().setItem('currentWorkspace', JSON.stringify(workspace));
            console.log('🔄 [AuthContext] Switched to workspace:', workspace.name);
        }
    };

    const refreshWorkspace = async () => {
        try {
            // Also refresh user data while we are at it
            const userRes = await authAPI.getCurrentUser();
            const freshUser = userRes.data.user;
            setUser(freshUser);
            getStorage().setItem('user', JSON.stringify(freshUser));

            const response = await workspaceAPI.getAll();
            const workspaces = response.data.workspaces;

            if (workspaces && workspaces.length > 0) {
                // Try to find current workspace in the list to update its data too
                let matchingWorkspace = workspaces.find(w => w.id === currentWorkspace?.id);

                // If current not found or doesn't exist, use the most recent
                if (!matchingWorkspace) {
                    matchingWorkspace = workspaces.reduce((latest, current) => {
                        const latestDate = new Date(latest.updatedAt || latest.createdAt);
                        const currentDate = new Date(current.updatedAt || current.createdAt);
                        return currentDate > latestDate ? current : latest;
                    });
                }

                setCurrentWorkspace(matchingWorkspace);
                getStorage().setItem('currentWorkspace', JSON.stringify(matchingWorkspace));
                console.log('✅ Auth & Workspace refreshed:', matchingWorkspace.name);
                return matchingWorkspace;
            }
        } catch (error) {
            console.error('Error refreshing auth data:', error);
        }
    };

    const value = {
        user,
        loading,
        currentWorkspace,
        login,
        register,
        logout,
        switchWorkspace,
        refreshWorkspace,
        unreadCount,
        setUnreadCount,
        onlineUsers,
        isAuthenticated: !!user
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

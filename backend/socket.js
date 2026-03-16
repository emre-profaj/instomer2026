import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
let io;
const isDev = process.env.NODE_ENV !== 'production';
const log = (...args) => isDev && console.log(...args);

// Track online users: userId -> Set<socketId>
const onlineUsers = new Map();
// Track socket -> userId mapping for disconnect cleanup
const socketToUser = new Map();

// Allowed origins for Socket.io
const allowedOrigins = [
    process.env.FRONTEND_URL || 'https://app.instomer.com',
    'https://app.instomer.com',
    'https://chatcrm.instomer.com',
    'https://instomer.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
];

export const initializeSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: (origin, callback) => {
                // Allow requests with no origin (mobile apps, server-to-server)
                if (!origin) {
                    return callback(null, true);
                }

                // Check if origin is allowed
                if (allowedOrigins.some(allowed => origin.startsWith(allowed) || allowed.includes(origin))) {
                    return callback(null, true);
                }

                // Allow widget connections from any origin
                return callback(null, true);
            },
            methods: ['GET', 'POST'],
            credentials: true
        },
        transports: ['websocket', 'polling']
    });

    io.on('connection', (socket) => {
        log('✅ Client connected:', socket.id);

        // Join user room for personal notifications + track online status
        socket.on('join_user', async (userId) => {
            if (userId) {
                const roomName = `user:${userId}`;
                socket.join(roomName);
                socketToUser.set(socket.id, userId);
                log(`👤 Socket ${socket.id} joined user room: ${roomName}`);

                // Track online status
                if (!onlineUsers.has(userId)) {
                    onlineUsers.set(userId, new Set());
                }
                const wasOffline = onlineUsers.get(userId).size === 0;
                onlineUsers.get(userId).add(socket.id);

                // If user just came online, update DB and broadcast
                if (wasOffline) {
                    try {
                        await prisma.user.update({
                            where: { id: userId },
                            data: { isOnline: true }
                        });
                        log(`🟢 User ${userId} is now ONLINE`);

                        // Broadcast to all workspaces the user belongs to
                        await broadcastUserStatus(userId, true);
                    } catch (err) {
                        console.error('Error updating user online status:', err);
                    }
                }
            }
        });

        // Join workspace room when client sends workspace info
        socket.on('join_workspace', (workspaceId) => {
            if (workspaceId) {
                // Leave all previous workspace rooms
                socket.rooms.forEach(room => {
                    if (room !== socket.id && (room.startsWith('workspace_') || room.startsWith('workspace:'))) {
                        socket.leave(room);
                    }
                });

                // Join new workspace room (support both formats for backwards compatibility)
                const roomName = `workspace:${workspaceId}`;
                const legacyRoomName = `workspace_${workspaceId}`;
                socket.join(roomName);
                socket.join(legacyRoomName);
                log(`📦 Socket ${socket.id} joined room: ${roomName}`);
            }
        });

        socket.on('leave_workspace', (workspaceId) => {
            if (workspaceId) {
                const roomName = `workspace:${workspaceId}`;
                const legacyRoomName = `workspace_${workspaceId}`;
                socket.leave(roomName);
                socket.leave(legacyRoomName);
                log(`📤 Socket ${socket.id} left room: ${roomName}`);
            }
        });

        socket.on('disconnect', async () => {
            log('❌ Client disconnected:', socket.id);

            const userId = socketToUser.get(socket.id);
            if (userId) {
                socketToUser.delete(socket.id);

                // Remove this socket from user's set
                const userSockets = onlineUsers.get(userId);
                if (userSockets) {
                    userSockets.delete(socket.id);

                    // If no more sockets, user is offline
                    if (userSockets.size === 0) {
                        onlineUsers.delete(userId);

                        try {
                            await prisma.user.update({
                                where: { id: userId },
                                data: {
                                    isOnline: false,
                                    lastSeenAt: new Date()
                                }
                            });
                            log(`🔴 User ${userId} is now OFFLINE`);

                            // Broadcast to all workspaces the user belongs to
                            await broadcastUserStatus(userId, false);
                        } catch (err) {
                            console.error('Error updating user offline status:', err);
                        }
                    }
                }
            }
        });
    });

    // On server start, reset all users to offline
    prisma.user.updateMany({
        data: { isOnline: false }
    }).then(() => {
        log('🔄 All users reset to offline on server start');
    }).catch(err => {
        console.error('Error resetting online statuses:', err);
    });

    return io;
};

// Broadcast user status change to all workspaces the user belongs to
async function broadcastUserStatus(userId, isOnline) {
    try {
        const memberships = await prisma.workspaceMember.findMany({
            where: { userId },
            select: { workspaceId: true }
        });

        const statusData = { userId, isOnline, lastSeenAt: new Date().toISOString() };

        memberships.forEach(({ workspaceId }) => {
            const roomName = `workspace:${workspaceId}`;
            const legacyRoomName = `workspace_${workspaceId}`;
            io.to(roomName).to(legacyRoomName).emit('user_status_changed', statusData);
            log(`📡 Broadcasted status change for user ${userId} (online=${isOnline}) to workspace ${workspaceId}`);
        });
    } catch (err) {
        console.error('Error broadcasting user status:', err);
    }
}

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};

// Get list of currently online user IDs
export const getOnlineUserIds = () => {
    return Array.from(onlineUsers.keys());
};

// Helper function to emit to a specific workspace
export const emitToWorkspace = (workspaceId, event, data) => {
    if (!io) {
        console.error('Socket.io not initialized!');
        return;
    }
    // Emit to both room formats for compatibility
    const roomName = `workspace:${workspaceId}`;
    const legacyRoomName = `workspace_${workspaceId}`;
    io.to(roomName).to(legacyRoomName).emit(event, data);
    log(`📡 Emitted '${event}' to room: ${roomName}`);
};

// Helper function to emit to a specific user
export const emitToUser = (userId, event, data) => {
    if (!io) {
        console.error('Socket.io not initialized!');
        return;
    }
    const roomName = `user:${userId}`;
    io.to(roomName).emit(event, data);
    log(`📡 Emitted '${event}' to user: ${roomName}`);
};

import { Server } from 'socket.io';

let io;
const isDev = process.env.NODE_ENV !== 'production';
const log = (...args) => isDev && console.log(...args);

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
        transports: ['polling', 'websocket']
    });

    io.on('connection', (socket) => {
        log('✅ Client connected:', socket.id);

        // Join user room for personal notifications
        socket.on('join_user', (userId) => {
            if (userId) {
                const roomName = `user:${userId}`;
                socket.join(roomName);
                log(`👤 Socket ${socket.id} joined user room: ${roomName}`);
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

        socket.on('disconnect', () => {
            log('❌ Client disconnected:', socket.id);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
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

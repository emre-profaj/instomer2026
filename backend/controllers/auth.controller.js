import bcrypt from 'bcryptjs';
import { validationResult } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { generateToken } from '../middleware/auth.middleware.js';

const prisma = new PrismaClient();

// Helper function to create slug from name
const createSlug = (name) => {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
};

export const register = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password, name, adminSecret } = req.body;

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Check for Admin Secret
        const SYSTEM_ADMIN_SECRET = process.env.ADMIN_SECRET || 'SUPER_SECRET_KEY_2025';
        const role = (adminSecret === SYSTEM_ADMIN_SECRET) ? 'SUPER_ADMIN' : 'USER';

        // Create user with automatic workspace
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                role, // Assign role
                workspaceMembers: {
                    create: {
                        role: 'OWNER',
                        workspace: {
                            create: {
                                name: `${name}'s Workspace`,
                                slug: `${createSlug(name)}-${Date.now()}`,
                                description: 'My personal workspace'
                            }
                        }
                    }
                }
            },
            include: {
                workspaceMembers: {
                    include: {
                        workspace: true
                    }
                }
            }
        });

        // Generate token
        const token = generateToken(user);

        // Get the created workspace
        const workspace = user.workspaceMembers[0]?.workspace;

        res.status(201).json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            },
            workspace: workspace ? {
                id: workspace.id,
                name: workspace.name,
                slug: workspace.slug
            } : null,
            token
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
};

export const login = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;

        // Find user with workspaces
        const user = await prisma.user.findUnique({
            where: { email },
            include: {
                workspaceMembers: {
                    include: {
                        workspace: {
                            include: {
                                _count: {
                                    select: {
                                        facebookPages: true,
                                        conversations: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!user || !user.password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate token
        const token = generateToken(user);

        // INTELLIGENT WORKSPACE SELECTION
        // Sort workspaces by "activity score" (pages + conversations)
        const sortedMembers = user.workspaceMembers.sort((a, b) => {
            const scoreA = (a.workspace._count?.facebookPages || 0) * 10 + (a.workspace._count?.conversations || 0);
            const scoreB = (b.workspace._count?.facebookPages || 0) * 10 + (b.workspace._count?.conversations || 0);

            console.log(`Workspace: ${a.workspace.name}, Score: ${scoreA}, Conversations: ${a.workspace._count?.conversations}`);
            console.log(`Workspace: ${b.workspace.name}, Score: ${scoreB}, Conversations: ${b.workspace._count?.conversations}`);

            if (scoreB !== scoreA) {
                return scoreB - scoreA; // Descending by score
            }

            // If scores are equal, prefer the OLDEST one (usually the main one)
            // The user reported that the newer empty one was taking precedence
            return new Date(a.workspace.createdAt) - new Date(b.workspace.createdAt);
        });

        // Select the "best" workspace
        const bestWorkspace = sortedMembers[0]?.workspace;

        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                avatar: user.avatar
            },
            workspace: bestWorkspace ? {
                id: bestWorkspace.id,
                name: bestWorkspace.name,
                slug: bestWorkspace.slug,
                members: [{
                    userId: user.id,
                    role: sortedMembers[0].role
                }]
            } : null,
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
};

export const facebookCallback = async (req, res) => {
    try {
        const user = req.user;

        // Determine target workspace
        let workspaceMember = null;
        let targetWorkspaceId = null;

        // Try to get workspaceId from state (sent from frontend)
        if (req.query.state) {
            try {
                const stateObj = JSON.parse(decodeURIComponent(req.query.state));
                if (stateObj.workspaceId) {
                    targetWorkspaceId = stateObj.workspaceId;
                    console.log('📝 Using workspace from state:', targetWorkspaceId);
                }
            } catch (e) {
                console.error('Failed to parse state for workspace:', e.message);
            }
        }

        // Priority 1: Use workspace from state if user is a member
        if (targetWorkspaceId) {
            workspaceMember = await prisma.workspaceMember.findUnique({
                where: {
                    userId_workspaceId: {
                        userId: user.id,
                        workspaceId: targetWorkspaceId
                    }
                },
                include: { workspace: true }
            });

            if (workspaceMember) {
                console.log('✅ Using workspace from state:', workspaceMember.workspace.name);
            }
        }

        // Priority 2: Find any existing workspace for this user
        if (!workspaceMember) {
            workspaceMember = await prisma.workspaceMember.findFirst({
                where: { userId: user.id },
                include: { workspace: true }
            });

            if (workspaceMember) {
                console.log('✅ Using existing user workspace:', workspaceMember.workspace.name);
            }
        }

        // Priority 3: Create new workspace ONLY if user has no workspace at all
        if (!workspaceMember) {
            console.log('⚠️ Creating new workspace for user:', user.email);
            const workspace = await prisma.workspace.create({
                data: {
                    name: `${user.name}'s Workspace`,
                    slug: `${createSlug(user.name)}-${Date.now()}`,
                    description: 'My personal workspace',
                    members: {
                        create: {
                            userId: user.id,
                            role: 'OWNER'
                        }
                    }
                }
            });

            workspaceMember = {
                workspace: workspace,
                userId: user.id,
                role: 'OWNER'
            };
        }

        // Determine channel type from state
        let channelType = 'facebook'; // default
        if (req.query.state) {
            try {
                const stateObj = JSON.parse(decodeURIComponent(req.query.state));
                if (stateObj.channelType) {
                    channelType = stateObj.channelType;
                    console.log('📝 Channel type from state:', channelType);
                }
            } catch (e) {
                console.error('Failed to parse channel type from state:', e.message);
            }
        }

        // Fetch and save Facebook pages automatically
        let permissionsData = [];
        let pages = [];

        if (user.facebookAccessToken) {
            console.log('Fetching Facebook pages for user:', user.name, '| Channel type:', channelType);
            try {
                const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v18.0';

                // DEBUG: Check permissions
                try {
                    const permResponse = await axios.get(
                        `https://graph.facebook.com/${GRAPH_API_VERSION}/me/permissions`,
                        { params: { access_token: user.facebookAccessToken } }
                    );
                    permissionsData = permResponse.data?.data || [];
                    console.log('🛑 [DEBUG] Granted Permissions:', JSON.stringify(permResponse.data));
                } catch (permError) {
                    console.error('🛑 [DEBUG] Error checking permissions:', permError.response?.data || permError.message);
                }

                const response = await axios.get(
                    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts`,
                    {
                        params: {
                            access_token: user.facebookAccessToken,
                            fields: 'id,name,access_token,category,instagram_business_account{id,username}'
                        }
                    }
                );

                console.log('🛑 [DEBUG] Raw Accounts Response:', JSON.stringify(response.data));

                pages = response.data.data || [];
                console.log(`Found ${pages.length} Facebook pages`);

                // Filter pages based on channel type
                if (channelType === 'instagram') {
                    // Only pages with Instagram business account
                    pages = pages.filter(p => p.instagram_business_account?.id);
                    console.log(`Filtered to ${pages.length} pages with Instagram accounts`);
                } else if (channelType === 'facebook') {
                    // For Facebook, show all pages but don't include Instagram info in display
                    console.log(`Showing ${pages.length} Facebook pages`);
                } else if (channelType === 'whatsapp') {
                    // Don't save any pages for WhatsApp - user will select from modal
                    pages = [];
                    console.log('WhatsApp channel - skipping page save, user will select from modal');
                }

                // DON'T auto-save pages - let user select which page to connect to this workspace
                // Pages will be sent to frontend for selection
                console.log(`Found ${pages.length} available pages for workspace: ${workspaceMember.workspace.name} - User will select which to connect`);
            } catch (pageError) {
                console.error('Error fetching Facebook pages:', pageError.response?.data || pageError.message);
            }
        } else {
            console.log('No Facebook access token found for user');
        }

        const token = generateToken(user);

        // Prepare available pages for frontend selection modal
        // Only include Instagram info if channel type is instagram
        const availablePages = pages.map(p => ({
            id: p.id,
            name: p.name,
            access_token: p.access_token,
            category: p.category,
            instagram_business_account: channelType === 'instagram' ? p.instagram_business_account : null
        }));

        // DEBUG: Prepare logs for frontend
        const debugInfo = {
            grantedPermissions: permissionsData,
            foundPagesCount: pages.length,
            pageNames: pages.map(p => p.name),
            workspaceId: workspaceMember.workspace.id
        };

        // Determine frontend URL for redirect
        const frontendUrl = process.env.FRONTEND_URL || 'https://app.instomer.com';

        // Create OAuth result data
        const oauthResult = {
            type: 'FACEBOOK_AUTH_SUCCESS',
            token: token,
            workspaceId: workspaceMember.workspace.id,
            channelType: channelType,
            availablePages: availablePages,
            timestamp: Date.now()
        };

        // Send HTML that closes popup
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Bağlantı Başarılı</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                    }
                    .success-icon {
                        font-size: 64px;
                        margin-bottom: 20px;
                    }
                    h2 { margin: 0 0 10px 0; }
                    p { margin: 0; opacity: 0.9; }
                </style>
            </head>
            <body>
                <div class="success-icon">✅</div>
                <h2>Bağlantı Başarılı!</h2>
                <p>Bu pencere otomatik kapanacak...</p>
                
                <script>
                    (function() {
                        console.log('🔐 [OAuth] Saving result to localStorage...');
                        
                        // Always save to localStorage - this is our primary communication method
                        try {
                            localStorage.setItem('oauth_result', JSON.stringify(${JSON.stringify(oauthResult)}));
                            localStorage.setItem('token', '${token}');
                            console.log('🔐 [OAuth] Result saved to localStorage');
                        } catch(e) {
                            console.error('🔐 [OAuth] localStorage error:', e);
                        }
                        
                        // Also try postMessage if opener exists
                        if (window.opener && !window.opener.closed) {
                            try {
                                window.opener.postMessage(${JSON.stringify(oauthResult)}, '*');
                                console.log('🔐 [OAuth] postMessage sent to opener');
                            } catch(e) {
                                console.log('🔐 [OAuth] postMessage failed, using localStorage');
                            }
                        }
                        
                        // Close popup after a short delay
                        setTimeout(function() {
                            window.close();
                        }, 1000);
                        
                        // If popup doesn't close (some browsers block it), show manual close message
                        setTimeout(function() {
                            document.querySelector('p').textContent = 'Pencere kapanmadıysa manuel kapatabilirsiniz.';
                        }, 2000);
                    })();
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Facebook callback error:', error);
        res.send(`
            <!DOCTYPE html>
            <html>
            <body>
                <script>
                    if (window.opener) {
                        window.opener.postMessage({ type: 'FACEBOOK_AUTH_ERROR' }, '*');
                    }
                    window.close();
                </script>
                <h2>Hata oluştu. Lütfen tekrar deneyin.</h2>
            </body>
            </html>
        `);
    }
};


export const getCurrentUser = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                email: true,
                name: true,
                avatar: true,
                role: true,
                createdAt: true
            }
        });

        res.json({ user });
    } catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
};

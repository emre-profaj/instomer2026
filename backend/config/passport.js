import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// JWT Strategy
const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET
};

passport.use(
    new JwtStrategy(jwtOptions, async (payload, done) => {
        try {
            const user = await prisma.user.findUnique({
                where: { id: payload.id }
            });

            if (user) {
                return done(null, user);
            }
            return done(null, false);
        } catch (error) {
            return done(error, false);
        }
    })
);

// Facebook Strategy
passport.use(
    new FacebookStrategy(
        {
            clientID: process.env.FACEBOOK_APP_ID,
            clientSecret: process.env.FACEBOOK_APP_SECRET,
            callbackURL: process.env.FACEBOOK_CALLBACK_URL,
            profileFields: ['id', 'emails', 'name', 'picture.type(large)'],
            graphAPIVersion: process.env.FACEBOOK_GRAPH_API_VERSION || 'v18.0',
            passReqToCallback: true // Enable request object access
        },
        async (req, accessToken, refreshToken, profile, done) => {
            try {
                let user = null;

                // Parse state parameter (it's a JSON string with token and workspaceId)
                let token = null;
                let hasTokenInState = false;

                console.log('🔍 [OAuth] Raw state from query:', req.query.state);

                if (req.query.state) {
                    try {
                        const stateObj = JSON.parse(decodeURIComponent(req.query.state));
                        token = stateObj.token;
                        hasTokenInState = !!token;
                        console.log('📝 [OAuth] Parsed state:', {
                            hasToken: hasTokenInState,
                            workspaceId: stateObj.workspaceId
                        });
                    } catch (parseError) {
                        console.error('❌ [OAuth] Failed to parse state:', parseError.message);
                        // Fallback: try using state directly as token (for backward compatibility)
                        token = req.query.state;
                        hasTokenInState = !!token;
                    }
                }

                // CRITICAL: If token exists, we MUST link to that user - never create new user
                if (token && token !== 'undefined' && token !== 'null') {
                    try {
                        const jwt = await import('jsonwebtoken');
                        const decoded = jwt.default.verify(token, process.env.JWT_SECRET);
                        console.log('✅ [OAuth] Token verified for user ID:', decoded.id);

                        if (decoded && decoded.id) {
                            // Find existing user by ID from token
                            const currentUser = await prisma.user.findUnique({
                                where: { id: decoded.id }
                            });

                            if (currentUser) {
                                console.log('✅ [OAuth] Linking Facebook to existing user:', currentUser.email);
                                
                                // Check if this Facebook account is already linked to another user
                                const existingFacebookUser = await prisma.user.findUnique({
                                    where: { facebookId: profile.id }
                                });
                                
                                if (existingFacebookUser && existingFacebookUser.id !== currentUser.id) {
                                    // Facebook is linked to another user - just update the access token for current user
                                    // This allows multiple CRM users to use the same Facebook admin account
                                    console.log('⚠️ [OAuth] Facebook already linked to:', existingFacebookUser.email);
                                    console.log('📝 [OAuth] Just updating access token for current user (shared Facebook admin account)');
                                    
                                    user = await prisma.user.update({
                                        where: { id: currentUser.id },
                                        data: {
                                            facebookAccessToken: accessToken,
                                            // Don't set facebookId since it's already on another user
                                        }
                                    });
                                } else {
                                    // Either no one has this Facebook or current user already has it
                                    user = await prisma.user.update({
                                        where: { id: currentUser.id },
                                        data: {
                                            facebookId: profile.id,
                                            facebookAccessToken: accessToken,
                                            // Update name and avatar from Facebook if missing
                                            name: currentUser.name || `${profile.name.givenName} ${profile.name.familyName}`,
                                            avatar: currentUser.avatar || profile.photos?.[0]?.value
                                        }
                                    });
                                }
                                
                                console.log('✅ [OAuth] Successfully updated Facebook token for:', user.email);
                                return done(null, user);
                            } else {
                                console.error('❌ [OAuth] User from token not found in database');
                                return done(new Error('User from token not found'));
                            }
                        }
                    } catch (tokenError) {
                        console.error('❌ [OAuth] Token verification failed:', tokenError.message);
                        // CRITICAL: If token was provided but verification failed, reject OAuth
                        // This prevents creating duplicate users
                        return done(new Error('Invalid authentication token. Please login again.'));
                    }
                }

                // If we reach here, there was NO token in state
                // This means it's a standalone OAuth login (not linking to existing account)
                console.log('ℹ️ [OAuth] No token in state - checking for existing user by Facebook ID or email');

                // Standard Flow: Check if user exists by Facebook ID
                user = await prisma.user.findUnique({
                    where: { facebookId: profile.id }
                });

                if (!user) {
                    const email = profile.emails?.[0]?.value;

                    if (email) {
                        // Check if user exists with this email
                        const existingUser = await prisma.user.findUnique({
                            where: { email }
                        });

                        if (existingUser) {
                            console.log('✅ [OAuth] Linking Facebook to existing user by email:', email);
                            // Link Facebook to existing account
                            user = await prisma.user.update({
                                where: { id: existingUser.id },
                                data: {
                                    facebookId: profile.id,
                                    facebookAccessToken: accessToken,
                                    avatar: existingUser.avatar || profile.photos?.[0]?.value
                                }
                            });
                        }
                    }

                    if (!user) {
                        console.log('⚠️ [OAuth] Creating new user for Facebook ID:', profile.id);
                        // Create new user if still not found
                        user = await prisma.user.create({
                            data: {
                                facebookId: profile.id,
                                email: email || `${profile.id}@facebook.com`,
                                name: `${profile.name.givenName} ${profile.name.familyName}`,
                                avatar: profile.photos?.[0]?.value,
                                facebookAccessToken: accessToken
                            }
                        });
                    }
                } else {
                    // Update access token
                    user = await prisma.user.update({
                        where: { id: user.id },
                        data: { facebookAccessToken: accessToken }
                    });
                }

                return done(null, user);
            } catch (error) {
                return done(error, false);
            }
        }
    )
);

export default passport;

import express from 'express';
import passport from 'passport';
import { body } from 'express-validator';
import {
    register,
    login,
    facebookCallback,
    getCurrentUser,
    updateProfile,
    changePassword
} from '../controllers/auth.controller.js';
import { authenticateJWT } from '../middleware/auth.middleware.js';

const router = express.Router();

// Register
router.post(
    '/register',
    [
        body('email').isEmail().withMessage('Valid email is required'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
        body('name').notEmpty().withMessage('Name is required')
    ],
    register
);

// Login
router.post(
    '/login',
    [
        body('email').isEmail().withMessage('Valid email is required'),
        body('password').notEmpty().withMessage('Password is required')
    ],
    login
);

// Facebook OAuth - Dynamic scopes based on channel type
router.get(
    '/facebook',
    (req, res, next) => {
        // Pass state parameter to passport
        const state = req.query.state;
        
        // Parse channel type from state
        let channelType = 'facebook';
        if (state) {
            try {
                const stateObj = JSON.parse(decodeURIComponent(state));
                channelType = stateObj.channelType || 'facebook';
            } catch (e) {
                console.log('Could not parse state for channel type');
            }
        }
        
        // Build scopes based on channel type
        let scopes = ['email'];
        
        if (channelType === 'facebook') {
            // Only Facebook page permissions
            scopes = [
                'email',
                'pages_show_list',
                'pages_messaging',
                'pages_manage_metadata',
                'pages_manage_posts',
                'leads_retrieval',
                'pages_manage_ads',
                'pages_manage_engagement',
                'pages_read_engagement',
                'pages_read_user_content',
                'business_management'
            ];
        } else if (channelType === 'instagram') {
            // Facebook page + Instagram permissions
            scopes = [
                'email',
                'pages_show_list',
                'pages_messaging',
                'pages_manage_metadata',
                'pages_read_engagement',
                'business_management',
                'instagram_basic',
                'instagram_manage_messages',
                'instagram_manage_comments'
            ];
        } else if (channelType === 'whatsapp') {
            // Only WhatsApp permissions
            scopes = [
                'email',
                'business_management',
                'whatsapp_business_management',
                'whatsapp_business_messaging'
            ];
        }
        
        console.log(`📱 OAuth for channel: ${channelType}, scopes:`, scopes);
        
        passport.authenticate('facebook', {
            scope: scopes,
            authType: 'rerequest', // Force re-authentication to show permissions dialog
            state: state // Pass state to Facebook OAuth
        })(req, res, next);
    }
);

router.get(
    '/facebook/callback',
    passport.authenticate('facebook', { session: false, failureRedirect: '/login' }),
    facebookCallback
);

// Get current user
router.get('/me', authenticateJWT, getCurrentUser);

// Update profile & password
router.put('/profile', authenticateJWT, updateProfile);
router.put('/change-password', authenticateJWT, changePassword);

export default router;

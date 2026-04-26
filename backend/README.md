# Chatinstomer Backend

Backend API for Chatwoot-style customer engagement platform.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

3. Update `.env` with your database and Facebook credentials

4. Initialize Prisma:
```bash
npx prisma generate
npx prisma migrate dev --name init
```

5. Start development server:
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/facebook` - Facebook OAuth
- `GET /api/auth/me` - Get current user

### Workspaces
- `POST /api/workspaces` - Create workspace
- `GET /api/workspaces` - List workspaces
- `GET /api/workspaces/:id` - Get workspace
- `POST /api/workspaces/:id/members` - Add member
- `PUT /api/workspaces/:id/members/:userId` - Update member role

### Facebook
- `POST /api/facebook/pages/connect` - Connect Facebook page
- `GET /api/facebook/pages/:workspaceId` - List connected pages
- `GET /api/facebook/webhook` - Webhook verification
- `POST /api/facebook/webhook` - Webhook handler

### Conversations
- `GET /api/conversations/:workspaceId` - List conversations
- `GET /api/conversations/:workspaceId/:id` - Get conversation
- `POST /api/conversations/:workspaceId/:id/messages` - Send message
- `PUT /api/conversations/:workspaceId/:id/assign` - Assign agent
- `PUT /api/conversations/:workspaceId/:id/status` - Update status

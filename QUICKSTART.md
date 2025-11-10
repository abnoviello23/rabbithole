# Quick Start Guide - Authentication Setup

## What Was Just Implemented

✅ Google OAuth authentication using NextAuth
✅ Protected backend API endpoints
✅ JWT token verification
✅ Sign in/out UI components

## Setup Steps (Do These Now)

### 1. Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

This will install:
- `pyjwt` - JWT token handling
- `cryptography` - Cryptographic operations
- `google-auth` - Google token verification

### 2. Set Up Google OAuth

Follow the detailed guide in `SETUP_AUTH.md`, or quick version:

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 credentials
3. Add redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Save Client ID and Client Secret

### 3. Configure Frontend Environment

```bash
cd frontend
cp .env.local.example .env.local
```

Edit `.env.local`:
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=$(openssl rand -base64 32)  # Generate this!
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-client-secret>
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 4. Update Backend Environment

Edit `backend/.env` and add:
```env
GOOGLE_CLIENT_ID=<same-as-frontend>
FRONTEND_URL=http://localhost:3000
```

### 5. Start the Application

Terminal 1 (Backend):
```bash
cd backend
uvicorn main:app --reload
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

### 6. Test It Out

1. Open http://localhost:3000
2. Click "Sign in with Google"
3. Authorize the app
4. You should see your profile in the top right
5. Try creating a node - it should work!

## What's Protected

All API endpoints now require authentication:
- `POST /generate` - Generate content
- `POST /automode` - Auto mode search
- `POST /cluster` - Cluster nodes

The health check endpoint `GET /` remains public.

## Troubleshooting

### "Security() got an unexpected keyword argument 'auto_error'"
✅ **FIXED** - This error has been resolved in the latest code.

### "ModuleNotFoundError: No module named 'fastapi'"
Run: `pip install -r requirements.txt` in the backend directory

### "Redirect URI mismatch"
Make sure you added `http://localhost:3000/api/auth/callback/google` to Google Console

### "Unauthorized" errors
- Check `GOOGLE_CLIENT_ID` matches in both frontend and backend
- Make sure you're signed in
- Check browser console for errors

### CORS errors
- Verify `FRONTEND_URL=http://localhost:3000` in backend `.env`
- Restart both frontend and backend

## File Changes Summary

**Backend:**
- ✅ `backend/auth.py` - New authentication module (fixed)
- ✅ `backend/main.py` - Protected endpoints with auth
- ✅ `backend/requirements.txt` - Added auth dependencies

**Frontend:**
- ✅ `frontend/app/api/auth/[...nextauth]/route.ts` - NextAuth handler
- ✅ `frontend/app/components/SignIn.tsx` - Sign in UI
- ✅ `frontend/app/components/Providers.tsx` - Session provider
- ✅ `frontend/app/page.tsx` - Auth-gated main page
- ✅ `frontend/app/utils/api.ts` - API calls with auth headers
- ✅ `frontend/types/next-auth.d.ts` - TypeScript types

Ready to go! 🚀

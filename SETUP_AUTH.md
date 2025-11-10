# Authentication Setup Guide

This guide will help you set up Google OAuth authentication for the RabbitHole app.

## Prerequisites

- Google Cloud Console account
- Node.js and npm installed
- Python 3.8+ installed

## Step 1: Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the **Google+ API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Google+ API"
   - Click "Enable"

4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Web application"
   - Add authorized redirect URIs:
     - Development: `http://localhost:3000/api/auth/callback/google`
     - Production: `https://yourdomain.com/api/auth/callback/google`
   - Click "Create"
   - **Save the Client ID and Client Secret**

## Step 2: Frontend Environment Setup

1. Copy the example environment file:
   ```bash
   cd frontend
   cp .env.local.example .env.local
   ```

2. Edit `.env.local` and fill in the values:
   ```env
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=<generate-this>
   GOOGLE_CLIENT_ID=<from-google-console>
   GOOGLE_CLIENT_SECRET=<from-google-console>
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

3. Generate `NEXTAUTH_SECRET`:
   ```bash
   openssl rand -base64 32
   ```

## Step 3: Backend Environment Setup

1. Update your backend `.env` file:
   ```bash
   cd backend
   # Edit .env and add the following
   ```

2. Add to `.env`:
   ```env
   OPENAI_API_KEY=<your-existing-key>
   GOOGLE_CLIENT_ID=<same-as-frontend>
   FRONTEND_URL=http://localhost:3000
   ```

## Step 4: Install Dependencies

### Frontend
```bash
cd frontend
# next-auth is already installed
```

### Backend
```bash
cd backend
pip install pyjwt cryptography google-auth
# Or reinstall all dependencies:
pip install -r requirements.txt
```

## Step 5: Start the Application

1. Start the backend:
   ```bash
   cd backend
   uvicorn main:app --reload
   ```

2. Start the frontend (in a new terminal):
   ```bash
   cd frontend
   npm run dev
   ```

3. Open your browser to `http://localhost:3000`

## Step 6: Test Authentication

1. Click "Sign in with Google"
2. You'll be redirected to Google OAuth
3. Grant permissions
4. You'll be redirected back to the app
5. You should see your profile in the top-right corner
6. Try creating a node - API requests now include your auth token

## Troubleshooting

### "Redirect URI mismatch" error
- Make sure you added the correct redirect URI in Google Console
- Development: `http://localhost:3000/api/auth/callback/google`
- Ensure there are no trailing slashes

### "Unauthorized" errors from backend
- Check that `GOOGLE_CLIENT_ID` matches in both frontend and backend `.env` files
- Make sure backend dependencies are installed
- Check backend logs for specific error messages

### CORS errors
- Verify `FRONTEND_URL` in backend `.env` matches your frontend URL
- Check that backend is running on port 8000
- Check that frontend is running on port 3000

### Session not persisting
- Make sure `NEXTAUTH_SECRET` is set in frontend `.env.local`
- Clear browser cookies and try again
- Check browser console for errors

## Production Deployment

For production:

1. Update `NEXTAUTH_URL` to your production domain
2. Add production redirect URI to Google Console
3. Update `FRONTEND_URL` in backend to production URL
4. Use environment-specific secrets (never commit `.env` files!)
5. Consider using a database session strategy instead of JWT for better security

## Security Notes

- Never commit `.env` or `.env.local` files to git
- Rotate your `NEXTAUTH_SECRET` regularly
- Keep your Google Client Secret secure
- Use HTTPS in production
- Consider implementing rate limiting
- Add session expiry handling

## Next Steps

You can now:
- Add user-specific features (save sessions per user)
- Implement role-based access control
- Add more OAuth providers (GitHub, Microsoft, etc.)
- Track user activity
- Add per-user rate limiting

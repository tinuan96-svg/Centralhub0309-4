# Authentication System Guide

## Overview

The application now has a complete authentication system that protects all routes and requires users to log in before accessing any pages.

## How It Works

### 1. **AuthProvider Component**
- Located at `/components/AuthProvider.tsx`
- Wraps the entire application
- Checks authentication status on every page
- Automatically redirects unauthenticated users to `/login`
- Manages auth state globally using React Context

### 2. **Protected Routes**
- **All routes require authentication** except `/login`
- Unauthenticated users are automatically redirected to the login page
- After successful login, users are redirected to `/dashboard`

### 3. **Login Page**
- Located at `/app/login/page.tsx`
- Uses Supabase email/password authentication
- Simple, clean UI with email and password fields
- Shows error messages if login fails

### 4. **Logout Functionality**

#### Desktop (Topbar)
- User avatar and email shown in top-right corner
- "Logout" button next to user info
- Clicking logout signs out and redirects to login page

#### Mobile (MobileHeader)
- User avatar button in top-right corner
- Tap to open account menu modal
- Shows user email and logout button
- Logout redirects to login page

## User Flow

1. **First Visit (Not Logged In)**
   - User arrives at any page
   - AuthProvider detects no authentication
   - User is redirected to `/login`

2. **Login**
   - User enters email and password
   - On success, redirected to `/dashboard`
   - Session is stored securely by Supabase

3. **Using the App (Logged In)**
   - User can navigate freely to all pages
   - Session persists across page refreshes
   - User info shown in header

4. **Logout**
   - Desktop: Click "Logout" button in topbar
   - Mobile: Tap user avatar → tap "Logout"
   - Session is cleared
   - Redirected to login page

## Technical Details

### Authentication Flow
```
User visits page → AuthProvider checks session
  ↓
  ├─ Has session? → Show page
  │
  └─ No session? → Redirect to /login
       ↓
       Login successful → Redirect to /dashboard
```

### Key Files Modified

1. **`/app/layout.tsx`**
   - Added `AuthProvider` wrapper
   - All pages now protected by auth

2. **`/components/AuthProvider.tsx`** (NEW)
   - Global auth state management
   - Auto-redirect logic
   - Session monitoring

3. **`/components/MobileLayout.tsx`**
   - Detects login page
   - Hides navigation on login page
   - Shows full navigation when authenticated

4. **`/components/MobileHeader.tsx`**
   - Added user menu modal
   - Shows user avatar
   - Logout functionality

5. **`/components/Topbar.tsx`**
   - Already had logout button
   - Works with new auth system

## Session Management

- Sessions are managed by Supabase Auth
- Sessions persist in browser storage
- Sessions are validated on every page load
- Auth state changes are monitored in real-time

## Security Features

- All routes protected by default
- Server-side session validation
- Secure password handling by Supabase
- Automatic token refresh
- HTTPS required in production

## Default Credentials

To create an admin user, run the Edge Function:
```bash
# This creates an admin user with email/password
# Check supabase/functions/setup-admin/index.ts for details
```

## Troubleshooting

### "Cannot access pages without logging in"
- This is the expected behavior
- All pages require authentication

### "Logout doesn't work"
- Check browser console for errors
- Verify Supabase connection in `.env`

### "Stuck in loading state"
- Clear browser cache and cookies
- Check network tab for API errors
- Verify Supabase credentials

## Environment Variables Required

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

These should already be configured in your `.env` file.

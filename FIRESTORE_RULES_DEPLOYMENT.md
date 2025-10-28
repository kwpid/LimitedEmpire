# Deploy Firestore Security Rules

## Overview
Your Firestore security rules have been created in the `firestore.rules` file. These rules are essential for securing your audit logs and other collections.

## What Was Fixed

### 1. Audit Logs Security Rules
Added rules to allow only admins to read and create audit logs:
```javascript
match /auditLogs/{logId} {
  allow read: if isAdmin();
  allow create: if isAdmin() &&
                  request.resource.data.timestamp is int &&
                  request.resource.data.adminId is string &&
                  request.resource.data.actionType is string;
  allow update: if false;
  allow delete: if false;
}
```

### 2. Webhook Authentication
Implemented secure Firebase Admin SDK-based authentication:
- **Client sends Firebase ID tokens**: Client uses `auth.currentUser.getIdToken()` to get tokens
- **Server verifies tokens**: Firebase Admin SDK verifies tokens cryptographically
- **Server checks admin status**: Admin SDK queries Firestore to verify `isAdmin: true`
- **No secrets in bundle**: Only Firebase ID tokens are sent (not shared secrets)
- **Defense-in-depth**: Both Firestore rules AND server-side checks prevent unauthorized access

**Security layers:**
1. Client-side: Only admins can create items/audit logs (Firestore rules)
2. Server-side: Webhook endpoints verify admin status before sending to Discord
3. Result: Even if Firestore rules are bypassed, webhooks still require admin verification

## How to Deploy Firestore Rules

### Step 1: Open Firebase Console
1. Go to https://console.firebase.google.com/
2. Select your project

### Step 2: Navigate to Firestore Rules
1. Click on **Firestore Database** in the left sidebar
2. Click on the **Rules** tab at the top

### Step 3: Copy and Deploy Rules
1. Open the `firestore.rules` file in your Replit project
2. Copy the entire contents of the file
3. Paste it into the Firebase Console rules editor (replacing all existing rules)
4. Click **Publish** to deploy the rules

### Step 4: Verify Deployment
After publishing, you should see:
- A success message in the Firebase Console
- The rules are now active and protecting your database

## Testing the Fixes

### Test 1: Audit Logs
1. Log in as an admin user
2. Go to the Admin Panel
3. Navigate to the Audit Log tab
4. You should now be able to see audit logs without permission errors

### Test 2: Webhooks
1. Create a new item as an admin
2. Check your Discord channels:
   - Item release webhook should appear in the configured channel
   - Admin log webhook should appear in the configured channel

## Important Notes

⚠️ **The rules MUST be deployed in Firebase Console** - The `firestore.rules` file in your project is just a reference copy. Firestore only uses rules that are deployed through the Firebase Console.

✅ **Required environment variables**:
- `DISCORD_WEBHOOK_ITEM_RELEASE` - for item release notifications
- `DISCORD_WEBHOOK_ADMIN_LOG` - for admin action logs
- `FIREBASE_PROJECT_ID` - Firebase project ID (same as VITE_FIREBASE_PROJECT_ID)
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to Firebase service account JSON file

⚠️ **CRITICAL: Firebase Admin SDK Setup Required**:
The webhooks and audit logs will NOT work until you complete this setup:

1. **Download Firebase Service Account:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Go to Project Settings (gear icon) → Service Accounts tab
   - Click "Generate New Private Key" button
   - Download the JSON file

2. **Upload to Replit:**
   - In your Replit project, create a file named `firebase-service-account.json`
   - Copy the contents of the downloaded JSON file into it
   - ⚠️ Keep this file private - don't share it publicly

3. **Set Environment Variables:**
   - Add `FIREBASE_PROJECT_ID` with your Firebase project ID
   - Add `GOOGLE_APPLICATION_CREDENTIALS` with value: `firebase-service-account.json`

4. **Restart the Server:**
   - The server will automatically pick up the credentials and start working

⚠️ **No longer needed** (can be removed):
- `ADMIN_WEBHOOK_SECRET` - replaced with Firebase Admin SDK
- `VITE_ADMIN_WEBHOOK_SECRET` - replaced with Firebase Admin SDK

## Troubleshooting

**"Missing or insufficient permissions" error:**
- Make sure you've deployed the rules in Firebase Console
- Verify you're logged in as an admin user (`isAdmin: true` in Firestore)
- Check that the rules published successfully

**Webhooks not sending:**
- Verify the Discord webhook URLs are correctly configured in Replit Secrets
- Check the browser console for authentication errors
- Ensure you're logged in as an admin user
- Verify the server has access to `VITE_FIREBASE_API_KEY` and `VITE_FIREBASE_PROJECT_ID`

**Firebase still showing invalid-api-key:**
- You need to configure Firebase authentication secrets (separate from webhook fixes)
- See `FIREBASE_SETUP_INSTRUCTIONS.md` for details

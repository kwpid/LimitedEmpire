# Webhook and Audit Log Fixes - Complete

## What Was Fixed

### 1. Discord Webhooks Not Working ✅
**Problem:** You created an item but nothing appeared in Discord.

**Root Cause:** The webhook authentication was using a hardcoded shared secret that needed to be configured.

**Solution:** Implemented secure Firebase Admin SDK-based authentication:
- Client sends Firebase ID tokens (no secrets in browser)
- Server verifies tokens using Firebase Admin SDK
- Server checks if user is admin before sending webhooks
- Discord webhooks configured via environment variables

### 2. Audit Log Permission Errors ✅
**Problem:** Error: "Missing or insufficient permissions" when viewing audit logs.

**Root Cause:** Missing Firestore security rules for the `auditLogs` collection.

**Solution:** Created comprehensive Firestore security rules that:
- Allow only admins to read audit logs
- Allow only admins to create audit logs  
- Prevent anyone from editing or deleting audit logs

## What You Need to Do

### Step 1: Deploy Firestore Security Rules

The security rules have been created in `firestore.rules`, but you need to deploy them:

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Firestore Database** → **Rules** tab
4. Copy ALL contents from the `firestore.rules` file in this project
5. Paste into the Firebase Console rules editor (replace everything)
6. Click **Publish**

### Step 2: Set Up Firebase Service Account

The webhook system needs a Firebase service account to verify admin status:

1. **Download Service Account:**
   - In Firebase Console, go to Project Settings (gear icon) → Service Accounts tab
   - Click "Generate New Private Key"
   - Download the JSON file

2. **Upload to Replit:**
   - Create a new file named `firebase-service-account.json`
   - Paste the contents of the downloaded JSON file
   - ⚠️ **IMPORTANT:** Don't share this file - it contains sensitive credentials

3. **Configure Environment Variables:**
   - Go to Replit Secrets (lock icon in sidebar)
   - Add `FIREBASE_PROJECT_ID` with your Firebase project ID
   - Add `GOOGLE_APPLICATION_CREDENTIALS` with value: `firebase-service-account.json`

4. **Restart the Server:**
   - The server will automatically restart and pick up the new credentials

### Step 3: Test Everything

Once you've completed steps 1 and 2:

1. **Test Audit Logs:**
   - Log in as an admin
   - Go to Admin Panel → Audit Log tab
   - You should see audit logs without permission errors

2. **Test Webhooks:**
   - Create a new item as an admin
   - Check your Discord channels for:
     - Item release notification
     - Admin log notification

## Security Improvements

The old system had a critical security flaw: the admin secret was exposed in the client bundle, allowing anyone to spam your Discord webhooks.

The new system is secure:
✅ No secrets in client code
✅ Firebase tokens are cryptographically verified
✅ Admin status is checked from Firestore
✅ Both Firestore rules AND server-side checks prevent unauthorized access

## Files Created/Modified

- `firestore.rules` - Firestore security rules including audit logs
- `server/lib/firebase-admin.ts` - Firebase Admin SDK initialization
- `server/routes.ts` - Secure webhook endpoints
- `client/src/lib/webhook-client.ts` - Updated to send Firebase ID tokens
- `FIRESTORE_RULES_DEPLOYMENT.md` - Detailed deployment guide
- `firebase-admin` npm package installed

## Environment Variables

### Required:
- `DISCORD_WEBHOOK_ITEM_RELEASE` ✅ (already configured)
- `DISCORD_WEBHOOK_ADMIN_LOG` ✅ (already configured)
- `FIREBASE_PROJECT_ID` ⚠️ (need to add)
- `GOOGLE_APPLICATION_CREDENTIALS` ⚠️ (need to add)

### No Longer Needed (can delete):
- `ADMIN_WEBHOOK_SECRET` - replaced with Firebase Admin SDK
- `VITE_ADMIN_WEBHOOK_SECRET` - replaced with Firebase Admin SDK

## Troubleshooting

**Server won't start:**
- Make sure you've created the `firebase-service-account.json` file
- Verify `FIREBASE_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` are set in Secrets
- Check the workflow logs for specific error messages

**Audit logs still show permission error:**
- Ensure you deployed the `firestore.rules` to Firebase Console
- Verify you're logged in as an admin user (check `isAdmin: true` in Firestore)
- Wait a few minutes for rules to propagate

**Webhooks not appearing in Discord:**
- Verify Discord webhook URLs are correct in Secrets
- Check browser console for authentication errors
- Ensure you're logged in as an admin
- Test with a simple item creation

## Need Help?

See the detailed guide in `FIRESTORE_RULES_DEPLOYMENT.md` for step-by-step instructions with screenshots and troubleshooting tips.

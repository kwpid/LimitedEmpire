# Firebase Setup Instructions

## Issues Fixed

### 1. "Insufficient or missing permissions" when rolling
**Problem**: Firebase security rules only allowed admins to update items, but regular users need to update item stock during rolls.

**Solution**: Updated the security rules to allow authenticated users to update stock-related fields (`remainingStock`, `totalOwners`) while keeping admin-only control over critical fields (`name`, `value`, `rarity`, `offSale`, `stockType`, `totalStock`).

### 2. "Require all reads to be executed before all writes" errors
**Problem**: Both roll and sell transactions were performing write operations before all reads completed, violating Firebase's strict transaction requirement.

**Solution**: 
- Fixed `rollService.ts`: Moved all transaction writes (item updates, ownership creation, user/admin updates) to the end of the transaction after all reads complete
- Fixed `sellService.ts`: Reorganized to ensure all reads (user, admin, item) happen before any writes
- Both services now follow Firebase's read-before-write contract

### 3. Auto-roll not stopping properly
**Problem**: Auto-roll would continue even after being toggled off due to stale closure-captured state.

**Solution**: 
- Implemented refs to track current auto-roll state and timeout handles
- Recursive setTimeout pattern waits 2 seconds after each roll completes (including 2.1s animation)
- Properly cleans up timeouts when auto-roll is disabled

## Next Steps - IMPORTANT

### Deploy Updated Firebase Security Rules

The security rules have been updated in `FIREBASE_RULES.md`, but you **MUST** deploy them to your Firebase Console for them to take effect:

1. Open the [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Firestore Database** → **Rules**
4. Copy the rules from `FIREBASE_RULES.md` (lines 7-125)
5. Paste them into the Firebase Rules editor
6. Click **Publish**

### Verify Firebase API Keys

Your Firebase integration needs the following secrets configured:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`

If you see "invalid-api-key" errors, these need to be set up in your Replit Secrets.

## Updated Security Rules Summary

The new rules allow:
- ✅ **All users**: Can read items
- ✅ **Authenticated users**: Can update `remainingStock` and `totalOwners` (during rolls)
- ✅ **Admins only**: Can create items, delete items, and update all fields including critical ones
- ❌ **Regular users**: Cannot modify item name, value, rarity, offSale status, or stock type

This maintains security while allowing the game mechanics to work properly.

## Testing

After deploying the rules to Firebase Console:
1. Try rolling items with a new account - should work without permission errors
2. Try selling items from inventory - should work without transaction errors
3. Verify that item stock decrements correctly
4. Verify that cash transfers work (80% to player, 20% to admin)

## Code Changes Made

1. **FIREBASE_RULES.md**: Updated items collection rules (lines 53-70)
2. **client/src/lib/sellService.ts**: Reordered transaction to do all reads first (lines 44-138)

All changes have been reviewed and approved by the architect agent.

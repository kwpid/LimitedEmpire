# Firebase Rules Update Required

## Issue
The leaderboard is failing with "Missing or insufficient permissions" error because the Firebase security rules don't include permissions for the `leaderboardCache` collection.

## Solution
You need to add the following rules to your Firebase Console:

### Steps:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database** → **Rules**
4. Add the following rule BEFORE the closing braces (after the Audit Logs section):

```javascript
// Leaderboard Cache collection
match /leaderboardCache/{cacheId} {
  allow read: if isAuthenticated();
  allow write: if isAuthenticated();
  allow delete: if isAdmin();
}
```

### Complete Updated Rules
Here's how your rules should look with the new section added:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isAdmin() {
      return isAuthenticated() && 
             exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
    
    function isModerator() {
      return isAuthenticated() && 
             exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isModerator == true;
    }
    
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    // Users collection
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && 
                      request.auth.uid == userId &&
                      request.resource.data.firebaseUid == request.auth.uid &&
                      request.resource.data.isBanned == false;
      allow update: if (isAuthenticated() &&
                       request.auth.uid == userId && 
                       !request.resource.data.diff(resource.data).affectedKeys().hasAny([
                         'isAdmin', 'isModerator', 'isBanned', 
                         'isPermanentBan', 'banReason', 'banNotes', 
                         'banExpiresAt', 'userId', 'firebaseUid'
                       ])) ||
                      (isAdmin() &&
                       !request.resource.data.diff(resource.data).affectedKeys().hasAny([
                         'isAdmin', 'userId', 'firebaseUid'
                       ])) ||
                      (isModerator() &&
                       request.resource.data.diff(resource.data).affectedKeys().hasOnly([
                         'isBanned', 'isPermanentBan', 'banReason', 'banNotes', 'banExpiresAt'
                       ]));
      allow delete: if isAdmin();
    }
    
    // Items collection
    match /items/{itemId} {
      allow read: if true;
      allow create, delete: if isAdmin();
      allow update: if isAdmin() || 
                      (isAuthenticated() && 
                       !request.resource.data.diff(resource.data).affectedKeys()
                         .hasAny(['name', 'imageUrl', 'value', 'rarity', 'offSale', 'stockType', 'totalStock']));
      
      match /owners/{userId} {
        allow read: if isAuthenticated();
        allow create: if isAuthenticated() && request.auth.uid == userId;
        allow delete: if isAdmin();
        allow update: if false;
      }
    }
    
    // Inventory collection
    match /inventory/{inventoryId} {
      allow read: if isAuthenticated() && resource.data.userId == request.auth.uid;
      allow create: if isAuthenticated() && 
                      request.resource.data.userId == request.auth.uid &&
                      request.resource.data.rolledAt is int;
      allow read, delete: if isAdmin();
      allow update: if false;
    }
    
    // Global rolls collection
    match /globalRolls/{rollId} {
      allow read: if true;
      allow create: if isAuthenticated() &&
                      request.resource.data.timestamp is int &&
                      request.resource.data.itemValue >= 2500000;
      allow delete: if isAdmin();
      allow update: if false;
    }
    
    // Counters collection
    match /counters/{counterId} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated() && counterId == 'userId';
    }
    
    // Trades collection
    match /trades/{tradeId} {
      allow read: if isAuthenticated() && (
        resource.data.senderId == request.auth.uid ||
        resource.data.receiverId == request.auth.uid
      );
      allow read: if isAdmin();
      allow create: if isAuthenticated() && 
                      request.resource.data.senderId == request.auth.uid &&
                      request.resource.data.status == "pending" &&
                      request.resource.data.senderOffer.items.size() >= 1 &&
                      request.resource.data.senderOffer.items.size() <= 7 &&
                      request.resource.data.receiverRequest.items.size() >= 1 &&
                      request.resource.data.receiverRequest.items.size() <= 7 &&
                      request.resource.data.senderOffer.cash >= 0 &&
                      request.resource.data.senderOffer.cash <= 50000 &&
                      request.resource.data.receiverRequest.cash >= 0 &&
                      request.resource.data.receiverRequest.cash <= 10000;
      allow update: if isAuthenticated() && (
        (resource.data.senderId == request.auth.uid && 
         (resource.data.status == "pending" || resource.data.status == "active") &&
         (request.resource.data.status == "declined" || request.resource.data.status == "cancelled")) ||
        (resource.data.receiverId == request.auth.uid && 
         resource.data.status == "pending" &&
         (request.resource.data.status == "completed" || 
          request.resource.data.status == "declined"))
      ) && !request.resource.data.diff(resource.data).affectedKeys()
            .hasAny(['senderId', 'receiverId', 'senderOffer', 'receiverRequest', 'createdAt']);
      allow delete: if isAdmin();
    }
    
    // Leaderboard Cache collection
    match /leaderboardCache/{cacheId} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated();
      allow delete: if isAdmin();
    }
    
    // Audit Logs collection
    match /auditLogs/{logId} {
      allow read, create: if isAdmin() || isModerator();
      allow update, delete: if false;
    }
  }
}
```

### After Adding the Rules
1. Click "Publish" in the Firebase Console
2. The leaderboard should now work without permission errors

## Note on Player Profile Showcase/Inventory Value

### Issue
If player profile cards show $0 inventory value, empty showcases, or "Calculating..." text, this is because the `showcaseMetadata` and `inventoryValue` fields are not populated for all users yet. These are **denormalized fields** that cache calculated values to avoid expensive queries.

### Why We Can't Calculate On-The-Fly
The PlayerCard component displays players in a list. Calculating inventory values on-the-fly would require:
- Fetching all item documents for every player in the list
- For 20 players with 50 items each = 1,000 Firebase reads per page load
- This would quickly exhaust your Firebase read quota and cause severe performance issues

### Solution: Run the User Schema Migration
These denormalized fields need to be populated via a one-time migration:

1. **As Admin**, open the browser console (F12)
2. Import the migration function:
   ```javascript
   import('/src/lib/userSchemaUpdater').then(m => m.migrateAllUsersSchema())
   ```
3. This will:
   - Calculate `inventoryValue` for all users (sum of all item values in their inventory)
   - Generate `showcaseMetadata` with item names, images, and serial numbers for showcase items
   - Add `usernameLower` for search functionality
   - Process users in batches to avoid quota limits

4. Monitor the console for progress updates

### Alternative: Automatic Population
These fields will also automatically populate when:
- Users roll new items (inventory value updates)
- Users update their showcase items (showcase metadata updates)

However, existing users need the migration run to populate their current data.

### Updated PlayerCard Behavior
The PlayerCard now automatically calculates:
- **Inventory value** from user's inventory items using the itemsCache (if inventoryValue is missing/zero)
- **Showcase metadata** from user's showcaseItems using the itemsCache (if showcaseMetadata is missing/empty)
- These calculations use cached item data (no additional Firebase reads)

### Player Search Requirements
For player search to work, all users must have the `usernameLower` field populated. This field is automatically added by the migration script above. If search isn't working:

1. Ensure the migration has been run to add `usernameLower` to all users
2. Check Firebase Console → Firestore → Indexes to ensure there's a composite index for:
   - Collection: `users`
   - Fields: `usernameLower` (Ascending)
   - Query scope: Collection

The search uses prefix matching (e.g., "kwp" finds "Kwpid", "kwpo", "kwpants", etc.)

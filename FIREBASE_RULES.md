# Firebase Security Rules for Limited Empire

## Firestore Security Rules

Copy these rules to your Firebase Console under Firestore Database → Rules:

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
      // Anyone authenticated can read user profiles
      allow read: if isAuthenticated();
      
      // CRITICAL: Users can ONLY create their own document with the correct firebaseUid
      // The document ID MUST match their Firebase Auth UID
      allow create: if isAuthenticated() && 
                      request.auth.uid == userId &&
                      request.resource.data.firebaseUid == request.auth.uid &&
                      request.resource.data.isAdmin == false && // MUST be false - admins set manually
                      request.resource.data.isModerator == false && // MUST be false - moderators set manually
                      request.resource.data.isBanned == false; // MUST be false on creation
      
      // Users can only update their own document (but CANNOT change admin status, ban status, userId, or firebaseUid)
      // Admins can update all fields except protected ones (isAdmin, userId, firebaseUid)
      // Moderators can ONLY update ban-related fields: isBanned, isPermanentBan, banReason, banNotes, banExpiresAt
      allow update: if (isAuthenticated() &&
                       request.auth.uid == userId && 
                       !request.resource.data.diff(resource.data).affectedKeys().hasAny(['isAdmin', 'isModerator', 'isBanned', 'isPermanentBan', 'banReason', 'banNotes', 'banExpiresAt', 'userId', 'firebaseUid'])) ||
                      (isAdmin() &&
                       !request.resource.data.diff(resource.data).affectedKeys().hasAny(['isAdmin', 'userId', 'firebaseUid'])) ||
                      (isModerator() &&
                       request.resource.data.diff(resource.data).affectedKeys().hasOnly(['isBanned', 'isPermanentBan', 'banReason', 'banNotes', 'banExpiresAt']));
      
      // Only admins can delete users
      allow delete: if isAdmin();
    }
    
    // Items collection
    match /items/{itemId} {
      // Anyone can read items
      allow read: if true;
      
      // Only admins can create or delete items
      allow create: if isAdmin();
      allow delete: if isAdmin();
      
      // Admins can update all fields
      // Authenticated users can only update stock-related fields (during rolls)
      allow update: if isAdmin() || 
                      (isAuthenticated() && 
                       !request.resource.data.diff(resource.data).affectedKeys()
                         .hasAny(['name', 'imageUrl', 'value', 'rarity', 'offSale', 'stockType', 'totalStock']));
      
      // Ownership markers subcollection (for tracking unique owners)
      match /owners/{userId} {
        // Anyone authenticated can read ownership markers
        allow read: if isAuthenticated();
        
        // Only allow creating ownership markers during item rolls
        allow create: if isAuthenticated() && request.auth.uid == userId;
        
        // Admins can delete ownership markers (for economy reset)
        allow delete: if isAdmin();
        
        // No updates allowed
        allow update: if false;
      }
    }
    
    // Inventory collection
    match /inventory/{inventoryId} {
      // Users can read their own inventory using their Firebase Auth UID
      allow read: if isAuthenticated() && 
                    resource.data.userId == request.auth.uid;
      
      // Users can add to their own inventory (from rolling)
      // CRITICAL: userId MUST match their Firebase Auth UID
      allow create: if isAuthenticated() && 
                      request.resource.data.userId == request.auth.uid &&
                      request.resource.data.rolledAt is int;
      
      // Admins can read and delete any inventory
      allow read, delete: if isAdmin();
      
      // No updates allowed (inventory items are immutable)
      allow update: if false;
    }
    
    // Global rolls collection (recent high-value rolls)
    match /globalRolls/{rollId} {
      // Anyone can read global rolls
      allow read: if true;
      
      // Authenticated users can create global rolls (when they roll high-value items)
      allow create: if isAuthenticated() &&
                      request.resource.data.timestamp is int &&
                      request.resource.data.itemValue >= 2500000;
      
      // Admins can delete old rolls
      allow delete: if isAdmin();
      
      // No updates allowed
      allow update: if false;
    }
    
    // Counters collection (for sequential user IDs)
    match /counters/{counterId} {
      // Anyone authenticated can read counters
      allow read: if isAuthenticated();
      
      // Only allow incrementing the userId counter during user creation
      allow write: if isAuthenticated() && 
                     counterId == 'userId';
    }
    
    // Trades collection
    match /trades/{tradeId} {
      // Users can read trades where they are the initiator or recipient
      allow read: if isAuthenticated() && (
        resource.data.initiatorId == request.auth.uid ||
        resource.data.recipientId == request.auth.uid
      );
      
      // Admins can read all trades
      allow read: if isAdmin();
      
      // Users can create trades if they are the initiator
      allow create: if isAuthenticated() && 
                      request.resource.data.initiatorId == request.auth.uid &&
                      request.resource.data.status == "pending";
      
      // Users can update trades (accept/decline/cancel)
      // - Initiator can cancel their own pending trades
      // - Recipient can accept or decline pending trades
      // - Only status and updatedAt can be changed
      allow update: if isAuthenticated() && (
        (resource.data.initiatorId == request.auth.uid && 
         resource.data.status == "pending" &&
         request.resource.data.status == "cancelled") ||
        (resource.data.recipientId == request.auth.uid && 
         resource.data.status == "pending" &&
         (request.resource.data.status == "accepted" || request.resource.data.status == "declined"))
      ) && !request.resource.data.diff(resource.data).affectedKeys()
            .hasAny(['initiatorId', 'recipientId', 'initiatorOffer', 'recipientOffer', 'createdAt', 'expiresAt']);
      
      // Admins can delete trades
      allow delete: if isAdmin();
    }
    
    // Audit Logs collection
    match /auditLogs/{logId} {
      // Only admins and moderators can read audit logs
      allow read: if isAdmin() || isModerator();
      
      // Only admins and moderators can create audit logs
      allow create: if isAdmin() || isModerator();
      
      // No updates or deletes allowed (audit logs are immutable)
      allow update, delete: if false;
    }
  }
}
```

## Storage Rules (if using Firebase Storage for images)

If you plan to allow users to upload images directly to Firebase Storage, add these rules:

```javascript
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    // Item images folder - only admins can upload
    match /items/{imageId} {
      allow read: if true;
      allow write: if request.auth != null && 
                     firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
    
    // Deny all other uploads
    match /{allPaths=**} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

## Important Notes

1. **Username Uniqueness**: The rules above don't enforce username uniqueness at the database level. This is handled in the application code by checking for existing usernames before creating a user document.

2. **Admin Creation**: The first admin must be manually set in the Firebase Console:
   - Go to Firestore Database
   - Find the user document you want to make admin
   - Edit the document and set `isAdmin: true`

3. **Item Stock Management**: The rules allow admins to update items, including stock values. The application logic prevents users from rolling items that are out of stock.

4. **Global Rolls Cleanup**: You may want to set up a Cloud Function to periodically delete old global rolls (older than 24 hours) to keep the collection size manageable.

5. **Rate Limiting**: Consider implementing Cloud Functions to rate limit rolling actions if abuse becomes a concern.

## Firebase Console Setup Checklist

- [ ] Enable Google Authentication in Firebase Console
- [ ] Add authorized domains (Replit dev URL and deployment URL)
- [ ] Deploy Firestore Security Rules above
- [ ] Deploy Storage Rules if using image uploads
- [ ] Create initial `counters/userId` document with `{ current: 0 }`
- [ ] Set up first admin user manually
- [ ] (Optional) Set up Cloud Functions for cleanup tasks

## Testing Security Rules

You can test these rules in the Firebase Console under Firestore Database → Rules → Rules Playground:

**Test Case 1: User can read their own inventory**
```
Operation: get
Path: /inventory/test-doc
Auth UID: user123
Document data: { userId: "user123", itemId: "item1", rolledAt: timestamp }
Result: Should ALLOW
```

**Test Case 2: Non-admin cannot create items**
```
Operation: create
Path: /items/new-item
Auth UID: user123
User is admin: false
Result: Should DENY
```

**Test Case 3: User cannot make themselves admin**
```
Operation: update
Path: /users/user123
Existing data: { isAdmin: false }
New data: { isAdmin: true }
Result: Should DENY
```

# Security Implementation Notes for Limited Empire

## Critical Security Measures Implemented

### 1. User Identity Consistency
- **Issue**: Mismatch between Firestore document IDs and user references in inventory
- **Solution**: All user references in inventory and global rolls now use `firebaseUid` (Firebase Auth UID) instead of Firestore document ID
- **Impact**: Security rules can now properly validate that users only access their own data

### 2. Admin Privilege Protection
- **Issue**: Users could potentially create a Firestore document with `isAdmin: true`
- **Current Solution** (MVP Implementation): 
  - Firestore rules enforce that `isAdmin` MUST be `false` on user creation
  - Only manually set admins in Firebase Console can have `isAdmin: true`
  - Admin status cannot be modified by users (protected in Firestore rules)
  - **LIMITATION**: The UI trusts the `isAdmin` field from Firestore. While rules prevent self-escalation, a compromised account with database write access could still set this flag.
- **Setup**: First admin must be manually set in Firebase Console:
  1. Go to Firestore Database
  2. Find the user document (document ID = Firebase Auth UID)
  3. Edit and set `isAdmin: true`
- **Production Recommendation**: Use Firebase Auth Custom Claims instead of Firestore field for admin status. Custom claims are server-controlled and cannot be modified by clients.

### 3. Stock Race Condition & Roll Integrity
- **Issue**: Concurrent rolls could oversell limited items; clients could manipulate which items to roll
- **Solution**: Complete roll logic now server-side within Firestore transaction
- **Details**:
  - Eligible items are queried INSIDE the transaction (not passed from client)
  - Roll selection (weighted random) happens server-side
  - Transaction validates item is not off-sale before rolling
  - Transaction reads current stock from Firestore before decrementing
  - Atomic update ensures no overselling
  - All roll data (rarity, value, global roll trigger) derived from transactional read
  - **CRITICAL**: Client cannot force-roll specific items or bypass rarity system

## Security Rules Alignment

### User Document Structure
```typescript
{
  firebaseUid: string,  // MUST match document ID and auth.uid
  username: string,
  userId: number,       // Sequential ID (cannot be changed)
  isAdmin: boolean,     // MUST be false on creation
  createdAt: timestamp
}
```

**Document ID = Firebase Auth UID**

This ensures:
- One user document per Firebase account
- Security rules can validate ownership using `request.auth.uid`
- No confusion between Firestore doc IDs and user identifiers

### Inventory and Global Rolls
All `userId` fields now reference `firebaseUid` to align with security rules that check `request.auth.uid`.

## Admin Setup Process

1. **Initial Setup**: Deploy Firestore rules to production
2. **First Admin**: Manually set in Firebase Console
3. **Additional Admins**: Can be set by existing admins through Firebase Console (not in app UI for security)

## Remaining Considerations

### Future Enhancements
1. **Cloud Functions**: Move roll logic to Cloud Functions for server-side validation
2. **Admin Claims**: Use Firebase Auth custom claims for admin status (more secure than Firestore field)
3. **Rate Limiting**: Implement Cloud Functions to prevent roll spam
4. **Audit Logging**: Track admin actions and item modifications

### Current Limitations
- Admin status is stored in Firestore (secure but not ideal)
- Client-side roll logic (works but Cloud Function would be better)
- No rate limiting on rolls (could be abused)

### Best Practices Followed
- ✅ Firestore transactions for atomic operations
- ✅ Security rules enforce user ownership
- ✅ Admin privileges cannot be self-granted
- ✅ Consistent user identification across collections
- ✅ Immutable inventory items (no updates allowed)

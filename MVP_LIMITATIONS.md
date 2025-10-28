# MVP Limitations & Production Roadmap

## Overview

Limited Empire is built as an MVP (Minimum Viable Product) using Firebase's client-side SDK. This approach enables rapid development and deployment but comes with inherent security limitations when compared to a fully server-authoritative architecture.

## Critical Architectural Limitation

### Client-Side Roll Logic

**Current State (MVP):**
- Roll selection logic executes in client-side JavaScript (browser)
- Uses Firestore transactions for atomic stock updates
- Validates rules like offSale, stock limits within the transaction
- Uses Firestore Security Rules to prevent unauthorized data writes

**Security Limitation:**
A technically sophisticated user could:
- Modify client-side JavaScript code in their browser
- Force-select specific items by manipulating the random selection
- Bypass the weighted rarity system to acquire high-value items

**Why This Exists:**
- Firebase client SDK architecture runs all application logic in the browser
- True server-side enforcement requires Cloud Functions or dedicated backend
- MVPs prioritize rapid iteration over perfect security

**Mitigating Factors:**
- Firestore Security Rules prevent:
  - Writing inventory for other users
  - Modifying item definitions (admin-only)
  - Bypassing authentication
  - Creating invalid data structures
- Transactions prevent race conditions and stock overselling
- Cheating requires technical knowledge (not casual exploitation)
- This is a collection game, not competitive PvP (lower stakes)

## Production Security Roadmap

### Phase 1: Cloud Function Migration
Move roll logic to Firebase Cloud Functions:

```typescript
// Cloud Function (server-side, trusted)
exports.performRoll = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) throw new Error('Unauthorized');
  
  // Query eligible items server-side
  const items = await getEligibleItems();
  
  // Perform weighted random selection server-side
  const selectedItem = weightedRandomSelection(items);
  
  // Update inventory and stock in transaction
  // Client CANNOT manipulate this logic
  return await rollTransaction(context.auth.uid, selectedItem);
});
```

Benefits:
- Server controls randomness (client cannot manipulate)
- Server validates all business rules
- Client simply calls function and receives result
- True security against cheating

### Phase 2: Custom Claims for Admin
Replace Firestore `isAdmin` field with Firebase Auth Custom Claims:

```typescript
// Set admin claim server-side only
admin.auth().setCustomUserClaims(uid, { admin: true });
```

Benefits:
- Admin status cannot be modified by clients
- Verified through Firebase Auth token
- More secure than Firestore field

### Phase 3: Rate Limiting
Implement Cloud Functions rate limiting:
- Prevent spam rolling
- Detect suspicious patterns
- Throttle abusive behavior

### Phase 4: Audit Logging
Track all sensitive operations:
- Item creation/modification
- Admin actions
- High-value rolls
- Stock changes

## MVP vs Production Decision Matrix

| Feature | MVP Approach | Production Approach |
|---------|--------------|---------------------|
| Roll Selection | Client-side with Firestore transaction | Cloud Function (server-side) |
| Admin Auth | Firestore field with rules | Firebase Auth Custom Claims |
| Stock Management | Client transaction | Server transaction in Cloud Function |
| Rate Limiting | None | Cloud Function throttling |
| Audit Logging | None | Cloud Function logging |
| Cheat Prevention | Firestore rules only | Server-side validation |

## Acceptable Use Cases (Current MVP)

✅ **Good for:**
- Demo/prototype
- Portfolio project
- Learning Firebase
- Small trusted community
- Single-player experience focus
- Non-competitive collection game

❌ **Not recommended for:**
- Competitive leaderboards with rewards
- Real-money transactions
- Large public release
- High-stakes gameplay
- Untrusted user base

## Implementation Priority

For production deployment, implement security improvements in this order:

1. **CRITICAL**: Migrate roll logic to Cloud Functions (prevents cheating)
2. **HIGH**: Implement Custom Claims for admin (prevents privilege escalation)
3. **MEDIUM**: Add rate limiting (prevents spam/abuse)
4. **LOW**: Add audit logging (enables detection and recovery)

## Cost Considerations

**Current MVP Costs:**
- Firebase free tier: $0/month
- Firestore operations: ~$0.01-0.10/month (depending on usage)

**Production Costs with Cloud Functions:**
- Cloud Functions: $0.40 per million invocations (plus compute time)
- For 10,000 rolls/day: ~$12/month
- Consider this when planning monetization

## Conclusion

This MVP implements the core gameplay loop with Firebase client SDK, suitable for demonstration, testing, and learning. The architecture enables rapid iteration but requires Cloud Functions migration before public production deployment to prevent determined users from manipulating the roll system.

The current implementation is **intentionally simplified** for MVP speed. All documented limitations have clear production solutions using Firebase's server-side features.

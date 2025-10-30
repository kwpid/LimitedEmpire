# Database Reads/Writes Analysis

This document provides a comprehensive analysis of Firestore reads and writes for different user scenarios in Limited Empire.

## Database Monitoring System Status ✅

The logging system is **properly implemented** with:
- ✅ All Firestore operations wrapped (getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc)
- ✅ Transaction monitoring with proxy pattern (transaction.get, transaction.set, transaction.update, transaction.delete)
- ✅ Caller information tracking (function name and file path)
- ✅ Detailed console logging with colors
- ✅ Console commands: `dbStats()` to view stats, `dbReset()` to reset
- ✅ Per-collection breakdowns for reads and writes

---

## Scenario Breakdown

### 1. **Rolling for Items**

#### Standard Roll (Non-Auto-Sell)
**Reads:**
- 1 read: `getDocs` on items collection (fetches all non-offSale items) - **N reads** where N = number of items
- 1 read: `getDocs` on users collection (to find admin user) - **1-2 reads** (depends on admin count)
- 3-4 reads inside transaction:
  - `transaction.get` on selected item - **1 read**
  - `transaction.get` on ownership marker - **1 read**
  - `transaction.get` on user document - **1 read**
  - `transaction.get` on admin document (if needed) - **1 read**

**Total Reads: N + 5 to 6 reads** (where N = number of items in catalog)

**Writes:**
- 2-4 writes inside transaction:
  - `transaction.update` on user document (add item to inventory, increment rollCount) - **1 write**
  - `transaction.update` on item document (update totalOwners, or remainingStock for limited items) - **1 write**
  - `transaction.set` on ownership marker (if first time owning) - **0-1 write**
  - `transaction.set` on globalRolls (if Mythic/Insane value >= 2.5M) - **0-1 write**

**Total Writes: 2 to 4 writes**

#### Auto-Sell Roll
**Reads:** Same as standard roll - **N + 5 to 6 reads**

**Writes:**
- 3-5 writes inside transaction:
  - `transaction.update` on user document (add cash, increment rollCount) - **1 write**
  - `transaction.update` on admin document (add cash from 20% cut) - **1 write**
  - `transaction.update` on item document - **1 write**
  - `transaction.set` on ownership marker (if first time owning) - **0-1 write**
  - `transaction.set` on globalRolls (if Mythic/Insane) - **0-1 write**

**Total Writes: 3 to 5 writes**

---

### 2. **Checking Players (Online Players Page)**

**Reads:**
- `getDocs` query on users collection with filters:
  - Filtered by `lastActive >= 5 minutes ago`
  - Limited to 50 results
  - **Result: Up to 50 reads** (one per active user found)

**Writes:** None

**Total: 0-50 reads, 0 writes**

---

### 3. **Viewing Player Profile**

**Reads:**
- Player data is already loaded from Players page (no additional read if from same page)
- `getDoc` calls for each showcase item (up to 7 items typically):
  - **0-7 reads** (one per showcase item)

**Writes:** None

**Total: 0-7 reads, 0 writes**

---

### 4. **Loading Leaderboard**

#### Initial Load
**Reads:**
- `getDocs` on entire users collection - **N reads** where N = total number of users (excluding admin)
- Items are cached, so **0 reads** from items collection (uses itemsCache)

**Total: N reads** (where N = number of users in database)

**Writes:** None

#### Auto-Refresh (Every 5 Minutes)
Same as initial load: **N reads, 0 writes**

**Note:** Leaderboard is expensive due to reading ALL users. With 1000 users, that's **1000 reads every 5 minutes** during active viewing.

---

### 5. **Viewing Inventory**

**Reads:**
- Inventory items are stored in user document (already loaded)
- Item details fetched from itemsCache - **0 reads** (cached)
- Only if cache expired or first load:
  - `getDocs` on items collection - **M reads** where M = total items in catalog

**Total: 0 reads** (if cache valid), or **M reads** (if cache needs refresh)

**Writes:** None

---

### 6. **Selling Items**

**Reads:**
- Item details from cache - **0 reads**
- 3 reads inside transaction:
  - `transaction.get` on user document - **1 read**
  - `transaction.get` on item document - **1 read**
  - `transaction.get` on admin document - **1 read**

**Total Reads: 3 reads**

**Writes:**
- 2 writes inside transaction:
  - `transaction.update` on user document (remove item, add cash) - **1 write**
  - `transaction.update` on admin document (deduct cash from 20% cut) - **1 write**

**Total Writes: 2 writes**

---

### 7. **Trading Items**

#### Sending Trade Offer
**Reads:** None (uses cached item data)

**Writes:**
- `addDoc` to trades collection - **1 write**

**Total: 0 reads, 1 write**

#### Accepting Trade
**Reads:**
- 3 reads inside transaction:
  - `transaction.get` on trade document - **1 read**
  - `transaction.get` on sender user document - **1 read**
  - `transaction.get` on receiver user document - **1 read**

**Total Reads: 3 reads**

**Writes:**
- 3 writes inside transaction:
  - `transaction.update` on sender user document (swap items/cash) - **1 write**
  - `transaction.update` on receiver user document (swap items/cash) - **1 write**
  - `transaction.delete` on trade document - **1 write**

**Total Writes: 3 writes**

---

### 8. **Item Index/Catalog**

**Reads:**
- Uses itemsCache - **0 reads** (if cache valid)
- If cache expired:
  - `getDocs` on items collection - **M reads** where M = total items

**Total: 0 reads** (typically cached), or **M reads** once per 24 hours

**Writes:** None

---

## Optimization Notes

### ✅ Already Optimized:
1. **Inventory stored in user document** - Avoids N+1 query problem
2. **Items cached for 24 hours** - Reduces item catalog reads dramatically
3. **Leaderboard limited to top 30** - Calculation done client-side after one read
4. **Players page limited to 50** - Capped query size

### 🔴 Expensive Operations:
1. **Rolling** - Requires reading ALL items catalog (N reads) + transaction reads
   - If you have 100 items, that's ~106 reads per roll
   - If you have 500 items, that's ~506 reads per roll
   
2. **Leaderboard** - Reads ALL users every 5 minutes
   - With 1000 users, that's 1000 reads every load
   - Auto-refreshes every 5 minutes

### 💡 Potential Optimizations:
1. **Cache rollable items** - Cache the list of eligible items instead of querying every roll
2. **Leaderboard pagination** - Only load top 100 instead of all users
3. **Background leaderboard updates** - Use Cloud Functions to calculate leaderboards periodically

---

## Cost Estimates (Firestore Pricing)

**Firestore Pricing (Free Tier):**
- 50,000 reads/day free
- 20,000 writes/day free

**Firestore Pricing (Paid):**
- $0.06 per 100,000 reads
- $0.18 per 100,000 writes

### Example Usage (100 active users, 200 items in catalog):
- Each user rolls 10 times/day: 100 × 10 × 206 = **206,000 reads**
- Each user checks leaderboard 3 times: 100 × 3 × 100 = **30,000 reads**
- Total daily reads: **~236,000 reads** = $0.14/day = **$4.20/month**

- Each user rolls 10 times/day: 100 × 10 × 3 = **3,000 writes**
- Other operations: **~1,000 writes**
- Total daily writes: **~4,000 writes** (within free tier)

---

## Summary Table

| Scenario | Reads | Writes | Notes |
|----------|-------|--------|-------|
| **Roll (Standard)** | N + 5-6 | 2-4 | N = items in catalog |
| **Roll (Auto-Sell)** | N + 5-6 | 3-5 | N = items in catalog |
| **Check Players** | 0-50 | 0 | Limited to active users |
| **View Profile** | 0-7 | 0 | Depends on showcase items |
| **Leaderboard** | N | 0 | N = total users |
| **Inventory** | 0 | 0 | Uses cache |
| **Sell Item** | 3 | 2 | Transaction-based |
| **Send Trade** | 0 | 1 | Simple write |
| **Accept Trade** | 3 | 3 | Transaction-based |
| **Item Index** | 0 (cached) | 0 | 24hr cache |

**Key Insight:** Rolling is the most expensive operation due to reading the entire items catalog every time.

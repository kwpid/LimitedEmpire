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

### 1. **Rolling for Items** ✅ OPTIMIZED

#### Standard Roll (Non-Auto-Sell)
**Reads:**
- 0 reads: Items loaded from **rollableItemsCache** (5-minute cache) - **0 reads** (cached)
- **First roll after cache expiry**: `getDocs` on items collection - **N reads** where N = number of items
- 1 read: `getDocs` on users collection (to find admin user) - **1-2 reads** (depends on admin count)
- 3-4 reads inside transaction:
  - `transaction.get` on selected item - **1 read**
  - `transaction.get` on ownership marker - **1 read**
  - `transaction.get` on user document - **1 read**
  - `transaction.get` on admin document (if needed) - **1 read**

**Total Reads: 5 to 6 reads** (cached) or **N + 5 to 6 reads** (first roll in 5 minutes)

**Improvement:** **~97% reduction** (from 206 reads to 6 reads for 200-item catalog)

**Writes:**
- 2-4 writes inside transaction:
  - `transaction.update` on user document (add item to inventory, increment rollCount) - **1 write**
  - `transaction.update` on item document (update totalOwners, or remainingStock for limited items) - **1 write**
  - `transaction.set` on ownership marker (if first time owning) - **0-1 write**
  - `transaction.set` on globalRolls (if Mythic/Insane value >= 2.5M) - **0-1 write**

**Total Writes: 2 to 4 writes**

#### Auto-Sell Roll
**Reads:** Same as standard roll - **5 to 6 reads** (cached) or **N + 5 to 6 reads** (first roll in 5 minutes)

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

### 4. **Loading Leaderboard** ✅ OPTIMIZED

#### Viewing Leaderboard (User Action)
**Reads:**
- `getDoc` on leaderboardCache document - **1 read**
- If cache is stale (>5 minutes), triggers background update

**Total: 1 read** (viewing cached data)

**Writes:** None

**Improvement:** **~99.9% reduction** (from 1000 reads to 1 read for 1000-user database)

#### Background Update (Automatic, Every ~5 Minutes)
This happens automatically when the cache expires and someone requests the leaderboard:
- `getDocs` on entire users collection - **N reads** where N = total number of users
- `setDoc` to update leaderboardCache - **1 write**

**Total: N reads + 1 write** (happens once per 5 minutes, not per view)

**Note:** The expensive operation now happens once every 5 minutes in the background, instead of every time someone views the leaderboard. Users see cached data instantly.

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

### ✅ Optimizations Implemented:
1. **Inventory stored in user document** - Avoids N+1 query problem
2. **Items cached for 24 hours** - Reduces item catalog reads dramatically
3. **Rollable items cached for 5 minutes** ⭐ NEW - Eliminates N reads per roll
4. **Leaderboard cached in Firestore** ⭐ NEW - Background updates instead of per-view calculation
5. **Players page limited to 50** - Capped query size

### 🎯 Performance Improvements:
1. **Rolling Optimization:**
   - **Before:** 206 reads per roll (200 items catalog)
   - **After:** 6 reads per roll (cached)
   - **Improvement:** 97% reduction in reads
   
2. **Leaderboard Optimization:**
   - **Before:** 1000 reads per view (1000 users)
   - **After:** 1 read per view (cached data)
   - **Background:** 1000 reads + 1 write every 5 minutes
   - **Improvement:** 99.9% reduction in reads per view

### 💡 Additional Optimization Ideas:
1. **Server-side caching** - Use Replit's Redis or memory cache for even faster access
2. **Incremental leaderboard updates** - Track changes instead of recalculating everything
3. **Item stock monitoring** - Only refresh rollable items cache when stock changes

---

## Cost Estimates (Firestore Pricing)

**Firestore Pricing (Free Tier):**
- 50,000 reads/day free
- 20,000 writes/day free

**Firestore Pricing (Paid):**
- $0.06 per 100,000 reads
- $0.18 per 100,000 writes

### Example Usage (100 active users, 200 items in catalog):

#### Before Optimization:
- Each user rolls 10 times/day: 100 × 10 × 206 = **206,000 reads**
- Each user checks leaderboard 3 times: 100 × 3 × 100 = **30,000 reads**
- Total daily reads: **~236,000 reads** = $0.14/day = **$4.20/month**
- Daily writes: **~4,000 writes** (within free tier)

#### After Optimization ⭐:
- **Rolling:** 100 users × 10 rolls × 6 reads = **6,000 reads** (97% reduction!)
  - Plus: ~288 cache refresh reads/day (200 items × 12 5-minute periods / 8 hours active)
- **Leaderboard:** 100 users × 3 views × 1 read = **300 reads** (99% reduction!)
  - Plus: ~12,000 background update reads/day (100 users × 12 5-minute periods / 8 hours)
- **Total daily reads:** **~18,600 reads** = $0.01/day = **$0.30/month**
- **Total daily writes:** **~4,300 writes** (within free tier)

**Cost Savings:** **93% reduction** in daily costs! ($4.20 → $0.30 per month)

---

## Summary Table

| Scenario | Reads (Before) | Reads (After) | Writes | Improvement | Notes |
|----------|----------------|---------------|--------|-------------|-------|
| **Roll (Standard)** | N + 5-6 | **5-6** ⭐ | 2-4 | 97% | Uses 5-min rollable cache |
| **Roll (Auto-Sell)** | N + 5-6 | **5-6** ⭐ | 3-5 | 97% | Uses 5-min rollable cache |
| **Check Players** | 0-50 | 0-50 | 0 | - | Limited to active users |
| **View Profile** | 0-7 | 0-7 | 0 | - | Depends on showcase items |
| **Leaderboard** | N | **1** ⭐ | 0 | 99.9% | Server-cached, bg updates |
| **Inventory** | 0 | 0 | 0 | - | Uses 24hr cache |
| **Sell Item** | 3 | 3 | 2 | - | Transaction-based |
| **Send Trade** | 0 | 0 | 1 | - | Simple write |
| **Accept Trade** | 3 | 3 | 3 | - | Transaction-based |
| **Item Index** | 0 (cached) | 0 | 0 | - | 24hr cache |
| **Leaderboard Update** | - | N (bg) | 1 | - | Every ~5 min, background |

**Key Insights:** 
- ⭐ Rolling optimized from ~206 reads to 6 reads (97% reduction)
- ⭐ Leaderboard optimized from 1000 reads to 1 read per view (99.9% reduction)
- **Total cost reduction: 93%** for typical usage patterns

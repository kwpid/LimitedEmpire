# Limited Empire

A rolling game where players can collect rare items through a probability-based rolling system. Built with React, TypeScript, Firebase, and Tailwind CSS.

## Project Overview

Limited Empire is a web-based collection game featuring:
- Google authentication with custom username system
- Animated item rolling with 8 rarity tiers
- Inventory management with search and filtering
- Admin panel for item creation and management
- Real-time global roll notifications for high-value items
- Stock system with serial numbers for limited items
- **Admin auto-ownership**: Admin receives serial #0 of all items
- **Advanced gifting system**: Give items with serial management (create new or transfer existing)
- **Ban system**: Temporary/permanent bans with automatic inventory wiping

## Tech Stack

**Frontend:**
- React with TypeScript
- Tailwind CSS for styling
- Wouter for routing
- Framer Motion for animations
- shadcn/ui components
- TanStack Query for state management

**Backend:**
- Firebase Authentication (Google OAuth)
- Firebase Firestore (database)
- Firebase Hosting ready

## Project Structure

```
client/src/
├── components/          # Reusable UI components
│   ├── ui/             # shadcn components
│   ├── ItemCard.tsx    # Item display card
│   ├── ItemDetailModal.tsx  # Modal with sell functionality
│   ├── ItemCreateForm.tsx   # Auto-gives admin serial #0
│   ├── ItemEditForm.tsx
│   ├── AdminPanel.tsx
│   ├── AdminGiveItemsDialog.tsx  # Advanced item gifting
│   ├── AdminUsersTab.tsx    # User management with ban/wipe
│   ├── BanOverlay.tsx       # Full-screen ban message
│   ├── GlobalRollToast.tsx
│   └── SlotMachineRoll.tsx  # Roll animation
├── contexts/
│   └── AuthContext.tsx # Firebase auth state
├── lib/
│   ├── firebase.ts     # Firebase config
│   ├── rarity.ts       # Rarity utility functions
│   ├── rollService.ts  # Roll logic with auto-sell
│   ├── sellService.ts  # Sell system with 80/20 split
│   └── queryClient.ts
├── pages/
│   ├── Login.tsx       # Google sign-in
│   ├── UsernameSetup.tsx
│   ├── RollScreen.tsx  # Main rolling interface
│   ├── Inventory.tsx   # User's collection
│   ├── Settings.tsx    # User settings with auto-sell
│   └── ItemIndex.tsx   # All items database
└── App.tsx            # Main app with routing

shared/
└── schema.ts          # TypeScript types and schemas

server/
├── routes.ts          # API routes (minimal - Firebase handles most)
└── storage.ts         # Storage interface
```

## Firebase Collections

**users/**
- firebaseUid: string
- username: string (unique, 2-20 chars)
- userId: number (sequential ID)
- isAdmin: boolean
- cash: number (starting balance: 1,000)
- rollCount: number (total rolls performed)
- isBanned: boolean (default: false)
- isPermanentBan: boolean (optional)
- banExpiresAt: timestamp (optional, for temporary bans)
- banReason: string (optional)
- settings: object (optional)
  - autoSellRarities: array of rarity strings to auto-sell
- createdAt: timestamp

**items/**
- name: string
- description: string
- imageUrl: string (URL)
- value: number
- rarity: COMMON | UNCOMMON | RARE | ULTRA_RARE | EPIC | ULTRA_EPIC | MYTHIC | INSANE
- offSale: boolean
- stockType: "limited" | "infinite"
- totalStock: number | null
- remainingStock: number | null
- createdAt: timestamp
- createdBy: string (userId)

**inventory/**
- itemId: string
- userId: string
- serialNumber: number | null (for limited items)
- rolledAt: timestamp

**globalRolls/**
- username: string
- itemName: string
- itemImageUrl: string
- itemValue: number
- rarity: string
- timestamp: number
- serialNumber?: number

**counters/**
- userId: { current: number }

## Rarity System

Items are categorized by value into 8 rarity tiers:
- Common (white): 1-2,499
- Uncommon (light green): 2,500-9,999
- Rare (light blue): 10,000-49,999
- Ultra Rare (dark blue): 50,000-250,999
- Epic (purple): 250,000-750,000
- Ultra Epic (dark purple): 750,000-2,500,000
- Mythic (red): 2,500,000-9,999,999
- Insane (rainbow): 10,000,000+

Roll probability is calculated logarithmically based on item value:
- 100 value = ~20% chance
- 1,000 value = ~5% chance
- 10,000 value = ~0.5% chance
- Higher values = exponentially lower chances

## Key Features

### Authentication
- Google OAuth popup sign-in
- Custom username validation (English letters, numbers, max 2 underscores)
- Sequential user IDs for easier management
- Persistent sessions

### Rolling System
- Probability-based rolling using item values
- Animated roll sequence with deceleration
- Auto-roll toggle for continuous rolling
- Visual feedback with rarity-based borders and glows

### Inventory
- Personal collection sorted by value
- Search functionality
- Rarity filtering
- Item detail modals with stats
- Serial numbers for limited items

### Admin Features
- **Item Creation**: Live preview with auto-ownership (admin gets serial #0)
  - Limited items: Admin receives serial #0, users get serials starting at #1
  - Infinite items: Admin receives one copy
  - Admin's serial #0 doesn't count towards stock
- **Item Editing**: Update name, description, image, value, stock settings
- **Stock Management**: Toggle between limited/infinite, set total stock
- **Off-sale Toggle**: Disable items from being rolled
- **User Management** (AdminUsersTab):
  - View all users with stats (cash, rolls, items)
  - **Give Items**: Advanced gifting with serial management
    - Infinite items: Specify quantity to give
    - Limited items: Create new serial OR transfer existing serial
    - Serial #0 (admin's) cannot be transferred
  - **Ban System**: Temporary or permanent bans with preset options
    - **Quick Presets**:
      - Alt Farming: 7 days + inventory wipe
      - Toxicity: 3 days
      - Scamming: Permanent + inventory wipe
      - Glitch Abuse: 30 days + optional inventory wipe
    - Custom bans with flexible duration and wipe options
    - Temporary: Set expiry date, user can return after expiration
    - Permanent: Auto-wipes inventory (transfers all items to admin)
    - Cannot ban admin (userId 1)
  - **Wipe Inventory**: Manually transfer all user items to admin
    - Preserves serial numbers during transfer
    - Updates ownership markers atomically
    - Cannot wipe admin account
- **Ban Overlay**: Full-screen message blocks banned users from all interaction
  - Shows ban type (temporary/permanent)
  - Displays ban reason and expiry time
  - Informs about inventory wipe for permanent bans
  - Logout button allows banned users to sign out

### Real-time Features
- Global roll notifications for items worth 2.5M+
- Live toast notifications with auto-dismiss
- Best rolls panel (personal items worth 250K+)
- Real-time database updates

## Firebase Security Rules

See the Firebase console for complete security rules. Key rules:
- Users can only read/write their own user document
- Only admins can create/update items
- Users can only add to their own inventory
- Global rolls are publicly readable
- Username uniqueness is enforced

## Design System

The game uses a dark, modern theme with:
- Background: Near-black (#0a0a0a - #111111)
- Card surfaces: Slightly lighter (#1a1a1a - #1f1f1f)
- Rarity-based color coding for visual hierarchy
- Smooth animations and transitions
- Responsive grid layouts
- Accessible contrast ratios

## Development

Run the development server:
```bash
npm run dev
```

The app runs on port 5000 with hot reloading enabled.

## Environment Variables

Required secrets (already configured):
- VITE_FIREBASE_API_KEY
- VITE_FIREBASE_APP_ID
- VITE_FIREBASE_PROJECT_ID

## User Preferences

None specified yet.

## Recent Changes

### October 28, 2025 (Latest) - Ban Presets & Search Improvements
- **Ban System Enhancements**:
  - Added preset ban reasons with quick-select dropdown
  - Alt Farming (7 days + wipe), Toxicity (3 days), Scamming (Permanent + wipe), Glitch Abuse (30 days)
  - Optional inventory wipe checkbox for temporary bans
  - Banned users can now logout via button on ban overlay
- **Search Improvements**:
  - More flexible search: type any words from item name in any order
  - No longer requires exact matching or specific word order
  - Real-time filtering as you type
  - Applied to both Inventory and Item Index pages

### October 28, 2025 (Earlier) - Admin Features Complete
- **Admin Auto-Ownership**: Admin (userId 1) automatically receives serial #0 of every item upon creation
- **Advanced Item Gifting**: AdminGiveItemsDialog with Create Serial and Pick Serial modes
- **Ban System**: Temporary/permanent bans with automatic inventory wiping for permanent bans
- **Inventory Wipe**: Manual wipe functionality with atomic transaction safety
- **BanOverlay**: Full-screen blocking UI for banned users

### October 28, 2025 (Earlier) - Firebase & Auto-Roll Fixes
- **Firebase Transaction Fixes**: Fixed "require all reads to be executed before all writes" errors
  - Fixed rollService.ts transaction: moved all writes (item, ownership, user, admin) to end of transaction
  - Fixed sellService.ts transaction: ensured all reads happen before any writes
  - Both services now follow Firebase's strict read-before-write rule
- **Firebase Security Rules**: Fixed "Insufficient or missing permissions" error when rolling
  - Updated rules to allow authenticated users to update stock-related fields (remainingStock, totalOwners)
  - Admins retain exclusive control over critical fields (name, value, rarity, offSale, stockType, totalStock)
  - **ACTION REQUIRED**: Deploy updated rules from FIREBASE_RULES.md to Firebase Console
- **Auto-Roll Enhancement**: Fixed auto-roll to properly stop when toggled off
  - Now uses refs to track current state instead of closure-captured values
  - Waits exactly 2 seconds after each roll completes (after 2.1s animation) before next roll
  - Properly cleans up timeouts when disabled
- See FIREBASE_SETUP_INSTRUCTIONS.md for detailed setup instructions

### October 28, 2025 (Earlier)
- **Sell System**: Complete transactional sell system with 80/20 revenue split
  - Players receive 80% of item value when selling
  - Admin account (user ID 1) receives 20% of all sales
  - Sell button in item detail modals (inventory view only)
  - Support for selling single items or entire stacks
  - All currency calculations use whole numbers (no decimals)
  - Atomic transactions ensure data consistency
- **Settings Page**: New settings interface with tabbed navigation
  - Auto-sell preferences: choose which rarities to auto-sell after rolling
  - Settings saved to user document in Firestore
  - Clean UI with shadcn tabs component
  - Available from roll screen navigation
- **Auto-Sell Integration**: Automatic selling during rolls
  - Items matching user's auto-sell preferences are sold immediately after rolling
  - Toast notification shows earnings instead of item addition
  - Bypasses inventory completely for matched rarities
  - 80/20 split applies to auto-sold items
- **CSS Fixes**: Improved visual layering
  - Stock/serial tags positioned on right side of cards
  - Tags z-index above images for visibility
  - Chroma rainbow effect z-index behind tags for INSANE items
  - Proper layering hierarchy maintained
- **Roll Animation Fix**: Fixed item switching during animation
  - Animation now displays correct final item throughout sequence
  - No more switching from one item to another mid-animation
  - Smooth deceleration with accurate final result

### October 28, 2025 (Earlier)
- **User Stats System**: Added comprehensive stats tracking (roll count, total/unique items, inventory value, rarest item, user ID)
  - Stats displayed on roll screen with icons and proper formatting
  - Efficient batched loading using Promise.all to avoid race conditions
- **Currency System**: Implemented cash balance for users
  - Starting balance of 1,000 cash
  - Displayed in topbar with proper nullish coalescing (handles zero balances correctly)
- **ItemCard Redesign**: 
  - Rarity badge moved to top left with color-coded background
  - Stock/serial numbers displayed top right
  - Insane rarity items feature animated rainbow gradient background
  - Consistent card heights with flex layout
  - Stack counts shown for inventory items with total value calculation
- **ItemDetailModal Redesign**:
  - Rarity badge overlaid on top left of item image
  - Stock info displayed on bottom left of image
  - Boxed layout for stats (description, value, roll chance, creator)
  - Rainbow gradient for Insane items in modal

### Earlier
- Initial implementation of Limited Empire rolling game
- Firebase integration with authentication and Firestore
- Complete UI with rolling, inventory, and admin features
- Rarity system with 8 tiers and rainbow animation for Insane items
- Stock system with serial numbers for limited items
- Security hardening with transactions and validation
- Comprehensive security documentation (see MVP_LIMITATIONS.md)

## Important Notes

**⚠️ MVP Architecture**: This is built using Firebase client SDK for rapid development. See `MVP_LIMITATIONS.md` for details on security limitations and production roadmap. The roll system is client-side and should be migrated to Cloud Functions before public production deployment.

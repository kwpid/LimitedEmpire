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
│   ├── ItemDetailModal.tsx
│   ├── ItemCreateForm.tsx
│   ├── ItemEditForm.tsx
│   ├── AdminPanel.tsx
│   └── GlobalRollToast.tsx
├── contexts/
│   └── AuthContext.tsx # Firebase auth state
├── lib/
│   ├── firebase.ts     # Firebase config
│   ├── rarity.ts       # Rarity utility functions
│   └── queryClient.ts
├── pages/
│   ├── Login.tsx       # Google sign-in
│   ├── UsernameSetup.tsx
│   ├── RollScreen.tsx  # Main rolling interface
│   ├── Inventory.tsx   # User's collection
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
- Item creation with live preview
- Item editing capabilities
- Stock management (limited/infinite)
- Off-sale toggle to disable rolling
- Visual previews of rarity, value, and roll chance

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

### October 28, 2025
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

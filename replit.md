# Limited Empire

## Overview

Limited Empire is a web-based collection game where players acquire rare items through a probability-based rolling system. The project aims to provide an engaging user experience with Google authentication, a sophisticated item rarity and stock system, and comprehensive administrative tools for item and user management. Key features include an animated rolling interface, inventory management, a real-time global roll notification system for high-value items, and advanced admin capabilities like item creation (with admin auto-ownership of serial #0), flexible item gifting, and a robust ban system with inventory wiping. The game's economy is centered around a probability-based item acquisition and selling mechanism, with plans for future expansion into reporting and analytics.

## Recent Changes (October 29, 2025)

**Trading System Removal:**
- Completely removed trading functionality from both frontend and backend
- Deleted Trades page, TradeModal, and TradeCard components
- Removed trade-related API routes and schemas
- Removed "Send Trade" button from player profile modals
- Updated navigation from 7 tabs to 6 tabs (removed Trades tab)

**Development Environment:**
- Firebase Admin SDK initialization made optional
- Graceful degradation when Firebase credentials are missing
- Server runs in development mode without Firebase dependencies

## Recent Changes (October 28, 2025)

**Latest Updates (Evening Session - Final):**
- **Roll Animation Container Fix**: Fixed container size issue - animation now stays within bounds and doesn't expand or move other elements off-screen
- **Mobile-Friendly Tabs**: Navigation tabs now show only icons on mobile screens (< sm breakpoint) for a cleaner, more compact interface
- **Leaderboard Cleanup**: Removed the countdown refresh timer for a cleaner appearance (auto-refresh every 5 minutes still works)
- **Badge UI Simplification**: Removed the help button from badge section for a streamlined profile interface

**Earlier Evening Session Updates:**
- **Banned User Banner**: Player profiles now display a prominent red banner at the top when viewing banned users, with ban reason if available
- **Auto-Sell Protection**: Mythic and Insane rarity items can no longer be auto-sold, preventing accidental loss of high-value items
- **Leaderboard Layout Redesign**: 
  - Changed to side-by-side layout (4 columns on XL screens, 2 on medium screens)
  - Reduced gradient brightness for better readability (added opacity)
  - Added scrollable frames with fixed height (600px) for consistent display
  - Implemented roll-tab-like mechanics (only renders on initial load, not on tab switches)
- **Roll Animation Overhaul**:
  - Completely redesigned from vertical to horizontal CS:GO style
  - Animation now scrolls left-to-right instead of top-to-bottom
  - Increased animation duration from 2s to 3.5s for better anticipation
  - Fixed autoroll speed-up bug by using stable ref-based animation keys
  - Implemented responsive centering that works across all viewport sizes

**Major New Features:**
- **Leaderboard System**: Added comprehensive leaderboard tab with 4 categories:
  - Top Value: Players ranked by total inventory value
  - Top Items: Players ranked by number of items owned
  - Top Cash: Players ranked by cash balance
  - Top Rolls: Players ranked by total roll count
  - Shows top 30 players per category, excluding admin (userId 1)
  - Top 3 players feature gold/silver/bronze gradient backgrounds
  - Auto-refreshes every 5 minutes
  - Clicking any player opens their profile modal

- **Badge System**: Implemented configurable player badge system
  - Developer badge for userId 2
  - Admin badge for admin users
  - Veteran badge for early users (userId < 100)
  - Millionaire badge for inventory value >= 1M
  - Roller tier badges (1K+, 10K+, 50K+ rolls) with dynamic names
  - Leaderboard tier badges (Top 30, Top 10, Top 3, Top 1) based on position
  - Badges displayed in player profile modal with colored icons and descriptions
  - Icon URLs configured in badgeConfig.ts for easy customization
  - Badge calculation uses leaderboard positions to prevent incorrect assignments

**Performance & UX Optimizations:**
- Optimized roll tab with React.memo - now renders exactly once on site load and never re-renders when switching tabs
- Roll component remains mounted but hidden with CSS display property when switching tabs
- Internal state and stats continue to update independently without component re-renders
- Data only updates after actual rolls, not on tab switches
- Removed 3-second roll delay - players can now roll again immediately after an item is shown
- Simplified autoroll logic to prevent double-rolling issues

**UI Improvements:**
- **Redesigned Player Cards**: Made more compact and consistent
  - Reduced avatar size from 80px to 48px for better space efficiency
  - Added inventory value display with trending icon
  - Ensured consistent sizing regardless of whether player has custom status
  - Showcase items reduced to 64px for proportional scaling
  - Removed padding for cleaner, denser layout
- **Player Profile Modal Enhancements**:
  - Added player ID display with Hash icon next to username
  - Integrated badge system with grid display of earned badges
  - Badges show icon, name, description, and color-coded styling
  - Removed "Add Friend" button
- **Item Detail Modal Fix**:
  - Fixed z-index issue where rarity/stock/serial badges appeared behind image
  - Badges now display properly in front with improved backdrop-blur
  - Added off-sale badge to image overlay for consistency
- Removed "rarest item" display from roll tab stats section for cleaner layout
- Fixed settings tab switching - profile and sell settings tabs now synchronize properly
- Added empty state indicators (Ban icon) for showcase slots without items
- Limited players "all" tab to show 10 players for optimization (unlimited when searching)
- Added professional footer with Roblox fair use disclaimer, locked to bottom of page
- Navigation has 6 tabs: Roll, Inventory, Players, Leaderboard, Index, and Settings

**Admin Features:**
- Fixed admin account appearing in item owners list - admin users are now filtered out from the owners display

## User Preferences

None specified yet.

## System Architecture

The application is built with a clear separation between frontend and backend concerns, leveraging Firebase for most backend services.

**UI/UX Decisions:**
The design adopts a dark, modern theme with a near-black background and slightly lighter card surfaces. Rarity-based color coding is extensively used for visual hierarchy and immediate recognition of item value. Smooth animations and transitions are implemented using Framer Motion to enhance user experience, particularly in the rolling system and modal interactions. Responsive grid layouts ensure usability across various devices. Shadcn/ui components are utilized for a consistent and accessible UI. Insane rarity items feature a distinctive animated rainbow gradient.

**Technical Implementations:**
- **Frontend**: Developed with React and TypeScript for robust type checking and maintainability. Tailwind CSS provides utility-first styling, while Wouter handles routing. TanStack Query manages server state efficiently.
- **Backend**: Primarily relies on Firebase services:
    - **Firebase Authentication**: For Google OAuth-based user authentication.
    - **Firebase Firestore**: As the primary NoSQL database for managing users, items, inventory, global rolls, and audit logs.
    - **Firebase Hosting**: For deploying the web application.
- **Rarity System**: Items are categorized into 8 tiers based on value, influencing their roll probability logarithmically.
- **Stock System**: Items can be "limited" (with serial numbers and finite stock) or "infinite." Admins receive serial #0 for all new limited items.
- **Transactional Integrity**: Firebase transactions are used to ensure atomicity and consistency for critical operations like rolling, selling, item gifting, and inventory wiping.
- **Real-time Features**: Global roll notifications for high-value items and real-time updates from Firestore are implemented.
- **Admin Features**:
    - **Item Management**: Creation (with auto-ownership for admin), editing, stock management, and off-sale toggling.
    - **User Management**: Viewing user stats, advanced item gifting (creating new serials or transferring existing ones), and a comprehensive ban system (temporary/permanent, inventory wipe options, presets).
    - **Audit Logging**: All admin actions are recorded in a dedicated Firestore collection and viewable through an admin panel.
- **Security Rules**: Firebase security rules enforce data access control, ensuring users can only manage their own data and only admins can perform privileged operations.
- **Roll System Logic**: The core rolling mechanism uses item values to calculate probabilities. While currently client-side for rapid development, it's designed for future migration to Cloud Functions for enhanced security.

**Core Data Models (Firestore Collections):**
- `users`: Stores user profiles, authentication details, cash, roll counts, ban status, and settings.
- `items`: Defines item properties such as name, value, rarity, stock type, and image URL.
- `inventory`: Links users to their owned items, including serial numbers for limited items and NFT lock status.
- `globalRolls`: Records significant item rolls for public display.
- `auditLogs`: Tracks all administrative actions.
- `counters`: Manages sequential IDs (e.g., for users).

## External Dependencies

- **Firebase**:
    - **Authentication**: For user sign-in via Google OAuth.
    - **Firestore**: Primary database for all application data.
    - **Hosting**: For deploying the web application.
- **Discord Webhooks**: Used for real-time notifications for item releases and admin actions, with authenticated endpoints.
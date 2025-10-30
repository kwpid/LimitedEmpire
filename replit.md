# Limited Empire

## Overview

Limited Empire is a web-based collection game where players acquire rare items through a probability-based rolling system. The project provides an engaging user experience with Google authentication, a sophisticated item rarity and stock system, and comprehensive administrative tools. Key features include an animated rolling interface, inventory management, a real-time global roll notification system for high-value items, and advanced admin capabilities like item creation, flexible item gifting, and a robust ban system. The game's economy is centered around probability-based item acquisition and selling, with future expansion plans for reporting and analytics.

## User Preferences

None specified yet.

## System Architecture

The application is built with React, TypeScript, and Firebase, maintaining a clear separation between frontend and backend concerns.

### UI/UX Decisions
The design features a dark, modern theme with rarity-based color coding for visual hierarchy. Framer Motion is used for smooth animations and transitions, especially in the rolling system and modal interactions. Responsive grid layouts ensure cross-device usability. Shadcn/ui components provide a consistent and accessible user interface. Insane rarity items have a distinctive animated rainbow gradient. Mobile interfaces prioritize icon-only navigation and compact layouts.

### Technical Implementations
- **Frontend**: Developed with React and TypeScript, utilizing Tailwind CSS for styling and Wouter for routing. TanStack Query efficiently manages server state.
- **Backend**: Primarily uses Firebase services:
    - **Firebase Authentication**: For Google OAuth.
    - **Firebase Firestore**: Main NoSQL database for all application data.
    - **Firebase Hosting**: For web application deployment.
- **Rarity System**: Items are categorized into 8 tiers, influencing roll probability logarithmically.
- **Stock System**: Supports "limited" (with serial numbers) and "infinite" items. Admins automatically receive serial #0 for new limited items.
- **Transactional Integrity**: Firebase transactions ensure atomicity for critical operations like rolling, selling, gifting, and inventory wiping.
- **Real-time Features**: Global roll notifications for high-value items and real-time Firestore updates.
- **Admin Features**: Item management (creation, editing, stock, off-sale), user management (stats, advanced gifting, comprehensive ban system with inventory wipe options), and audit logging of all admin actions.
- **Security Rules**: Firebase security rules enforce data access control.
- **Roll System Logic**: Core mechanism calculates probabilities based on item values, with a design for future migration to Cloud Functions.
- **Optimization**: Implemented a buffered write system for user data (auto-saves every 60 seconds or on page unload) and a persistent 5-minute cache for item data (`itemsCache`) to significantly reduce Firestore reads and writes. Leaderboard refreshes are synchronized globally.
- **Trading System**: Comprehensive 4-tab interface for managing trades, including item selection (1-7 items), cash offers, NFT-locked item restrictions, and inventory sorting/searching. Trade validation is enforced client-side and via Firestore security rules.
- **Leaderboard System**: Displays top 30 players across four categories (Value, Items, Cash, Rolls) with gold/silver/bronze rankings, auto-refreshing every 5 minutes.
- **Badge System**: Configurable player badges (Developer, Admin, Veteran, Millionaire, Roller Tiers, Leaderboard Tiers) displayed in player profiles with dynamic calculation.

### Core Data Models (Firestore Collections)
- `users`: User profiles, auth details, cash, roll counts, ban status.
- `items`: Item properties (name, value, rarity, stock, image URL).
- `inventory`: User-owned items, serial numbers, NFT lock status.
- `globalRolls`: Records significant item rolls.
- `auditLogs`: Administrative actions.
- `counters`: Sequential IDs.
- `trades`: Trade offers (items, cash, status, timestamps).

## External Dependencies

- **Firebase**:
    - **Authentication**: Google OAuth.
    - **Firestore**: Primary database.
    - **Hosting**: Web application deployment.
- **Discord Webhooks**: Real-time notifications for item releases and admin actions.
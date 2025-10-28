# Limited Empire - Design Guidelines

## Design Approach

**Reference-Based Gaming Interface** drawing inspiration from modern web-based collection games and gacha systems (CS:GO case opening interfaces, Fortnite item shops, trading card game interfaces). Emphasize the excitement of rolling while maintaining clean information architecture for inventory management.

**Core Principle**: Create anticipation and reward through visual design - every roll should feel significant, every item should feel valuable.

## Design Principles

1. **Visual Drama**: Use motion and scale to create excitement during rolls
2. **Information Clarity**: Dense data displays remain scannable and organized
3. **Rarity Prominence**: Color coding must be immediately recognizable
4. **Performance First**: Smooth animations even with auto-roll enabled

## Typography System

**Primary Font**: Inter or Montserrat (Google Fonts)
- Headers: 700 weight, tracking-tight
- Body: 500 weight
- Data/Stats: 600 weight, tabular-nums

**Scale**:
- Game Title/Hero: text-5xl to text-6xl
- Section Headers: text-2xl to text-3xl
- Item Names: text-lg to text-xl
- Item Values/Stats: text-base
- Metadata/Labels: text-sm
- Fine Print: text-xs

## Layout System

**Spacing Primitives**: Use Tailwind units of 2, 4, 6, 8, 12, 16
- Component padding: p-4 to p-6
- Section gaps: gap-6 to gap-8
- Screen margins: px-6 md:px-12

**Grid System**:
- Inventory/Index: grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5
- Item cards: Compact but readable, ~200-250px width
- Admin panels: Single column forms with max-w-2xl

## Color System (Rarity Framework)

**Base Theme**: 
- Background: Near-black (#0a0a0a to #111111)
- Surface: Slightly lighter (#1a1a1a to #1f1f1f)
- Borders: Subtle (#2a2a2a to #333333)

**Rarity Colors** (applied to borders, glows, accents):
- Common: #ffffff (white)
- Uncommon: #90ee90 (light green)
- Rare: #87ceeb (light blue)
- Ultra Rare: #1e3a8a (dark blue)
- Epic: #a855f7 (purple)
- Ultra Epic: #6b21a8 (dark purple)
- Mythic: #dc2626 (red)
- Insane: Linear gradient (rainbow animation)

**Gradients**: Apply subtle radial gradients on surfaces, strong gradients for CTAs and important UI elements

## Component Library

### Navigation
- Sticky top bar with game title, username display, balance/stats
- Tab-based navigation between Roll/Inventory/Index screens
- Width: full-width with max-w-7xl container
- Height: h-16 to h-20

### Roll Screen Components

**Roll Display Area**:
- Large central area (min-h-[60vh]) for roll animation
- Item card scales up during reveal (transform scale-110 to scale-125)
- Rarity glow effect radiates from card edges
- Value display prominently below item

**Roll Controls**:
- Large "ROLL" button (w-48 h-16) with gradient background
- Auto-roll toggle switch with active state glow
- Roll speed indicator during auto-roll

**Best Rolls Panels** (Side by Side):
- Personal Best (250k+): Left panel, max 5-8 items
- Global Rolls (2.5m+): Right panel, live feed with timestamps
- Each panel: p-4, rounded-lg, border with subtle glow

### Inventory/Index Screens

**Filter Bar**:
- Search input: Full-width with icon, rounded-lg
- Filter dropdowns: Rarity, Stock Status, Value Range
- Sort options: Value, Recent, Alphabetical
- Sticky positioning (top-20) on scroll

**Item Cards**:
- Image: Square aspect ratio (aspect-square)
- Rarity border: 2px solid with matching glow
- Content: Item name, value, serial # (if applicable)
- Hover state: Slight lift (hover:-translate-y-1) and enhanced glow

**Item Detail Popup**:
- Modal overlay: backdrop-blur with bg-black/80
- Content area: max-w-2xl, centered
- Two-column layout: Image left (40%), Details right (60%)
- Displays: Name, description, value, rarity, stock info, serial #
- Admin edit button: Positioned top-right corner

### Admin Panel

**Tab System**:
- Horizontal tabs: Create Item, Edit Items, Manage Users
- Active tab: Bottom border accent with rarity color

**Create Item Form**:
- Left column: Image preview (aspect-square, 300px)
- Right column: Form inputs stacked
- Toggle switches for: Off-Sale, Limited Stock
- Stock input appears conditionally
- Preview widgets show: Calculated %, rarity tier, color coding

**Form Inputs**:
- Labels: text-sm, mb-2
- Inputs: p-3, rounded-lg, border-2
- Image URL input with live preview
- Textarea for description (rows-4)
- Number inputs for value and stock

### Notifications System

**Global Roll Toast**:
- Slides in from top-right
- Shows: Player username, item image (small), item name, value
- Auto-dismiss after 5 seconds
- Rarity-colored border with animated glow

## Animations

**Roll Animation Sequence**:
1. Fast spin blur effect (duration-100 repeating)
2. Gradual deceleration over 2-3 seconds
3. Final reveal with scale-up and glow (duration-500)
4. Rarity-specific particle effects for Epic+

**Microinteractions**:
- Card hover: Smooth lift with glow intensification
- Button press: Scale down (active:scale-95)
- Tab switching: Slide transition between views
- Filter application: Fade items out/in

**Performance Notes**: 
- Use CSS transforms over position changes
- Implement will-change for roll animations
- Debounce search inputs
- Virtualize long inventory lists

## Responsive Breakpoints

**Mobile (base)**:
- Single column layouts
- Roll display takes full viewport
- Best rolls stack vertically
- Item cards: grid-cols-2

**Tablet (md: 768px)**:
- Two-column inventory
- Side-by-side best rolls panels
- Expanded filter bar

**Desktop (lg: 1024px+)**:
- Multi-column inventory (4-5 cols)
- Full admin panel layout
- Enhanced roll animations

## Accessibility

- Focus states: ring-2 ring-offset-2 with rarity colors
- ARIA labels for all interactive elements
- Keyboard navigation through inventory/index
- Screen reader announcements for roll results
- Sufficient contrast ratios (WCAG AA minimum)

## Images

**Item Images**: 
- Required for all items (admin-provided URLs)
- Display size: 200x200px in cards, 300x300px in popups
- Fallback: Placeholder with item name initial and rarity color

**No Hero Image Required**: This is a game interface, not a marketing site
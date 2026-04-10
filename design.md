# Foodie Finder - Mobile App Design Document

© 2025 Sassy Consulting - A Veteran Owned Company

## Overview
Foodie Finder is a lightweight mobile app for foodies and travelers to discover local restaurants, view daily specials, and use a fun random restaurant picker. The app aggregates ratings from multiple sources and provides quick, accessible information for users who aren't technically inclined.

## Target Audience
- Local foodies looking for dining variety
- Travelers exploring new areas
- Office workers near restaurant clusters who need quick lunch decisions
- Non-technical users who want simple, fun restaurant discovery

---

## Color Palette

### Primary Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Sky Blue** | `#6BA3BE` | Primary accent, headers, active states |
| **Light Blue** | `#A8D5E5` | Secondary backgrounds, cards |
| **Soft Blue** | `#E8F4F8` | Light backgrounds, surfaces |

### Accent Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Copper** | `#B87333` | Call-to-action buttons, highlights |
| **Light Orange** | `#E8A87C` | Secondary accents, icons |
| **Warm Cream** | `#FDF5E6` | Card backgrounds, elevated surfaces |

### Neutral Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Charcoal** | `#36454F` | Primary text |
| **Slate Gray** | `#5A6A7A` | Secondary text |
| **Light Gray** | `#E5E8EB` | Borders, dividers |
| **Off White** | `#FAFBFC` | Main background |

---

## Screen List

### 1. Home Screen (Random Picker)
The main screen featuring the random restaurant picker functionality.

**Primary Content:**
- Distance radius selector (slider: 1-25 miles)
- Zip code input field
- Large "Randomize" button with animation
- Result card showing selected restaurant with:
  - Restaurant name
  - Distance from user
  - Today's special (if available)
  - Quick rating indicator
  - "View Details" link

**Layout:**
- Top: App title and location indicator
- Middle: Distance controls and zip code
- Center: Large randomize button (thumb-friendly, bottom third)
- Bottom: Result display area

### 2. Restaurant List Screen
Browse all indexed restaurants in the area.

**Primary Content:**
- Search bar at top
- Filter chips (distance, cuisine type, has specials)
- Scrollable list of restaurant cards showing:
  - Restaurant name
  - Cuisine type
  - Distance
  - Aggregated rating (stars)
  - Today's special preview (truncated)

### 3. Restaurant Detail Screen
Full information about a selected restaurant.

**Primary Content:**
- Restaurant header image (if available)
- Restaurant name and cuisine type
- Address with map link
- Phone number (tappable)
- Website link
- **Daily Special** section (highlighted)
- **Culvers Flavor of the Day** (for Culvers locations)
- **Aggregated Rating** section:
  - Overall score
  - Individual source ratings (Yelp, Facebook, Website)
  - Rating breakdown visualization
- Brief restaurant description/info

### 4. Favorites Screen
User's saved favorite restaurants.

**Primary Content:**
- List of favorited restaurants
- Quick access to randomize from favorites only
- Empty state with prompt to add favorites

### 5. Settings Screen
App configuration options.

**Primary Content:**
- Default zip code setting
- Default distance radius
- Notification preferences
- About/Help section
- Copyright: © 2025 Sassy Consulting - A Veteran Owned Company

---

## Key User Flows

### Flow 1: Random Restaurant Selection
1. User opens app → Home Screen
2. User adjusts distance slider (default: 5 miles)
3. User enters/confirms zip code
4. User taps "Randomize" button
5. Button animates (spinning/shuffling effect)
6. Result card slides up with random restaurant
7. Card shows: name, distance, today's special
8. User can tap "Try Again" or "View Details"

### Flow 2: Browse and Discover
1. User taps "Browse" tab → Restaurant List
2. User scrolls through restaurants
3. User can filter by distance or "Has Special Today"
4. User taps restaurant card → Detail Screen
5. User views full info, specials, ratings
6. User can tap heart to favorite

### Flow 3: Culvers Flavor of the Day
1. User searches or browses to find Culvers
2. User taps Culvers location → Detail Screen
3. Prominent "Flavor of the Day" section displays:
   - Today's flavor name
   - Flavor description
   - (Pulled from Culvers API by zip code)

### Flow 4: View Aggregated Ratings
1. User on Restaurant Detail Screen
2. Scrolls to "Ratings" section
3. Sees overall aggregated score (e.g., 4.2/5)
4. Sees breakdown by source:
   - Yelp: 4.0 ★
   - Facebook: 4.5 ★
   - Website: 4.2 ★
5. Visual bar chart shows rating distribution

---

## Navigation Structure

```
Tab Bar (Bottom)
├── Home (Random Picker) - house.fill icon
├── Browse (Restaurant List) - magnifyingglass icon
├── Favorites - heart.fill icon
└── Settings - gearshape.fill icon
```

---

## Component Specifications

### Randomize Button
- Size: 160x160pt circular
- Background: Copper gradient (#B87333 → #E8A87C)
- Icon: Dice or shuffle icon (white, 48pt)
- Text: "SPIN" below icon
- Animation: Rotation + scale pulse on press
- Position: Center of screen, thumb-reachable

### Restaurant Card (List View)
- Height: 100pt
- Padding: 16pt
- Border radius: 12pt
- Background: Warm Cream (#FDF5E6)
- Shadow: subtle (2pt blur)
- Content:
  - Left: Restaurant icon/image (64pt)
  - Center: Name, cuisine, distance
  - Right: Rating badge, special indicator

### Distance Slider
- Track color: Light Gray
- Active track: Sky Blue
- Thumb: Copper circle
- Labels: "1 mi" to "25 mi"
- Current value displayed above thumb

### Rating Badge
- Circular, 40pt diameter
- Background: Sky Blue
- Text: Rating number (white, bold)
- Star icon beside

---

## Typography

| Style | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| Title | 28pt | Bold | 36pt | Screen titles |
| Subtitle | 20pt | SemiBold | 28pt | Section headers |
| Body | 16pt | Regular | 24pt | Main content |
| Caption | 14pt | Regular | 20pt | Secondary info |
| Small | 12pt | Regular | 16pt | Labels, hints |

---

## Spacing System (8pt Grid)

- xs: 4pt
- sm: 8pt
- md: 16pt
- lg: 24pt
- xl: 32pt
- xxl: 48pt

---

## Data Requirements

### Restaurant Object
```typescript
interface Restaurant {
  id: string;
  name: string;
  cuisineType: string;
  address: string;
  zipCode: string;
  phone?: string;
  website?: string;
  latitude: number;
  longitude: number;
  isCulvers: boolean;
  dailySpecial?: {
    title: string;
    description: string;
    validDate: string;
  };
  ratings: {
    yelp?: number;
    facebook?: number;
    website?: number;
    aggregated: number;
  };
  flavorOfTheDay?: string; // Culvers only
  description?: string;
  imageUrl?: string;
  isFavorite: boolean;
}
```

### User Preferences (Local Storage)
```typescript
interface UserPreferences {
  defaultZipCode: string;
  defaultRadius: number; // miles
  favorites: string[]; // restaurant IDs
}
```

---

## Accessibility Considerations

- All touch targets minimum 44pt
- High contrast text (Charcoal on light backgrounds)
- Clear visual hierarchy
- Large, readable fonts (minimum 14pt body)
- Haptic feedback on button presses
- VoiceOver/TalkBack compatible labels

---

## Copyright Notice

© 2025 Sassy Consulting - A Veteran Owned Company

All rights reserved. This application and its design are proprietary to Sassy Consulting.

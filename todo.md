# Foodie Finder - Project TODO

© 2025 Sassy Consulting - A Veteran Owned Company

## Core Features

- [x] Set up theme colors (light blues, copper/orange, charcoal gray)
- [x] Generate custom app icon
- [x] Configure app branding in app.config.ts
- [x] Create tab navigation (Home, Browse, Favorites, Settings)
- [x] Build Home screen with random restaurant picker
- [x] Implement distance radius selector (1-25 miles)
- [x] Add zip code input field
- [x] Create animated "Randomize" button
- [x] Build restaurant result card component
- [x] Create Browse/Restaurant List screen
- [x] Implement restaurant search functionality
- [x] Add filter chips (distance, cuisine, has specials)
- [x] Build Restaurant Detail screen
- [x] Display daily specials section
- [x] Implement Culvers Flavor of the Day feature
- [x] Create aggregated ratings display (Yelp, Facebook, Website)
- [x] Build Favorites screen
- [x] Implement favorite/unfavorite functionality
- [x] Create Settings screen with default preferences
- [x] Add copyright notice to Settings/About section
- [x] Implement local storage for user preferences
- [x] Add sample restaurant data for demo
- [x] Implement distance calculation from zip code

## UI Components

- [x] Restaurant card component
- [x] Rating badge component
- [x] Special of the day badge
- [x] Distance selector component
- [x] Filter chip component
- [x] Empty state components

## Polish & Testing

- [x] Add haptic feedback to buttons
- [x] Implement loading states
- [x] Add error handling
- [x] Test all user flows

## Real Restaurant Data - Intelligent Scraping System

- [x] Set up backend scraping infrastructure
- [x] Create enhanced restaurant data model
- [x] Build multi-source scraping service (Facebook, Yelp, Google, websites)
- [x] Scrape and aggregate ratings from multiple sources
- [x] Extract menu links and embedded menus
- [x] Capture phone numbers for tap-to-call ordering
- [x] Find online ordering links (DoorDash, UberEats, direct)
- [x] Get reservation links (OpenTable, Resy)
- [x] Extract price range indicators
- [x] Scrape popular dishes from reviews/menus
- [x] Get hours of operation
- [x] Find parking info
- [x] Update frontend with new data fields
- [x] Add tap-to-call functionality
- [x] Add menu viewer/links
- [x] Add ordering options section
- [x] Test with real restaurant data

## Intelligent Review Sentiment Analysis

- [x] Create 400+ phrase sentiment dictionary for restaurants
- [x] Build lightweight LLM sentiment analyzer
- [x] Generate smart review summaries (loved/mixed/caution)
- [x] Display sentiment summary on restaurant cards
- [x] Show detailed sentiment breakdown on detail screen

## Live Culver's Flavor of the Day

- [x] Research Culver's website structure for flavor data
- [x] Implement live scraping of Culver's Flavor of the Day
- [x] Connect scraper to restaurant detail screen
- [x] Test with multiple zip codes

## Auto-Scroll After Spin

- [x] Add ScrollView ref to Home screen
- [x] Implement auto-scroll to result after spin animation
- [x] Ensure smooth scroll behavior

## GPS Location Detection

- [x] Install expo-location package
- [x] Request location permissions
- [x] Implement getCurrentPosition function
- [x] Reverse geocode to get zip code from coordinates
- [x] Add "Use My Location" button on Home screen
- [x] Auto-populate zip code field from GPS
- [x] Handle permission denied gracefully

## Cuisine Type Filters

- [x] Add cuisine filter chips to Browse screen
- [x] Implement filter state management
- [x] Filter restaurants by cuisine type
- [x] Add "All" option to clear filters
- [x] Style active/inactive filter states
- [x] Persist filter preferences

## Restaurant Photos Carousel

- [x] Add photos array to restaurant data model
- [x] Create PhotoCarousel component
- [x] Implement horizontal scroll with pagination dots
- [x] Add photo zoom/fullscreen modal
- [x] Display photos on restaurant detail screen
- [x] Handle missing photos gracefully

## Open Now Filter

- [x] Create isOpenNow utility function
- [x] Parse hours of operation strings
- [x] Compare with device current time
- [x] Add "Open Now" filter chip to Browse screen
- [x] Show open/closed status on restaurant cards
- [x] Handle restaurants without hours data

## Share Functionality

- [x] Install expo-sharing package
- [x] Create share button on restaurant detail screen
- [x] Generate shareable text with restaurant info
- [x] Support native share sheet (iOS/Android)
- [x] Add share button to restaurant detail header

## Price Range Filter

- [x] Add price range filter chips ($, $$, $$$, $$$$)
- [x] Filter restaurants by price range
- [x] Display price range on restaurant cards
- [x] Allow single price selection with "Any Price" option

## Recently Viewed History

- [x] Create recently viewed storage hook
- [x] Track restaurant views (last 10)
- [x] Add Recently Viewed section to Home screen
- [x] Persist history in AsyncStorage
- [x] Add clear history option in Settings

## Dark Mode Toggle

- [x] Add theme preference to user settings
- [x] Create theme toggle switch in Settings
- [x] Persist theme preference in AsyncStorage
- [x] Apply theme across all screens

## Dietary Restriction Filters

- [x] Add dietary tags to restaurant data model
- [x] Create dietary filter chips (Vegan, Vegetarian, Gluten-Free, etc.)
- [x] Filter restaurants by dietary options
- [x] Display dietary badges on restaurant cards

## Future Enhancements

- [ ] Push notifications for daily specials
- [ ] Restaurant reviews submission
- [ ] Offline mode with cached data
- [ ] Multiple saved locations (home, work)

## Claude Audit Fixes (December 2025)

### Critical (Before Launch)
- [x] Fix heart icon bug in restaurant-card.tsx (line 92)
- [x] Fix package name in package.json (app-template → foodie-finder)
- [x] Update tRPC to 11.8.1 (security vulnerability fixed)
- [x] Add accessibility labels to all Pressable components
- [x] Fix color contrast (copper on cream fails WCAG AA)

### High Priority
- [x] Create use-responsive.ts hook for breakpoints
- [x] Add responsive spin button sizing
- [x] Set minHeight: 44 on all touch targets (filter chips, buttons)
- [x] Add tablet layout support (numColumns for FlatList)
- [x] Add screen reader announcements for dynamic content

### Medium Priority
- [x] Add landscape mode support
- [x] Add focus management for keyboard users
- [x] Compress image assets
- [x] Add component tests with React Native Testing Library

## Rebranding - Manus to Sassy

- [x] Replace all 'manus' with 'sassy' in bundle IDs
- [x] Update app.config.ts identifiers
- [x] Update deep link schemes
- [x] Verify all references updated

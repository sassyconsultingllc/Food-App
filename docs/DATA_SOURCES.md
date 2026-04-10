# Restaurant Data Integration

## Strategy: Shared Cache + User Imports

Foodie Finder minimizes API costs through two mechanisms:

1. **Shared Cache**: When any user searches a zip code, results are cached for ALL users
2. **User Imports**: Users share restaurants from Google Maps → added to their favorites

### Cost Breakdown

| Action | API Calls | Cost |
|--------|-----------|------|
| First user searches 53703 | 1 call to each source | ~$0.05 |
| Next 1000 users search 53703 | 0 (cached) | $0.00 |
| User shares from Google Maps | 1 Place Details call | ~$0.017 |

## Data Sources

| Source | Free Tier | Used For |
|--------|-----------|----------|
| **Foursquare** | 100k/month | Initial zip code scrapes |
| **HERE Places** | 250k/month | Initial zip code scrapes |
| **Google Places** | $200 credit/month | User imports only |
| **OpenStreetMap** | Unlimited | Baseline data |
| **Culver's** | Unlimited | Flavor of the Day |

## User Flow

### Discovery via Search
```
User searches "53703"
        ↓
Server checks: is zip cached?
        ↓
   ┌────┴────┐
   │         │
  YES        NO
   │         │
   ↓         ↓
Serve from   Hit APIs
cache        & cache
```

### Import via Share
```
User in Google Maps finds "Joe's Pizza"
        ↓
Taps Share → Foodie Finder
        ↓
App receives Google Maps URL
        ↓
Server: Extract Place ID from URL
        ↓
Server: Check cache for this restaurant
        ↓
   ┌────┴────┐
   │         │
In cache   Not cached
   │         │
   ↓         ↓
Use cache   Fetch Place Details ($0.017)
            & cache for everyone
        ↓
Add to user's favorites
        ↓
"Joe's Pizza added to favorites! 🎉"
```

### Randomizer
```
User taps "Pick Random"
        ↓
Pull from user's favorites (server-synced)
        ↓
Random selection
        ↓
"Tonight: Joe's Pizza!"
```

## Setup

### Required (free)
```bash
# OpenStreetMap and Culver's work without keys
```

### Recommended (for search)
```bash
# Get at least one for initial searches
FOURSQUARE_API_KEY=your_key  # 100k/month free
HERE_API_KEY=your_key        # 250k/month free
```

### For User Imports
```bash
# Required for Google Maps share imports
GOOGLE_PLACES_API_KEY=your_key  # Place Details only, ~$17/1000
```

## Database Tables

### `restaurant_cache`
Shared across all users. One restaurant = one row, regardless of how many users have it favorited.

### `zipcode_cache`  
Tracks which zip codes have been scraped and when.

### `user_favorites`
Links users to cached restaurants. Many users can favorite the same restaurant.

### `shared_imports`
Audit log of Google Maps shares processed.

## Cache Behavior

- **Zip code search**: Cached for 24 hours minimum
- **Restaurant data**: Refreshed when explicitly requested or 7 days old
- **No fallback data**: If cache miss and APIs fail, return empty (no fake data)

## Attribution

When displaying data, include appropriate attribution:
- **Foursquare**: "Powered by Foursquare"
- **Google**: Follow Google's attribution requirements
- **OpenStreetMap**: "© OpenStreetMap contributors"

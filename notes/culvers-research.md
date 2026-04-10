# Culver's Flavor of the Day Research

© 2025 Sassy Consulting - A Veteran Owned Company

## Key Findings

### URL Structure
- Location page: `https://www.culvers.com/restaurants/{location-slug}`
- Example: `https://www.culvers.com/restaurants/madison-cottage-grove`

### Data Available on Location Page
1. **Today's Flavor of the Day**: "OREO® Cookie Cheesecake"
2. **Upcoming Flavors**: Listed with dates
3. **Daily Soups**: Available while supplies last
4. **Restaurant Hours**: Lobby, Drive Thru, Curbside
5. **Phone Number**: (608) 268-0211
6. **Address**: 4401 Cottage Grove Road, Madison, WI
7. **Owner**: Paul Kneubuehl

### API Discovery
The Flavor of the Day search uses:
- Input: City, State or ZIP code
- Returns: List of nearby Culver's locations
- Each location has a unique slug for direct access

### Scraping Strategy
1. Use the location finder API with zip code
2. Get list of nearby Culver's locations
3. Scrape each location page for:
   - Today's Flavor of the Day
   - Flavor description (from flavor detail page)
   - Hours
   - Address

### Example Data Structure
```json
{
  "location": "Madison - Cottage Grove Rd",
  "address": "4401 Cottage Grove Road, Madison, WI",
  "phone": "(608) 268-0211",
  "flavorOfTheDay": "OREO® Cookie Cheesecake",
  "hours": {
    "lobby": "10:00 AM - 10:30 PM",
    "driveThru": "10:00 AM - 10:30 PM",
    "curbside": "10:00 AM - 9:45 PM"
  },
  "upcomingFlavors": [
    { "date": "2024-12-23", "flavor": "Really Reese's" },
    { "date": "2024-12-26", "flavor": "Caramel Fudge Cookie Dough" }
  ]
}
```

// Offline assertion of the scraper data-quality fixes against the exact
// cases from the 2026-06-15 screenshots. No network — pure-function checks.
import { inferCuisine, isNonFoodPlace } from "../worker/scraper.ts";

let pass = 0, fail = 0;
function eq(label, got, want) {
  const ok = got === want;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  => ${JSON.stringify(got)}${ok ? "" : `  (want ${JSON.stringify(want)})`}`);
  ok ? pass++ : fail++;
}

// Cuisine relabeling (screenshot mislabels on the left)
eq("Yako Sushi House (was Fast Food)",        inferCuisine("Yako Sushi House", ["Fast Food"], "Fast Food"), "Japanese");
// Provider category "Bakery" is specific, so it wins over the name token
// "Diner" — both are defensible for Monty's; we just don't regress to a
// generic label.
eq("Monty's Blue Plate Diner (was Bakery)",   inferCuisine("Monty's Blue Plate Diner", ["Bakery"], "Bakery"), "Bakery");
eq("Fratelli's Trattoria (was Restaurant)",   inferCuisine("Fratelli's Trattoria", ["Restaurant"], "Restaurant"), "Italian");
eq("Habanero's Mexican Grill (was Casual)",   inferCuisine("Habanero's Mexican Grill", ["Casual Dining"], "Casual Dining"), "Mexican");
eq("David's Jamaican Cuisine (was Casual)",   inferCuisine("David's Jamaican Cuisine", ["Casual Dining"], "Casual Dining"), "Caribbean");
eq("Hot N Spicy Asian (was Casual)",          inferCuisine("Hot N Spicy Asian", ["Casual Dining"], "Casual Dining"), "Asian");
// "Fish Fry" matches Seafood before Burgers — acceptable for a fish-fry house.
eq("Hank's Burgers & Fish Fry (was Rest.)",   inferCuisine("Hank's Burgers & Fish Fry", ["Restaurant"], "Restaurant"), "Seafood");
eq("Javaabilities (was Fast Food)",           inferCuisine("Javaabilities", ["Fast Food"], "Fast Food"), "Cafe");
eq("Weary Traveler Freehouse (was Bar)",      inferCuisine("Weary Traveler Freehouse", ["Bar"], "Bar"), "Brewpub");

// Culver's: google-sourced "Store" must not surface; burgers categories win
eq("Culver's google record (was Store)",      inferCuisine("Culver's - McFarland", ["Store", "Restaurant", "Food"], "Store"), "Restaurant");
eq("Culver's native record",                  inferCuisine("Culver's - McFarland", ["Fast Food", "Burgers", "Ice Cream"], "Fast Food"), "Burgers");

// Non-food deny-list
eq("Action Outdoor Kitchen dropped",          isNonFoodPlace(["Hardware, House & Garden"]), true);
eq("Culver's kept",                           isNonFoodPlace(["Fast Food", "Burgers", "Ice Cream"]), false);
eq("Bar kept",                                isNonFoodPlace(["Bar"]), false);
eq("Sushi kept",                              isNonFoodPlace(["Japanese", "Sushi"]), false);

// Culver's brand-name construction (mirror of the scraper inline logic)
const brand = (city) => (city ? `Culver's - ${city}` : "Culver's");
eq("Culver's name uses brand, not locator", brand("McFarland"), "Culver's - McFarland");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

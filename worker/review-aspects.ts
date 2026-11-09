// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
/**
 * Review aspects: turn raw review text into verdicts people actually search
 * for. "4.3 stars" says nothing about whether a place is quiet enough to talk,
 * good for a laptop, or has coffee worth the ocean view. This extracts
 * aspect-level verdicts ("Best place for quiet atmosphere", "Great oceanside
 * coffee", "Bad service") from review sentences.
 *
 * Deterministic and dependency-free so it runs per search inside the Worker
 * without an LLM call, and so the same text always yields the same labels.
 *
 * How a verdict is reached:
 *  1. Reviews are split into clauses (sentences, then "but"/"however"/";"),
 *     so "coffee was great but service was slow" scores each aspect apart.
 *  2. A clause that mentions an aspect is scored by nearby polarity words,
 *     flipped by negation ("wasn't good"), plus any polarity the aspect term
 *     itself carries ("noisy" counts against "quiet atmosphere"). Aspect
 *     terms are masked first so "cold brew" doesn't read as "cold".
 *  3. Clauses with no polarity fall back to that review's star rating.
 *  4. Per aspect: best = repeated praise with a superlative, great = repeated
 *     praise, good = net praise, bad = repeated complaints. Mixed is dropped.
 *  5. A setting (oceanside, rooftop, patio) and an item (coffee, cocktails)
 *     praised in the same review combine: "Great oceanside coffee".
 */

export type AspectVerdict = 'best' | 'great' | 'good' | 'bad';
export type AspectKind = 'vibe' | 'setting' | 'item' | 'quality';

export interface ReviewAspect {
  /** Stable key, e.g. "quiet", "coffee", "waterfront+coffee". */
  key: string;
  kind: AspectKind | 'combo';
  verdict: AspectVerdict;
  /** Display label, e.g. "Best place for quiet atmosphere". */
  label: string;
  /** Clauses that praised this aspect. */
  positive: number;
  /** Clauses that complained about it. */
  negative: number;
}

export interface ReviewInput {
  text: string;
  /** 1-5 stars, when the source gives one. */
  rating?: number;
}

interface AspectDef {
  key: string;
  kind: AspectKind;
  /** Neutral mentions; polarity comes from context. */
  terms: string[];
  /** Mentions that are themselves praise for this aspect. */
  posTerms?: string[];
  /** Mentions that are themselves a complaint about this aspect. */
  negTerms?: string[];
  /** Label body. vibe: "place for <phrase>"; others: "<phrase>". */
  phrase: string;
}

const ASPECTS: AspectDef[] = [
  // Vibe: "Great place for ..."
  {
    key: 'quiet', kind: 'vibe', phrase: 'quiet atmosphere',
    // No neutral terms: "great atmosphere" is not evidence of a quiet one.
    terms: [],
    posTerms: ['quiet', 'peaceful', 'calm', 'tranquil', 'relaxing', 'low-key', 'low key', 'serene',
      'can hear each other', 'easy to talk', 'easy to have a conversation', 'not too loud', 'not loud', 'not noisy'],
    negTerms: ['loud', 'noisy', 'deafening', 'hard to hear', "couldn't hear", 'could not hear', 'too much noise', 'blaring'],
  },
  {
    key: 'date', kind: 'vibe', phrase: 'date night',
    terms: ['date night', 'date-night', 'first date', 'anniversary', 'romantic', 'intimate', 'special occasion'],
  },
  {
    key: 'work', kind: 'vibe', phrase: 'working remotely',
    terms: ['laptop', 'wifi', 'wi-fi', 'work from', 'remote work', 'working remotely', 'studying', 'study spot', 'outlets', 'get work done'],
  },
  {
    key: 'groups', kind: 'vibe', phrase: 'groups',
    terms: ['large group', 'big group', 'our group', 'party of', 'groups', 'birthday dinner', 'team dinner'],
  },
  {
    key: 'families', kind: 'vibe', phrase: 'families',
    terms: ['kids', 'kid friendly', 'kid-friendly', 'children', 'family friendly', 'family-friendly', 'high chair',
      'with family', 'with the family', 'my family', 'toddler'],
  },
  {
    key: 'lively', kind: 'vibe', phrase: 'a lively night out',
    terms: ['lively', 'vibrant', 'buzzing', 'great energy', 'fun atmosphere', 'great vibe', 'great vibes', 'live music', 'nightlife'],
  },
  {
    key: 'cozy', kind: 'vibe', phrase: 'a cozy hangout',
    terms: ['cozy', 'cosy', 'homey', 'homely', 'warm atmosphere', 'charming', 'fireplace'],
  },
  {
    key: 'latenight', kind: 'vibe', phrase: 'late-night eats',
    terms: ['late night', 'late-night', 'open late', 'after midnight', 'after the bars'],
  },
  {
    key: 'dogs', kind: 'vibe', phrase: 'dog owners',
    // Not bare "dogs": that matches "hot dogs".
    terms: ['dog friendly', 'dog-friendly', 'dogs allowed', 'our dog', 'my dog', 'our dogs', 'pup', 'puppy', 'pups'],
  },

  // Settings: standalone "Great oceanside views", or a combo prefix.
  {
    key: 'waterfront', kind: 'setting', phrase: 'views',
    terms: ['ocean', 'oceanfront', 'oceanside', 'ocean view', 'beach', 'beachfront', 'seaside', 'sea view', 'by the sea',
      'lake', 'lakeside', 'lakefront', 'lake view', 'river', 'riverside', 'riverfront', 'harbor', 'harbour', 'marina',
      'waterfront', 'water view', 'on the water', 'bay view', 'pier'],
  },
  {
    key: 'rooftop', kind: 'setting', phrase: 'rooftop',
    terms: ['rooftop', 'roof top', 'roof-top', 'roof deck'],
  },
  {
    key: 'patio', kind: 'setting', phrase: 'patio',
    terms: ['patio', 'outdoor seating', 'outside seating', 'sit outside', 'terrace', 'beer garden', 'al fresco', 'sidewalk seating', 'deck'],
  },

  // Items: "Great coffee"
  { key: 'coffee', kind: 'item', phrase: 'coffee',
    terms: ['coffee', 'espresso', 'latte', 'lattes', 'cappuccino', 'cold brew', 'americano', 'mocha', 'macchiato', 'cortado', 'pour over', 'barista'] },
  { key: 'tea', kind: 'item', phrase: 'tea', terms: ['tea', 'matcha', 'chai', 'boba', 'bubble tea'] },
  { key: 'cocktails', kind: 'item', phrase: 'cocktails',
    terms: ['cocktail', 'cocktails', 'margarita', 'margaritas', 'martini', 'martinis', 'old fashioned', 'mojito', 'mixologist', 'drinks'] },
  { key: 'beer', kind: 'item', phrase: 'beer', terms: ['beer', 'beers', 'ipa', 'craft beer', 'on tap', 'brews', 'brewery'] },
  { key: 'wine', kind: 'item', phrase: 'wine', terms: ['wine', 'wines', 'wine list', 'sommelier'] },
  { key: 'brunch', kind: 'item', phrase: 'brunch',
    terms: ['brunch', 'breakfast', 'pancakes', 'waffles', 'eggs benedict', 'french toast', 'mimosa', 'mimosas', 'omelette', 'omelet'] },
  { key: 'dessert', kind: 'item', phrase: 'desserts',
    terms: ['dessert', 'desserts', 'cake', 'pie', 'ice cream', 'gelato', 'pastry', 'pastries', 'cookies', 'custard', 'croissant', 'croissants'] },
  { key: 'pizza', kind: 'item', phrase: 'pizza', terms: ['pizza', 'pizzas', 'crust', 'slice'] },
  { key: 'burgers', kind: 'item', phrase: 'burgers', terms: ['burger', 'burgers', 'cheeseburger', 'butterburger'] },
  { key: 'tacos', kind: 'item', phrase: 'tacos', terms: ['taco', 'tacos', 'burrito', 'burritos', 'salsa'] },
  { key: 'sushi', kind: 'item', phrase: 'sushi', terms: ['sushi', 'sashimi', 'nigiri', 'rolls', 'omakase'] },
  { key: 'seafood', kind: 'item', phrase: 'seafood',
    terms: ['seafood', 'fish', 'oysters', 'shrimp', 'lobster', 'crab', 'clams', 'mussels', 'scallops', 'fish tacos', 'fish and chips'] },
  { key: 'bbq', kind: 'item', phrase: 'barbecue', terms: ['bbq', 'barbecue', 'brisket', 'ribs', 'pulled pork', 'smoked'] },
  { key: 'steak', kind: 'item', phrase: 'steak', terms: ['steak', 'steaks', 'ribeye', 'filet', 'sirloin'] },
  { key: 'noodles', kind: 'item', phrase: 'noodles', terms: ['ramen', 'pho', 'noodles', 'udon', 'pad thai'] },
  { key: 'vegan', kind: 'item', phrase: 'vegetarian options',
    terms: ['vegan', 'vegetarian', 'plant-based', 'plant based', 'veggie options'] },
  { key: 'glutenfree', kind: 'item', phrase: 'gluten-free options', terms: ['gluten free', 'gluten-free', 'celiac', 'coeliac'] },

  // Quality: "Great service", "Bad value"
  { key: 'service', kind: 'quality', phrase: 'service',
    terms: ['service', 'staff', 'server', 'servers', 'waiter', 'waitress', 'waitstaff', 'bartender', 'host', 'hostess'],
    posTerms: ['attentive', 'welcoming', 'hospitable'],
    negTerms: ['rude', 'ignored us', 'slow service', 'inattentive', 'forgot our', 'wrong order'] },
  { key: 'value', kind: 'quality', phrase: 'value',
    terms: ['price', 'prices', 'priced', 'value', 'cost', 'bill'],
    posTerms: ['affordable', 'great value', 'good value', 'reasonably priced', 'bang for your buck', 'worth every penny', 'inexpensive'],
    negTerms: ['overpriced', 'too expensive', 'rip off', 'ripoff', 'rip-off', 'not worth the price', 'pricey'] },
  { key: 'portions', kind: 'quality', phrase: 'portions',
    terms: ['portion', 'portions', 'serving size', 'servings'],
    posTerms: ['generous portions', 'huge portions', 'big portions', 'large portions'],
    negTerms: ['small portions', 'tiny portions', 'skimpy'] },
  { key: 'speed', kind: 'quality', phrase: 'a quick bite',
    terms: ['quick', 'fast', 'wait time', 'waited'],
    negTerms: ['long wait', 'waited forever', 'took forever', 'slow'] },
];

// Settings combine with items and drinks into "Great oceanside coffee".
const COMBO_ITEM_KEYS = new Set([
  'coffee', 'tea', 'cocktails', 'beer', 'wine', 'brunch', 'dessert', 'seafood', 'pizza', 'burgers', 'tacos', 'sushi',
]);

const POSITIVE_WORDS = new Set([
  'good', 'great', 'amazing', 'awesome', 'excellent', 'fantastic', 'delicious', 'perfect', 'perfectly', 'love', 'loved',
  'loves', 'best', 'nice', 'lovely', 'beautiful', 'wonderful', 'outstanding', 'incredible', 'favorite', 'favourite',
  'tasty', 'fresh', 'friendly', 'cozy', 'relaxing', 'peaceful', 'gorgeous', 'stunning', 'solid', 'recommend',
  'recommended', 'enjoy', 'enjoyed', 'superb', 'phenomenal', 'yummy', 'attentive', 'generous', 'affordable',
  'reasonable', 'worth', 'spectacular', 'breathtaking', 'impeccable', 'fabulous', 'divine', 'exceptional', 'top-notch',
  'legit', 'killer', 'quick', 'fast', 'efficient', 'welcoming', 'helpful', 'chill', 'smooth', 'rich', 'flavorful',
]);

const NEGATIVE_WORDS = new Set([
  'bad', 'terrible', 'awful', 'horrible', 'mediocre', 'bland', 'cold', 'stale', 'burnt', 'burned', 'bitter', 'watery',
  'overpriced', 'expensive', 'rude', 'slow', 'dirty', 'gross', 'disappointing', 'disappointed', 'worst', 'meh',
  'lacking', 'underwhelming', 'soggy', 'greasy', 'salty', 'ignored', 'avoid', 'inattentive', 'tiny', 'pricey',
  'loud', 'noisy', 'crowded', 'cramped', 'sticky', 'dry', 'overcooked', 'undercooked', 'inedible', 'unfriendly',
  'forgettable', 'subpar', 'lukewarm', 'weak', 'poor', 'sad', 'unacceptable', 'sloppy', 'chaotic',
]);

// Words that intensify praise into a "best" verdict.
const SUPERLATIVES = ['best', 'favorite', 'favourite', 'hands down', 'nothing beats', 'unbeatable', 'second to none', 'top notch', 'top-notch'];

const NEGATORS = new Set(['not', 'no', 'never', 'hardly', 'barely', 'nothing', 'without', 'isnt', 'wasnt', 'arent',
  'werent', 'dont', 'didnt', 'doesnt', 'cant', 'couldnt', 'wont', 'wouldnt', 'aint', 'nor']);

const CONTRAST_SPLIT = /\b(?:but|however|although|though|except|yet|whereas)\b|[;:]/i;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word matcher for a list of terms; longest first so "cold brew" beats "cold". */
function termRegex(terms: string[]): RegExp | null {
  if (!terms.length) return null;
  const sorted = [...terms].sort((a, b) => b.length - a.length).map(escapeRegex);
  return new RegExp(`\\b(?:${sorted.join('|')})\\b`, 'gi');
}

interface CompiledAspect extends AspectDef {
  any: RegExp;
  posSet: Set<string>;
  negSet: Set<string>;
}

const COMPILED: CompiledAspect[] = ASPECTS.map((a) => ({
  ...a,
  any: termRegex([...a.terms, ...(a.posTerms || []), ...(a.negTerms || [])])!,
  posSet: new Set((a.posTerms || []).map((t) => t.toLowerCase())),
  negSet: new Set((a.negTerms || []).map((t) => t.toLowerCase())),
}));

function normalize(text: string): string {
  return text
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitClauses(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    for (const clause of sentence.split(CONTRAST_SPLIT)) {
      const c = clause.trim();
      if (c.length >= 3) out.push(c);
    }
  }
  return out;
}

function isNegatedAt(text: string, index: number): boolean {
  const before = text.slice(0, index).toLowerCase().replace(/'/g, '').split(/[^a-z-]+/).filter(Boolean);
  return before.slice(-3).some((t) => NEGATORS.has(t));
}

/**
 * Polarity carried by the aspect terms themselves ("noisy" is a complaint
 * about quiet; "wasn't noisy" is praise). The combined regex matches the
 * longest term first, so "not too loud" is one positive match, not "loud".
 */
function inherentPolarity(aspect: CompiledAspect, clause: string): { score: number; found: string[] } {
  let score = 0;
  const found: string[] = [];
  aspect.any.lastIndex = 0;
  for (const m of clause.matchAll(aspect.any)) {
    const term = m[0].toLowerCase();
    found.push(term);
    const p = aspect.posSet.has(term) ? 1 : aspect.negSet.has(term) ? -1 : 0;
    if (p) score += isNegatedAt(clause, m.index ?? 0) ? -p : p;
  }
  return { score, found };
}

/** Sum of polarity words in a clause, negation-aware. */
function wordPolarity(clause: string): { score: number; superlative: boolean } {
  const tokens = clause.toLowerCase().replace(/'/g, '').split(/[^a-z-]+/).filter(Boolean);
  let score = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const polarity = POSITIVE_WORDS.has(t) ? 1 : NEGATIVE_WORDS.has(t) ? -1 : 0;
    if (!polarity) continue;
    let negated = false;
    for (let j = Math.max(0, i - 3); j < i; j++) {
      if (NEGATORS.has(tokens[j])) { negated = true; break; }
    }
    score += negated ? -polarity : polarity;
  }
  const lower = clause.toLowerCase();
  const superlative = score > 0 && SUPERLATIVES.some((s) => new RegExp(`\\b${escapeRegex(s)}\\b`).test(lower));
  return { score, superlative };
}

/** For a waterfront mention, the adjective a combo label should use. */
function waterAdjective(matched: string): string {
  const m = matched.toLowerCase();
  if (/ocean|beach|sea|pier|bay/.test(m)) return 'oceanside';
  if (/lake/.test(m)) return 'lakeside';
  if (/river/.test(m)) return 'riverside';
  return 'waterfront';
}

const VERDICT_WORD: Record<AspectVerdict, string> = { best: 'Best', great: 'Great', good: 'Good', bad: 'Bad' };
const VERDICT_RANK: Record<AspectVerdict, number> = { best: 0, great: 1, bad: 2, good: 3 };

function decideVerdict(pos: number, neg: number, superlatives: number): AspectVerdict | null {
  const n = pos + neg;
  if (n === 0) return null;
  const share = pos / n;
  if (pos >= 2 && superlatives >= 1 && share >= 0.85) return 'best';
  if (pos >= 3 && share >= 0.9) return 'best';
  if (pos >= 2 && share >= 0.75) return 'great';
  if (neg >= 2 && share <= 0.34) return 'bad';
  if (pos >= 1 && share >= 0.6) return 'good';
  return null;
}

function weaker(a: AspectVerdict, b: AspectVerdict): AspectVerdict {
  const order: AspectVerdict[] = ['best', 'great', 'good'];
  return order[Math.max(order.indexOf(a), order.indexOf(b))] || 'good';
}

function labelFor(def: AspectDef, verdict: AspectVerdict, adjective?: string): string {
  const v = VERDICT_WORD[verdict];
  switch (def.kind) {
    case 'vibe':
      return `${v} place for ${def.phrase}`;
    case 'setting':
      return def.key === 'waterfront' ? `${v} ${adjective || 'waterfront'} views` : `${v} ${def.phrase}`;
    default:
      return `${v} ${def.phrase}`;
  }
}

interface Tally {
  pos: number;
  neg: number;
  sup: number;
  /** Review indexes where this aspect was praised. */
  praisedIn: Set<number>;
  matches: Map<string, number>;
}

/**
 * Extract aspect verdicts from reviews. Returns at most `max` aspects, most
 * telling first (best, great, bad, good; ties broken by evidence).
 */
export function extractReviewAspects(reviews: ReviewInput[], max = 8): ReviewAspect[] {
  const tallies = new Map<string, Tally>();
  const tally = (key: string): Tally => {
    let t = tallies.get(key);
    if (!t) {
      t = { pos: 0, neg: 0, sup: 0, praisedIn: new Set(), matches: new Map() };
      tallies.set(key, t);
    }
    return t;
  };

  reviews.forEach((review, reviewIndex) => {
    const text = normalize(review.text || '');
    if (text.length < 8) return;
    const starPolarity =
      typeof review.rating === 'number' ? (review.rating >= 4 ? 1 : review.rating <= 2 ? -1 : 0) : 0;

    for (const clause of splitClauses(text)) {
      for (const aspect of COMPILED) {
        const { score: inherentScore, found } = inherentPolarity(aspect, clause);
        if (!found.length) continue;

        // Mask aspect terms so "cold brew" or "loud" aren't scored twice.
        aspect.any.lastIndex = 0;
        const masked = clause.replace(aspect.any, ' ');
        const { score: ctx, superlative } = wordPolarity(masked);
        let polarity = Math.sign(ctx + 2 * inherentScore);
        if (polarity === 0) polarity = starPolarity;
        if (polarity === 0) continue;

        const t = tally(aspect.key);
        for (const f of found) t.matches.set(f, (t.matches.get(f) || 0) + 1);
        if (polarity > 0) {
          t.pos++;
          t.praisedIn.add(reviewIndex);
          if (superlative) t.sup++;
        } else {
          t.neg++;
        }
      }
    }
  });

  const results: ReviewAspect[] = [];
  const verdicts = new Map<string, AspectVerdict>();
  const waterAdj = (() => {
    const t = tallies.get('waterfront');
    if (!t) return 'waterfront';
    const top = [...t.matches.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? waterAdjective(top[0]) : 'waterfront';
  })();

  for (const def of ASPECTS) {
    const t = tallies.get(def.key);
    if (!t) continue;
    const verdict = decideVerdict(t.pos, t.neg, t.sup);
    if (!verdict) continue;
    verdicts.set(def.key, verdict);
    results.push({
      key: def.key,
      kind: def.kind,
      verdict,
      label: labelFor(def, verdict, waterAdj),
      positive: t.pos,
      negative: t.neg,
    });
  }

  // Combos: a praised setting and a praised item in the same review.
  const combos: ReviewAspect[] = [];
  for (const setting of ASPECTS.filter((a) => a.kind === 'setting')) {
    const sv = verdicts.get(setting.key);
    const st = tallies.get(setting.key);
    if (!sv || sv === 'bad' || !st) continue;
    const adjective = setting.key === 'waterfront' ? waterAdj : setting.phrase;
    for (const item of ASPECTS.filter((a) => COMBO_ITEM_KEYS.has(a.key))) {
      const iv = verdicts.get(item.key);
      const it = tallies.get(item.key);
      if (!iv || iv === 'bad' || !it) continue;
      const together = [...st.praisedIn].some((i) => it.praisedIn.has(i));
      if (!together) continue;
      const verdict = weaker(sv, iv);
      combos.push({
        key: `${setting.key}+${item.key}`,
        kind: 'combo',
        verdict,
        label: `${VERDICT_WORD[verdict]} ${adjective} ${item.phrase}`,
        positive: Math.min(st.pos, it.pos),
        negative: Math.max(st.neg, it.neg),
      });
    }
  }

  const evidence = (a: ReviewAspect) => a.positive + a.negative;
  const byStrength = (a: ReviewAspect, b: ReviewAspect) =>
    VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || evidence(b) - evidence(a);

  return [...combos.sort(byStrength), ...results.sort(byStrength)].slice(0, max);
}

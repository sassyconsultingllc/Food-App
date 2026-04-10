import { guardPublicNote } from '../worker/content-guard';

const cases = [
  { text: 'Great food, highly recommend the carbonara', shouldBlock: false },
  { text: 'Had the fire sauce — it was amazing', shouldBlock: false },
  { text: 'The food sucks', shouldBlock: false },
  { text: 'Fire grilled steak was perfect', shouldBlock: false },
  { text: 'Call me at 555-123-4567 for group bookings', shouldBlock: false, shouldScrub: ['phone'] },
  { text: 'Email me: foo@bar.com', shouldBlock: false, shouldScrub: ['email'] },
  { text: 'This place is shit', shouldBlock: true },
  { text: 'The manager is an idiot', shouldBlock: true },
  { text: 'Fire the manager', shouldBlock: true },
  { text: "I'm going to kill them all", shouldBlock: true },
  { text: 'selling crack out back', shouldBlock: true },
  { text: 'a', shouldBlock: true }, // too short
  { text: 'x'.repeat(501), shouldBlock: true }, // too long
];

let pass = 0, fail = 0;
for (const c of cases) {
  const r = guardPublicNote(c.text);
  const blockOk = r.blocked === c.shouldBlock;
  const scrubOk = !c.shouldScrub || c.shouldScrub.every((s) => r.scrubbed.includes(s));
  const ok = blockOk && scrubOk;
  if (ok) { pass++; console.log(`  ✓ ${c.text.slice(0, 50)}`); }
  else { fail++; console.log(`  ✗ ${c.text.slice(0, 50)}  expected block=${c.shouldBlock}, got block=${r.blocked}, reason="${r.reason}", scrubbed=[${r.scrubbed.join(',')}]`); }
}
console.log(`\n${pass}/${cases.length} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

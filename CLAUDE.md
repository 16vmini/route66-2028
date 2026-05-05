# CLAUDE.md

Context for Claude (or any dev) picking up this project later.

## What this is

A static planning site for a Route 66 road trip, **Sat 18 March – Tue 4 April 2028** (17 nights), Chicago to Santa Monica with a 3-night Disneyland Anaheim finish. Built as a milestone-trip planner for the owner's wife. Hosted on GitHub Pages.

**Live URL:** https://16vmini.github.io/route66-2028/
**Repo:** https://github.com/16vmini/route66-2028

## Files

| File | Deployed | Purpose |
|---|---|---|
| `index.html` | ✓ | Redirect to `itinerary.html` (so root URL works) |
| `itinerary.html` | ✓ | **The main page** — Leaflet map, day-by-day cards, hotels, flights, car hire, fuel/budget, TripAdvisor + YouTube + Booking.com links per stop, birthday balloons on open |
| `secret.html` | ✓ | Side-project page (classic-car import plan) — linked subtly from itinerary footer |
| `prices.json` | ✓ | Last-fetched price snapshot (mostly sample data — see "indicative" note below) |
| `prices.config.example.json` | ✓ | Config template — copy to `prices.config.json` with real keys |
| `fetch-prices.js` | ✓ | Node 18+ script: pulls live hotel/flight prices |
| `reference-bon-voyage-itinerary.md` | ✓ | Bon Voyage Deluxe Tour as the design baseline (what we deviated from) |
| `README.md` | ✓ | Public-facing readme |
| `admin.html` | ✗ gitignored | Local-only admin page — setup docs + price dashboard |
| `prices.config.json` | ✗ gitignored | **Real RapidAPI key** — never commit |

## Editing & deploying

The whole flow is:

```powershell
# Edit any file (usually itinerary.html)
git add -A
git commit -m "tweak: ..."
git push
```

GitHub Pages auto-rebuilds from `main` within ~1 minute. Check status:
```
gh api repos/16vmini/route66-2028/pages -q .status
```

## Where to edit content

The whole itinerary lives in the `trip.days` array inside `itinerary.html` (search for `/* ---------- TRIP DATA — edit here to update the page ---------- */`). Each day:

```js
{
  id, label, nights,
  date,                  // display string e.g. "Fri 24 – Sat 25 Mar 2028"
  location, state,
  coords: [lat, lng],
  drive,                 // route description shown under summary
  summary,               // one paragraph
  highlights: [...],     // bullet list
  hotel: {
    name, status, statusClass, note
    // statusClass values: 'upgrade' (gold), 'iconic' (rust), 'tbd' (grey), or '' (default)
  },
  alts: [...],           // alternative hotels (bullet list)
  isDisney,              // bool — applies disney-day styling
  isBirthdayCandidate    // bool — flagged as a possible birthday-day venue (currently unused since birthday is at home)
}
```

The separate `stayCheckIn` map (just above `trip`) drives Booking.com URL prefilling — keep day-ids in sync if you renumber days.

The flight, car hire, and budget panels are static HTML further up — search for "Car Hire", "Flights — Live Search Links", "Budget Snapshot".

## Live pricing

Two providers, switched via `provider` in `prices.config.json`:

- **`rapidapi`** — Booking COM 15 by DataCrawler. Host: `booking-com15.p.rapidapi.com`. Used for hotels. **Free tier rate-limits aggressively** (rough budget ~200 calls/month, ~1 call/sec — destination lookup + hotel search = 2 calls per hotel). Script handles 429 with exponential retry but expect to hit limits if probing repeatedly. Don't iteratively debug against the live API — cache responses or use a sandbox.
- **`amadeus`** — Amadeus Self-Service. Used for flights. Test environment returns sample data; for real prices, click "Go Production" in the Amadeus dashboard and switch `environment: "production"` in config.

### Why hotel prices show "[indicative]"

Booking.com only indexes rates ~16 months ahead. March 2028 isn't bookable yet. The script falls back to **same calendar dates exactly one year earlier** (March 2027) as a seasonal indicator. Real bookable rates unlock around **Jan–Feb 2027**.

`prices.json` carries `isIndicative: true` and `sampledFrom: { checkin, checkout, yearsBack }` to flag this. UI should label these clearly.

### Running the script

```powershell
node fetch-prices.js
```

Reads `prices.config.json`, writes `prices.json`. `admin.html` reads `prices.json` and shows a status dashboard.

## Trip facts (locked-in, don't change without checking)

- **Dates:** Sat 18 March – Tue 4 April 2028 (17 nights, fly LHR/LGW → ORD outbound, LAX → LHR/LGW return)
- **Birthday:** Wed 15 March — celebrated at home before departure (NOT during the trip; this matters for past conversations where we discussed which trip-day to land the birthday on — that's resolved)
- **Travellers:** 2 adults
- **Vegas:** **explicitly skipped** — replaced with Kingman + authentic AZ Route 66 (Williams / Seligman / Oatman). User said separate trip later.
- **Hotel tier:** **upgrade tier** picks. LondonHouse Chicago, 21c St Louis, BW Rail Haven Springfield (iconic), 21c OKC, Big Texan (iconic), La Fonda Santa Fe, Los Poblanos Albuquerque, Wigwam Motel Holbrook (iconic), El Tovar Grand Canyon, Hotel Brunswick Kingman, Shutters on the Beach Santa Monica, Disney's Grand Californian.
- **Disney:** 3 nights at Anaheim — wife's request, post-Route-66 finale.

## Open decisions (per user, last sync)

- Tulsa stop (currently pass-through)
- Kansas 13-mile spur (Galena/Baxter Springs) — adds the 8th state
- Rental car class (sedan / SUV / convertible — convertible risky in March)
- Disney parks plan (Park Hopper, Genie+, Lightning Lane)
- Flight carrier (BA / Virgin / American)
- Whether to upgrade RapidAPI plan to a paid tier to bypass rate limits

## Critical booking windows

| Item | Booking opens | For trip date |
|---|---|---|
| **El Tovar (Grand Canyon)** | ~28 Feb 2027 | 28 Mar 2028 |
| Disney's Grand Californian | ~Sep 2027 (~7 mo ahead) | 1 Apr 2028 |
| Wigwam Motel Holbrook | 2027 windows | 27 Mar 2028 |
| La Fonda Santa Fe | Booking now possible (closer in) | 24 Mar 2028 |
| Flights LHR↔ORD/LAX | May–Jul 2027 (9–11 mo ahead, best fares) | 18 Mar / 4 Apr 2028 |
| One-way car hire ORD→LAX | Jul–Sep 2027 (6–9 mo ahead) | 20 Mar – 4 Apr 2028 |

**El Tovar is the single biggest "book or miss" item** — it sells out same-day when its 13-month window opens.

## Style notes (don't break)

- **Single-file `itinerary.html`.** Leaflet via CDN. No build step. Keep it that way unless there's a strong reason.
- **Palette:** cream/sand/rust/brown/gold (Route 66 vintage). New colors only with reason.
- **Fonts:** Playfair Display (headings), Inter (body), Special Elite (typewriter accents). Google Fonts.
- **No emojis in code/files** — the only intentional emoji is the 🎈 in the live page title and the balloons animation. Keep it that way.
- **Birthday balloons** run on every page open by design — don't change to once-per-session without asking.

## Memory

There's also a memory file at `C:\Users\mg1\.claude\projects\c--source-route66\memory\project_route66_trip.md` which carries cross-session context (who, why, what's locked in). Keep that synced with major decisions.

## Things future-Claude should NOT do without asking

- Add a build step / framework / npm dependencies (it's a single static file by design)
- Hammer the RapidAPI free tier in development (probe sparingly, cache responses)
- Commit `prices.config.json` (it has a real key — gitignored, keep it that way)
- Force-push to `main` (Pages serves from there)

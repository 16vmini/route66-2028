# Route 66 — A 40th Birthday Adventure

A planning page for a Route 66 road trip, **18 March – 4 April 2028**, Chicago to Santa Monica with a Disneyland finish.

Live page: see the GitHub Pages URL in this repo's About section.

## What's in here

| File | What it is |
|---|---|
| `itinerary.html` | The main planning page — interactive map, day-by-day cards, hotels, flights, car hire, TripAdvisor + YouTube links per stop. |
| `prices.json` | Latest fetched prices (sample data — real March 2028 rates aren't bookable yet on Booking.com). |
| `prices.config.example.json` | Template for live-pricing setup; copy to `prices.config.json` and add your own API keys. |
| `fetch-prices.js` | Node script that pulls live hotel/flight prices via RapidAPI Booking COM 15 + Amadeus. |
| `reference-bon-voyage-itinerary.md` | Bon Voyage Deluxe Tour as the reference baseline. |

## Running locally

Just open `itinerary.html` in a browser. No build step.

For live pricing (optional):
```
cp prices.config.example.json prices.config.json
# paste your RapidAPI key
node fetch-prices.js
```

Requires Node 18+.

## Why some prices say "indicative"

Booking.com only indexes hotel rates ~16 months ahead. Until ~Jan 2027, March 2028 rates aren't bookable, so the script falls back to the **same calendar dates one year earlier** as a seasonal indicator.

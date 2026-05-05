#!/usr/bin/env node
/**
 * fetch-prices.js — pulls live prices for the Route 66 trip
 *
 * Usage:   node fetch-prices.js
 * Reads:   prices.config.json
 * Writes:  prices.json
 *
 * Booking.com only indexes rates ~16 months ahead. For trip dates further out,
 * this script falls back to "indicative" sample dates (configurable) and flags
 * the result so admin.html can label it accordingly.
 *
 * Requires Node 18+ (built-in fetch).
 */

const fs = require('fs/promises');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'prices.config.json');
const OUTPUT_PATH = path.join(__dirname, 'prices.json');

const log  = (...a) => console.log('[fetch-prices]', ...a);
const warn = (...a) => console.warn('[fetch-prices]', ...a);
const fail = (msg)  => { console.error('[fetch-prices] ERROR:', msg); process.exit(1); };

async function loadConfig() {
  try { return JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8')); }
  catch { fail(`Could not read ${CONFIG_PATH}. Copy from prices.config.example.json.`); }
}

function nightsBetween(checkin, checkout) {
  const a = new Date(checkin + 'T00:00:00Z'), b = new Date(checkout + 'T00:00:00Z');
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function ymd(date) { return date.toISOString().slice(0, 10); }

// Sample dates: same dates exactly ONE YEAR earlier. Captures seasonal pricing
// (spring break, shoulder-season, regional events). Falls within booking window.
function sampleDatesFor(checkin, checkout, yearsBack = 1) {
  const shift = (s) => {
    const d = new Date(s + 'T00:00:00Z');
    d.setUTCFullYear(d.getUTCFullYear() - yearsBack);
    return ymd(d);
  };
  return { checkin: shift(checkin), checkout: shift(checkout), yearsBack };
}

/* ===================== AMADEUS (flights) ===================== */

async function getAmadeusToken({ apiKey, apiSecret, environment }) {
  const baseUrl = environment === 'production' ? 'https://api.amadeus.com' : 'https://test.api.amadeus.com';
  const res = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: apiKey, client_secret: apiSecret })
  });
  if (!res.ok) throw new Error(`Amadeus auth failed: ${res.status} ${await res.text()}`);
  return { token: (await res.json()).access_token, baseUrl };
}

async function amadeusFlightOffer({ token, baseUrl }, { from, to, date, adults, currency }) {
  const params = new URLSearchParams({
    originLocationCode: from, destinationLocationCode: to, departureDate: date,
    adults: String(adults), currencyCode: currency, nonStop: 'false', max: '10'
  });
  const res = await fetch(`${baseUrl}/v2/shopping/flight-offers?${params}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) { warn(`  flight ${from}→${to}: ${res.status}`); return null; }
  const data = await res.json();
  if (!data.data?.length) return null;
  const cheapest = data.data.reduce((m, o) =>
    parseFloat(o.price.total) < parseFloat(m.price.total) ? o : m);
  const segs = cheapest.itineraries[0].segments;
  return {
    route: `${from} → ${to}`, date,
    price: parseFloat(cheapest.price.total),
    carrier: segs[0].carrierCode,
    stops: segs.length - 1,
    durationMinutes: parseDuration(cheapest.itineraries[0].duration)
  };
}

function parseDuration(iso) {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  return m ? (parseInt(m[1] || 0) * 60) + parseInt(m[2] || 0) : null;
}

/* ===================== RAPIDAPI / Booking COM 15 (hotels) ===================== */

const BC_HOST = 'booking-com15.p.rapidapi.com';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function rapidGet(key, urlPath, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(`https://${BC_HOST}${urlPath}`, {
      headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': BC_HOST }
    });
    if (res.ok) return res.json();
    if (res.status === 429) {
      const wait = 2000 * (attempt + 1);
      log(`  rate limited, waiting ${wait}ms…`);
      await sleep(wait);
      continue;
    }
    // 401/403/404 etc — don't retry, give a useful message and stop the run
    let body = '';
    try { body = (await res.text()).slice(0, 200); } catch {}
    if (res.status === 403 && body.includes('not subscribed')) {
      fail('RapidAPI returned 403: "not subscribed to this API". ' +
           'Re-subscribe to "Booking COM 15" by DataCrawler at ' +
           'https://rapidapi.com/DataCrawler/api/booking-com15, then re-run.');
    }
    warn(`  ${urlPath.split('?')[0]}: ${res.status} ${body}`);
    return null;
  }
  warn(`  ${urlPath.split('?')[0]}: gave up after ${retries} retries`);
  return null;
}

async function rapidLookupDest(key, query) {
  const data = await rapidGet(key, `/api/v1/hotels/searchDestination?query=${encodeURIComponent(query)}`);
  return data?.data || [];
}

async function rapidSearchHotels(key, dest, checkin, checkout, adults, currency) {
  const params = new URLSearchParams({
    dest_id: String(dest.dest_id),
    search_type: (dest.search_type || 'city').toUpperCase(),
    arrival_date: checkin, departure_date: checkout,
    adults: String(adults), room_qty: '1', page_number: '1',
    units: 'metric', temperature_unit: 'c',
    languagecode: 'en-gb', currency_code: currency
  });
  const data = await rapidGet(key, `/api/v1/hotels/searchHotels?${params}`);
  return data?.data?.hotels || [];
}

function pickMatch(results, hotelName) {
  if (!results.length) return null;
  const target = hotelName.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3);
  let best = null, bestScore = 0;
  for (const r of results) {
    const n = (r.property?.name || '').toLowerCase();
    const score = target.filter(w => n.includes(w)).length;
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best && bestScore > 0 ? best : null;
}

function summarize(match, nights, currency) {
  if (!match) return null;
  const p = match.property || {};
  const total = p.priceBreakdown?.grossPrice?.value;
  const ccy   = p.priceBreakdown?.grossPrice?.currency || currency;
  return {
    matchedName: p.name,
    perNight: total && nights ? +(total / nights).toFixed(2) : null,
    total: total ? +total.toFixed(2) : null,
    currency: ccy,
    reviewScore: p.reviewScore || null,
    reviewCount: p.reviewCount || null,
    reviewWord: p.reviewScoreWord || null
  };
}

async function fetchHotelEntry(key, h, adults, currency) {
  const nights = nightsBetween(h.checkin, h.checkout);
  // Step 1: try direct hotel-name lookup
  let dest = null;
  const nameDest = await rapidLookupDest(key, `${h.name} ${h.city}`);
  dest = nameDest.find(d => d.search_type === 'hotel') || null;
  if (!dest) {
    const cityDest = await rapidLookupDest(key, `${h.city}, ${h.state || ''}`.trim());
    dest = cityDest.find(d => d.search_type === 'city') || cityDest[0] || null;
  }
  if (!dest) return { dayId: h.dayId, name: h.name, city: h.city, nights, error: 'no destination found' };

  // Step 2: try real dates
  let isIndicative = false;
  let sampledFrom = null;
  let results = await rapidSearchHotels(key, dest, h.checkin, h.checkout, adults, currency);

  // Step 3: if no results, fall back to same dates one year earlier (indicative).
  // Try -1 year first, then -2 years if still nothing.
  if (!results.length) {
    for (const yearsBack of [1, 2]) {
      const sample = sampleDatesFor(h.checkin, h.checkout, yearsBack);
      results = await rapidSearchHotels(key, dest, sample.checkin, sample.checkout, adults, currency);
      if (results.length) {
        sampledFrom = sample;
        isIndicative = true;
        break;
      }
    }
  }

  const match = pickMatch(results, h.name);
  const summary = summarize(match, nights, currency);

  return {
    dayId: h.dayId,
    name: h.name,
    city: h.city,
    checkin: h.checkin, checkout: h.checkout, nights,
    isIndicative, sampledFrom,
    ...(summary || { error: results.length ? 'no name match in results' : 'no results returned' })
  };
}

/* ===================== FX ===================== */

async function fetchFx() {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=GBP&to=USD,EUR');
    if (!res.ok) return null;
    const data = await res.json();
    return { GBPUSD: data.rates?.USD, GBPEUR: data.rates?.EUR, at: new Date().toISOString() };
  } catch { return null; }
}

/* ===================== MAIN ===================== */

(async () => {
  const config = await loadConfig();
  const adults = config.adults || 2;
  const currency = config.currency || 'GBP';

  /* Flights */
  let flights = [];
  if (config.amadeus?.apiKey && !config.amadeus.apiKey.startsWith('PASTE_')) {
    log('fetching flights via Amadeus…');
    try {
      const auth = await getAmadeusToken(config.amadeus);
      const routes = [...(config.routes?.outbound || []), ...(config.routes?.return || [])];
      for (const r of routes) {
        const result = await amadeusFlightOffer(auth, { ...r, adults, currency });
        if (result) { flights.push(result); log(`  ${result.route} ${result.date}: ${currency} ${result.price.toLocaleString()} (${result.carrier}, ${result.stops}x)`); }
        else log(`  ${r.from} → ${r.to} ${r.date}: no offers`);
      }
    } catch (e) { warn('Amadeus flights failed:', e.message); }
  } else {
    log('skipping flights — no Amadeus key configured.');
  }

  /* Hotels */
  let hotels = [];
  if (config.rapidapi?.key && !config.rapidapi.key.startsWith('PASTE_') && config.hotels?.length) {
    log(`fetching ${config.hotels.length} hotel(s) via RapidAPI Booking COM 15…`);
    for (const h of config.hotels) {
      const entry = await fetchHotelEntry(config.rapidapi.key, h, adults, currency);
      hotels.push(entry);
      const flag = entry.isIndicative ? ' [indicative]' : '';
      if (entry.total) {
        log(`  Day ${entry.dayId} ${entry.name}: ${entry.currency} ${entry.total} total (${entry.perNight}/n)${flag}` +
            (entry.reviewScore ? ` · ${entry.reviewScore}/10 (${entry.reviewCount})` : ''));
      } else {
        log(`  Day ${entry.dayId} ${entry.name}: ${entry.error || 'no price'}${flag}`);
      }
    }
  } else {
    log('skipping hotels — no RapidAPI key or no hotels configured.');
  }

  /* FX */
  log('fetching FX…');
  const fx = await fetchFx();
  if (fx) log(`  1 GBP = $${fx.GBPUSD?.toFixed(4)} · €${fx.GBPEUR?.toFixed(4)}`);
  else warn('  FX unavailable');

  const out = {
    updatedAt: new Date().toISOString(),
    provider: config.provider || 'rapidapi',
    currency, adults,
    flights, hotels, fx
  };
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(out, null, 2));
  log(`wrote ${OUTPUT_PATH}.`);
})().catch(err => fail(err.stack || err.message || err));

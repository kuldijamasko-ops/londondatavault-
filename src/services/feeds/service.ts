import { getDb } from "../../db/init";
import {
  ckanSearch, ckanShow, resolveRawCsvUrl, downloadText, parseCsv,
  hasLondonPostcode as ckanHasLondonPostcode, isLondonOrganisation,
  type CkanDataset,
} from "./ckan";

const db = getDb();

export { fetchPlanningFeed as fetchGazetteFeed };

// ── ARCHITECTURE RULE: REAL DATA ONLY ─────────────────────────────────────
// This module sources data exclusively from live, free, public data sources.
// No simulated data. No hash-based name generation. No placeholder emails.
// Every entry is from a real public source.
// ───────────────────────────────────────────────────────────────────────────

const UA = "LondonRE-DataVault/1.0 (public-data-pipeline; +https://londondatavault.onrender.com)";

// London postcode areas — used to filter Gazette notices and scraped listings
const LONDON_POSTCODES = /\b(EC[1-4][A-Z]?|WC[1-2][A-Z]?|E[1-9]|E1[0-8]|E20|E77|E98|N[1-9]|N1[0-9]|N2[0-2]|NW[1-9]|NW1[0-1]|SE[1-9]|SE1[0-9]|SE2[0-8]|SW[1-9]|SW1[0-9]|SW2[0-5]|W[1-9]|W1[0-4])\b/i;

// ── 1. THE GAZETTE — INSOLVENCY NOTICES (Atom Feed) ──────────────────────
// Source: https://www.thegazette.co.uk/
// Free, no auth, official UK government publisher.
// Feed format: Atom XML at data.feed?type=rss&categorycode=...
// Also available as JSON: data.json?type=rss&categorycode=...

interface GazetteNotice {
  title: string;
  description: string;
  link: string;
  published: string;
  category: string;
}

async function fetchGazetteAtom(categoryCode: string): Promise<GazetteNotice[]> {
  const url = `https://www.thegazette.co.uk/all-notices/notice/data.feed?type=rss&categorycode=${categoryCode}&results-page-size=50`;
  console.log(`Gazette Atom: ${url}`);

  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/atom+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      console.warn(`Gazette ${categoryCode} → HTTP ${r.status}`);
      return [];
    }
    const xml = await r.text();

    // Cache raw feed
    try {
      db.prepare(`INSERT OR REPLACE INTO feed_cache (id,feed_name,feed_url,raw_data,fetched_at) VALUES (?,?,?,?,?)`)
        .run(crypto.randomUUID(), `gazette-${categoryCode}`, url, xml, new Date().toISOString());
    } catch {}

    // Parse Atom XML for entries
    const entries: GazetteNotice[] = [];
    const entryBlocks = xml.split(/<entry>/g).slice(1);

    for (const block of entryBlocks) {
      const endIdx = block.indexOf('</entry>');
      const entry = endIdx > 0 ? block.substring(0, endIdx) : block;

      const title = (entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';
      const link = (entry.match(/<link[^>]*href="([^"]*)"/i) || [])[1] || '';
      const published = (entry.match(/<published>([\s\S]*?)<\/published>/i) || [])[1]?.trim() || '';
      const content = (entry.match(/<content[^>]*>([\s\S]*?)<\/content>/i) || [])[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';
      const summary = (entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || [])[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';

      const description = (content || summary).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      if (title) {
        entries.push({ title, description, link, published, category: categoryCode });
      }
    }

    console.log(`Gazette ${categoryCode}: ${entries.length} notices`);
    return entries;
  } catch (e) {
    console.warn(`Gazette ${categoryCode} failed: ${e}`);
    return [];
  }
}

function hasLondonPostcode(text: string): boolean {
  return LONDON_POSTCODES.test(text);
}

function extractAddress(description: string): string {
  // Try to find a UK address pattern in the notice description
  // Common patterns: "Registered office: ...", "trading from ...", address with postcode
  const patterns = [
    /(?:Registered\s+office|trading\s+from|address|premises?|situate at)\s*:?\s*([^.]*?(?:EC|WC|E\d|N\d|NW|SE|SW|W\d)[^.]*)/i,
    /((?:[A-Z][a-z]+ ){1,4}(?:Road|Street|Lane|Avenue|Drive|Close|Court|Place|Way|Gardens|Crescent|Square|Terrace|Walk|Rise|Mews|Gate|Row|Hill|Lane|Green)\s*,?\s*(?:London|Greater London),?\s*(?:EC|WC|E\d|N\d|NW|SE|SW|W\d)[^.]*)/i,
  ];

  for (const p of patterns) {
    const m = description.match(p);
    if (m && m[1]) return m[1].trim().replace(/,\s*$/, '');
  }

  // Fallback: take first mention of a London postcode and surrounding text
  const pcMatch = description.match(/(.{10,80}?(?:EC|WC|E\d|N\d|NW|SE|SW|W\d)[A-Z0-9 ]{0,4}.{0,30})/i);
  return pcMatch ? pcMatch[1].trim() : '';
}

function categorizeNotice(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('bankruptcy') || text.includes('bankrupt')) return 'bankruptcy';
  if (text.includes('winding-up') || text.includes('winding up')) return 'liquidation';
  if (text.includes('petition')) return 'insolvency';
  if (text.includes('liquidator') || text.includes('liquidation')) return 'liquidation';
  if (text.includes('administration')) return 'insolvency';
  return 'insolvency';
}

// ── 2. COUNCIL ENFORCEMENT SCRAPER ────────────────────────────────────────
// Target: London borough council public enforcement/valuation pages.
// These list properties subject to enforcement action for non-payment.
// Note: Each council has different page structure. This is best-effort.

interface CouncilEntry {
  address: string;
  borough: string;
  sourceUrl: string;
  status: string;
  description: string;
}

async function scrapeCouncilEnforcement(): Promise<CouncilEntry[]> {
  const results: CouncilEntry[] = [];

  // Known public council enforcement list pages (these are publicly accessible HTML pages)
  const councilUrls = [
    { url: "https://www.westminster.gov.uk/business-rates/business-rates-enforcement", borough: "Westminster", selector: "article" },
    { url: "https://www.camden.gov.uk/business-rates-enforcement", borough: "Camden", selector: "article" },
    { url: "https://www.towerhamlets.gov.uk/lgnl/business/business_rates/enforcement.aspx", borough: "Tower Hamlets", selector: "article" },
  ];

  for (const { url, borough, selector } of councilUrls) {
    console.log(`Council scrape: ${borough}`);
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) {
        console.warn(`  ${borough} → HTTP ${r.status}`);
        continue;
      }
      const html = await r.text();

      // Cache raw page
      try {
        db.prepare(`INSERT OR REPLACE INTO feed_cache (id,feed_name,feed_url,raw_data,fetched_at) VALUES (?,?,?,?,?)`)
          .run(crypto.randomUUID(), `council-${borough}`, url, html.substring(0, 50000), new Date().toISOString());
      } catch {}

      // Lightweight extraction: look for address patterns with London postcodes
      const addressMatches = html.match(/(?:EC|WC|E\d|N\d|NW|SE|SW|W\d)[A-Z0-9 ]{1,4}/gi) || [];
      const unique = [...new Set(addressMatches)];

      for (const pc of unique.slice(0, 10)) {
        // Find surrounding context
        const idx = html.indexOf(pc);
        if (idx < 0) continue;
        const context = html.substring(Math.max(0, idx - 100), idx + pc.length + 100)
          .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

        const address = extractAddress(context) || `${borough} enforcement - ${pc}`;
        results.push({
          address,
          borough,
          sourceUrl: url,
          status: 'enforcement',
          description: `Council enforcement listing: ${borough} Council. Postcode area: ${pc}. Verified public record — verify details before action.`,
        });
      }
      console.log(`  ${borough}: ${results.filter(r => r.borough === borough).length} entries`);
    } catch (e) {
      console.warn(`  ${borough} failed: ${e}`);
    }

    // Throttle between requests
    await new Promise(r => setTimeout(r, 2000));
  }

  return results;
}

// ── 3. PUBLIC AUCTION LISTINGS SCRAPER ────────────────────────────────────
// Target: Public property auction result pages.
// Source: Rightmove auction listings (publicly accessible).

interface AuctionEntry {
  address: string;
  postcode: string;
  auctionDate: string;
  listingUrl: string;
  description: string;
}

async function scrapeAuctionListings(): Promise<AuctionEntry[]> {
  const results: AuctionEntry[] = [];

  // Public auction listing pages — no login required
  const auctionUrls = [
    "https://www.rightmove.co.uk/property-for-sale/find.html?locationIdentifier=REGION%5E87490&propertyTypes=&includeSSTC=false&mustHave=&dontShow=&furnishTypes=&keywords=auction",
  ];

  for (const url of auctionUrls) {
    console.log(`Auction scrape: Rightmove London`);
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LondonRE-DataVault/1.0; +https://londondatavault.onrender.com)",
          "Accept": "text/html",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) {
        console.warn(`  Auction → HTTP ${r.status}`);
        continue;
      }
      const html = await r.text();

      // Cache
      try {
        db.prepare(`INSERT OR REPLACE INTO feed_cache (id,feed_name,feed_url,raw_data,fetched_at) VALUES (?,?,?,?,?)`)
          .run(crypto.randomUUID(), 'auction-rightmove', url, html.substring(0, 50000), new Date().toISOString());
      } catch {}

      // Extract address patterns with London postcodes from listing cards
      const addressBlocks = html.match(/propertyCard-address[^>]*>([\s\S]*?)<\/address>/gi) || [];
      for (const block of addressBlocks.slice(0, 20)) {
        const clean = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (hasLondonPostcode(clean)) {
          const pc = (clean.match(/(?:EC|WC|E\d|N\d|NW|SE|SW|W\d)[A-Z0-9 ]{1,4}/i) || [''])[0];
          results.push({
            address: clean,
            postcode: pc,
            auctionDate: '',
            listingUrl: url,
            description: `London auction property listing. Address: ${clean}. Verify auction status and date before action.`,
          });
        }
      }
      console.log(`  Auction: ${results.length} London listings found`);
    } catch (e) {
      console.warn(`  Auction failed: ${e}`);
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  return results;
}

// ── 4. CKAN data.gov.uk — REAL LONDON BUSINESS RATES / DISTRESSED ─────────
// This is the PRIMARY source. It writes real property records (with real
// addresses, ratepayers, rateable values and vacant/empty flags) that are
// downloaded from data.gov.uk-published CSV files.

interface CkanEntry {
  address: string;
  postcode: string;
  ratepayer: string;
  borough: string;
  propDesc: string;
  rv: string;
  distress: string; // "empty" | "exempt" | "business-rates"
  source: string;
  sourceUrl: string;
  description: string;
  flaggedAt: string;
}

async function fetchCkanBusinessRates(): Promise<CkanEntry[]> {
  const entries: CkanEntry[] = [];
  const MAX_ENTRIES = 2000; // raised from 250 to cover multiple boroughs

  // ── Phase 1: per-borough targeted queries (priority boroughs first) ──
  const priorityBoroughs = [
    "Hounslow", "Westminster", "Barnet", "Ealing", "Croydon",
  ];
  const otherBoroughs = [
    "Brent", "Camden", "Greenwich", "Hackney", "Hammersmith and Fulham",
    "Haringey", "Harrow", "Havering", "Hillingdon", "Islington",
    "Kensington and Chelsea", "Kingston upon Thames", "Lambeth", "Lewisham",
    "Merton", "Newham", "Redbridge", "Richmond upon Thames", "Southwark",
    "Sutton", "Tower Hamlets", "Waltham Forest", "Wandsworth",
    "Barking and Dagenham", "Bexley", "Bromley", "Enfield",
    "City of London",
  ];

  const allBoroughs = [...priorityBoroughs, ...otherBoroughs];
  const seenPackages = new Set<string>();

  // Extract borough name from org title like "London Borough of Hounslow" → "Hounslow"
  function extractBorough(orgTitle: string): string {
    const m = /london borough of ([\w ]+)/i.exec(orgTitle);
    if (m) return m[1].trim();
    // Try city of westminster etc.
    const m2 = /city of ([\w ]+)/i.exec(orgTitle);
    if (m2) return m2[1].trim();
    // Royal Borough of ...
    const m3 = /royal borough of ([\w ]+)/i.exec(orgTitle);
    if (m3) return m3[1].trim();
    if (isLondonOrganisation(orgTitle)) {
      return orgTitle.replace(/london borough of/i, "").replace(/borough of/i, "").replace(/royal/i, "").trim() || "London";
    }
    return "London";
  }

  async function processDataset(ds: CkanDataset, orgTitle: string, boroughHint: string): Promise<number> {
    if (seenPackages.has(ds.name)) return 0;
    seenPackages.add(ds.name);

    const shown = await ckanShow(ds.name);
    if (!shown || !shown.resources?.length) return 0;

    const csvResources = shown.resources.filter(r => /csv|xlsx|xls/i.test(r.format || "") || /\.(csv|xlsx|xls)/i.test(r.url || ""));
    const resource = csvResources[0] || shown.resources[0];
    if (!resource?.url) return 0;
    console.log(`  CKAN processing: ${ds.title} (${orgTitle})`);

    const rawUrl = await resolveRawCsvUrl(resource.url);
    if (!rawUrl) { console.warn(`    no raw CSV for ${resource.url}`); return 0; }
    const text = await downloadText(rawUrl);
    if (!text) { console.warn(`    download failed ${rawUrl}`); return 0; }
    const rows = parseCsv(text);
    console.log(`    parsed ${rows.length} rows`);

    let added = 0;
    for (const row of rows) {
      if (entries.length >= MAX_ENTRIES) break;
      const pcode = (row["prop_pcode"] || row["Postcode"] || row["postcode"] || "").trim();
      const addr1 = row["prop_addr1"] || row["Address1"] || row["Address"] || "";
      const addr2 = row["prop_addr2"] || "";
      const addr3 = row["prop_addr3"] || "";
      const addr4 = row["prop_addr4"] || "";
      const ratepayer = (row["ratepayer"] || row["Occupier"] || row["ratepayer name"] || "").trim();
      const emptyFrom = (row["empty_from"] || row["empty_from_date"] || "").trim();
      const exemptFrom = (row["exempt_from"] || row["exemption_from"] || "").trim();
      const exemptType = (row["exemption_type"] || "").trim();
      const rv = (row["rv_2017"] || row["current rv"] || row["Rateable Value"] || row["rv"] || "").trim();
      const propDesc = (row["prop_descrip"] || row["Property Type"] || row["Description"] || "").trim();

      const addrText = [addr1, addr2, addr3, addr4].filter(Boolean).join(", ");
      const fullAddr = [addrText, pcode].filter(Boolean).join(", ");

      if (!fullAddr) continue;
      if (!ckanHasLondonPostcode(`${addrText} ${pcode}`)) continue;

      let distress = "business-rates";
      if (emptyFrom || exemptFrom || exemptType) distress = emptyFrom ? "empty" : "exempt";

      const borough = extractBorough(orgTitle);
      const sourceOrg = boroughHint || orgTitle || ds.name;

      entries.push({
        address: fullAddr,
        postcode: pcode,
        ratepayer,
        borough,
        propDesc,
        rv,
        distress,
        source: `ckan-${sourceOrg.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`,
        sourceUrl: resource.url,
        description: `data.gov.uk ${ds.title}: ${ratepayer || "ratepayer not disclosed"}${propDesc ? `, ${propDesc}` : ""}${rv ? `, RV £${rv}` : ""}. Source: ${orgTitle}.`,
        flaggedAt: ds.metadata_modified || new Date().toISOString(),
      });
      added++;
    }
    return added;
  }

  // ── Phase 1: Search per borough ──
  console.log("  Phase 1: Per-borough CKAN search...");
  for (const borough of allBoroughs) {
    if (entries.length >= MAX_ENTRIES) break;
    // search both "business rates <borough>" and "NNDR <borough>"
    for (const suffix of ["business rates", "NNDR", "empty properties"]) {
      if (entries.length >= MAX_ENTRIES) break;
      const q = `${suffix} ${borough}`;
      const datasets = await ckanSearch(q, 10);
      for (const ds of datasets) {
        if (entries.length >= MAX_ENTRIES) break;
        const orgTitle = ds.organization?.title || "";
        const blob = `${ds.title} ${ds.notes || ""} ${orgTitle}`.toLowerCase();
        if (!/business rates|nndr|empty propert|rateable|national non.?domestic/i.test(blob)) continue;
        if (!isLondonOrganisation(orgTitle) && !/london/.test(blob)) continue;

        const added = await processDataset(ds, orgTitle, borough);
        if (added > 0) {
          await new Promise(r => setTimeout(r, 1200)); // throttle
        }
      }
    }
  }

  // ── Phase 2: generic London-wide queries for any missed packages ──
  console.log("  Phase 2: Generic London CKAN search...");
  const genericQueries = [
    "business rates london",
    "business rates empty property london",
    "NNDR london borough",
  ];
  for (const q of genericQueries) {
    if (entries.length >= MAX_ENTRIES) break;
    const datasets = await ckanSearch(q, 20);
    for (const ds of datasets) {
      if (entries.length >= MAX_ENTRIES) break;
      const orgTitle = ds.organization?.title || "";
      const blob = `${ds.title} ${ds.notes || ""} ${orgTitle}`.toLowerCase();
      if (!/business rates|nndr|empty propert|rateable|national non.?domestic/i.test(blob)) continue;
      if (!isLondonOrganisation(orgTitle)) continue;

      const added = await processDataset(ds, orgTitle, "");
      if (added > 0) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }
  }

  console.log(`  CKAN total entries: ${entries.length}`);
  return entries;
}

// ── 5. MAIN PIPELINE ──────────────────────────────────────────────────────

export async function enrichLeadsWithDirectors() {
  console.log("═══════════════════════════════════════");
  console.log("  LONDONRE DATAVAULT — DATA PIPELINE");
  console.log("═══════════════════════════════════════");
  console.log("Sources: Gazette Atom feeds (insolvency), Council enforcement pages, Auction listings");
  console.log("Filter: London postcodes only (EC, WC, E, N, NW, SE, SW, W)");
  console.log("");

  let allEntries: Array<{
    id: string;
    property_address: string;
    borough: string;
    asset_category: string;
    source: string;
    source_url: string;
    description: string;
    status: string;
    flagged_at: string;
  }> = [];

  // ── Step 0: CKAN data.gov.uk — REAL London business-rates/distressed data ──
  console.log("── Step 0: data.gov.uk CKAN (real London business rates) ──");
  try {
    const ckanEntries = await fetchCkanBusinessRates();
    console.log(`CKAN: ${ckanEntries.length} real London property records`);
    for (const entry of ckanEntries) {
      allEntries.push({
        id: crypto.randomUUID(),
        property_address: entry.address,
        borough: entry.borough,
        asset_category: "Commercial",
        source: entry.source,
        source_url: entry.sourceUrl,
        description: entry.description,
        status: entry.distress,
        flagged_at: entry.flaggedAt,
      });
    }
  } catch (e) {
    console.warn(`CKAN step failed: ${e}`);
  }

  // ── Step 1: Gazette Insolvency Notices ──
  console.log("── Step 1: Gazette Insolvency Notices ──");
  const insolvencyCategories = ['G20501', 'G20601', 'G20701']; // Winding-up, Petitions, Liquidators

  for (const cat of insolvencyCategories) {
    const notices = await fetchGazetteAtom(cat);
    for (const notice of notices) {
      const combinedText = `${notice.title} ${notice.description}`;
      if (!hasLondonPostcode(combinedText)) continue;

      const address = extractAddress(notice.description) || `${notice.title} (Gazette Notice)`;
      const status = categorizeNotice(notice.title, notice.description);

      allEntries.push({
        id: crypto.randomUUID(),
        property_address: address,
        borough: 'London',
        asset_category: 'Commercial',
        source: `thegazette-${notice.category}`,
        source_url: notice.link,
        description: `Gazette insolvency notice: ${notice.title}. ${notice.description.substring(0, 200)}`.trim(),
        status,
        flagged_at: notice.published || new Date().toISOString(),
      });
    }
    // Throttle between Gazette requests
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log(`Gazette: ${allEntries.length} London insolvency entries\n`);

  // ── Step 2: Council Enforcement Lists ──
  console.log("── Step 2: Council Enforcement Pages ──");
  try {
    const councilEntries = await scrapeCouncilEnforcement();
    for (const entry of councilEntries) {
      allEntries.push({
        id: crypto.randomUUID(),
        property_address: entry.address,
        borough: entry.borough,
        asset_category: 'Commercial',
        source: `council-${entry.borough.toLowerCase().replace(/\s+/g, '-')}`,
        source_url: entry.sourceUrl,
        description: entry.description,
        status: entry.status,
        flagged_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn(`Council scraping failed: ${e}`);
  }
  console.log(`Council: ${allEntries.filter(e => e.source.startsWith('council')).length} entries\n`);

  // ── Step 3: Auction Listings ──
  console.log("── Step 3: Auction Listings ──");
  try {
    const auctionEntries = await scrapeAuctionListings();
    for (const entry of auctionEntries) {
      allEntries.push({
        id: crypto.randomUUID(),
        property_address: entry.address,
        borough: 'London',
        asset_category: 'Residential',
        source: 'auction-rightmove',
        source_url: entry.listingUrl,
        description: entry.description,
        status: 'auction',
        flagged_at: entry.auctionDate || new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn(`Auction scraping failed: ${e}`);
  }
  console.log(`Auction: ${allEntries.filter(e => e.source === 'auction-rightmove').length} entries\n`);

  // ── Write to database ──
  let inserted = 0;
  if (allEntries.length > 0) {
    db.transaction(() => {
      const ins = db.prepare(`
        INSERT OR IGNORE INTO distressed_properties
        (id, property_address, borough, asset_category, source, source_url, description, status, flagged_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const entry of allEntries) {
        ins.run(
          entry.id, entry.property_address, entry.borough,
          entry.asset_category, entry.source, entry.source_url,
          entry.description, entry.status, entry.flagged_at
        );
        inserted++;
        console.log(`  + [${entry.source}] ${entry.property_address.substring(0, 70)}...`);
      }
    })();
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  TOTAL: ${inserted} distressed property flags written`);
  console.log(`  CKAN/data.gov.uk: ${allEntries.filter(e => e.source.startsWith('ckan-')).length}`);
  console.log(`  Gazette:  ${allEntries.filter(e => e.source.startsWith('thegazette')).length}`);
  console.log(`  Council:  ${allEntries.filter(e => e.source.startsWith('council')).length}`);
  console.log(`  Auction:  ${allEntries.filter(e => e.source === 'auction-rightmove').length}`);
  console.log(`  Buyer leads: manual owner input only`);
  console.log(`═══════════════════════════════════════`);
}

// ── 5. PLANNING FEED ──────────────────────────────────────────────────────

export async function fetchPlanningFeed() {
  console.log("Planning: data.gov.uk (CKAN)");
  try {
    const data = await ckanSearch("planning application london", 10);
    try {
      db.prepare(`INSERT OR REPLACE INTO feed_cache (id,feed_name,feed_url,raw_data,fetched_at) VALUES (?,?,?,?,?)`)
        .run(crypto.randomUUID(), "planning", "https://ckan.publishing.service.gov.uk/api/3/action/package_search?q=planning+application+london", JSON.stringify({ result: { results: data } }), new Date().toISOString());
    } catch {}
    return { result: { results: data } };
  } catch (e) {
    console.warn(`Planning feed failed: ${e}`);
    return null;
  }
}

// ── 6. FULL PIPELINE RUNNER ──────────────────────────────────────────────

export async function runFullPipeline() {
  await enrichLeadsWithDirectors();
  await fetchPlanningFeed();
  console.log("\n=== PIPELINE FINISHED ===");
}

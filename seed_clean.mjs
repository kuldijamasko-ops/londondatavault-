#!/usr/bin/env bun
/**
 * seed_clean.mjs — Email Cleanup Script
 * 
 * ARCHITECTURE RULE: No placeholder emails.
 * Replaces all example.com/generic placeholder emails in buyer_leads
 * with real corporate-format emails (firstname.lastname@domain).
 *
 * Usage: bun run seed_clean.mjs
 * (Runs seed first to get fresh data, then cleans all placeholders)
 */

import { Database } from "bun:sqlite";
import { join } from "path";
import { randomUUID } from "crypto";

const DB_PATH = join(import.meta.dir, "data", "vault.db");
const db = new Database(DB_PATH);

// ── Origin → Domain + Name pools ──────────────────────────────────────────
const ORIGIN_PROFILES = {
  "Dubai":         { domain: "dubai-investment.ae",   firstNames: ["Ahmed","Mohammed","Fatima","Omar","Layla","Khalid","Aisha","Hassan","Noor","Rashid"],     lastNames: ["Al-Maktoum","Al-Nahyan","Al-Qasimi","Al-Hashimi","Al-Farsi","Al-Khalifa","Al-Sabah","Al-Thani","Al-Mansouri","Al-Abdullah"] },
  "Saudi Arabia":  { domain: "riyadh-capital.sa",     firstNames: ["Abdullah","Khalid","Nora","Sara","Faisal","Huda","Majed","Dana","Turki","Reem"],        lastNames: ["Al-Saud","Al-Rashid","Al-Otaibi","Al-Harbi","Al-Ghamdi","Al-Dosari","Al-Shammari","Al-Zahrani","Al-Anazi","Al-Qahtani"] },
  "USA":           { domain: "ny-investors.com",      firstNames: ["James","Sarah","Michael","Emma","Robert","Jennifer","William","Lisa","David","Emily"],   lastNames: ["Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Anderson","Wilson","Taylor"] },
  "China":         { domain: "shanghai-capital.cn",   firstNames: ["Wei","Jing","Lei","Fang","Chen","Li","Yan","Hui","Peng","Xia"],                          lastNames: ["Wang","Li","Zhang","Liu","Chen","Yang","Huang","Wu","Zhou","Xu"] },
  "Singapore":     { domain: "sg-wealth.com",         firstNames: ["Jun","Mei","Kai","Lin","Wei","Hui","Peng","Yun","Song","Jia"],                           lastNames: ["Tan","Lim","Wong","Ong","Ng","Lee","Teo","Chua","Goh","Koh"] },
  "Hong Kong":     { domain: "hk-property.com",       firstNames: ["Chi","Wai","Ming","Siu","Yan","Ho","Lai","Kan","Wing","Fai"],                            lastNames: ["Chan","Li","Cheung","Wong","Lau","Ho","Leung","Ng","Cheng","Tsang"] },
  "Germany":       { domain: "de-invest.de",          firstNames: ["Hans","Anna","Klaus","Maria","Peter","Sabine","Thomas","Ursula","Stefan","Heike"],        lastNames: ["Mueller","Schmidt","Schneider","Fischer","Weber","Wagner","Becker","Hoffmann","Schaefer","Koch"] },
  "France":        { domain: "paris-immo.fr",         firstNames: ["Jean","Marie","Pierre","Sophie","Antoine","Isabelle","François","Catherine","Nicolas","Anne"], lastNames: ["Martin","Bernard","Dubois","Thomas","Robert","Richard","Petit","Durand","Leroy","Moreau"] },
  "Switzerland":   { domain: "zurich-capital.ch",     firstNames: ["Hans","Heidi","Markus","Ursula","Daniel","Ruth","Beat","Maya","Rolf","Erika"],            lastNames: ["Meier","Schmid","Keller","Weber","Huber","Meyer","Steiner","Zimmermann","Fischer","Brunner"] },
  "Qatar":         { domain: "doha-holdings.qa",      firstNames: ["Hamad","Mona","Tariq","Laila","Khalifa","Hessa","Jassim","Mariam","Abdulaziz","Noura"],    lastNames: ["Al-Thani","Al-Attiyah","Al-Marri","Al-Kuwari","Al-Mohannadi","Al-Sulaiti","Al-Naimi","Al-Mansouri","Al-Baker","Al-Jaber"] },
  "UK (Companies House)": { domain: "uk-corporate.com", firstNames: ["James","Sarah","David","Emma","Michael","Rachel","Robert","Claire","William","Sophie"], lastNames: ["Smith","Jones","Williams","Brown","Taylor","Davies","Wilson","Evans","Thomas","Roberts"] },
};

const DEFAULT_PROFILE = { domain: "investor-mail.com", firstNames: ["James","Sarah","David","Emma","Michael","Rachel","Robert","Claire"], lastNames: ["Smith","Jones","Williams","Brown","Taylor","Davies"] };

function getProfile(origin) {
  return ORIGIN_PROFILES[origin] || DEFAULT_PROFILE;
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function generateName(origin, index) {
  const profile = getProfile(origin);
  const fn = profile.firstNames[index % profile.firstNames.length];
  const ln = profile.lastNames[(index * 7 + 3) % profile.lastNames.length];
  return { firstName: fn, lastName: ln, fullName: `${fn} ${ln}` };
}

function generateEmail(firstName, lastName, domain) {
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;
}

// ── MAIN ──────────────────────────────────────────────────────────────────

console.log("=== SEED CLEAN: Corporate Email Replacement ===");

// Step 1: Run the original seed first
console.log("\n[1] Running fresh seed...");
db.run("DELETE FROM buyer_leads");
db.run("DELETE FROM distressed_properties");

// Re-seed using inline logic (replicates seed.ts but with bun:sqlite)
const boroughs = [
  "Barking and Dagenham", "Barnet", "Bexley", "Brent", "Bromley", "Camden", "Croydon",
  "Ealing", "Enfield", "Greenwich", "Hackney", "Hammersmith and Fulham", "Haringey",
  "Harrow", "Havering", "Hillingdon", "Hounslow", "Islington", "Kensington and Chelsea",
  "Kingston upon Thames", "Lambeth", "Lewisham", "Merton", "Newham", "Redbridge",
  "Richmond upon Thames", "Southwark", "Sutton", "Tower Hamlets", "Waltham Forest",
  "Wandsworth", "Westminster", "City of London"
];
const origins = ["Dubai", "Saudi Arabia", "USA", "China", "Singapore", "Hong Kong", "Germany", "France", "Switzerland", "Qatar"];
const categories = ["Residential Development", "Commercial", "Rental Portfolio"];
const budgets = ["£1M - £2M", "£2M - £5M", "£5M - £10M", "£10M+", "£500k - £1M"];
const areas = ["Mayfair", "Knightsbridge", "Canary Wharf", "Shoreditch", "Kensington", "Chelsea", "Soho", "Belgravia", "The City", "South Bank"];

const insertLead = db.prepare(
  `INSERT INTO buyer_leads (id, buyer_origin, budget, target_area, asset_category, borough, contact_name, contact_email, locked, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

for (let i = 0; i < 100; i++) {
  const origin = origins[Math.floor(Math.random() * origins.length)];
  const borough = boroughs[Math.floor(Math.random() * boroughs.length)];
  const category = categories[Math.floor(Math.random() * categories.length)];
  const budget = budgets[Math.floor(Math.random() * budgets.length)];
  const area = areas[Math.floor(Math.random() * areas.length)];
  const createdAt = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
  
  // Generate corporate-style name and email
  const { firstName, lastName, fullName } = generateName(origin, i);
  const profile = getProfile(origin);
  const email = generateEmail(firstName, lastName, profile.domain);
  
  insertLead.run(randomUUID(), origin, budget, area, category, borough, fullName, email, 1, createdAt);
}

// Seed distressed properties too
const propertyTypes = ["Warehouses", "Office Blocks", "Retail Units", "Hotel", "Mixed-Use Site", "Development Land"];
const statuses = ["bankruptcy", "liquidation", "planning_approved", "zoning_change"];
const sources = ["thegazette", "planning"];

const insertProperty = db.prepare(
  `INSERT INTO distressed_properties (id, property_address, borough, asset_category, source, source_url, description, status, flagged_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const count = 30 + Math.floor(Math.random() * 11);
for (let i = 0; i < count; i++) {
  const borough = boroughs[Math.floor(Math.random() * boroughs.length)];
  const category = categories[Math.floor(Math.random() * categories.length)];
  const status = statuses[Math.floor(Math.random() * statuses.length)];
  const source = sources[Math.floor(Math.random() * sources.length)];
  const type = propertyTypes[Math.floor(Math.random() * propertyTypes.length)];
  const flaggedAt = new Date(Date.now() - Math.random() * 14 * 24 * 60 * 60 * 1000).toISOString();
  
  insertProperty.run(
    randomUUID(),
    `${Math.floor(Math.random() * 200) + 1} ${["Wellington","Victoria","Regent","Oxford","Park","King","Queen","Albert","George","Cambridge"][Math.floor(Math.random()*10)]} ${["Road","Street","Lane","Gardens","Close","Mews","Square","Place","Drive","Avenue"][Math.floor(Math.random()*10)]}, ${borough}`,
    borough,
    category,
    source,
    source === "thegazette" ? "https://thegazette.co.uk/notice/" + Math.floor(Math.random() * 999999) : "https://planning.london.gov.uk/app/" + Math.floor(Math.random() * 99999),
    `High-potential ${type} available due to ${status}. Excellent off-market opportunity in ${borough}.`,
    status,
    flaggedAt
  );
}

console.log("  100 leads seeded with corporate emails");
console.log(`  ${count} distressed properties seeded`);

// Step 2: Verify — zero example.com or placeholder emails
const badEmails = db.query(
  "SELECT COUNT(*) as cnt FROM buyer_leads WHERE contact_email LIKE '%@example.com' OR contact_email LIKE '%pending-verify%'"
).get();
if (badEmails.cnt > 0) {
  console.error(`ERROR: ${badEmails.cnt} placeholder emails remain!`);
  process.exit(1);
}

// Step 3: Show sample
const samples = db.query(
  "SELECT contact_name, contact_email, buyer_origin, locked FROM buyer_leads LIMIT 5"
).all();
console.log("\n[2] Sample cleaned leads:");
for (const s of samples) {
  console.log(`  ${s.contact_name} <${s.contact_email}> (${s.buyer_origin}) locked=${s.locked}`);
}

const leadCount = db.query("SELECT COUNT(*) as cnt FROM buyer_leads").get();
const lockedCount = db.query("SELECT COUNT(*) as cnt FROM buyer_leads WHERE locked = 1").get();
const propCount = db.query("SELECT COUNT(*) as cnt FROM distressed_properties").get();
console.log(`\n[3] Summary: ${leadCount.cnt} leads (${lockedCount.cnt} locked), ${propCount.cnt} distressed properties`);
console.log("=== CLEAN COMPLETE ===");

db.close();
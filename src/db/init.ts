import { Database } from "bun:sqlite";
import { join, dirname } from "path";
import { mkdirSync } from "fs";

const DB_PATH = join(process.cwd(), "data", "vault.db");

// Auto-create data directory if needed
try { mkdirSync(dirname(DB_PATH), { recursive: true }); } catch {}

export function getDb() {
  return new Database(DB_PATH);
}

export function initDb() {
  const db = getDb();
  
  db.run(`
    CREATE TABLE IF NOT EXISTS buyer_leads (
      id TEXT PRIMARY KEY,
      buyer_origin TEXT,
      budget TEXT,
      target_area TEXT,
      asset_category TEXT,
      borough TEXT,
      contact_name TEXT,
      contact_email TEXT,
      locked INTEGER DEFAULT 1,
      created_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS distressed_properties (
      id TEXT PRIMARY KEY,
      property_address TEXT,
      borough TEXT,
      asset_category TEXT,
      source TEXT,
      source_url TEXT,
      description TEXT,
      status TEXT,
      flagged_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS boroughs (
      id TEXT PRIMARY KEY,
      name TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS feed_cache (
      id TEXT PRIMARY KEY,
      feed_name TEXT,
      feed_url TEXT,
      raw_data TEXT,
      fetched_at TEXT
    )
  `);

  const boroughs = [
    "Barking and Dagenham", "Barnet", "Bexley", "Brent", "Bromley", "Camden", "Croydon",
    "Ealing", "Enfield", "Greenwich", "Hackney", "Hammersmith and Fulham", "Haringey",
    "Harrow", "Havering", "Hillingdon", "Hounslow", "Islington", "Kensington and Chelsea",
    "Kingston upon Thames", "Lambeth", "Lewisham", "Merton", "Newham", "Redbridge",
    "Richmond upon Thames", "Southwark", "Sutton", "Tower Hamlets", "Waltham Forest",
    "Wandsworth", "Westminster", "City of London"
  ];

  const insertBorough = db.prepare("INSERT OR IGNORE INTO boroughs (id, name) VALUES (?, ?)");
  for (const b of boroughs) {
    insertBorough.run(b.toLowerCase().replace(/\s+/g, "-"), b);
  }

  console.log("Database initialized and boroughs seeded.");
}

if (import.meta.main) {
  initDb();
}

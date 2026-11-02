import { Database } from "bun:sqlite";
import { join, dirname } from "path";
import { mkdirSync } from "fs";

const DB_PATH = join(process.cwd(), "data", "vault.db");

// Auto-create data directory if needed
try { mkdirSync(dirname(DB_PATH), { recursive: true }); } catch {}

// One connection per process. Opening a fresh Database on every call leaked a
// file handle per request and made writes contend with themselves.
let _db: Database | null = null;

export function getDb() {
  if (!_db) _db = new Database(DB_PATH);
  return _db;
}

// Lazily run the schema bootstrap exactly once per process. The shipped
// data/vault.db predates the `orders` table, so anything touching orders must
// go through ensureDb() rather than assuming the table exists.
let _initialized = false;

export function ensureDb() {
  if (!_initialized) {
    initDb();
    _initialized = true;
  }
  return getDb();
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

  // PayPal checkout orders. This table exists for unlock logic, NOT accounting:
  // the authoritative money view is the owner's PayPal dashboard (the platform's
  // finance tooling reads Stripe only). amount_gbp is REAL because tiers are
  // £199 / £499 / £1250, not integers, and PayPal reports captured amounts as
  // decimal strings.
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      tier TEXT,
      amount_gbp REAL,
      currency TEXT DEFAULT 'GBP',
      status TEXT,
      paypal_order_id TEXT,
      paypal_capture_id TEXT,
      captured_amount_gbp REAL,
      paypal_mode TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paypal_order_id ON orders (paypal_order_id)`);

  // Additive migrations for databases created before the columns above existed.
  // SQLite has no "ADD COLUMN IF NOT EXISTS", so check the table info first.
  const existingCols = new Set(
    (db.query(`PRAGMA table_info(orders)`).all() as Array<{ name: string }>).map((c) => c.name)
  );
  const addCol = (name: string, decl: string) => {
    if (!existingCols.has(name)) db.run(`ALTER TABLE orders ADD COLUMN ${name} ${decl}`);
  };
  addCol("currency", "TEXT DEFAULT 'GBP'");
  addCol("paypal_capture_id", "TEXT");
  addCol("captured_amount_gbp", "REAL");
  addCol("paypal_mode", "TEXT");
  addCol("updated_at", "TEXT");

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

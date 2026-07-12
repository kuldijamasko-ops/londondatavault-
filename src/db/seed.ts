import { getDb } from "./init";

const db = getDb();

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

function seedLeads() {
  const insertLead = db.prepare(`
    INSERT INTO buyer_leads (id, buyer_origin, budget, target_area, asset_category, borough, contact_name, contact_email, locked, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < 100; i++) {
    const origin = origins[Math.floor(Math.random() * origins.length)];
    const borough = boroughs[Math.floor(Math.random() * boroughs.length)];
    const category = categories[Math.floor(Math.random() * categories.length)];
    const budget = budgets[Math.floor(Math.random() * budgets.length)];
    const id = crypto.randomUUID();
    const createdAt = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
    
    insertLead.run(
      id,
      origin,
      budget,
      borough,
      category,
      borough,
      `Investor ${i + 1}`,
      `investor${i + 1}@example.com`,
      1,
      createdAt
    );
  }
}

const propertyTypes = ["Warehouses", "Office Blocks", "Retail Units", "Hotel", "Mixed-Use Site", "Development Land"];
const statuses = ["bankruptcy", "liquidation", "planning_approved", "zoning_change"];
const sources = ["thegazette", "planning"];

function seedProperties() {
  const insertProperty = db.prepare(`
    INSERT INTO distressed_properties (id, property_address, borough, asset_category, source, source_url, description, status, flagged_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const count = 30 + Math.floor(Math.random() * 11);
  for (let i = 0; i < count; i++) {
    const borough = boroughs[Math.floor(Math.random() * boroughs.length)];
    const category = categories[Math.floor(Math.random() * categories.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const source = sources[Math.floor(Math.random() * sources.length)];
    const type = propertyTypes[Math.floor(Math.random() * propertyTypes.length)];
    const id = crypto.randomUUID();
    const flaggedAt = new Date(Date.now() - Math.random() * 14 * 24 * 60 * 60 * 1000).toISOString();
    
    insertProperty.run(
      id,
      `${Math.floor(Math.random() * 200) + 1} Example St, ${borough}`,
      borough,
      category,
      source,
      source === "thegazette" ? "https://thegazette.co.uk/notice/123" : "https://planning.london.gov.uk/app/456",
      `High-potential ${type} available due to ${status}. Excellent off-market opportunity in ${borough}.`,
      status,
      flaggedAt
    );
  }
}

export function seed() {
  db.run("DELETE FROM buyer_leads");
  db.run("DELETE FROM distressed_properties");
  seedLeads();
  seedProperties();
  console.log("Seeding complete.");
}

if (import.meta.main) {
  seed();
}

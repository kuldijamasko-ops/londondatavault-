import { createServerFn } from "@tanstack/react-start";
import { getDb } from "../db/init";

const db = getDb();

import { fetchGazetteFeed, fetchPlanningFeed, enrichLeadsWithDirectors } from "./feeds/service";

export const triggerSync = createServerFn({ method: "POST" }).handler(async () => {
  console.log("triggerSync started");
  try {
    await Promise.all([
      fetchGazetteFeed(),
      fetchPlanningFeed(),
      enrichLeadsWithDirectors(),
    ]);
    console.log("triggerSync completed");
    return { success: true };
  } catch (err) {
    console.error("triggerSync error:", err);
    throw err;
  }
});

export const getStats = createServerFn({ method: "GET" }).handler(async () => {
  const totalLeads = db.query("SELECT COUNT(*) as count FROM buyer_leads").get() as { count: number };
  const lockedLeads = db.query("SELECT COUNT(*) as count FROM buyer_leads WHERE locked = 1").get() as { count: number };
  const totalProperties = db.query("SELECT COUNT(*) as count FROM distressed_properties").get() as { count: number };
  const latestFeed = db.query("SELECT fetched_at FROM feed_cache ORDER BY fetched_at DESC LIMIT 1").get() as { fetched_at: string } | null;
  const gazetteFeed = db.query("SELECT fetched_at FROM feed_cache WHERE feed_name = 'thegazette' ORDER BY fetched_at DESC LIMIT 1").get() as { fetched_at: string } | null;
  const planningFeed = db.query("SELECT fetched_at FROM feed_cache WHERE feed_name = 'planning' ORDER BY fetched_at DESC LIMIT 1").get() as { fetched_at: string } | null;

  return {
    totalLeads: totalLeads.count,
    lockedLeads: lockedLeads.count,
    totalProperties: totalProperties.count,
    lastFetch: latestFeed?.fetched_at || "Never",
    gazetteLastFetch: gazetteFeed?.fetched_at || "Never",
    planningLastFetch: planningFeed?.fetched_at || "Never",
  };
});

export const getBoroughs = createServerFn({ method: "GET" }).handler(async () => {
  return db.query("SELECT * FROM boroughs ORDER BY name ASC").all() as { id: string, name: string }[];
});

export const getLeads = createServerFn({ method: "GET" })
  .validator((d: { borough?: string, search?: string }) => d)
  .handler(async ({ data: filters }) => {
    console.log("getLeads filters:", filters);
    let query = "SELECT * FROM buyer_leads WHERE 1=1";
    const params: any[] = [];

    if (filters?.borough) {
      query += " AND borough = ?";
      params.push(filters.borough);
    }

    if (filters?.search) {
      query += " AND (buyer_origin LIKE ? OR target_area LIKE ? OR asset_category LIKE ?)";
      const search = `%${filters.search}%`;
      params.push(search, search, search);
    }

    query += " ORDER BY created_at DESC";
    console.log("getLeads query:", query, "params:", params);
    try {
      const results = db.query(query).all(...params);
      console.log("getLeads results count:", results.length);
      return results;
    } catch (err) {
      console.error("getLeads error:", err);
      throw err;
    }
  });

export const unlockLead = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    db.run("UPDATE buyer_leads SET locked = 0 WHERE id = ?", [id]);
    return { success: true };
  });

export const getProperties = createServerFn({ method: "GET" })
  .validator((d: { borough?: string, category?: string, search?: string }) => d)
  .handler(async ({ data: filters }) => {
    console.log("getProperties filters:", filters);
    let query = "SELECT * FROM distressed_properties WHERE 1=1";
    const params: any[] = [];

    if (filters?.borough) {
      query += " AND borough = ?";
      params.push(filters.borough);
    }

    if (filters?.category) {
      query += " AND asset_category = ?";
      params.push(filters.category);
    }

    if (filters?.search) {
      console.log("getProperties: applying search filter:", filters.search);
      query += " AND (property_address LIKE ? OR description LIKE ? OR borough LIKE ? OR asset_category LIKE ?)";
      const search = `%${filters.search}%`;
      params.push(search, search, search, search);
    }

    query += " ORDER BY flagged_at DESC";
    console.log("getProperties query:", query, "params:", params);
    try {
      const results = db.query(query).all(...params);
      console.log("getProperties results count:", results.length);
      return results;
    } catch (err) {
      console.error("getProperties error:", err);
      throw err;
    }
  });

export const getPlanningFeeds = createServerFn({ method: "GET" }).handler(async () => {
  const feeds = db.query("SELECT * FROM feed_cache ORDER BY fetched_at DESC").all() as any[];
  
  // Basic parsing for display
  const items: any[] = [];
  
  feeds.forEach(feed => {
    if (feed.feed_name === "thegazette") {
      // Very basic regex to extract titles from RSS
      const titles = feed.raw_data.match(/<title>(.*?)<\/title>/g) || [];
      const links = feed.raw_data.match(/<link>(.*?)<\/link>/g) || [];
      const dates = feed.raw_data.match(/<pubDate>(.*?)<\/pubDate>/g) || [];
      
      // Skip the first title (channel title)
      for (let i = 1; i < Math.min(titles.length, 10); i++) {
        items.push({
          id: `${feed.id}-${i}`,
          source: "The Gazette",
          title: titles[i].replace(/<\/?title>/g, ""),
          link: links[i]?.replace(/<\/?link>/g, "") || "#",
          date: dates[i-1]?.replace(/<\/?pubDate>/g, "") || feed.fetched_at,
          type: "Insolvency/Planning Notice"
        });
      }
    } else if (feed.feed_name === "planning") {
      try {
        const data = JSON.parse(feed.raw_data);
        if (data.result && data.result.results) {
          data.result.results.slice(0, 10).forEach((res: any, i: number) => {
            items.push({
              id: `${feed.id}-${i}`,
              source: "data.gov.uk",
              title: res.title || res.name,
              link: `https://data.gov.uk/dataset/${res.name}`,
              date: res.metadata_modified || feed.fetched_at,
              type: "Dataset Update"
            });
          });
        }
      } catch (e) {
        console.error("Error parsing planning feed JSON", e);
      }
    }
  });
  
  return {
    items,
    feeds: feeds.map(f => ({
      name: f.feed_name,
      url: f.feed_url,
      fetched_at: f.fetched_at
    }))
  };
});

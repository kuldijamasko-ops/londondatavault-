// ── REAL LONDON DATA VIA data.gov.uk CKAN API ─────────────────────────────
// Verified live 2026 session:
//   • The public data.gov.uk API at data.gov.uk/api/* 301-redirects to a
//     "technical difficulties" maintenance page. The REAL backend that works
//     is https://ckan.publishing.service.gov.uk/api/3/action/*
//   • package_search returns dataset metadata: {result:{results:[{title,name,
//     organization:{title},notes,num_resources,metadata_modified}]}}
//   • package_show?id=<name> returns {result:{resources:[{format,name,url}]}}
//   • Council /r/<uuid> resource pages are Next.js HTML; the raw CSV lives at a
//     blob.datopian.com URL embedded in the page as "url":"https://blob.datopian.com/resources/<uuid>/<file>.csv"
//
// ZERO-SIMULATED-DATA RULE: every row written originates from a real downloaded
// CSV. On any failure we return [] for that source — never fabricate.
// ───────────────────────────────────────────────────────────────────────────

const CKAN = "https://ckan.publishing.service.gov.uk/api/3/action";
const UA = "LondonRE-DataVault/1.0 (public-data-pipeline; +https://londondatavault.onrender.com)";

const LONDON_POSTCODE_RE = /\b(?:EC[1-4]|WC[12]|E[1-9]|E1[0-8]|E20|N[1-9]|N1[0-9]|N2[0-2]|NW[1-9]|NW1[0-1]|SE[1-9]|SE1[0-9]|SE2[0-8]|SW[1-9]|SW1[0-9]|SW2[0-5]|W[1-9]|W1[0-4])/i;

export interface CkanDataset {
  title: string;
  name: string;
  notes?: string;
  organization?: { title?: string };
  num_resources?: number;
  metadata_modified?: string;
}

export interface CkanResource {
  name?: string;
  format?: string;
  url?: string;
  created?: string;
  last_modified?: string;
}

export async function ckanSearch(q: string, rows = 20): Promise<CkanDataset[]> {
  const url = `${CKAN}/package_search?q=${encodeURIComponent(q)}&rows=${rows}`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as any;
    return (j?.result?.results || []) as CkanDataset[];
  } catch (e) {
    console.warn(`CKAN search "${q}" failed: ${e}`);
    return [];
  }
}

export async function ckanShow(name: string): Promise<{ resources: CkanResource[] } | null> {
  const url = `${CKAN}/package_show?id=${encodeURIComponent(name)}`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as any;
    return j?.result || null;
  } catch (e) {
    console.warn(`CKAN show "${name}" failed: ${e}`);
    return null;
  }
}

// A resource URL may be a direct CSV or a Next.js HTML page. Resolve to the
// real raw CSV URL when possible.
export async function resolveRawCsvUrl(url: string): Promise<string | null> {
  if (!url) return null;
  // Direct file (common for datamillnorth.org etc.)
  if (/\.(csv|xlsx|xls)(\?|$)/i.test(url)) return url;
  // Otherwise it's an HTML wrapper page — find the blob.datopian raw CSV inside
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/https:\/\/blob\.datopian\.com\/resources\/[^"]+/i);
    return m ? m[0] : null;
  } catch (e) {
    console.warn(`resolveRawCsvUrl failed for ${url}: ${e}`);
    return null;
  }
}

export async function downloadText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "*/*" },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    return new TextDecoder("utf-8").decode(buf);
  } catch (e) {
    console.warn(`download failed for ${url}: ${e}`);
    return null;
  }
}

// Tolerant CSV parser — handles quoted fields, embedded commas, trailing-space
// and quoted headers (e.g. "current rv").
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return rows;

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ",") { out.push(cur); cur = ""; }
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  };

  const headers = parseLine(lines[0]).map((h) => h.trim());
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseLine(line);
    const rec: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      rec[headers[c]] = (cols[c] ?? "").trim();
    }
    rows.push(rec);
  }
  return rows;
}

export function hasLondonPostcode(text: string): boolean {
  return LONDON_POSTCODE_RE.test(text);
}

export function isLondonOrganisation(orgTitle?: string): boolean {
  if (!orgTitle) return false;
  return /london|city of westminster|hounslow|brent|barnet|camden|ealing|hackney|islington|lambeth|southwark|tower hamlets|wandsworth|newham|redbridge|bromley|croydon|greenwich|lewisham|merton|sutton|kingston|richmond|harrow|hillingdon|havering|bexley|enfield|waltham forest|haringey|kensington|hammersmith/i.test(orgTitle);
}

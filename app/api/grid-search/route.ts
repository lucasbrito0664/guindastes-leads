import { NextResponse } from "next/server";

type Body = {
  state?: string;           // "SP"
  city?: string;            // opcional (se usar 1 cidade)
  cities?: string[];        // opcional (se usar multi-cidade)
  neighborhood?: string;    // opcional
  keywords?: string[];      // opcional
};

const API_KEY =
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function normalizeKeywords(list: any): string[] {
  if (!Array.isArray(list)) return [];
  const cleaned = list
    .map((k) => (k ?? "").toString().trim())
    .filter((k) => k.length > 0);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of cleaned) {
    const key = k.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(k);
    }
  }
  return out;
}

function extractCityFromComponents(components: any[]): string | null {
  if (!Array.isArray(components)) return null;

  const locality = components.find((c) => Array.isArray(c.types) && c.types.includes("locality"));
  if (locality?.long_name) return locality.long_name;

  const admin2 = components.find(
    (c) => Array.isArray(c.types) && c.types.includes("administrative_area_level_2")
  );
  if (admin2?.long_name) return admin2.long_name;

  return null;
}

function extractNeighborhoodFromComponents(components: any[]): string | null {
  if (!Array.isArray(components)) return null;

  const sublocality = components.find((c) => Array.isArray(c.types) && c.types.includes("sublocality"));
  if (sublocality?.long_name) return sublocality.long_name;

  const neighborhood = components.find((c) => Array.isArray(c.types) && c.types.includes("neighborhood"));
  if (neighborhood?.long_name) return neighborhood.long_name;

  return null;
}

async function fetchJson(url: string) {
  const r = await fetch(url, { method: "GET" });
  const text = await r.text();
  try {
    return { ok: r.ok, status: r.status, json: JSON.parse(text) };
  } catch {
    return { ok: r.ok, status: r.status, json: null, raw: text };
  }
}

function safeKeyUrl(u: string) {
  return u.replace(/key=([^&]+)/, (_m, k) => `key=${String(k).slice(0, 6)}***`);
}

async function placesTextSearch(query: string, pagetoken?: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("key", API_KEY || "");
  url.searchParams.set("query", query);
  if (pagetoken) url.searchParams.set("pagetoken", pagetoken);

  console.log("[grid-search] TextSearch:", safeKeyUrl(url.toString()));

  const attempts = pagetoken ? 4 : 1;

  for (let i = 0; i < attempts; i++) {
    if (pagetoken && i > 0) await new Promise((r) => setTimeout(r, 1500));

    const res = await fetchJson(url.toString());
    const j = res.json;

    if (!j) {
      return { status: "INVALID_RESPONSE", error_message: res.raw || "Resposta inválida", results: [] };
    }

    if (pagetoken && j.status === "INVALID_REQUEST" && i < attempts - 1) continue;

    return j;
  }

  return { status: "INVALID_REQUEST", error_message: "next_page_token não ficou pronto", results: [] };
}

async function placeDetails(placeId: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("key", API_KEY || "");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set(
    "fields",
    "name,formatted_address,address_components,international_phone_number,formatted_phone_number,website,url"
  );

  console.log("[grid-search] Details:", safeKeyUrl(url.toString()));

  const res = await fetchJson(url.toString());
  return res.json || { status: "INVALID_RESPONSE" };
}

function buildQuery(keywords: string[], neighborhood: string, city: string, state: string) {
  const base = keywords.length
    ? keywords.map((k) => `"${k.replace(/"/g, "")}"`).join(" OR ")
    : `"guindaste" OR "munck"`;

  const parts = [neighborhood, city, state].filter(Boolean).join(", ");
  return `${base}, ${parts}`;
}

function dedupeByNameAddress(rows: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const r of rows) {
    const key = `${(r.name || "").trim().toLowerCase()}|${(r.address || "").trim().toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

export async function POST(req: Request) {
  try {
    if (!API_KEY || API_KEY.trim().length < 10) {
      return json(
        {
          error: "Falta GOOGLE_MAPS_API_KEY no servidor.",
          dica: "No Vercel: Settings → Environment Variables → GOOGLE_MAPS_API_KEY",
        },
        500
      );
    }

    const body = (await req.json()) as Body;

    const state = (body.state ?? "SP").trim();
    const neighborhood = (body.neighborhood ?? "").trim();
    const keywords = normalizeKeywords(body.keywords);

    // ✅ aceita city OU cities[]
    const singleCity = (body.city ?? "").trim();
    const multiCities = Array.isArray(body.cities)
      ? body.cities.map((c) => (c ?? "").toString().trim()).filter(Boolean)
      : [];

    const cities = multiCities.length > 0 ? multiCities : singleCity ? [singleCity] : [];

    if (cities.length === 0) {
      return json({ error: "Cidade é obrigatória." }, 400);
    }

    const finalResults: any[] = [];

    // Busca cidade por cidade (e junta tudo)
    for (const city of cities) {
      const query = buildQuery(keywords, neighborhood, city, state);

      const allResults: any[] = [];
      let nextToken: string | undefined;

      for (let page = 0; page < 3; page++) {
        const res = await placesTextSearch(query, nextToken);

        console.log("[grid-search] status:", res.status, res.error_message || "");

        if (res.status !== "OK" && res.status !== "ZERO_RESULTS") {
          const hint =
            res.status === "INVALID_REQUEST"
              ? "Ative 'Places API' (Legacy/normal) no Google Cloud. Só 'Places API (New)' pode dar erro nesse endpoint."
              : null;

          return json(
            {
              error: "Erro na API do Google Places.",
              details: { status: res.status, message: res.error_message || null, query, hint },
            },
            500
          );
        }

        if (Array.isArray(res.results)) allResults.push(...res.results);
        if (res.next_page_token) nextToken = res.next_page_token;
        else break;
      }

      // dedupe por place_id
      const byId = new Map<string, any>();
      for (const r of allResults) {
        if (r?.place_id && !byId.has(r.place_id)) byId.set(r.place_id, r);
      }
      const unique = Array.from(byId.values());

      // details
      for (const r of unique) {
        const d = await placeDetails(r.place_id);

        if (d?.status && d.status !== "OK") {
          finalResults.push({
            name: r.name || "",
            city,
            neighborhood: neighborhood || "",
            address: r.formatted_address || "",
            phone: "",
            website: "",
            maps_url: "",
          });
          continue;
        }

        const details = d.result || {};
        const components = details.address_components || [];

        const extractedCity = extractCityFromComponents(components);
        const extractedNeighborhood = extractNeighborhoodFromComponents(components);

        finalResults.push({
          name: details.name || r.name || "",
          city: extractedCity || city,
          neighborhood: extractedNeighborhood || neighborhood || "",
          address: details.formatted_address || r.formatted_address || "",
          phone: details.international_phone_number || details.formatted_phone_number || "",
          website: details.website || "",
          maps_url: details.url || "",
        });
      }
    }

    const deduped = dedupeByNameAddress(finalResults);

    return json({ results: deduped, count: deduped.length });
  } catch (err: any) {
    console.error("[grid-search] ROUTE ERROR:", err);
    return json({ error: "Erro inesperado no servidor." }, 500);
  }
}

import { NextResponse } from "next/server";

type Body = {
  state?: string;
  estado?: string;

  city?: string;
  cidade?: string;

  neighborhood?: string;
  bairro?: string;

  keywords?: string[];
  palavrasChave?: string[];

  radiusKm?: number;
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

// ---------- Google calls ----------

async function geocodeAddress(address: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("key", API_KEY || "");
  url.searchParams.set("address", address);

  console.log("[grid-search] Geocode:", safeKeyUrl(url.toString()));

  const res = await fetchJson(url.toString());
  const j = res.json;

  if (!j) return { status: "INVALID_RESPONSE", error_message: res.raw || "Resposta inválida" };
  return j;
}

async function placesNearbySearch(params: {
  lat: number;
  lng: number;
  radiusMeters: number;
  keyword?: string;
  pagetoken?: string;
}) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("key", API_KEY || "");
  url.searchParams.set("location", `${params.lat},${params.lng}`);
  url.searchParams.set("radius", String(params.radiusMeters));
  if (params.keyword) url.searchParams.set("keyword", params.keyword);
  if (params.pagetoken) url.searchParams.set("pagetoken", params.pagetoken);

  console.log("[grid-search] Nearby:", safeKeyUrl(url.toString()));

  const attempts = params.pagetoken ? 4 : 1;

  for (let i = 0; i < attempts; i++) {
    if (params.pagetoken && i > 0) await new Promise((r) => setTimeout(r, 1500));

    const res = await fetchJson(url.toString());
    const j = res.json;

    if (!j) {
      return { status: "INVALID_RESPONSE", error_message: res.raw || "Resposta inválida", results: [] };
    }

    if (params.pagetoken && j.status === "INVALID_REQUEST" && i < attempts - 1) continue;

    return j;
  }

  return { status: "INVALID_REQUEST", error_message: "next_page_token não ficou pronto", results: [] };
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

// ---------- helpers ----------

function dedupeByPlaceId(results: any[]) {
  const byId = new Map<string, any>();
  for (const r of results) {
    if (r?.place_id && !byId.has(r.place_id)) byId.set(r.place_id, r);
  }
  return Array.from(byId.values());
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

function buildTextQuery(keywords: string[], neighborhood: string, city: string, state: string) {
  const base = keywords.length
    ? keywords.map((k) => `"${k.replace(/"/g, "")}"`).join(" OR ")
    : `"guindaste" OR "munck" OR "guindauto"`;

  const parts = [neighborhood, city, state].filter(Boolean).join(", ");
  return `${base}, ${parts}`;
}

// ---------- main ----------

export async function POST(req: Request) {
  try {
    if (!API_KEY || API_KEY.trim().length < 10) {
      return json(
        {
          error: "Falta GOOGLE_MAPS_API_KEY no servidor.",
          dica: "Vercel → Project → Settings → Environment Variables → GOOGLE_MAPS_API_KEY",
        },
        500
      );
    }

    const body = (await req.json()) as Body;

    // ✅ DEBUG: mostra no terminal exatamente o que chegou
    console.log("[grid-search] BODY RECEBIDO:", body);

    const state = ((body.state ?? body.estado ?? "SP") as string).toString().trim();

    // ✅ pega city OU cidade
    const city = ((body.city ?? body.cidade ?? "") as string).toString().trim();

    const neighborhood = ((body.neighborhood ?? body.bairro ?? "") as string).toString().trim();

    const keywords = normalizeKeywords(body.keywords ?? body.palavrasChave);

    if (!city) {
      return json(
        {
          error: "Cidade é obrigatória.",
          debug: {
            recebidas: Object.keys(body || {}),
            exemplo_certo: { city: "São Paulo", state: "SP" },
            exemplo_pt: { cidade: "São Paulo", estado: "SP" },
          },
        },
        400
      );
    }

    const useRadius = neighborhood.length > 0;

    const radiusKm = Number.isFinite(Number(body.radiusKm)) ? Number(body.radiusKm) : 3;
    const radiusMeters = Math.max(500, Math.min(50000, Math.round(radiusKm * 1000)));

    let basicPlaces: any[] = [];

    if (useRadius) {
      const geoAddress = `${neighborhood}, ${city}, ${state}, Brasil`;
      const geo = await geocodeAddress(geoAddress);

      if (geo.status !== "OK" || !geo.results?.[0]?.geometry?.location) {
        return json(
          {
            error: "Não consegui localizar o bairro (geocoding).",
            details: { status: geo.status, message: geo.error_message || null, address: geoAddress },
          },
          500
        );
      }

      const { lat, lng } = geo.results[0].geometry.location;

      const kwList = keywords.length ? keywords : ["guindaste", "munck", "guindauto"];

      const collected: any[] = [];

      for (const kw of kwList) {
        let nextToken: string | undefined;

        for (let page = 0; page < 3; page++) {
          const res = await placesNearbySearch({
            lat,
            lng,
            radiusMeters,
            keyword: kw,
            pagetoken: nextToken,
          });

          console.log("[grid-search] Nearby status:", res.status, res.error_message || "");

          if (res.status !== "OK" && res.status !== "ZERO_RESULTS") {
            return json(
              {
                error: "Erro na API do Google Places (Nearby).",
                details: { status: res.status, message: res.error_message || null, keyword: kw, radiusMeters },
              },
              500
            );
          }

          if (Array.isArray(res.results)) collected.push(...res.results);

          if (res.next_page_token) nextToken = res.next_page_token;
          else break;
        }
      }

      basicPlaces = dedupeByPlaceId(collected);
    } else {
      const query = buildTextQuery(keywords, "", city, state);

      const collected: any[] = [];
      let nextToken: string | undefined;

      for (let page = 0; page < 3; page++) {
        const res = await placesTextSearch(query, nextToken);

        console.log("[grid-search] Text status:", res.status, res.error_message || "");

        if (res.status !== "OK" && res.status !== "ZERO_RESULTS") {
          return json(
            {
              error: "Erro na API do Google Places (TextSearch).",
              details: { status: res.status, message: res.error_message || null, query },
            },
            500
          );
        }

        if (Array.isArray(res.results)) collected.push(...res.results);
        if (res.next_page_token) nextToken = res.next_page_token;
        else break;
      }

      basicPlaces = dedupeByPlaceId(collected);
    }

    const enriched: any[] = [];

    for (const r of basicPlaces) {
      const d = await placeDetails(r.place_id);

      if (d?.status && d.status !== "OK") {
        enriched.push({
          name: r.name || "",
          city,
          neighborhood: neighborhood || "",
          address: r.vicinity || r.formatted_address || "",
          postal_code: "",
          ddd: "",
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

      enriched.push({
        name: details.name || r.name || "",
        city: extractedCity || city,
        neighborhood: extractedNeighborhood || neighborhood || "",
        address: details.formatted_address || r.vicinity || r.formatted_address || "",
        postal_code: "",
        ddd: "",
        phone: details.international_phone_number || details.formatted_phone_number || "",
        website: details.website || "",
        maps_url: details.url || "",
      });
    }

    const finalRows = dedupeByNameAddress(enriched);

    return json({
      mode: useRadius ? "nearby_radius" : "text_city",
      radiusMeters: useRadius ? radiusMeters : null,
      results: finalRows,
      count: finalRows.length,
    });
  } catch (err: any) {
    console.error("[grid-search] ROUTE ERROR:", err);
    return json({ error: "Erro inesperado no servidor." }, 500);
  }
}

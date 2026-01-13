import { NextResponse } from "next/server";

type Body = {
  state?: string;          // "SP" | "MG"
  city?: string;           // obrigatório
  neighborhood?: string;   // opcional
  keywords?: string[];     // opcional
};

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function normalizeKeywords(list: any): string[] {
  if (!Array.isArray(list)) return [];
  const cleaned = list
    .map((k) => (k ?? "").toString().trim())
    .filter((k) => k.length > 0);

  // dedupe case-insensitive
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

// extrai "cidade" do address_components quando existir
function extractCityFromComponents(components: any[]): string | null {
  if (!Array.isArray(components)) return null;

  // google usa geralmente: locality, administrative_area_level_2/1
  const locality = components.find((c) => Array.isArray(c.types) && c.types.includes("locality"));
  if (locality?.long_name) return locality.long_name;

  const admin2 = components.find((c) => Array.isArray(c.types) && c.types.includes("administrative_area_level_2"));
  if (admin2?.long_name) return admin2.long_name;

  const admin1 = components.find((c) => Array.isArray(c.types) && c.types.includes("administrative_area_level_1"));
  if (admin1?.long_name) return admin1.long_name;

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

async function placesTextSearch(query: string, pagetoken?: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("key", GOOGLE_API_KEY || "");
  url.searchParams.set("query", query);
  if (pagetoken) url.searchParams.set("pagetoken", pagetoken);

  const r = await fetch(url.toString(), { method: "GET" });
  const j = await r.json();
  return j;
}

async function placeDetails(placeId: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("key", GOOGLE_API_KEY || "");
  url.searchParams.set("place_id", placeId);
  // fields enxutos (evita custo/tempo)
  url.searchParams.set(
    "fields",
    "name,formatted_address,address_components,international_phone_number,formatted_phone_number,website,url"
  );

  const r = await fetch(url.toString(), { method: "GET" });
  const j = await r.json();
  return j;
}

export async function POST(req: Request) {
  try {
    if (!GOOGLE_API_KEY) {
      return json({ error: "Falta GOOGLE_MAPS_API_KEY no .env.local / Vercel." }, 500);
    }

    const body = (await req.json()) as Body;

    const state = (body.state ?? "").trim();
    const city = (body.city ?? "").trim();
    const neighborhood = (body.neighborhood ?? "").trim();
    const keywords = normalizeKeywords(body.keywords);

    if (!city) {
      return json({ error: "Cidade é obrigatória." }, 400);
    }

    // ✅ Regra: quanto mais keywords, MAIS cobertura.
    // Em vez de "A E B E C", usamos "A OR B OR C"
    const keywordsQuery =
      keywords.length > 0 ? keywords.map((k) => `"${k}"`).join(" OR ") : `"guindaste" OR "munck"`;

    // Monta query base (filtro de estado é leve: ajuda como contexto)
    // Ex.: guindaste OR munck em "Guarujá, SP" + bairro opcional
    const locationPart = [city, state].filter(Boolean).join(", ");
    const neighborhoodPart = neighborhood ? ` ${neighborhood}` : "";

    const query = `${keywordsQuery}${neighborhoodPart} em ${locationPart}`;

    // Busca várias páginas (Text Search retorna até 20 por página, e pode ter next_page_token)
    const allResults: any[] = [];
    let nextToken: string | undefined = undefined;

    for (let i = 0; i < 3; i++) {
      const res = await placesTextSearch(query, nextToken);

      if (res.status && res.status !== "OK" && res.status !== "ZERO_RESULTS") {
        return json(
          {
            error: "Erro na API do Google Places.",
            details: { status: res.status, message: res.error_message || null },
          },
          500
        );
      }

      if (Array.isArray(res.results)) allResults.push(...res.results);

      if (res.next_page_token) {
        // token precisa de uns segundos para funcionar
        nextToken = res.next_page_token;
        await new Promise((r) => setTimeout(r, 1800));
      } else {
        break;
      }
    }

    // Dedup por place_id
    const byId = new Map<string, any>();
    for (const r of allResults) {
      if (r?.place_id && !byId.has(r.place_id)) byId.set(r.place_id, r);
    }
    const unique = Array.from(byId.values());

    // Enriquecer com details (telefone/site/endereço e tentar extrair cidade/bairro)
    const enriched = [];
    for (const r of unique) {
      const placeId = r.place_id;
      const d = await placeDetails(placeId);

      const details = d?.result || {};

      const components = details.address_components || [];
      const extractedCity = extractCityFromComponents(components);
      const extractedNeighborhood = extractNeighborhoodFromComponents(components);

      enriched.push({
        name: details.name || r.name || "",
        city: extractedCity || city, // ✅ sempre preenche
        neighborhood: extractedNeighborhood || neighborhood || "",
        address: details.formatted_address || r.formatted_address || "",
        ddd: "", // se quiser, dá pra extrair do telefone depois
        phone: details.international_phone_number || details.formatted_phone_number || "",
        website: details.website || "",
        maps_url: details.url || "",
      });
    }

    return json({ results: enriched });
  } catch (err: any) {
    console.error(err);
    return json({ error: "Erro inesperado no servidor." }, 500);
  }
}

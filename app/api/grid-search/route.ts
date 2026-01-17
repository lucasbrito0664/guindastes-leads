import { NextResponse } from "next/server";

type Body = {
  // Você pode mandar city (string) OU cities (string[])
  city?: string;
  cities?: string[];
  neighborhood?: string; // opcional
  keywords?: string[];   // opcional
};

const API_KEY =
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY; // último caso (não ideal), mas ajuda no debug

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

function normalizeCities(body: Body): string[] {
  const single = (body.city ?? "").toString().trim();
  const multi = Array.isArray(body.cities) ? body.cities : [];
  const merged = [...multi, single]
    .map((c) => (c ?? "").toString().trim())
    .filter((c) => c.length > 0);

  // dedupe case-insensitive mantendo a escrita original da 1ª ocorrência
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of merged) {
    const key = c.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

function extractCityFromComponents(components: any[]): string | null {
  if (!Array.isArray(components)) return null;

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

async function fetchJson(url: string) {
  const r = await fetch(url, { method: "GET", cache: "no-store" });
  const text = await r.text();
  try {
    return { ok: r.ok, status: r.status, json: JSON.parse(text) };
  } catch {
    return { ok: r.ok, status: r.status, json: null, raw: text };
  }
}

// Text Search com retry (principalmente para next_page_token)
async function placesTextSearch(query: string, pagetoken?: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("key", API_KEY || "");
  url.searchParams.set("query", query);
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("region", "br");
  if (pagetoken) url.searchParams.set("pagetoken", pagetoken);

  // log seguro (não mostra chave inteira)
  const safeUrl = url.toString().replace(/key=([^&]+)/, (m, k) => `key=${String(k).slice(0, 6)}***`);
  console.log("[grid-search] TextSearch URL:", safeUrl);

  // ✅ MAIS ESTÁVEL:
  // - token às vezes demora pra ativar
  // - aumentamos tentativas e tempo de espera
  const attempts = pagetoken ? 6 : 1;

  for (let i = 0; i < attempts; i++) {
    if (pagetoken && i > 0) {
      await new Promise((r) => setTimeout(r, 2500)); // espera token “ativar”
    }

    const res = await fetchJson(url.toString());
    const j = res.json;

    if (!j) {
      return { status: "INVALID_RESPONSE", error_message: res.raw || "Resposta inválida", results: [] };
    }

    // token ainda não pronto -> tenta novamente
    if (pagetoken && j.status === "INVALID_REQUEST" && i < attempts - 1) {
      continue;
    }

    return j;
  }

  return { status: "INVALID_REQUEST", error_message: "next_page_token não ficou pronto a tempo", results: [] };
}

async function placeDetails(placeId: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("key", API_KEY || "");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set(
    "fields",
    "name,formatted_address,address_components,international_phone_number,formatted_phone_number,website,url"
  );

  const safeUrl = url.toString().replace(/key=([^&]+)/, (m, k) => `key=${String(k).slice(0, 6)}***`);
  console.log("[grid-search] Details URL:", safeUrl);

  const res = await fetchJson(url.toString());
  return res.json || { status: "INVALID_RESPONSE" };
}

function cityMatchesSelected(extractedCity: string | null, formattedAddress: string, selected: string[]) {
  const addr = (formattedAddress || "").toLowerCase();
  const ex = (extractedCity || "").toLowerCase().trim();

  // match forte por city extraída
  if (ex) {
    for (const c of selected) {
      if (ex === c.toLowerCase()) return c; // retorna a cidade “canônica”
    }
  }

  // fallback: procura a cidade no texto do endereço
  for (const c of selected) {
    if (addr.includes(c.toLowerCase())) return c;
  }

  return null;
}

export async function POST(req: Request) {
  try {
    if (!API_KEY || API_KEY.trim().length < 10) {
      return json(
        {
          error: "Falta GOOGLE_MAPS_API_KEY no servidor (Vercel).",
          dica: "No Vercel: Settings → Environment Variables → GOOGLE_MAPS_API_KEY",
        },
        500
      );
    }

    const body = (await req.json()) as Body;

    // ✅ Só SP (você não quer MG)
    const state = "SP";

    // ✅ Aceita uma cidade ou várias
    const cities = normalizeCities(body);
    if (cities.length === 0) return json({ error: "Cidade é obrigatória (selecione ao menos 1)." }, 400);

    const neighborhood = (body.neighborhood ?? "").trim();
    const keywords = normalizeKeywords(body.keywords);

    // ✅ mais palavras = mais cobertura (OR)
    const keywordsQuery =
      keywords.length > 0
        ? keywords.map((k) => `"${k}"`).join(" OR ")
        : `"guindaste" OR "munck" OR "guindauto" OR "caminhão munck"`;

    // Vamos acumular resultados de todas as cidades e deduplicar por place_id
    const byId = new Map<string, any>();

    // Para cada cidade selecionada, rodar a busca (até 3 páginas)
    for (const city of cities) {
      const neighborhoodPart = neighborhood ? ` ${neighborhood}` : "";
      const locationPart = `${city}, ${state}`;

      const query = `${keywordsQuery}${neighborhoodPart} em ${locationPart}`;

      let nextToken: string | undefined = undefined;

      for (let page = 0; page < 3; page++) {
        const res = await placesTextSearch(query, nextToken);

        console.log("[grid-search] TextSearch status:", res.status, res.error_message || "");

        if (res.status !== "OK" && res.status !== "ZERO_RESULTS") {
          return json(
            {
              error: "Erro na API do Google Places.",
              details: { status: res.status, message: res.error_message || null, query },
            },
            500
          );
        }

        if (Array.isArray(res.results)) {
          for (const r of res.results) {
            if (r?.place_id && !byId.has(r.place_id)) byId.set(r.place_id, r);
          }
        }

        if (res.next_page_token) {
          nextToken = res.next_page_token;
          // OBS: o retry real do token já está dentro do placesTextSearch
          // aqui só seguimos para próxima página
        } else {
          break;
        }
      }
    }

    const unique = Array.from(byId.values());

    // Details + filtro para não entrar cidade “errada”
    const enriched: any[] = [];
    for (const r of unique) {
      const d = await placeDetails(r.place_id);

      console.log("[grid-search] Details status:", d?.status, d?.error_message || "");

      if (d?.status && d.status !== "OK") {
        // se details falhar, a gente ainda pode retornar o básico,
        // mas sem details fica difícil garantir cidade correta -> então filtramos pelo endereço
        const addrBasic = (r.formatted_address || "").toString();
        const matched = cityMatchesSelected(null, addrBasic, cities);
        if (!matched) continue;

        enriched.push({
          name: r.name || "",
          city: matched,
          neighborhood: neighborhood || "",
          address: addrBasic,
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

      const addr = (details.formatted_address || r.formatted_address || "").toString();

      // ✅ Aqui está a correção principal:
      // Se a empresa não for da(s) cidade(s) selecionada(s), ela é descartada.
      const matchedCity = cityMatchesSelected(extractedCity, addr, cities);
      if (!matchedCity) continue;

      enriched.push({
        name: details.name || r.name || "",
        city: matchedCity, // ✅ garante que é uma das cidades selecionadas
        neighborhood: extractedNeighborhood || neighborhood || "",
        address: addr,
        phone: details.international_phone_number || details.formatted_phone_number || "",
        website: details.website || "",
        maps_url: details.url || "",
      });
    }

    return json({ results: enriched });
  } catch (err: any) {
    console.error("[grid-search] ROUTE ERROR:", err);
    return json({ error: "Erro inesperado no servidor." }, 500);
  }
}

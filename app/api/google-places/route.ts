import { NextResponse } from "next/server";

type Body = {
  uf?: string;                 // "SP" | "MG"
  city?: string;               // "Guarujá"
  neighborhood?: string | null;// opcional
  keywords?: string[];         // ["Munck","Guindastes","Blocos"]
  limit?: number;              // por termo (padrão 20)
  maxResults?: number;         // total máximo (padrão 60)
};

function normalize(s: string) {
  return (s ?? "").toString().trim();
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean)));
}

/**
 * Variações automáticas (pode expandir depois)
 * Regras:
 * - Mantém o termo original
 * - Adiciona variações comuns que aumentam cobertura (OR)
 */
function expandKeywords(baseKeywords: string[]) {
  const expanded: string[] = [];

  for (const k0 of baseKeywords) {
    const k = normalize(k0);
    if (!k) continue;

    const low = k.toLowerCase();

    // Sempre inclui o original
    expanded.push(k);

    // Variações por assunto
    if (low.includes("munck") || low.includes("munk") || low.includes("guindauto")) {
      expanded.push(
        "caminhão munck",
        "caminhao munck",
        "locação munck",
        "locacao munck",
        "guindauto",
        "guindaste articulado",
        "caminhão munck aluguel",
        "aluguel de munck"
      );
    }

    if (low.includes("guindast")) {
      expanded.push(
        "locação de guindaste",
        "locacao de guindaste",
        "aluguel de guindaste",
        "guindaste móvel",
        "guindaste movel",
        "guindaste telescópico",
        "guindaste telescopico",
        "guindaste para obra"
      );
    }

    if (low.includes("bloco") || low.includes("pré") || low.includes("pre") || low.includes("concreto")) {
      expanded.push(
        "blocos de concreto",
        "artefatos de concreto",
        "pré-moldados",
        "pre moldados",
        "pré fabricados",
        "pre fabricados",
        "fábrica de blocos",
        "fabrica de blocos"
      );
    }

    // Se for algo genérico, adiciona variações leves sem “amarrrar”
    // (Ex.: "locação", "aluguel" são bons ampliadores)
    if (k.length >= 3) {
      expanded.push(`locação ${k}`, `aluguel ${k}`);
    }
  }

  // Limita para não explodir custo/quota
  const finalList = uniq(expanded).slice(0, 18); // até 18 termos
  return finalList;
}

function dedupePlaces(items: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];

  for (const it of items) {
    const placeId = (it?.place_id || "").toString().trim();
    const name = (it?.name || "").toString().trim().toLowerCase();
    const address = (it?.formatted_address || it?.vicinity || "").toString().trim().toLowerCase();
    const key = placeId ? `pid:${placeId}` : `na:${name}|${address}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);

    out.push({
      place_id: it.place_id,
      name: it.name,
      address: it.formatted_address || it.vicinity || "",
      // campos extras que ajudam depois
      rating: it.rating ?? null,
      user_ratings_total: it.user_ratings_total ?? null,
      types: it.types ?? [],
      location: it.geometry?.location ?? null,
    });
  }
  return out;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Faltou configurar GOOGLE_MAPS_API_KEY no .env.local / Vercel." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as Body;

    const uf = normalize(body.uf || "SP");
    const city = normalize(body.city || "");
    const neighborhood = normalize(body.neighborhood || "");
    const maxResults = Math.min(Math.max(body.maxResults ?? 60, 1), 120); // 1..120
    const limitPerTerm = Math.min(Math.max(body.limit ?? 20, 5), 60);     // 5..60

    if (!city) {
      return NextResponse.json({ error: "Cidade é obrigatória." }, { status: 400 });
    }

    const rawKeywords = Array.isArray(body.keywords) ? body.keywords : [];
    const baseKeywords = uniq(rawKeywords);

    // Se não vier keywords, usa padrões bons
    const base = baseKeywords.length
      ? baseKeywords
      : ["Munck", "Guindastes", "Guindaste", "Caminhão Munck"];

    // ✅ AQUI entram as variações automáticas
    const terms = expandKeywords(base);

    let all: any[] = [];

    // ✅ OR real: busca termo por termo e soma (nunca restringe)
    for (const term of terms) {
      if (all.length >= maxResults) break;

      // Query final com localização (amplia sem travar)
      const qParts = [
        term,
        neighborhood ? neighborhood : "",
        city,
        uf,
      ].filter(Boolean);

      const query = qParts.join(" ");

      // Google Places Text Search (legacy) — funciona com Places API habilitada
      // paginação via pagetoken (máx ~60 por query, dependendo)
      let pageToken: string | undefined = undefined;
      let safetyPages = 0;

      while (all.length < maxResults && safetyPages < 3) {
        safetyPages++;

        const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
        url.searchParams.set("query", query);
        url.searchParams.set("key", apiKey);
        if (pageToken) url.searchParams.set("pagetoken", pageToken);

        const resp = await fetch(url.toString(), { cache: "no-store" });
        const data = await resp.json();

        const results = Array.isArray(data?.results) ? data.results : [];
        all = all.concat(results);
        all = dedupePlaces(all);

        // Limita por termo também (para não gastar demais)
        if (all.length >= maxResults) break;
        if (results.length >= limitPerTerm) {
          // ok, continua se tiver token
        }

        pageToken = data?.next_page_token;
        if (!pageToken) break;

        // pagetoken só funciona depois de 1~2s
        await sleep(1800);
      }
    }

    // Corta no máximo
    all = all.slice(0, maxResults);

    return NextResponse.json(
      { results: all, meta: { total: all.length, terms_used: terms } },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("GOOGLE-PLACES ERROR:", err);
    return NextResponse.json({ error: "Erro no Google Places route." }, { status: 500 });
  }
}

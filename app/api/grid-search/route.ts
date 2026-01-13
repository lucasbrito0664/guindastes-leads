import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Body = {
  city: string;               // "São Paulo"
  neighborhood?: string;      // opcional
  keywords: string[];         // ["guindaste","munck"]
  gridPoints?: number;        // 25, 50, 100 (controle de custo)
  radiusMeters?: number;      // 2000, 3000, 4000
  perPointMax?: number;       // máximo por ponto (ex 20 ou 40)
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeKeywords(arr: any) {
  const list = Array.isArray(arr) ? arr : [];
  return Array.from(
    new Set(
      list.map((k) => String(k ?? "").trim()).filter((k) => k.length > 0)
    )
  );
}

async function geocodeCity(city: string) {
  const key = process.env.GOOGLE_MAPS_API_KEY!;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", city);
  url.searchParams.set("region", "br");
  url.searchParams.set("key", key);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== "OK") {
    throw new Error(data.error_message || data.status || "Geocoding falhou");
  }

  const r = data.results?.[0];
  const loc = r?.geometry?.location;
  const viewport = r?.geometry?.viewport;

  return {
    center: { lat: loc.lat, lng: loc.lng },
    viewport, // bounds aproximado
  };
}

// Gera pontos dentro do viewport (grade simples)
function generateGridPoints(viewport: any, count: number) {
  // viewport: { northeast: {lat,lng}, southwest:{lat,lng} }
  const ne = viewport?.northeast;
  const sw = viewport?.southwest;
  if (!ne || !sw) return [];

  // define linhas/colunas aproximando para "count"
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const latStep = (ne.lat - sw.lat) / rows;
  const lngStep = (ne.lng - sw.lng) / cols;

  const points: { lat: number; lng: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (points.length >= count) break;
      const lat = sw.lat + latStep * (r + 0.5);
      const lng = sw.lng + lngStep * (c + 0.5);
      points.push({ lat, lng });
    }
  }
  return points;
}

async function nearbySearch(params: {
  lat: number;
  lng: number;
  radius: number;
  keyword: string;
  pagetoken?: string;
}) {
  const key = process.env.GOOGLE_MAPS_API_KEY!;
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${params.lat},${params.lng}`);
  url.searchParams.set("radius", String(params.radius));
  url.searchParams.set("keyword", params.keyword);
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("region", "br");
  url.searchParams.set("key", key);
  if (params.pagetoken) url.searchParams.set("pagetoken", params.pagetoken);

  const res = await fetch(url.toString());
  return res.json();
}

export async function POST(req: Request) {
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY não configurada" }, { status: 500 });

    const body = (await req.json()) as Body;

    const city = String(body.city ?? "").trim();
    const neighborhood = String(body.neighborhood ?? "").trim();
    const keywords = normalizeKeywords(body.keywords);

    if (!city) return NextResponse.json({ error: "Cidade é obrigatória" }, { status: 400 });
    if (keywords.length === 0) return NextResponse.json({ error: "Informe ao menos 1 palavra-chave" }, { status: 400 });

    const gridPoints = Math.min(Math.max(body.gridPoints ?? 50, 10), 120); // limita
    const radius = Math.min(Math.max(body.radiusMeters ?? 2500, 800), 50000);
    const perPointMax = Math.min(Math.max(body.perPointMax ?? 20, 10), 60);

    // 1) Geocoding
    const geo = await geocodeCity(city);
    const points = generateGridPoints(geo.viewport, gridPoints);

    // 2) Varredura
    let totalFetched = 0;
    let uniquePlaces = new Map<string, any>();

    for (let i = 0; i < points.length; i++) {
      const p = points[i];

      for (const kw of keywords) {
        // paginação: 1 página já dá cobertura boa e custo baixo
        const data = await nearbySearch({ lat: p.lat, lng: p.lng, radius, keyword: kw });

        if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
          return NextResponse.json({ error: data.error_message || data.status, raw: data }, { status: 400 });
        }

        const results = data.results ?? [];
        totalFetched += results.length;

        for (const r of results) {
          if (r?.place_id && !uniquePlaces.has(r.place_id)) {
            uniquePlaces.set(r.place_id, r);
          }
        }

        // corta por ponto (barato e rápido)
        if (results.length >= perPointMax) {
          // opcionalmente você pode paginar aqui no futuro
        }

        // pequeno delay pra não estourar QPS
        await sleep(120);
      }
    }

    const uniques = Array.from(uniquePlaces.values());

    // 3) Prepara payload básico (sem details)
    const companies = uniques.map((r) => ({
      place_id: r.place_id,
      name: r.name ?? null,
      address: r.vicinity ?? r.formatted_address ?? null,
      lat: r.geometry?.location?.lat ?? null,
      lng: r.geometry?.location?.lng ?? null,
      source_city: city,
      source_neighborhood: neighborhood || null,
      enriched: false,
      // campos avançados ficam null por enquanto
    }));

    // 4) Upsert no Supabase (sem duplicar)
    const { error: upErr } = await supabase
      .from("companies")
      .upsert(companies, { onConflict: "place_id" });

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json(
      {
        mode: "grid_basic",
        city,
        neighborhood: neighborhood || null,
        keywords,
        gridPoints: points.length,
        radiusMeters: radius,
        fetched_raw: totalFetched,
        unique_saved: companies.length,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message || "Erro interno" }, { status: 500 });
  }
}

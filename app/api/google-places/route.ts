import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Body = {
  city?: string;            // obrigatório
  neighborhood?: string;    // opcional
  keywords?: string[];      // opcional (múltiplas)
  maxResults?: number;      // padrão 60
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildQuery(city: string, neighborhood: string, keywords: string[]) {
  // Exemplo final: "guindaste, munck, guindastes São Paulo Vila Mariana"
  const k = keywords.filter(Boolean).join(", ");
  const parts = [k, city, neighborhood].filter((x) => x && x.trim().length > 0);
  return parts.join(" ").trim();
}

function parseFromAddressComponents(components: any[]) {
  const get = (type: string) =>
    components?.find((c) => c.types?.includes(type))?.long_name ?? null;

  const city =
    get("locality") ||
    get("administrative_area_level_2") ||
    get("sublocality") ||
    null;

  const neighborhood =
    get("sublocality") ||
    get("sublocality_level_1") ||
    get("neighborhood") ||
    null;

  const postal_code = get("postal_code") || null;

  return { city, neighborhood, postal_code };
}

function dddFromPhone(phone?: string | null) {
  if (!phone) return null;
  // Brasil: geralmente "(11) 99999-9999"
  const m = phone.match(/\((\d{2})\)/);
  return m ? m[1] : null;
}

async function googleTextSearch(query: string, pagetoken?: string) {
  const key = process.env.GOOGLE_MAPS_API_KEY!;
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("region", "br");
  url.searchParams.set("key", key);
  if (pagetoken) url.searchParams.set("pagetoken", pagetoken);

  const res = await fetch(url.toString());
  return res.json();
}

async function googlePlaceDetails(placeId: string) {
  const key = process.env.GOOGLE_MAPS_API_KEY!;
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  // Campos que precisamos para preencher suas colunas
  url.searchParams.set(
    "fields",
    "place_id,name,formatted_address,formatted_phone_number,website,address_component"
  );
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("key", key);

  const res = await fetch(url.toString());
  return res.json();
}

export async function POST(req: Request) {
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY não configurada" }, { status: 500 });
    }

    const body = (await req.json()) as Body;

    const city = (body.city ?? "").trim();
    const neighborhood = (body.neighborhood ?? "").trim();
    const keywords = Array.isArray(body.keywords)
      ? Array.from(new Set(body.keywords.map((k) => (k ?? "").toString().trim()).filter(Boolean)))
      : [];

    const maxResults = Math.min(Math.max(body.maxResults ?? 60, 1), 60);

    if (!city) {
      return NextResponse.json({ error: "Cidade é obrigatória" }, { status: 400 });
    }

    const query = buildQuery(city, neighborhood, keywords);

    // 1) Text Search paginado (até 60 = 3 páginas x 20)
    let all: any[] = [];
    let token: string | undefined = undefined;

    for (let page = 0; page < 3 && all.length < maxResults; page++) {
      const data = await googleTextSearch(query, token);

      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        return NextResponse.json(
          { error: data.error_message || data.status, raw: data },
          { status: 400 }
        );
      }

      const results = data.results ?? [];
      all = all.concat(results);

      token = data.next_page_token;
      if (!token) break;

      // importantíssimo: token só funciona após ~2 segundos
      await sleep(2200);
    }

    // corta no máximo pedido
    all = all.slice(0, maxResults);

    // 2) Deduplicar por place_id
    const map = new Map<string, any>();
    for (const p of all) {
      if (p?.place_id && !map.has(p.place_id)) map.set(p.place_id, p);
    }
    const unique = Array.from(map.values());

    // 3) Buscar details para preencher telefone/site/CEP/bairro/cidade
    // (sim, isso faz 1 request por empresa)
    const enriched: any[] = [];
    for (const p of unique) {
      const place_id = p.place_id;
      const details = await googlePlaceDetails(place_id);

      if (details.status !== "OK") {
        // se falhar details, salva o básico
        enriched.push({
          place_id,
          name: p.name ?? null,
          address: p.formatted_address ?? null,
          city,
          neighborhood: neighborhood || null,
          postal_code: null,
          ddd: null,
          phone: null,
          website: null,
          maps_url: `https://www.google.com/maps/place/?q=place_id:${place_id}`,
        });
        continue;
      }

      const r = details.result;
      const comps = r.address_components || [];
      const parsed = parseFromAddressComponents(comps);

      const phone = r.formatted_phone_number ?? null;

      enriched.push({
        place_id,
        name: r.name ?? p.name ?? null,
        address: r.formatted_address ?? p.formatted_address ?? null,
        city: parsed.city ?? city,
        neighborhood: parsed.neighborhood ?? (neighborhood || null),
        postal_code: parsed.postal_code ?? null,
        ddd: dddFromPhone(phone),
        phone,
        website: r.website ?? null,
        maps_url: `https://www.google.com/maps/place/?q=place_id:${place_id}`,
      });
    }

    // 4) Salvar no Supabase sem duplicar (place_id UNIQUE)
    // Upsert => se já existe, atualiza campos
    const { error: upErr } = await supabase
      .from("companies")
      .upsert(enriched, { onConflict: "place_id" });

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        query,
        total_google: all.length,
        unique: unique.length,
        saved: enriched.length,
        results: enriched,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

type Body = {
  uf?: string;
  city?: string;
  neighborhood?: string | null;
  keywords?: string[];
  totalTarget?: number;
};

function normalize(s: string) {
  return (s ?? "").toString().trim();
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean)));
}

function dedupe(items: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const it of items) {
    const placeId = (it?.place_id || "").toString().trim();
    const name = (it?.name || "").toString().trim().toLowerCase();
    const address = (it?.address || "").toString().trim().toLowerCase();
    const key = placeId ? `pid:${placeId}` : `na:${name}|${address}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const uf = normalize(body.uf || "SP");
    const city = normalize(body.city || "");
    const neighborhood = normalize(body.neighborhood || "");
    const keywords = uniq(Array.isArray(body.keywords) ? body.keywords : []);

    if (!city) {
      return NextResponse.json({ error: "Cidade é obrigatória." }, { status: 400 });
    }

    const totalTarget = Math.min(Math.max(body.totalTarget ?? 300, 60), 900);

    // ✅ URL certa em produção e local
    const url = new URL("/api/google-places", req.url);

    // A estratégia do “grid” aqui vai ser simples e crua:
    // - chama o google-places UMA vez com keywords
    // - como o google-places já faz OR + variações, isso cobre bem
    // Depois a gente pode evoluir para grid real por coordenadas/radius.
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        uf,
        city,
        neighborhood: neighborhood || null,
        keywords,
        maxResults: Math.min(totalTarget, 120), // respeita o limite do google-places route
        limit: 20,
      }),
    });

    const data = await res.json().catch(() => null);
    const items = Array.isArray(data?.results) ? data.results : [];

    const merged = dedupe(items);

    return NextResponse.json(
      {
        results: merged,
        meta: {
          total: merged.length,
          mode: "GRID (simples) usando OR + variações",
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("GRID-SEARCH ERROR:", err);
    return NextResponse.json({ error: "Erro no GRID Search." }, { status: 500 });
  }
}

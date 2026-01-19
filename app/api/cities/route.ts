import { NextResponse } from "next/server";

export const runtime = "nodejs"; // garante Node runtime na Vercel

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

// GET /api/cities?state=SP
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // ✅ fallback para SP (como você pediu)
    const state = (searchParams.get("state") || "SP").toUpperCase().trim();

    // IBGE: municípios por UF (isso já resolve “cidades” do estado)
    const url = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(
      state
    )}/municipios`;

    const r = await fetch(url, {
      // cache ajuda custo e velocidade
      next: { revalidate: 60 * 60 * 24 }, // 24h
    });

    if (!r.ok) {
      const txt = await r.text();
      return json({ error: "Falha ao consultar IBGE", details: txt }, 500);
    }

    const data = await r.json();

    // data: [{ id, nome, microrregiao... }]
    const cities = Array.isArray(data)
      ? data
          .map((m: any) => m?.nome)
          .filter(Boolean)
          .sort((a: string, b: string) => a.localeCompare(b, "pt-BR"))
      : [];

    return json({ state, cities });
  } catch (err: any) {
    console.error("[api/cities] error:", err);
    return json({ error: "Erro inesperado" }, 500);
  }
}

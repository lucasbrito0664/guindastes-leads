import { NextResponse } from "next/server";

type CacheEntry = { data: any; expiresAt: number };
const cache = new Map<string, CacheEntry>();

const TTL_MS = 1000 * 60 * 60 * 12; // 12 horas

function getCache(key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`IBGE HTTP ${res.status}`);
  return res.json();
}

function sortPT(items: string[]) {
  return items
    .filter(Boolean)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const uf = (url.searchParams.get("uf") || "SP").toUpperCase();

    if (!["SP", "MG"].includes(uf)) {
      return NextResponse.json(
        { error: "UF inválida. Use SP ou MG." },
        { status: 400 }
      );
    }

    const cacheKey = `ibge:${uf}`;
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json(cached);

    // Municípios por UF (IBGE oficial)
    const ibgeUrl = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`;
    const raw = await fetchJson(ibgeUrl);

    // IBGE retorna [{ id, nome, microrregiao... }]
    const municipios = sortPT(raw.map((m: any) => m?.nome));

    // Para você, "cidades" = lista de municípios (mais completo e oficial)
    const cities = municipios;

    const payload = { uf, cities, municipios };
    setCache(cacheKey, payload);

    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json(
      { error: "Falha ao carregar municípios do IBGE." },
      { status: 500 }
    );
  }
}

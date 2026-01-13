"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

type PlaceRow = {
  place_id?: string;
  name?: string;
  city?: string;
  uf?: string;
  neighborhood?: string;
  address?: string;
  postal_code?: string; // CEP
  ddd?: string;
  phone?: string;
  website?: string;
};

type Municipio = { nome: string };
type IBGECity = { nome: string };

const UF_OPTIONS = [
  { uf: "SP", label: "São Paulo (SP)" },
  { uf: "MG", label: "Minas Gerais (MG)" },
];

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean)));
}

export default function LeadsPage() {
  const router = useRouter();

  const [uf, setUf] = useState<"SP" | "MG">("SP");
  const [city, setCity] = useState<string>("");
  const [cityList, setCityList] = useState<string[]>([]);
  const [neighborhood, setNeighborhood] = useState<string>("");

  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>(["Munck", "Guindastes", "Blocos"]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [results, setResults] = useState<PlaceRow[]>([]);

  const total = results.length;

  // Carrega cidades do IBGE por UF
  useEffect(() => {
    async function loadCities() {
      setErrorMsg("");
      setCity("");
      setCityList([]);

      try {
        // IBGE: /localidades/estados/{UF}/municipios (municipios = cidades)
        const resp = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`, {
          cache: "force-cache",
        });

        if (!resp.ok) throw new Error("Falha ao carregar cidades do IBGE.");

        const data = (await resp.json()) as Municipio[];
        const names = data.map((x) => x.nome).sort((a, b) => a.localeCompare(b, "pt-BR"));

        setCityList(names);
        // seleciona a primeira por padrão (pra não dar “cidade obrigatória”)
        if (names.length) setCity(names[0]);
      } catch (e: any) {
        setErrorMsg("Não consegui carregar a lista de cidades (IBGE).");
      }
    }

    loadCities();
  }, [uf]);

  const handleKeywordKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const k = keywordInput.trim();
      if (!k) return;
      const next = uniq([...keywords, k]);
      setKeywords(next);
      setKeywordInput("");
    }
  };

  const removeKeyword = (k: string) => {
    setKeywords(keywords.filter((x) => x !== k));
  };

  async function handleSearch() {
    setErrorMsg("");

    const cityTrim = city.trim();
    if (!cityTrim) {
      setErrorMsg("Cidade é obrigatória.");
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch("/api/grid-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          uf,
          city: cityTrim,
          neighborhood: neighborhood.trim() || null,
          keywords: keywords,
          totalTarget: 300,
        }),
      });

      const data = await resp.json().catch(() => null);

      if (!resp.ok) {
        setErrorMsg(data?.error || "Erro ao buscar.");
        setResults([]);
        return;
      }

      const items = Array.isArray(data?.results) ? data.results : [];

      // Normaliza para nossa tabela completa
      const mapped: PlaceRow[] = items.map((it: any) => ({
        place_id: it.place_id,
        name: it.name,
        city: cityTrim,
        uf,
        neighborhood: neighborhood.trim() || it.neighborhood || "",
        address: it.address || it.formatted_address || "",
        postal_code: it.postal_code || it.cep || "",
        ddd: it.ddd || "",
        phone: it.phone || it.formatted_phone_number || "",
        website: it.website || "",
      }));

      setResults(mapped);
    } catch (e: any) {
      setErrorMsg("Erro inesperado ao buscar.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#071B25] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-[#06202C] p-3 shadow-lg ring-1 ring-white/10">
              <Image
                src="/logo.jpg"
                alt="RF Implementos"
                width={120}
                height={120}
                className="h-16 w-16 object-contain sm:h-20 sm:w-20"
                priority
              />
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                RF <span className="text-[#FFD200]">Implementos</span>
              </h1>
              <p className="text-white/70">Busca e exportação.</p>
            </div>
          </div>

          <button
            onClick={() => router.push("/")}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
          >
            ← Voltar
          </button>
        </div>

        {/* Card */}
        <div className="mt-6 rounded-3xl bg-[#061821] p-6 shadow-2xl ring-1 ring-white/10">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* UF */}
            <div>
              <label className="mb-2 block text-sm font-medium text-white/70">Estado</label>
              <select
                value={uf}
                onChange={(e) => setUf(e.target.value as "SP" | "MG")}
                className="w-full rounded-xl border border-white/15 bg-[#04131A] px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#FFD200]"
              >
                {UF_OPTIONS.map((o) => (
                  <option key={o.uf} value={o.uf}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* City */}
            <div>
              <label className="mb-2 block text-sm font-medium text-white/70">Cidade</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#04131A] px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#FFD200]"
              >
                {cityList.length === 0 ? (
                  <option value="">Carregando...</option>
                ) : (
                  cityList.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Neighborhood */}
            <div>
              <label className="mb-2 block text-sm font-medium text-white/70">Bairro (opcional)</label>
              <input
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                placeholder="Ex: Moema"
                className="w-full rounded-xl border border-white/15 bg-[#04131A] px-4 py-3 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-[#FFD200]"
              />
            </div>
          </div>

          {/* Keywords */}
          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-white/70">Palavras-chave (Enter)</label>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-[#04131A] px-3 py-3">
              {keywords.map((k) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-2 rounded-full bg-[#FFD200] px-3 py-1 text-sm font-semibold text-black"
                >
                  {k}
                  <button
                    onClick={() => removeKeyword(k)}
                    className="rounded-full bg-black/15 px-2 py-0.5 text-xs hover:bg-black/25"
                    aria-label={`Remover ${k}`}
                  >
                    ×
                  </button>
                </span>
              ))}

              <input
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={handleKeywordKeyDown}
                placeholder="Ex: Munck (Enter) Guindastes (Enter) Blocos (Enter)"
                className="min-w-[260px] flex-1 bg-transparent px-2 py-1 text-white placeholder:text-white/30 outline-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleSearch}
                disabled={loading}
                className="rounded-xl bg-[#FFD200] px-6 py-3 font-extrabold text-black shadow-lg hover:brightness-95 disabled:opacity-60"
              >
                {loading ? "Buscando..." : "Busca"}
              </button>

              <button
                onClick={() => alert("O export do Excel continua no botão existente do seu projeto. Se quiser, eu reativo aqui também em 1 clique.")}
                className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 font-semibold hover:bg-white/10"
              >
                Exportar Excel
              </button>
            </div>

            <div className="text-sm text-white/70">
              Resultados (sem duplicados): <span className="font-bold text-white">{total}</span>
            </div>
          </div>

          {/* Error */}
          {errorMsg ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-200">
              {errorMsg}
            </div>
          ) : null}

          {/* Table */}
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-black/30 text-white/80">
                  <tr>
                    <th className="px-4 py-3 text-left">Empresa</th>
                    <th className="px-4 py-3 text-left">Cidade</th>
                    <th className="px-4 py-3 text-left">Bairro</th>
                    <th className="px-4 py-3 text-left">Endereço</th>
                    <th className="px-4 py-3 text-left">CEP</th>
                    <th className="px-4 py-3 text-left">DDD</th>
                    <th className="px-4 py-3 text-left">Telefone</th>
                    <th className="px-4 py-3 text-left">Site</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/5 bg-[#03131A]">
                  {results.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-white/60" colSpan={8}>
                        Faça uma busca para listar empresas aqui.
                      </td>
                    </tr>
                  ) : (
                    results.map((r, idx) => (
                      <tr key={(r.place_id || "") + idx} className="hover:bg-white/5">
                        <td className="px-4 py-3 font-semibold">{r.name || "-"}</td>
                        <td className="px-4 py-3">{r.city || "-"}</td>
                        <td className="px-4 py-3">{r.neighborhood || "-"}</td>
                        <td className="px-4 py-3">{r.address || "-"}</td>
                        <td className="px-4 py-3">{r.postal_code || "-"}</td>
                        <td className="px-4 py-3">{r.ddd || "-"}</td>
                        <td className="px-4 py-3">{r.phone || "-"}</td>
                        <td className="px-4 py-3">
                          {r.website ? (
                            <a className="text-[#FFD200] hover:underline" href={r.website} target="_blank" rel="noreferrer">
                              Abrir
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-3 text-xs text-white/40">
            Observação: alguns campos (CEP/DDD/Telefone/Site) só aparecem se a API retornar. Se quiser, eu habilito o “enrich”
            para completar telefone/site automaticamente (custo maior).
          </p>
        </div>
      </div>
    </div>
  );
}

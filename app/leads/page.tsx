"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type CompanyRow = {
  id?: string | number;
  place_id?: string;

  name?: string;
  city?: string;
  neighborhood?: string;
  address?: string;
  postal_code?: string;
  ddd?: string;
  phone?: string;
  website?: string;
  maps_url?: string;
};

function normalizeKeywords(list: string[]) {
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

function dedupeCompanies(rows: CompanyRow[]) {
  const seen = new Set<string>();
  const out: CompanyRow[] = [];

  for (const r of rows) {
    const pid = (r.place_id || "").trim();
    const key =
      pid.length > 0
        ? `pid:${pid}`
        : `${(r.name || "").trim().toLowerCase()}|${(r.address || "")
            .trim()
            .toLowerCase()}`;

    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

export default function LeadsPage() {
  // ✅ SP only
  const estado = "SP";

  // ✅ Cidades IBGE
  const [cidadesIBGE, setCidadesIBGE] = useState<string[]>([]);
  const [cidadeDropdown, setCidadeDropdown] = useState<string>("São Paulo");
  const [selectedCities, setSelectedCities] = useState<string[]>(["São Paulo"]);
  const [loadingCities, setLoadingCities] = useState<boolean>(false);

  // ✅ Bairro com autocomplete
  const [bairroInput, setBairroInput] = useState<string>("");
  const [bairroSelecionado, setBairroSelecionado] = useState<string>("");
  const [bairroSuggestions, setBairroSuggestions] = useState<string[]>([]);

  // ✅ Keywords
  const [keywordInput, setKeywordInput] = useState<string>("");
  const [keywords, setKeywords] = useState<string[]>(["Munck", "Guindastes", "Blocos"]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [rows, setRows] = useState<CompanyRow[]>([]);

  const totalSemDuplicados = useMemo(() => dedupeCompanies(rows).length, [rows]);

  async function carregarCidades() {
    setLoadingCities(true);
    try {
      const resp = await fetch("/api/cities", { cache: "no-store" });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(t || "Falha ao carregar cidades (/api/cities)");
      }
      const j = await resp.json();

      const list: string[] = Array.isArray(j?.cities) ? j.cities : [];
      const sorted = [...list].sort((a, b) => a.localeCompare(b, "pt-BR"));

      if (sorted.length === 0) {
        throw new Error("A rota /api/cities respondeu, mas não trouxe cidades.");
      }

      setCidadesIBGE(sorted);

      // Ajusta dropdown
      if (sorted.includes("São Paulo")) setCidadeDropdown("São Paulo");
      else setCidadeDropdown(sorted[0]);

      // Ajusta selectedCities: mantém as já selecionadas que existirem
      setSelectedCities((prev) => {
        const kept = prev.filter((c) => sorted.includes(c));
        if (kept.length > 0) return kept;
        if (sorted.includes("São Paulo")) return ["São Paulo"];
        return [sorted[0]];
      });
    } catch (e: any) {
      console.error(e);
      setErrorMsg(
        (e?.message?.toString() || "Erro ao carregar cidades") +
          " — vou manter São Paulo como fallback."
      );
      setCidadesIBGE(["São Paulo"]);
      setCidadeDropdown("São Paulo");
      setSelectedCities(["São Paulo"]);
    } finally {
      setLoadingCities(false);
    }
  }

  // carrega ao abrir
  useEffect(() => {
    carregarCidades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addKeywordFromInput() {
    const v = (keywordInput || "").trim();
    if (!v) return;
    setKeywords((prev) => normalizeKeywords([...prev, v]));
    setKeywordInput("");
  }

  function removeKeyword(k: string) {
    setKeywords((prev) => prev.filter((x) => x.toLowerCase() !== k.toLowerCase()));
  }

  function addCity() {
    const c = (cidadeDropdown || "").trim();
    if (!c) return;
    setSelectedCities((prev) => {
      const next = normalizeKeywords([...prev, c]); // reaproveita normalize (case-insensitive)
      // normalizeKeywords mantém capitalização original do "c" e remove duplicadas
      return next;
    });

    // bairro é “local”, então ao mexer em cidades, limpamos seleção de bairro
    setBairroSelecionado("");
    setBairroInput("");
    setBairroSuggestions([]);
  }

  function removeCity(c: string) {
    setSelectedCities((prev) => {
      const next = prev.filter((x) => x.toLowerCase() !== c.toLowerCase());
      return next.length ? next : ["São Paulo"];
    });
    setBairroSelecionado("");
    setBairroInput("");
    setBairroSuggestions([]);
  }

  // Autocomplete de bairros (usa a 1ª cidade selecionada como referência)
  useEffect(() => {
    const input = bairroInput.trim();
    if (input.length < 2) {
      setBairroSuggestions([]);
      return;
    }

    const cityRef = selectedCities[0] || "São Paulo";

    const t = setTimeout(async () => {
      try {
        const resp = await fetch("/api/neighborhoods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city: cityRef, input }),
        });

        if (!resp.ok) {
          setBairroSuggestions([]);
          return;
        }

        const j = await resp.json();
        const sugg = Array.isArray(j?.suggestions) ? j.suggestions : [];
        setBairroSuggestions(sugg.slice(0, 20));
      } catch {
        setBairroSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [bairroInput, selectedCities]);

  async function buscar() {
    setErrorMsg("");
    setLoading(true);

    try {
      if (!selectedCities || selectedCities.length === 0) {
        setErrorMsg("Selecione ao menos 1 cidade.");
        setLoading(false);
        return;
      }

      const payload = {
        cities: selectedCities.map((c) => c.trim()).filter(Boolean),
        neighborhood: (bairroSelecionado || "").trim() || null,
        keywords: normalizeKeywords(keywords),
      };

      const resp = await fetch("/api/grid-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || "Erro na busca");
      }

      const j = await resp.json();
      const incoming: CompanyRow[] = Array.isArray(j?.results)
        ? j.results
        : Array.isArray(j?.data)
        ? j.data
        : Array.isArray(j)
        ? j
        : [];

      setRows(dedupeCompanies(incoming));
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message?.toString() || "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function exportarExcel() {
    setErrorMsg("");

    try {
      const deduped = dedupeCompanies(rows);
      if (deduped.length === 0) {
        setErrorMsg("Não há resultados para exportar.");
        return;
      }

      const nomeArquivo =
        selectedCities.length === 1
          ? `leads_${estado}_${selectedCities[0]}`
          : `leads_${estado}_multicidades_${selectedCities.length}`;

      const resp = await fetch("/api/export-xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: nomeArquivo.replace(/\s+/g, "_"),
          rows: deduped,
        }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(t || "Erro ao exportar Excel");
      }

      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${nomeArquivo.replace(/\s+/g, "_")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message?.toString() || "Falha ao exportar");
    }
  }

  const cidadesOrdenadas = useMemo(() => {
    const base = cidadesIBGE.length ? cidadesIBGE : ["São Paulo"];
    return [...base].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [cidadesIBGE]);

  return (
    <div className="min-h-screen bg-[#07131d] text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-[#0c2234] border border-white/10 p-4">
              <Image src="/logo.jpg" alt="RF Implementos" width={160} height={160} priority />
            </div>

            <div>
              <h1 className="text-4xl font-extrabold leading-tight">
                Meus <span className="text-yellow-400">Leads</span> (SP)
              </h1>
              <p className="text-white/70 mt-1">
                Escolha cidades, opcionalmente bairro, busque e exporte.
              </p>
            </div>
          </div>

          <Link
            href="/"
            className="rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm"
          >
            ← Voltar
          </Link>
        </div>

        {/* Card */}
        <div className="mt-8 rounded-3xl border border-white/10 bg-black/30 backdrop-blur p-6">
          {/* Linha 1: Cidade + Adicionar + Bairro */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cidades */}
            <div>
              <label className="block text-sm text-white/70 mb-2">Cidade (adicione 1 ou mais)</label>

              <div className="flex gap-2">
                <select
                  value={cidadeDropdown}
                  onChange={(e) => setCidadeDropdown(e.target.value)}
                  className="flex-1 rounded-xl bg-black/40 border border-white/15 px-4 py-3 outline-none focus:ring-2 focus:ring-yellow-400"
                >
                  {cidadesOrdenadas.map((c) => (
                    <option key={c} value={c} className="bg-black">
                      {c}
                    </option>
                  ))}
                </select>

                <button
                  onClick={addCity}
                  className="rounded-xl bg-yellow-400 text-black font-bold px-4 py-3 hover:bg-yellow-300"
                  title="Adicionar cidade"
                >
                  +
                </button>

                <button
                  onClick={carregarCidades}
                  disabled={loadingCities}
                  className="rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-3 disabled:opacity-60"
                  title="Recarregar cidades do IBGE"
                >
                  {loadingCities ? "..." : "⟳"}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {selectedCities.map((c) => (
                  <button
                    key={c.toLowerCase()}
                    onClick={() => removeCity(c)}
                    className="px-3 py-1 rounded-full bg-yellow-400/20 border border-yellow-400/40 text-yellow-200 text-sm hover:bg-yellow-400/25"
                    title="Clique para remover"
                  >
                    {c} <span className="text-yellow-100/70">×</span>
                  </button>
                ))}
              </div>

              <p className="text-xs text-white/50 mt-2">
                Se só aparece “São Paulo”, então a rota <b>/api/cities</b> não está retornando as 645 cidades ainda.
              </p>
            </div>

            {/* Bairro */}
            <div>
              <label className="block text-sm text-white/70 mb-2">Bairro (opcional)</label>

              <input
                value={bairroInput}
                onChange={(e) => {
                  setBairroInput(e.target.value);
                  setBairroSelecionado("");
                }}
                placeholder="Digite 2+ letras (ex: Moe...)"
                className="w-full rounded-xl bg-black/40 border border-white/15 px-4 py-3 outline-none focus:ring-2 focus:ring-yellow-400"
              />

              {bairroSelecionado ? (
                <div className="mt-2 text-sm text-white/80">
                  Selecionado:{" "}
                  <span className="text-yellow-300 font-semibold">{bairroSelecionado}</span>{" "}
                  <button className="ml-2 text-xs text-white/60 underline" onClick={() => setBairroSelecionado("")}>
                    limpar
                  </button>
                </div>
              ) : null}

              <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
                {bairroSuggestions.length === 0 ? (
                  <div className="px-4 py-3 text-white/50 text-sm">Digite para ver sugestões…</div>
                ) : (
                  <div className="max-h-56 overflow-auto">
                    {bairroSuggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setBairroSelecionado(s);
                          setBairroInput(s);
                          setBairroSuggestions([]);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-white/50 mt-2">
                O Google sugere bairros conforme você digita (não existe lista completa oficial via API).
              </p>
            </div>
          </div>

          {/* Keywords */}
          <div className="mt-5">
            <label className="block text-sm text-white/70 mb-2">Palavras-chave (Enter)</label>

            <div className="flex flex-wrap gap-2 mb-3">
              {keywords.map((k) => (
                <button
                  key={k.toLowerCase()}
                  onClick={() => removeKeyword(k)}
                  className="px-3 py-1 rounded-full bg-yellow-400/20 border border-yellow-400/40 text-yellow-200 text-sm hover:bg-yellow-400/25"
                  title="Clique para remover"
                >
                  {k} <span className="text-yellow-100/70">×</span>
                </button>
              ))}
            </div>

            <input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeywordFromInput();
                }
              }}
              placeholder="Digite 1 palavra e Enter. Ex: Munck"
              className="w-full rounded-xl bg-black/40 border border-white/15 px-4 py-3 outline-none focus:ring-2 focus:ring-yellow-400"
            />

            <p className="text-xs text-white/50 mt-2">
              Dica: escreva uma palavra e aperte Enter. Clique na tag para remover.
            </p>
          </div>

          {/* Botões */}
          <div className="mt-6 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={buscar}
                disabled={loading}
                className="rounded-xl bg-yellow-400 text-black font-bold px-6 py-3 hover:bg-yellow-300 disabled:opacity-60"
              >
                {loading ? "Buscando..." : "Buscar"}
              </button>

              <button
                onClick={exportarExcel}
                disabled={loading || rows.length === 0}
                className="rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-6 py-3 disabled:opacity-50"
              >
                Exportar Excel (.xlsx)
              </button>
            </div>

            <div className="text-white/70">
              Resultados (sem duplicados):{" "}
              <span className="text-white font-semibold">{totalSemDuplicados}</span>
            </div>
          </div>

          {/* Erro */}
          {errorMsg ? (
            <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 px-4 py-3">
              {errorMsg}
            </div>
          ) : null}

          {/* Tabela */}
          <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-black/40">
                <tr className="text-left">
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">Cidade</th>
                  <th className="px-4 py-3">Bairro</th>
                  <th className="px-4 py-3">Telefone</th>
                  <th className="px-4 py-3">Endereço</th>
                  <th className="px-4 py-3">Site</th>
                  <th className="px-4 py-3">Maps</th>
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-white/60" colSpan={7}>
                      Faça uma busca para listar empresas aqui.
                    </td>
                  </tr>
                ) : (
                  dedupeCompanies(rows).map((r, idx) => (
                    <tr key={r.place_id || r.id?.toString() || `${r.name}-${idx}`} className="border-t border-white/5">
                      <td className="px-4 py-3 font-medium">{r.name || "-"}</td>
                      <td className="px-4 py-3">{r.city || "-"}</td>
                      <td className="px-4 py-3">{r.neighborhood || "-"}</td>
                      <td className="px-4 py-3">
                        {r.ddd || r.phone ? `${r.ddd ? `(${r.ddd}) ` : ""}${r.phone || ""}` : "-"}
                      </td>
                      <td className="px-4 py-3">{r.address || "-"}</td>
                      <td className="px-4 py-3">
                        {r.website ? (
                          <a className="text-yellow-300 hover:underline" href={r.website} target="_blank" rel="noreferrer">
                            Abrir
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.maps_url ? (
                          <a className="text-yellow-300 hover:underline" href={r.maps_url} target="_blank" rel="noreferrer">
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

          <p className="text-xs text-white/45 mt-4">
            Se aparecer erro, ele vai aparecer em vermelho aqui.
          </p>
        </div>
      </div>
    </div>
  );
}

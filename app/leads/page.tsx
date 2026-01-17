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
  // Preferimos place_id quando existir; senão cai no name+address
  const seen = new Set<string>();
  const out: CompanyRow[] = [];
  for (const r of rows) {
    const pid = (r.place_id || "").trim();
    const key =
      pid.length > 0
        ? `pid:${pid}`
        : `${(r.name || "").trim().toLowerCase()}|${(r.address || "").trim().toLowerCase()}`;

    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

export default function LeadsPage() {
  // ✅ Só SP
  const estado = "SP";

  // ✅ Cidades oficiais via IBGE (rota /api/cities)
  const [cidadesIBGE, setCidadesIBGE] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);

  // ✅ Bairro com autocomplete
  const [bairroInput, setBairroInput] = useState<string>("");
  const [bairroSelecionado, setBairroSelecionado] = useState<string>(""); // valor final usado na busca
  const [bairroSuggestions, setBairroSuggestions] = useState<string[]>([]);

  // ✅ Keywords por Enter (chips)
  const [keywordInput, setKeywordInput] = useState<string>("");
  const [keywords, setKeywords] = useState<string[]>(["Munck", "Guindastes", "Blocos"]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [rows, setRows] = useState<CompanyRow[]>([]);

  // Carrega cidades (645) do IBGE
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/cities", { cache: "no-store" });
        const j = await resp.json();

        const list: string[] = Array.isArray(j?.cities) ? j.cities : [];
        const sorted = [...list].sort((a, b) => a.localeCompare(b, "pt-BR"));

        setCidadesIBGE(sorted);

        // Default: São Paulo se existir, senão a primeira
        if (sorted.includes("São Paulo")) setSelectedCities(["São Paulo"]);
        else if (sorted.length > 0) setSelectedCities([sorted[0]]);
      } catch (e) {
        console.error(e);
        // fallback mínimo
        setCidadesIBGE(["São Paulo"]);
        setSelectedCities(["São Paulo"]);
      }
    })();
  }, []);

  const totalSemDuplicados = useMemo(() => dedupeCompanies(rows).length, [rows]);

  function addKeywordFromInput() {
    const v = (keywordInput || "").trim();
    if (!v) return;
    setKeywords((prev) => normalizeKeywords([...prev, v]));
    setKeywordInput("");
  }

  function removeKeyword(k: string) {
    setKeywords((prev) => prev.filter((x) => x.toLowerCase() !== k.toLowerCase()));
  }

  // Autocomplete de bairros (usa a primeira cidade selecionada como referência)
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
        const j = await resp.json();
        const sugg = Array.isArray(j?.suggestions) ? j.suggestions : [];
        setBairroSuggestions(sugg.slice(0, 20));
      } catch {
        setBairroSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [bairroInput, selectedCities]);

  async function buscarCompleto() {
    setErrorMsg("");
    setLoading(true);

    try {
      if (!selectedCities || selectedCities.length === 0) {
        setErrorMsg("Selecione ao menos 1 cidade.");
        setLoading(false);
        return;
      }

      const payload = {
        // ✅ seu backend agora aceita cities[]
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

      const deduped = dedupeCompanies(incoming);
      setRows(deduped);
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

  const cidadesOrdenadas = useMemo(
    () => [...cidadesIBGE].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [cidadesIBGE]
  );

  return (
    <div className="min-h-screen bg-[#07131d] text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-[#0c2234] border border-white/10 p-4">
              <Image src="/logo.jpg" alt="RF Implementos" width={140} height={140} priority />
            </div>

            <div>
              <h1 className="text-4xl font-extrabold leading-tight">
                Meus <span className="text-yellow-400">Leads</span> (SP)
              </h1>
              <p className="text-white/70 mt-1">Selecione cidades, opcionalmente bairro, busque e exporte.</p>
            </div>
          </div>

          <Link href="/" className="rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm">
            ← Voltar
          </Link>
        </div>

        {/* Card */}
        <div className="mt-8 rounded-3xl border border-white/10 bg-black/30 backdrop-blur p-6">
          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cidades (multi-select) */}
            <div>
              <label className="block text-sm text-white/70 mb-2">Cidades (selecione 1 ou mais)</label>
              <select
                multiple
                value={selectedCities}
                onChange={(e) => {
                  const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
                  setSelectedCities(opts);

                  // Se mudar cidade, limpamos bairro selecionado (porque bairro é “local”)
                  setBairroSelecionado("");
                  setBairroInput("");
                  setBairroSuggestions([]);
                }}
                className="w-full h-64 rounded-xl bg-black/40 border border-white/15 px-4 py-3 outline-none focus:ring-2 focus:ring-yellow-400"
              >
                {cidadesOrdenadas.length === 0 ? (
                  <option value="São Paulo">Carregando...</option>
                ) : (
                  cidadesOrdenadas.map((c) => (
                    <option key={c} value={c} className="bg-black">
                      {c}
                    </option>
                  ))
                )}
              </select>

              <p className="text-xs text-white/50 mt-2">
                No Windows: segure <b>Ctrl</b> para selecionar várias cidades.
              </p>
            </div>

            {/* Bairro (autocomplete) */}
            <div>
              <label className="block text-sm text-white/70 mb-2">Bairro (opcional)</label>

              <input
                value={bairroInput}
                onChange={(e) => {
                  setBairroInput(e.target.value);
                  setBairroSelecionado(""); // ainda não selecionou
                }}
                placeholder="Digite 2+ letras para aparecer lista (ex: Moe...)"
                className="w-full rounded-xl bg-black/40 border border-white/15 px-4 py-3 outline-none focus:ring-2 focus:ring-yellow-400"
              />

              {bairroSelecionado ? (
                <div className="mt-2 text-sm text-white/80">
                  Selecionado: <span className="text-yellow-300 font-semibold">{bairroSelecionado}</span>{" "}
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
                Observação: o Google sugere bairros conforme você digita (não existe “lista completa de todos os bairros”
                via API).
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

            <p className="text-xs text-white/50 mt-2">Dica: escreva uma palavra e aperte Enter. Clique na tag para remover.</p>
          </div>

          {/* Botões */}
          <div className="mt-6 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={buscarCompleto}
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
              Resultados (sem duplicados): <span className="text-white font-semibold">{totalSemDuplicados}</span>
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
            Se aparecer erro, ele vai aparecer em vermelho aqui. Para multi-cidade, use Ctrl no Windows.
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type CompanyRow = {
  id?: string | number;

  name?: string; // Nome da empresa
  city?: string; // Cidade
  neighborhood?: string; // Bairro
  address?: string; // Endereço
  postal_code?: string; // CEP
  ddd?: string; // DDD
  phone?: string; // Telefone
  website?: string; // Site
};

// Estados disponíveis (você pediu SP e MG)
const STATES = ["SP", "MG"] as const;

// Cidades (lista). Para não travar o projeto, vou começar com um conjunto bom de SP e MG.
// Você pode aumentar depois — o dropdown já fica em ordem alfabética.
const CITIES_BY_STATE: Record<string, string[]> = {
  SP: [
    "São Paulo",
    "Guarulhos",
    "Campinas",
    "São Bernardo do Campo",
    "Santo André",
    "Osasco",
    "Sorocaba",
    "Ribeirão Preto",
    "Santos",
    "São José dos Campos",
    "Jundiaí",
    "Mogi das Cruzes",
    "Diadema",
    "Carapicuíba",
    "Itaquaquecetuba",
    "Barueri",
    "Embu das Artes",
    "Taboão da Serra",
    "Cotia",
    "Mauá",
    "Suzano",
    "Praia Grande",
    "Guarujá",
    "Bauru",
    "Limeira",
    "Sumaré",
    "Hortolândia",
    "Indaiatuba",
    "Americana",
    "Piracicaba",
    "Franca",
    "São Vicente",
  ],
  MG: [
    "Belo Horizonte",
    "Contagem",
    "Betim",
    "Uberlândia",
    "Juiz de Fora",
    "Montes Claros",
    "Ribeirão das Neves",
    "Uberaba",
    "Governador Valadares",
    "Ipatinga",
    "Divinópolis",
    "Sete Lagoas",
    "Santa Luzia",
    "Ibirité",
    "Poços de Caldas",
  ],
};

function normalizeKeywords(list: string[]) {
  const cleaned = list
    .map((k) => (k ?? "").toString().trim())
    .filter((k) => k.length > 0);

  // remove duplicadas (case-insensitive)
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
  // Dedup por "name + address" (tende a ser o mais estável)
  const seen = new Set<string>();
  const out: CompanyRow[] = [];
  for (const r of rows) {
    const key = `${(r.name || "").trim().toLowerCase()}|${(r.address || "")
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
  const [estado, setEstado] = useState<string>("SP");
  const [cidade, setCidade] = useState<string>("São Paulo");
  const [bairro, setBairro] = useState<string>("");

  const [keywordInput, setKeywordInput] = useState<string>("");
  const [keywords, setKeywords] = useState<string[]>(["Munck", "Guindastes", "Blocos"]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [rows, setRows] = useState<CompanyRow[]>([]);

  const cidadesDisponiveis = useMemo(() => {
    const list = CITIES_BY_STATE[estado] || [];
    // ordem alfabética
    return [...list].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [estado]);

  useEffect(() => {
    // quando troca estado, ajusta cidade para a 1ª da lista (se necessário)
    if (!cidadesDisponiveis.includes(cidade)) {
      setCidade(cidadesDisponiveis[0] || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

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

  async function buscarCompleto() {
    setErrorMsg("");
    setLoading(true);

    try {
      if (!cidade || !cidade.trim()) {
        setErrorMsg("Cidade é obrigatória.");
        setLoading(false);
        return;
      }

      const payload = {
        state: estado, // pode ou não ser usado no backend, mas mandamos
        city: cidade.trim(),
        neighborhood: (bairro || "").trim() || null,
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

      const json = await resp.json();

      // Esperado: { results: [...] } ou { data: [...] } — vamos aceitar ambos
      const incoming: CompanyRow[] = Array.isArray(json?.results)
        ? json.results
        : Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json)
        ? json
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

      const resp = await fetch("/api/export-xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: `leads_${estado}_${cidade}`.replace(/\s+/g, "_"),
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
      a.download = `leads_${estado}_${cidade.replace(/\s+/g, "_")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message?.toString() || "Falha ao exportar");
    }
  }

  return (
    <div className="min-h-screen bg-[#07131d] text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-[#0c2234] border border-white/10 p-4">
              <Image src="/logo.jpg" alt="RF Implementos" width={120} height={120} priority />
            </div>

            <div>
              <h1 className="text-4xl font-extrabold leading-tight">
                Meus <span className="text-yellow-400">Leads</span>
              </h1>
              <p className="text-white/70 mt-1">
                Busque e exporte para Excel. (Busca completa)
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
          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Estado */}
            <div>
              <label className="block text-sm text-white/70 mb-2">Estado</label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="w-full rounded-xl bg-black/40 border border-white/15 px-4 py-3 outline-none focus:ring-2 focus:ring-yellow-400"
              >
                {STATES.map((uf) => (
                  <option key={uf} value={uf} className="bg-black">
                    {uf}
                  </option>
                ))}
              </select>
            </div>

            {/* Cidade */}
            <div>
              <label className="block text-sm text-white/70 mb-2">Cidade</label>
              <select
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                className="w-full rounded-xl bg-black/40 border border-white/15 px-4 py-3 outline-none focus:ring-2 focus:ring-yellow-400"
              >
                {cidadesDisponiveis.map((c) => (
                  <option key={c} value={c} className="bg-black">
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Bairro */}
            <div>
              <label className="block text-sm text-white/70 mb-2">Bairro (opcional)</label>
              <input
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                placeholder="Ex: Moema"
                className="w-full rounded-xl bg-black/40 border border-white/15 px-4 py-3 outline-none focus:ring-2 focus:ring-yellow-400"
              />
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
              placeholder="Ex: Munck (Enter) Guindastes (Enter) Blocos"
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
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-white/60" colSpan={6}>
                      Faça uma busca para listar empresas aqui.
                    </td>
                  </tr>
                ) : (
                  dedupeCompanies(rows).map((r, idx) => (
                    <tr key={r.id?.toString() || `${r.name}-${idx}`} className="border-t border-white/5">
                      <td className="px-4 py-3 font-medium">{r.name || "-"}</td>
                      <td className="px-4 py-3">{r.city || "-"}</td>
                      <td className="px-4 py-3">{r.neighborhood || "-"}</td>
                      <td className="px-4 py-3">
                        {r.ddd || r.phone ? `${r.ddd ? `(${r.ddd}) ` : ""}${r.phone || ""}` : "-"}
                      </td>
                      <td className="px-4 py-3">{r.address || "-"}</td>
                      <td className="px-4 py-3">
                        {r.website ? (
                          <a
                            className="text-yellow-300 hover:underline"
                            href={r.website}
                            target="_blank"
                            rel="noreferrer"
                          >
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
            Se aparecer erro, ele vai aparecer em vermelho aqui (não fica silencioso).
          </p>
        </div>
      </div>
    </div>
  );
}

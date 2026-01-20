"use client";

import React, { useMemo, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

type CompanyRow = {
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

const STATES = ["SP"] as const; // você pediu só SP agora

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
    const key = `${(r.name || "").trim().toLowerCase()}|${(r.address || "").trim().toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

export default function LeadsPage() {
  const [estado, setEstado] = useState<string>("SP");
  const [cidades, setCidades] = useState<string[]>([]);
  const [cidade, setCidade] = useState<string>("");

  const [bairro, setBairro] = useState<string>("");

  const [keywordInput, setKeywordInput] = useState<string>("");
  const [keywords, setKeywords] = useState<string[]>(["Munck", "Guindastes", "Blocos"]);

  const [radiusKm, setRadiusKm] = useState<number>(3); // ✅ raio padrão 3km

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [rows, setRows] = useState<CompanyRow[]>([]);

  // carrega cidades do IBGE via /api/cities
  useEffect(() => {
    async function loadCities() {
      try {
        const resp = await fetch(`/api/cities?state=${estado}`);
        const j = await resp.json();
        const list = Array.isArray(j?.cities) ? j.cities : [];
        setCidades(list);
        setCidade((prev) => (prev && list.includes(prev) ? prev : list[0] || "São Paulo"));
      } catch (e) {
        // fallback
        setCidades(["São Paulo"]);
        setCidade("São Paulo");
      }
    }
    loadCities();
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

  async function buscar() {
    setErrorMsg("");
    setLoading(true);

    try {
      if (!cidade || !cidade.trim()) {
        setErrorMsg("Cidade é obrigatória.");
        setLoading(false);
        return;
      }

      // ✅ mandando PT (backend aceita)
      const payload = {
        estado,
        cidade: cidade.trim(),
        bairro: (bairro || "").trim() || "",
        palavrasChave: normalizeKeywords(keywords),
        radiusKm, // ✅ usa quando bairro estiver preenchido
      };

      const resp = await fetch("/api/grid-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await resp.json();

      if (!resp.ok) {
        throw new Error(j?.error || "Erro na busca");
      }

      const incoming: CompanyRow[] = Array.isArray(j?.results) ? j.results : [];
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
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-[#0c2234] border border-white/10 p-4">
              <Image src="/logo.jpg" alt="RF Implementos" width={150} height={150} priority />
            </div>

            <div>
              <h1 className="text-4xl font-extrabold leading-tight">
                Pesquisa de <span className="text-yellow-400">Leads</span>
              </h1>
              <p className="text-white/70 mt-1">
                Se preencher Bairro, busca em raio de <span className="text-yellow-300 font-semibold">{radiusKm}km</span>.
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

        <div className="mt-8 rounded-3xl border border-white/10 bg-black/30 backdrop-blur p-6">
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
                {cidades.map((c) => (
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

          {/* Raio */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">Raio (km) — só se tiver Bairro</label>
              <select
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                className="w-full rounded-xl bg-black/40 border border-white/15 px-4 py-3 outline-none focus:ring-2 focus:ring-yellow-400"
              >
                <option value={1} className="bg-black">1 km</option>
                <option value={3} className="bg-black">3 km</option>
                <option value={5} className="bg-black">5 km</option>
              </select>
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
              placeholder="Digite uma palavra e aperte Enter (ex: Munck, Guindastes, Blocos)"
              className="w-full rounded-xl bg-black/40 border border-white/15 px-4 py-3 outline-none focus:ring-2 focus:ring-yellow-400"
            />

            <p className="text-xs text-white/50 mt-2">
              Dica: digite uma palavra e aperte Enter. Clique na tag para remover.
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

          {errorMsg ? (
            <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 px-4 py-3">
              {errorMsg}
            </div>
          ) : null}

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
                    <tr key={`${r.name || "row"}-${idx}`} className="border-t border-white/5">
                      <td className="px-4 py-3 font-medium">{r.name || "-"}</td>
                      <td className="px-4 py-3">{r.city || "-"}</td>
                      <td className="px-4 py-3">{r.neighborhood || "-"}</td>
                      <td className="px-4 py-3">{r.phone || "-"}</td>
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-white/45 mt-4">
            Se aparecer erro, ele aparece em vermelho aqui.
          </p>
        </div>
      </div>
    </div>
  );
}

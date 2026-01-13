"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type Lead = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  address?: string;
  phone?: string | null;
  website?: string | null;
  maps_url?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  uf?: string | null;
};

function normalizeText(s: string) {
  return (s || "").toString().trim();
}

function parseKeywords(input: string) {
  return input
    .split(",")
    .map((k) => normalizeText(k))
    .filter(Boolean);
}

function dedupeLeads(items: Lead[]) {
  const seen = new Set<string>();
  const out: Lead[] = [];
  for (const it of items) {
    const key =
      it.place_id ||
      `${normalizeText(it.name || "")}__${normalizeText(
        it.formatted_address || it.address || ""
      )}`.toLowerCase();

    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

async function downloadXlsx(leads: Lead[]) {
  // import dinamico para não quebrar o build
  const XLSX = await import("xlsx");

  const rows = leads.map((l) => ({
    "Nome da empresa": l.name || "",
    Endereço: l.formatted_address || l.address || "",
    Cidade: l.city || "",
    Bairro: l.neighborhood || "",
    UF: l.uf || "",
    Telefone: l.phone || "",
    Site: l.website || "",
    "Maps URL": l.maps_url || "",
    "Place ID": l.place_id || "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");

  XLSX.writeFile(wb, `leads_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

const UF_TO_MUNICIPIOS: Record<string, string[]> = {
  SP: [
    "São Paulo",
    "Guarulhos",
    "Campinas",
    "São Bernardo do Campo",
    "Santo André",
    "Osasco",
    "Diadema",
    "Mauá",
    "São Caetano do Sul",
    "Barueri",
    "Jundiaí",
    "Santos",
    "São José dos Campos",
    "Sorocaba",
    "Ribeirão Preto",
    "Mogi das Cruzes",
    "Carapicuíba",
    "Itaquaquecetuba",
    "Cotia",
    "Embu das Artes",
  ],
  RJ: ["Rio de Janeiro", "Niterói", "Duque de Caxias", "Nova Iguaçu", "São Gonçalo"],
  MG: ["Belo Horizonte", "Contagem", "Betim", "Uberlândia", "Juiz de Fora"],
  PR: ["Curitiba", "Londrina", "Maringá", "Ponta Grossa", "Cascavel"],
};

export default function LeadsPage() {
  const [uf, setUf] = useState<string>("SP");
  const [municipio, setMunicipio] = useState<string>("São Paulo");
  const [bairro, setBairro] = useState<string>("");
  const [keywordsText, setKeywordsText] = useState<string>("Munck, Guindastes, Blocos");

  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [results, setResults] = useState<Lead[]>([]);

  const municipiosDaUf = useMemo(() => UF_TO_MUNICIPIOS[uf] || [], [uf]);

  const keywords = useMemo(() => parseKeywords(keywordsText), [keywordsText]);

  async function runBuscaRapida() {
    setStatusMsg("");
    setLoading(true);
    try {
      const payload = {
        uf,
        city: municipio,
        neighborhood: normalizeText(bairro) || null,
        keywords,
        limit: 60,
      };

      const res = await fetch("/api/google-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setStatusMsg(data?.error || data?.message || "Erro na Busca rápida.");
        setResults([]);
        return;
      }

      const leads: Lead[] = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
      const deduped = dedupeLeads(leads);
      setResults(deduped);
      setStatusMsg(`OK: ${deduped.length} resultados (sem duplicados).`);
    } catch (e: any) {
      setStatusMsg("Erro inesperado na Busca rápida.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function runGrid() {
    setStatusMsg("");
    setLoading(true);
    try {
      const payload = {
        uf,
        city: municipio,
        neighborhood: normalizeText(bairro) || null,
        keywords,
      };

      const res = await fetch("/api/grid-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setStatusMsg(
          data?.error ||
            data?.message ||
            "GRID não respondeu (verifique se /api/grid-search existe)."
        );
        return;
      }

      const leads: Lead[] = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
      const deduped = dedupeLeads(leads);
      setResults(deduped);
      setStatusMsg(`GRID OK: ${deduped.length} resultados (sem duplicados).`);
    } catch (e: any) {
      setStatusMsg("Erro inesperado no GRID.");
    } finally {
      setLoading(false);
    }
  }

  async function exportExcel() {
    if (!results.length) {
      setStatusMsg("Nada para exportar ainda.");
      return;
    }
    try {
      await downloadXlsx(results);
      setStatusMsg("Excel gerado com sucesso (.xlsx).");
    } catch {
      setStatusMsg("Falha ao exportar Excel. (verifique se a lib xlsx está instalada)");
    }
  }

  return (
    <div className="min-h-screen bg-[#071a24] text-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 relative">
            <Image
              src="/logo.jpg"
              alt="RF Implementos"
              fill
              className="object-contain"
              priority
            />
          </div>

          <div className="flex-1">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Pesquisa de Empresas{" "}
              <span className="text-[#ffcc00]">Guindastes</span>
            </h1>
            <p className="text-white/70 mt-1">
              Busque por UF + Município + Bairro (opcional) + palavras-chave.
              Use <b>Busca rápida</b> (até 60) ou <b>GRID</b> (cobertura maior).
            </p>
          </div>

          <a
            href="/"
            className="hidden md:inline-flex rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
          >
            Voltar
          </a>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-black/25 shadow-2xl">
          <div className="p-6 md:p-7">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* UF */}
              <div>
                <label className="text-sm text-white/70">UF</label>
                <select
                  className="mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-[#ffcc00]/60"
                  value={uf}
                  onChange={(e) => {
                    const v = e.target.value;
                    setUf(v);
                    const firstCity = (UF_TO_MUNICIPIOS[v] || [])[0] || "";
                    setMunicipio(firstCity);
                  }}
                >
                  <option value="SP">SP</option>
                  <option value="RJ">RJ</option>
                  <option value="MG">MG</option>
                  <option value="PR">PR</option>
                </select>
              </div>

              {/* Município */}
              <div>
                <label className="text-sm text-white/70">Município</label>
                <select
                  className="mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-[#ffcc00]/60"
                  value={municipio}
                  onChange={(e) => setMunicipio(e.target.value)}
                >
                  {municipiosDaUf.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-white/50">
                  Se não encontrar seu município, me diga qual UF/cidade que eu adiciono.
                </p>
              </div>

              {/* Bairro */}
              <div>
                <label className="text-sm text-white/70">Bairro (opcional)</label>
                <input
                  className="mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-[#ffcc00]/60"
                  placeholder="Ex: Moema"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                />
              </div>
            </div>

            {/* Keywords */}
            <div className="mt-5">
              <label className="text-sm text-white/70">
                Palavras-chave (separadas por vírgula)
              </label>
              <input
                className="mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-[#ffcc00]/60"
                placeholder="Exemplo: Munck, Guindastes, Blocos"
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
              />
              <div className="mt-2 text-xs text-white/50">
                Exemplo: <span className="text-white/70">Munck, Guindastes, Blocos</span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-col md:flex-row gap-3 md:items-center">
              <button
                onClick={runBuscaRapida}
                disabled={loading}
                className="rounded-xl bg-[#ffcc00] text-black font-bold px-5 py-3 hover:brightness-110 disabled:opacity-60"
              >
                {loading ? "Aguarde..." : "Busca rápida (até 60)"}
              </button>

              <button
                onClick={runGrid}
                disabled={loading}
                className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 hover:bg-white/10 disabled:opacity-60"
              >
                {loading ? "Aguarde..." : "Busca completa (GRID)"}
              </button>

              <button
                onClick={exportExcel}
                disabled={loading || results.length === 0}
                className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 hover:bg-white/10 disabled:opacity-60"
                title="Gera um .xlsx organizado"
              >
                Exportar para Excel (.xlsx)
              </button>

              <div className="md:ml-auto text-sm text-white/70">
                Resultados (sem duplicados):{" "}
                <span className="text-white font-semibold">{results.length}</span>
              </div>
            </div>

            {statusMsg ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/80">
                {statusMsg}
              </div>
            ) : null}
          </div>
        </div>

        {/* Results table */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="font-semibold">Resultados</div>
            <div className="text-xs text-white/50">
              Dica: use o Excel para filtrar por bairro/telefone/site.
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-white/5 text-white/70">
                <tr>
                  <th className="text-left px-4 py-3">Empresa</th>
                  <th className="text-left px-4 py-3">Endereço</th>
                  <th className="text-left px-4 py-3">Telefone</th>
                  <th className="text-left px-4 py-3">Site</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-white/50" colSpan={4}>
                      Faça uma busca para aparecerem resultados aqui.
                    </td>
                  </tr>
                ) : (
                  results.map((r, idx) => (
                    <tr
                      key={(r.place_id || idx).toString()}
                      className="border-t border-white/10 hover:bg-white/5"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.name || "-"}</div>
                        <div className="text-xs text-white/50">
                          {r.uf || uf} • {r.city || municipio}
                          {r.neighborhood ? ` • ${r.neighborhood}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/80">
                        {r.formatted_address || r.address || "-"}
                        {r.maps_url ? (
                          <div className="mt-1">
                            <a
                              href={r.maps_url}
                              target="_blank"
                              className="text-[#ffcc00] hover:underline text-xs"
                              rel="noreferrer"
                            >
                              Abrir no Maps
                            </a>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{r.phone || "-"}</td>
                      <td className="px-4 py-3">
                        {r.website ? (
                          <a
                            href={r.website}
                            target="_blank"
                            className="text-[#ffcc00] hover:underline"
                            rel="noreferrer"
                          >
                            Site
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

          <div className="px-5 py-4 border-t border-white/10 text-xs text-white/50">
            Visual baseado na identidade RF Implementos. Depois ajustamos tipografia e layout fino.
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

type PlaceItem = {
  name: string;
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
};

export default function LeadsPage() {
  const [municipios, setMunicipios] = useState<string[]>([]);
  const [municipio, setMunicipio] = useState<string>("");
  const [bairro, setBairro] = useState<string>("");
  const [keywordsText, setKeywordsText] = useState<string>("Munck, Guindastes, Blocos");

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string>("");
  const [resultados, setResultados] = useState<PlaceItem[]>([]);

  const keywords = useMemo(() => {
    return keywordsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [keywordsText]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/municipios");
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Erro ao carregar municípios");
        setMunicipios(j.municipios || []);
      } catch (e: any) {
        setErro(e?.message ?? "Erro ao carregar municípios");
      }
    })();
  }, []);

  async function buscar(tipo: "quick" | "grid") {
    setErro("");
    setLoading(true);
    setResultados([]);

    try {
      if (!municipio) throw new Error("Selecione um Município (SP).");

      // Monta a busca (SP fixo)
      const queryParts = [
        keywords.join(" "),
        municipio,
        "SP",
        bairro ? `bairro ${bairro}` : "",
      ].filter(Boolean);

      const query = queryParts.join(" ");

      // Aqui você aponta para sua rota (quick vs grid).
      // Se você ainda não tem /api/grid-search, pode usar /api/google-places por enquanto.
      const endpoint = tipo === "grid" ? "/api/grid-search" : "/api/google-places";

      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: "SP",
          municipio,
          bairro: bairro || null,
          keywords,
          query,
          limit: tipo === "quick" ? 60 : 300, // grid tenta mais
        }),
      });

      const j = await r.json();
      if (!r.ok) {
        // Mostra o erro real na tela (sem “sumir”)
        throw new Error(j?.error || j?.message || "Erro na API");
      }

      const items: PlaceItem[] = j?.results || j?.data || [];
      // remove duplicados por name+address
      const map = new Map<string, PlaceItem>();
      for (const it of items) {
        const key = `${it.name}__${it.formattedAddress || ""}`.toLowerCase();
        if (!map.has(key)) map.set(key, it);
      }

      setResultados(Array.from(map.values()));
    } catch (e: any) {
      setErro(e?.message ?? "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#061a22] p-6 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-2xl border border-white/10 bg-black/30 shadow-2xl p-6 md:p-8">
          <h1 className="text-3xl md:text-4xl font-bold">
            Pesquisa de Empresas <span className="text-[#f5c400]">Guindastes</span>
          </h1>
          <p className="text-white/70 mt-2">
            Estado fixo: <b>São Paulo (SP)</b>. Filtre por Município, Bairro e Palavras-chave.
          </p>

          {erro ? (
            <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
              <b>Erro:</b> {erro}
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">Município (obrigatório)</label>
              <select
                className="w-full rounded-xl bg-black/40 border border-white/15 px-3 py-3 outline-none focus:ring-2 focus:ring-[#f5c400]"
                value={municipio}
                onChange={(e) => setMunicipio(e.target.value)}
              >
                <option value="">Selecione…</option>
                {municipios.map((m) => (
                  <option key={m} value={m} className="text-black">
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-white/70 mb-2">Bairro (opcional)</label>
              <input
                className="w-full rounded-xl bg-black/40 border border-white/15 px-3 py-3 outline-none focus:ring-2 focus:ring-[#f5c400]"
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                placeholder="Ex: Moema"
              />
            </div>

            <div>
              <label className="block text-sm text-white/70 mb-2">Palavras-chave (separadas por vírgula)</label>
              <input
                className="w-full rounded-xl bg-black/40 border border-white/15 px-3 py-3 outline-none focus:ring-2 focus:ring-[#f5c400]"
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                placeholder="Exemplo: Munck, Guindastes, Blocos"
              />
              <p className="text-xs text-white/50 mt-2">Exemplo: Munck, Guindastes, Blocos</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => buscar("quick")}
              disabled={loading}
              className="rounded-xl bg-[#f5c400] px-5 py-3 font-semibold text-black hover:brightness-110 disabled:opacity-50"
            >
              {loading ? "Buscando..." : "Busca rápida (até 60)"}
            </button>

            <button
              onClick={() => buscar("grid")}
              disabled={loading}
              className="rounded-xl bg-white/10 border border-white/15 px-5 py-3 font-semibold hover:bg-white/15 disabled:opacity-50"
            >
              Busca completa (GRID)
            </button>

            <div className="ml-auto text-white/70 flex items-center">
              Resultados (sem duplicados):{" "}
              <b className="ml-2 text-white">{resultados.length}</b>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
          {resultados.length === 0 ? (
            <p className="text-white/60">Nenhum resultado ainda. Faça uma busca.</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-white/70">
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 pr-3">Empresa</th>
                    <th className="text-left py-2 pr-3">Endereço</th>
                    <th className="text-left py-2 pr-3">Telefone</th>
                    <th className="text-left py-2 pr-3">Site</th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((r, idx) => (
                    <tr key={idx} className="border-b border-white/5">
                      <td className="py-2 pr-3 font-medium">{r.name}</td>
                      <td className="py-2 pr-3 text-white/80">{r.formattedAddress || "-"}</td>
                      <td className="py-2 pr-3 text-white/80">
                        {r.internationalPhoneNumber || r.nationalPhoneNumber || "-"}
                      </td>
                      <td className="py-2 pr-3 text-white/80">
                        {r.websiteUri ? (
                          <a className="text-[#f5c400] underline" href={r.websiteUri} target="_blank">
                            Abrir
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

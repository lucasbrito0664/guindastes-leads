"use client";

import Image from "next/image";
import { useState } from "react";

export default function Home() {
  const [cidade, setCidade] = useState("São Paulo");
  const [bairro, setBairro] = useState("");
  const [keywords, setKeywords] = useState("Munck, Guindastes, Blocos");

  return (
    <div className="min-h-screen bg-[#061c26] text-white">
      {/* topo */}
      <div className="border-b border-white/10 bg-[#061c26]/70 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-5 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.jpg" alt="RF Implementos" width={56} height={56} priority />
            <div className="leading-tight">
              <div className="text-lg font-semibold tracking-wide">RF Implementos</div>
              <div className="text-xs text-white/70">
                Pesquisa de empresas • Guindastes / Munck
              </div>
            </div>
          </div>

          <div className="ml-auto">
            <a
              href="/leads"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              Ir para Meus Leads →
            </a>
          </div>
        </div>
      </div>

      {/* conteúdo */}
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-3xl border border-white/10 bg-[#072635] shadow-[0_20px_60px_rgba(0,0,0,0.5)] p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                Pesquisa de Empresas{" "}
                <span className="text-[#ffcc00]">Guindastes</span>
              </h1>
              <p className="mt-2 text-sm text-white/70">
                Use Busca rápida para encontrar até 60 resultados ou GRID para cobrir a cidade inteira e salvar no banco.
              </p>
            </div>
          </div>

          {/* filtros */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-white/70">Cidade (obrigatório)</label>
              <input
                className="mt-1 w-full rounded-xl bg-[#061c26] border border-white/15 px-4 py-3 outline-none focus:border-[#ffcc00]"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                placeholder="São Paulo"
              />
            </div>

            <div>
              <label className="text-xs text-white/70">Bairro (opcional)</label>
              <input
                className="mt-1 w-full rounded-xl bg-[#061c26] border border-white/15 px-4 py-3 outline-none focus:border-[#ffcc00]"
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                placeholder="Ex: Moema"
              />
            </div>

            <div>
              <label className="text-xs text-white/70">Palavras-chave (separadas por vírgula)</label>
              <input
                className="mt-1 w-full rounded-xl bg-[#061c26] border border-white/15 px-4 py-3 outline-none focus:border-[#ffcc00]"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="Exemplo: Munck, Guindastes, Blocos"
              />
              <div className="mt-2 text-xs text-white/60">
                Exemplo: <span className="text-white/80">Munck, Guindastes, Blocos</span>
              </div>
            </div>
          </div>

          {/* ações */}
          <div className="mt-6 flex flex-col md:flex-row gap-3">
            <button className="rounded-xl bg-[#ffcc00] text-black font-semibold px-5 py-3 hover:brightness-110">
              Busca rápida (até 60)
            </button>

            <button className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 hover:bg-white/10">
              Busca completa (GRID)
            </button>

            <button className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 hover:bg-white/10">
              Exportar para Excel (.xlsx)
            </button>

            <div className="md:ml-auto flex items-center text-sm text-white/70">
              Resultados (sem duplicados): <span className="ml-2 text-white font-semibold">0</span>
            </div>
          </div>

          <p className="mt-6 text-xs text-white/55">
            Dica: faça o GRID para cobertura e depois use “Meus Leads” para enriquecer só os leads bons.
          </p>
        </div>
      </div>
    </div>
  );
}

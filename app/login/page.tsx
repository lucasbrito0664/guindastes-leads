"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");

    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const j = await r.json();
    if (!r.ok) {
      setMsg(j?.error || "Erro");
      return;
    }

    window.location.href = "/";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-6 border border-slate-800">
        <h1 className="text-xl font-semibold text-white">Acesso</h1>
        <p className="text-sm text-slate-300 mt-1">Digite a senha para entrar</p>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <input
            className="w-full rounded-lg p-3 bg-slate-950 border border-slate-800 text-white outline-none"
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="w-full rounded-lg p-3 bg-yellow-500 font-semibold">
            Entrar
          </button>
          {msg ? <p className="text-red-400 text-sm">{msg}</p> : null}
        </form>
      </div>
    </div>
  );
}

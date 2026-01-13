import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const city = (searchParams.get("city") ?? "").trim();
    const neighborhood = (searchParams.get("neighborhood") ?? "").trim();
    const q = (searchParams.get("q") ?? "").trim();

    let query = supabase.from("companies").select("*").order("created_at", { ascending: false }).limit(2000);

    if (city) query = query.ilike("source_city", `%${city}%`);
    if (neighborhood) query = query.ilike("source_neighborhood", `%${neighborhood}%`);

    if (q) {
      // filtra por nome/endereço
      // (supabase não tem OR fácil no client anon; então fazemos filtro simples em name e address por 2 requests ou filtra no front)
      // aqui fazemos name
      query = query.ilike("name", `%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ leads: data ?? [] }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Erro interno" }, { status: 500 });
  }
}

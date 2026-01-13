import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export async function GET() {
  const { data, error } = await supabase
    .from("companies")
    .select("source_city")
    .not("source_city", "is", null)
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const unique = Array.from(new Set((data ?? []).map((x: any) => x.source_city).filter(Boolean))).sort();
  return NextResponse.json({ municipios: unique }, { status: 200 });
}

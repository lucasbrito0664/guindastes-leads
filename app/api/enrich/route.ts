import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Body = { placeIds: string[] };

function dddFromPhone(phone?: string | null) {
  if (!phone) return null;
  const m = phone.match(/\((\d{2})\)/);
  return m ? m[1] : null;
}

async function placeDetails(placeId: string) {
  const key = process.env.GOOGLE_MAPS_API_KEY!;
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "place_id,name,formatted_address,formatted_phone_number,website,address_component");
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("key", key);

  const res = await fetch(url.toString());
  return res.json();
}

function parsePostal(components: any[]) {
  const pc = components?.find((c) => c.types?.includes("postal_code"))?.long_name;
  return pc || null;
}

export async function POST(req: Request) {
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY não configurada" }, { status: 500 });

    const body = (await req.json()) as Body;
    const placeIds = Array.isArray(body.placeIds)
      ? Array.from(new Set(body.placeIds.map((x) => String(x).trim()).filter(Boolean)))
      : [];

    if (placeIds.length === 0) {
      return NextResponse.json({ error: "Envie placeIds[]" }, { status: 400 });
    }

    let ok = 0;
    let fail = 0;

    for (const id of placeIds) {
      const d = await placeDetails(id);
      if (d.status !== "OK") {
        fail++;
        continue;
      }

      const r = d.result;
      const phone = r.formatted_phone_number ?? null;

      const update = {
        place_id: id,
        name: r.name ?? null,
        address: r.formatted_address ?? null,
        phone,
        ddd: dddFromPhone(phone),
        website: r.website ?? null,
        postal_code: parsePostal(r.address_components || []),
        maps_url: `https://www.google.com/maps/place/?q=place_id:${id}`,
        enriched: true,
      };

      const { error } = await supabase
        .from("companies")
        .upsert(update, { onConflict: "place_id" });

      if (error) fail++;
      else ok++;
    }

    return NextResponse.json({ enriched_ok: ok, enriched_fail: fail }, { status: 200 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message || "Erro interno" }, { status: 500 });
  }
}

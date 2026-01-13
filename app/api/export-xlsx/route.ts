import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

type ExportBody = {
  rows: Array<{
    name?: string;
    city?: string;
    neighborhood?: string;
    address?: string;
    postal_code?: string;
    ddd?: string;
    phone?: string;
    website?: string;
  }>;
  filename?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ExportBody;

    const rows = Array.isArray(body.rows) ? body.rows : [];
    const filename = (body.filename || "leads").replace(/[^a-zA-Z0-9-_]/g, "_");

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Leads");

    sheet.columns = [
      { header: "Nome da empresa", key: "name", width: 35 },
      { header: "Cidade", key: "city", width: 18 },
      { header: "Bairro", key: "neighborhood", width: 22 },
      { header: "Endereço", key: "address", width: 45 },
      { header: "CEP", key: "postal_code", width: 12 },
      { header: "DDD", key: "ddd", width: 8 },
      { header: "Telefone", key: "phone", width: 20 },
      { header: "Site", key: "website", width: 30 },
    ];

    // Estilo do cabeçalho
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const r of rows) {
      sheet.addRow({
        name: r.name || "",
        city: r.city || "",
        neighborhood: r.neighborhood || "",
        address: r.address || "",
        postal_code: r.postal_code || "",
        ddd: r.ddd || "",
        phone: r.phone || "",
        website: r.website || "",
      });
    }

    // Auto-filter
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columns.length },
    };

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  } catch (e) {
    console.error("EXPORT ERROR:", e);
    return NextResponse.json({ error: "Falha ao gerar Excel" }, { status: 500 });
  }
}

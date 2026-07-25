import ExcelJS from "exceljs";
import { Lead } from "./scrapeLeads";

export async function buildExcel(
  leads: Lead[],
  category: string,
  location: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Leads");

  sheet.columns = [
    { header: "Business Name", key: "businessName", width: 30 },
    { header: "Email", key: "email", width: 30 },
    { header: "Phone Number", key: "phone", width: 20 },
    { header: "Website", key: "website", width: 35 },
    { header: "Location", key: "location", width: 40 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

  leads.forEach((lead) => {
    sheet.addRow({
      businessName: lead.businessName,
      email: lead.email,
      phone: lead.phone,
      website: lead.website,
      location: lead.location,
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function getExcelFilename(category: string, location: string): string {
  const sanitize = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

  const cat = sanitize(category);
  const loc = sanitize(location);

  if (!cat && !loc) return "leads.xlsx";
  if (!loc) return `leads_${cat}.xlsx`;
  return `leads_${cat}_${loc}.xlsx`;
}

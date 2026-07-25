import { NextResponse } from "next/server";
import { parsePrompt } from "@/lib/parsePrompt";
import { scrapeLeads } from "@/lib/scrapeLeads";
import { buildExcel, getExcelFilename } from "@/lib/buildExcel";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Please provide a valid search prompt." },
        { status: 400 }
      );
    }

    const { businessCategory, location } = parsePrompt(prompt);

    console.log(
      `[API] Prompt: "${prompt}" | Category: "${businessCategory}" | Location: "${location}"`
    );

    const leads = await scrapeLeads(businessCategory, location);

    console.log(
      `[API] Query: "${businessCategory} in ${location}" | Leads: ${leads.length}`
    );

    const excelBuffer = await buildExcel(leads, businessCategory, location);
    const excelBase64 = excelBuffer.toString("base64");
    const filename = getExcelFilename(businessCategory, location);

    return NextResponse.json({
      leads,
      excelBase64,
      filename,
      query: location
        ? `${businessCategory} in ${location}`
        : businessCategory,
    });
  } catch (error) {
    console.error("[API] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong while searching for leads. Please try again." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { parsePrompt } from "@/lib/parsePrompt";
import { scrapeLeads } from "@/lib/scrapeLeads";
import { buildExcel, getExcelFilename } from "@/lib/buildExcel";

export const maxDuration = 60;

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Please provide a valid search prompt." },
        { status: 400 }
      );
    }

    if (prompt.trim().length < 2) {
      return NextResponse.json(
        { error: "Please provide a more detailed search prompt." },
        { status: 400 }
      );
    }

    const { businessCategory, location } = parsePrompt(prompt);

    console.log(
      `[API] Prompt: "${prompt}" | Category: "${businessCategory}" | Location: "${location}"`
    );

    if (!businessCategory) {
      return NextResponse.json(
        { error: "Could not understand the search prompt. Try something like 'coffee shops in New York'." },
        { status: 400 }
      );
    }

    const leads = await scrapeLeads(businessCategory, location);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(
      `[API] Query: "${businessCategory} in ${location}" | Leads: ${leads.length} | Time: ${elapsed}s`
    );

    if (leads.length === 0) {
      return NextResponse.json({
        leads: [],
        excelBase64: "",
        filename: "leads.xlsx",
        query: location
          ? `${businessCategory} in ${location}`
          : businessCategory,
        error: "No leads found for this search. Try a different prompt or be more specific (e.g. 'restaurants in New York').",
      });
    }

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
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[API] Error after ${elapsed}s:`, error);
    return NextResponse.json(
      { error: "Something went wrong while searching for leads. Please try again." },
      { status: 500 }
    );
  }
}

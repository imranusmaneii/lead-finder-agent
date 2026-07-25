# Lead Finder Agent

A Next.js web app that takes natural-language prompts, scrapes business leads from Google Maps using headless browser automation, and lets users download the results as an Excel file.

## Install

```bash
npm install
```

## Local Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Chromium is fetched at runtime, so scraping works locally without any additional setup.

## Deploy to Vercel

1. Push this repo to GitHub
2. Connect the GitHub repo to Vercel
3. Vercel auto-builds on push to `main`
4. The API function has a 60-second timeout (`maxDuration = 60`) to accommodate scraping + email lookups

## How to Use

1. Enter a natural language prompt like **"coffee shops in New York"**
2. Click **Find Leads**
3. Wait 10-40 seconds while the app scrapes Google Maps
4. View results in the table and click **Download Excel** to save them

## How the Excel Download Works

The Excel file is generated in-memory inside the serverless function and sent back as a base64-encoded string in the API response. Your browser decodes it and triggers a download — no file is ever saved on the server. This is because Vercel functions are stateless and ephemeral; any files written to disk would be lost after the function completes.

## Project Structure

```
/app
  /page.tsx                # Main UI
  /api/leads/route.ts      # POST endpoint
/lib
  /parsePrompt.ts          # Extracts category + location from prompt
  /scrapeLeads.ts          # Playwright + Chromium scraping logic
  /buildExcel.ts           # Excel file generation with exceljs
```

## Known Limitations

- **Google Maps DOM selectors** may need occasional updates if Google changes their layout
- **Lead count** is capped at ~15 per search to stay within serverless time limits
- **Email extraction** is best-effort — only attempted if a website URL is found, and many sites block or don't expose email addresses in their HTML
- If Chromium-in-serverless proves unreliable, you can set the `BROWSERLESS_API_KEY` env var to use a Browserless fallback (not implemented in default path — see `.env.example`)

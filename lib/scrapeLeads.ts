import playwright, { Browser, Page } from "playwright-core";
import chromium from "@sparticuz/chromium";

export interface Lead {
  businessName: string;
  email: string;
  phone: string;
  website: string;
  location: string;
}

const JUNK_EMAILS = [
  "example.com", "sentry.io", "wixpress.com", "schema.org",
  "googleapis.com", "google.com", "gstatic.com", "facebook.com",
  "cloudflare.com", "wordpress.org", "w3.org", ".png", ".jpg",
  ".gif", ".svg", ".webp", "no-reply", "noreply", "mailer-daemon",
];

async function dismissConsent(page: Page) {
  try {
    const consentBtn = page.locator('button:has-text("Accept all"), button:has-text("I agree"), button:has-text("Reject all"), form[action*="consent"] button');
    if (await consentBtn.count() > 0) {
      await consentBtn.first().click({ timeout: 3000 });
      await page.waitForTimeout(1500);
    }
  } catch {}
}

async function extractEmailFromWebsite(
  browser: Browser,
  url: string
): Promise<string> {
  let page;
  try {
    page = await browser.newPage();
    await page.goto(url, {
      timeout: 8000,
      waitUntil: "domcontentloaded",
    });
    const content = await page.content();
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const matches = content.match(emailRegex);
    if (matches && matches.length > 0) {
      const filtered = matches.filter(
        (e) => !JUNK_EMAILS.some((j) => e.toLowerCase().includes(j))
      );
      return filtered.length > 0 ? filtered[0] : "";
    }
    return "";
  } catch {
    return "";
  } finally {
    if (page) {
      try { await page.close(); } catch {}
    }
  }
}

async function extractLeadsFromStructuredData(page: Page): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const scripts = await page.locator('script[type="application/ld+json"]').all();
    for (const script of scripts) {
      try {
        const text = await script.textContent();
        if (!text) continue;
        const data = JSON.parse(text);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item["@type"] === "LocalBusiness" || item["@type"] === "Restaurant" || item["@type"] === "Store") {
            leads.push({
              businessName: item.name || "",
              phone: item.telephone || "",
              website: item.url || "",
              location: item.address
                ? `${item.address.streetAddress || ""}, ${item.address.addressLocality || ""}, ${item.address.addressRegion || ""}`.trim()
                : "",
              email: "",
            });
          }
        }
      } catch {}
    }
  } catch {}
  return leads;
}

function extractLeadFromText(blockText: string): Partial<Lead> | null {
  const lines = blockText.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const lead: Partial<Lead> = {};

  lead.businessName = lines[0] || "";

  const phoneMatch = blockText.match(/[\+]?[\d][\d\s\-\(\)]{6,}/);
  if (phoneMatch) lead.phone = phoneMatch[0].trim();

  const webMatch = blockText.match(/(?:https?:\/\/)?(?!google\.com)(?!maps\.google)[a-zA-Z0-9][a-zA-Z0-9\-]*\.[a-zA-Z]{2,}(?:\/\S*)?/);
  if (webMatch && !webMatch[0].includes("google")) {
    lead.website = webMatch[0].startsWith("http") ? webMatch[0] : `https://${webMatch[0]}`;
  }

  const addrKeywords = /open|close|hour|direction|website|phone|review|rating/i;
  for (const line of lines) {
    if (!addrKeywords.test(line) && line.length > 10 && line !== lead.businessName) {
      const hasDigit = /\d/.test(line);
      const hasLetter = /[a-zA-Z]/.test(line);
      if (hasDigit && hasLetter) {
        lead.location = line;
        break;
      }
    }
  }

  return lead;
}

async function scrollResultsPanel(page: Page, scrollableSelector: string, maxScrolls: number) {
  for (let i = 0; i < maxScrolls; i++) {
    try {
      const scrollable = page.locator(scrollableSelector);
      if (await scrollable.count() > 0) {
        await scrollable.evaluate((el: any) => {
          el.scrollBy(0, 600);
        });
      } else {
        await page.evaluate(() => {
          const feed = document.querySelector('[role="feed"]') ||
                       document.querySelector('[role="main"]') ||
                       document.querySelector('.m6QErb');
          if (feed) feed.scrollBy(0, 600);
        });
      }
    } catch {
      await page.mouse.wheel(0, 600);
    }
    await page.waitForTimeout(1500);
  }
}

export async function scrapeLeads(
  businessCategory: string,
  location: string
): Promise<Lead[]> {
  const searchQuery = location
    ? `${businessCategory} in ${location}`
    : businessCategory;

  console.log(`[Scrape] Starting scrape for: "${searchQuery}"`);

  let browser: Browser | null = null;

  try {
    browser = await playwright.chromium.launch({
      args: [
        ...chromium.args,
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
      ],
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1366, height: 900 },
      locale: "en-US",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    const page = await context.newPage();

    const encodedQuery = encodeURIComponent(searchQuery);
    const searchUrl = `https://www.google.com/maps/search/${encodedQuery}`;
    console.log(`[Scrape] Navigating to: ${searchUrl}`);

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    await page.waitForTimeout(3000);
    await dismissConsent(page);
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    console.log(`[Scrape] Current URL: ${currentUrl}`);

    const pageTitle = await page.title();
    console.log(`[Scrape] Page title: ${pageTitle}`);

    let leads: Lead[] = [];

    const structuredLeads = await extractLeadsFromStructuredData(page);
    if (structuredLeads.length > 0) {
      console.log(`[Scrape] Found ${structuredLeads.length} leads from structured data`);
      leads = structuredLeads;
    }

    if (leads.length < 5) {
      console.log("[Scrape] Trying DOM extraction from result cards...");

      const scrollableSelectors = [
        '[role="feed"]',
        '[role="main"] .m6QErb',
        'div.m6QErb.DxyBCb',
        '.section-layout',
        '[role="list"]',
      ];

      let scrollableFound = false;
      for (const sel of scrollableSelectors) {
        const el = page.locator(sel);
        if (await el.count() > 0) {
          console.log(`[Scrape] Found scrollable panel: ${sel}`);
          await scrollResultsPanel(page, sel, 8);
          scrollableFound = true;
          break;
        }
      }

      if (!scrollableFound) {
        console.log("[Scrape] No scrollable panel found, scrolling page...");
        for (let i = 0; i < 6; i++) {
          await page.mouse.wheel(0, 500);
          await page.waitForTimeout(1200);
        }
      }

      const resultSelectors = [
        'a[href*="/maps/place/"]',
        '[role="article"]',
        '.Nv2PK',
        'div[jsaction*="mouseover"]',
        '.hfpxzc',
        '.bfdHYd',
        '[data-result-index]',
      ];

      let resultElements: any[] = [];
      for (const sel of resultSelectors) {
        try {
          const els = await page.locator(sel).all();
          if (els.length > resultElements.length) {
            resultElements = els;
            console.log(`[Scrape] Found ${els.length} result elements with selector: ${sel}`);
          }
        } catch {}
      }

      if (resultElements.length === 0) {
        console.log("[Scrape] Trying broader element search...");
        try {
          const allLinks = await page.locator('a').all();
          for (const link of allLinks) {
            try {
              const href = await link.getAttribute("href");
              if (href && href.includes("/maps/place/")) {
                resultElements.push(link);
              }
            } catch {}
          }
          console.log(`[Scrape] Found ${resultElements.length} place links via href scan`);
        } catch {}
      }

      const seen = new Set<string>();

      for (const existing of leads) {
        const key = `${existing.businessName.toLowerCase()}|${existing.phone}|${existing.website}`;
        seen.add(key);
      }

      for (let i = 0; i < resultElements.length && leads.length < 15; i++) {
        try {
          const el = resultElements[i];

          let businessName = "";
          let phone = "";
          let website = "";
          let locationStr = "";

          try {
            const ariaLabel = await el.getAttribute("aria-label");
            if (ariaLabel && ariaLabel.length > 1 && ariaLabel.length < 300) {
              businessName = ariaLabel;
            }
          } catch {}

          if (!businessName) {
            try {
              const innerEl = el.locator('.qBF1Pd, .fontHeadlineSmall, .NrDZNb, .W4Efsd').first();
              if (await innerEl.count() > 0) {
                businessName = (await innerEl.textContent()) || "";
              }
            } catch {}
          }

          if (!businessName) {
            try {
              const text = (await el.textContent()) || "";
              businessName = text.split("\n").find((l) => l.trim().length > 1) || "";
            } catch {}
          }

          businessName = businessName.trim();
          if (!businessName || businessName.length < 2) continue;
          if (/^\d+$/.test(businessName)) continue;
          if (businessName.toLowerCase().includes("ad ·") || businessName.toLowerCase().includes("sponsored")) continue;

          const blockText = await el.textContent().catch(() => "") || "";

          const phoneMatch = blockText.match(/[\+]?[\d][\d\s\-\(\)]{7,}/);
          if (phoneMatch) phone = phoneMatch[0].trim();

          const webMatch = blockText.match(/((?:https?:\/\/)?(?!google\.com|maps\.google|gstatic|googleapis)[a-zA-Z0-9][a-zA-Z0-9\-]*\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/);
          if (webMatch && !webMatch[0].includes("google")) {
            const raw = webMatch[0];
            website = raw.startsWith("http") ? raw : `https://${raw}`;
          }

          try {
            const innerHtml = await el.innerHTML();
            const innerWebMatch = innerHtml.match(/href="(https?:\/\/(?!google\.com|maps\.google)[^"]+)"/);
            if (innerWebMatch && !innerWebMatch[1].includes("google")) {
              website = innerWebMatch[1];
            }
          } catch {}

          const dedupKey = `${businessName.toLowerCase().replace(/\s+/g, "")}|${phone}|${website}`;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);

          leads.push({
            businessName,
            email: "",
            phone: phone || "",
            website: website || "",
            location: locationStr || "",
          });

          console.log(`[Scrape] Lead ${leads.length}: ${businessName} | Phone: ${phone || "N/A"} | Web: ${website || "N/A"}`);

        } catch {}
      }
    }

    if (leads.length === 0) {
      console.log("[Scrape] Attempting click-and-extract fallback...");
      leads = await clickAndExtractFallback(page, browser, seen);
    }

    if (leads.length === 0) {
      console.log("[Scrape] Attempting page text extraction fallback...");
      leads = await textBasedFallback(page, browser);
    }

    console.log(`[Scrape] Final result for "${searchQuery}": ${leads.length} leads`);
    return leads;

  } catch (error) {
    console.error("[Scrape] Fatal error:", error);
    return [];
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

async function clickAndExtractFallback(
  page: Page,
  browser: Browser,
  seen: Set<string>
): Promise<Lead[]> {
  const leads: Lead[] = [];

  try {
    const feed = page.locator('[role="feed"], .m6QErb').first();
    if (await feed.count() === 0) return leads;

    const clickables = await feed.locator('a[href*="/maps/place/"]').all();
    console.log(`[Scrape-Fallback] Found ${clickables.length} clickable results`);

    for (let i = 0; i < clickables.length && leads.length < 15; i++) {
      try {
        const clickable = clickables[i];

        let businessName = "";
        try {
          businessName = (await clickable.getAttribute("aria-label")) || "";
        } catch {}
        if (!businessName) {
          try {
            businessName = ((await clickable.textContent()) || "").split("\n")[0].trim();
          } catch {}
        }

        businessName = businessName.trim();
        if (!businessName || businessName.length < 2) continue;

        await clickable.click({ timeout: 4000 });
        await page.waitForTimeout(3000);

        let phone = "";
        let website = "";
        let locationStr = "";
        let email = "";

        const detailArea = page.locator('[role="main"]');
        if (await detailArea.count() > 0) {
          const detailText = await detailArea.textContent().catch(() => "") || "";

          const pm = detailText.match(/[\+]?[\d][\d\s\-\(\)]{7,}/);
          if (pm) phone = pm[0].trim();

          try {
            const webLink = page.locator('[role="main"] a[data-item-id*="authority"], [role="main"] a[href^="http"]:not([href*="google"])').first();
            if (await webLink.count() > 0) {
              const href = await webLink.getAttribute("href");
              if (href && !href.includes("google")) website = href;
            }
          } catch {}

          const addrSelectors = [
            'button[data-item-id*="address"]',
            '[data-tooltip*="Address"]',
          ];
          for (const sel of addrSelectors) {
            try {
              const addrEl = detailArea.locator(sel).first();
              if (await addrEl.count() > 0) {
                const label = await addrEl.getAttribute("aria-label");
                const text = await addrEl.textContent();
                locationStr = label || text || "";
                if (locationStr.trim()) break;
              }
            } catch {}
          }
        }

        const dedupKey = `${businessName.toLowerCase().replace(/\s+/g, "")}|${phone}|${website}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        if (website) {
          try {
            const normalizedUrl = website.startsWith("http") ? website : `https://${website}`;
            email = await extractEmailFromWebsite(browser, normalizedUrl);
          } catch {}
        }

        leads.push({
          businessName,
          email: email || "",
          phone: phone || "",
          website: website || "",
          location: locationStr || "",
        });

        console.log(`[Scrape-Fallback] Lead ${leads.length}: ${businessName}`);

        try {
          const backBtn = page.locator('button[aria-label="Back"], button[jsaction*="back"]');
          if (await backBtn.count() > 0) {
            await backBtn.first().click({ timeout: 2000 });
            await page.waitForTimeout(1500);
          }
        } catch {}

      } catch {}
    }
  } catch (error) {
    console.error("[Scrape-Fallback] Error:", error);
  }

  return leads;
}

async function textBasedFallback(
  page: Page,
  browser: Browser
): Promise<Lead[]> {
  const leads: Lead[] = [];

  try {
    const bodyText = await page.textContent("body").catch(() => "") || "";
    const html = await page.content();

    const blocks = html.split(/(?=<div[^>]*class="[^"]*(?:Nv2PK|hfpxzc|section-result)[^"]*")/i);

    for (const block of blocks) {
      if (leads.length >= 15) break;

      const textContent = block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const extracted = extractLeadFromText(textContent);

      if (extracted && extracted.businessName && extracted.businessName.length > 2) {
        const name = extracted.businessName;
        if (leads.some((l) => l.businessName.toLowerCase() === name.toLowerCase())) continue;

        let email = "";
        if (extracted.website) {
          try {
            const normalizedUrl = extracted.website.startsWith("http") ? extracted.website : `https://${extracted.website}`;
            email = await extractEmailFromWebsite(browser, normalizedUrl);
          } catch {}
        }

        leads.push({
          businessName: name,
          email: email || "",
          phone: extracted.phone || "",
          website: extracted.website || "",
          location: extracted.location || "",
        });
      }
    }

    if (leads.length === 0) {
      const emailRegex = /href="mailto:([^"]+)"/g;
      let match;
      while ((match = emailRegex.exec(html)) !== null) {
        console.log(`[Scrape-Text] Found mailto: ${match[1]}`);
      }
    }

  } catch (error) {
    console.error("[Scrape-Text] Error:", error);
  }

  return leads;
}

import playwright, { Browser } from "playwright-core";
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

async function extractEmailFromWebsite(
  browser: Browser,
  url: string
): Promise<string> {
  let page;
  try {
    page = await browser.newPage();
    await page.goto(url, {
      timeout: 6000,
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

async function findResultLinks(feed: any) {
  // Strategy 1: Links with place in href
  let links = await feed.locator('a[href*="/maps/place/"]').all();
  if (links.length > 0) return links;

  // Strategy 2: Any anchor inside the feed that looks like a result
  links = await feed.locator('a[aria-label]').all();
  if (links.length > 0) return links;

  // Strategy 3: Divs with jsaction that contain result info
  const divLinks = await feed.locator('div[jsaction] a').all();
  if (divLinks.length > 0) return divLinks;

  // Strategy 4: Any clickable result-like element
  links = await feed.locator('[role="link"]').all();
  if (links.length > 0) return links;

  // Strategy 5: Last resort — all anchor tags in feed
  links = await feed.locator('a').all();
  return links;
}

export async function scrapeLeads(
  businessCategory: string,
  location: string
): Promise<Lead[]> {
  const searchQuery = location
    ? `${businessCategory} in ${location}`
    : businessCategory;

  let browser: Browser | null = null;

  try {
    browser = await playwright.chromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
    });

    const page = await context.newPage();

    await page.goto("https://www.google.com/maps", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(2500);

    // Try multiple selectors for the search box
    let searchBox = page.locator('#searchboxinput');
    if (await searchBox.count() === 0) {
      searchBox = page.locator('input[aria-label*="Search"]').first();
    }
    if (await searchBox.count() === 0) {
      searchBox = page.locator('input[type="text"]').first();
    }

    await searchBox.waitFor({ timeout: 10000 });
    await searchBox.fill(searchQuery);
    await page.waitForTimeout(500);
    await searchBox.press("Enter");

    await page.waitForTimeout(4000);

    // Wait for results — try multiple selectors
    let feed = page.locator('[role="feed"]');
    if (await feed.count() === 0) {
      feed = page.locator('[role="list"]');
    }
    if (await feed.count() === 0) {
      // Wait a bit more and try again
      await page.waitForTimeout(3000);
      feed = page.locator('[role="feed"]');
    }

    try {
      await feed.waitFor({ timeout: 15000 });
    } catch {
      // If no feed found, the page might have changed structure
      console.log("[Scrape] Could not find results feed, attempting fallback...");
    }

    // Scroll to load more results
    for (let i = 0; i < 6; i++) {
      try {
        await feed.evaluate((el: any) => el.scrollBy(0, 500));
      } catch {}
      await page.waitForTimeout(1200);
    }

    // Find result links using multiple strategies
    const results = await findResultLinks(feed);

    console.log(`[Scrape] Found ${results.length} result elements for "${searchQuery}"`);

    const leads: Lead[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < Math.min(results.length, 20); i++) {
      if (leads.length >= 15) break;

      try {
        const result = results[i];

        // Extract business name — try multiple approaches
        let businessName = "";
        try {
          const ariaLabel = await result.getAttribute("aria-label");
          if (ariaLabel && ariaLabel.length > 1 && ariaLabel.length < 200) {
            businessName = ariaLabel;
          }
        } catch {}

        if (!businessName) {
          try {
            const text = await result.textContent();
            if (text) {
              // Take first line or first 100 chars
              businessName = text.split("\n")[0].trim().substring(0, 100);
            }
          } catch {}
        }

        businessName = businessName.trim();
        if (!businessName || businessName.length < 2) continue;

        // Skip if this looks like a non-business result (ads, etc.)
        if (businessName.toLowerCase().includes("ad ·") || businessName.toLowerCase().includes("sponsored")) continue;

        // Click to open detail panel
        try {
          await result.click({ timeout: 3000 });
        } catch {
          continue;
        }
        await page.waitForTimeout(2500);

        let phone = "";
        let website = "";
        let locationStr = "";
        let email = "";

        // Extract from detail panel with multiple selector strategies
        try {
          // Wait for detail panel to appear
          const detailSelectors = ['[role="main"]', '[role="complementary"]', '.section-hero-header-description'];
          let detailPanel = null;
          for (const sel of detailSelectors) {
            const panel = page.locator(sel);
            if (await panel.count() > 0) {
              detailPanel = panel;
              break;
            }
          }

          if (detailPanel) {
            await page.waitForTimeout(1000);

            // Phone extraction — multiple strategies
            if (!phone) {
              const phoneSelectors = [
                'button[data-item-id^="phone:tel:"]',
                'button[data-item-id*="phone"]',
                'a[href^="tel:"]',
                '[data-tooltip*="Phone"]',
              ];
              for (const sel of phoneSelectors) {
                try {
                  const el = detailPanel.locator(sel).first();
                  if (await el.count() > 0) {
                    const label = await el.getAttribute("aria-label");
                    const text = await el.textContent();
                    const raw = label || text || "";
                    const phoneMatch = raw.match(/[\+]?[\d\s\-\(\)]{7,}/);
                    if (phoneMatch) {
                      phone = phoneMatch[0].trim();
                      break;
                    }
                  }
                } catch {}
              }
            }

            // Website extraction — multiple strategies
            if (!website) {
              const webSelectors = [
                'a[data-item-id^="authority:"]',
                'a[data-item-id*="authority"]',
                'a[href*="http"]:not([href*="google.com"]):not([href*="maps.google"])',
              ];
              for (const sel of webSelectors) {
                try {
                  const el = detailPanel.locator(sel).first();
                  if (await el.count() > 0) {
                    const href = await el.getAttribute("href");
                    if (href && !href.includes("google.com/maps") && !href.includes("google.com/search")) {
                      website = href;
                      break;
                    }
                  }
                } catch {}
              }
            }

            // Address / Location extraction — multiple strategies
            if (!locationStr) {
              const addrSelectors = [
                'button[data-item-id^="address:"]',
                'button[data-item-id*="address"]',
                '[data-tooltip*="Address"]',
                'div[data-item-id*="address"]',
              ];
              for (const sel of addrSelectors) {
                try {
                  const el = detailPanel.locator(sel).first();
                  if (await el.count() > 0) {
                    const label = await el.getAttribute("aria-label");
                    const text = await el.textContent();
                    locationStr = label || text || "";
                    if (locationStr.trim()) break;
                  }
                } catch {}
              }
            }

            // Fallback: try to get address from the page content
            if (!locationStr) {
              try {
                const allText = await detailPanel.textContent();
                // Look for patterns that look like addresses
                const addrMatch = allText?.match(/\d+\s+[A-Z][a-z]+\s+(St|Ave|Blvd|Rd|Dr|Ln|Way|Ct|Pl|Hwy|Road|Street|Avenue|Boulevard|Drive|Lane|Court|Place|Highway)\b[^,]*,\s*[^,]+,\s*[A-Z]{2}/);
                if (addrMatch) {
                  locationStr = addrMatch[0];
                }
              } catch {}
            }

            // Email — only if website was found
            if (website) {
              try {
                const normalizedUrl = website.startsWith("http")
                  ? website
                  : `https://${website}`;
                email = await extractEmailFromWebsite(browser, normalizedUrl);
              } catch {}
            }
          }
        } catch {}

        // Dedup check
        const dedupKey = `${businessName.toLowerCase().replace(/\s+/g, "")}|${phone}|${website}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        leads.push({
          businessName,
          email: email || "",
          phone: phone || "",
          website: website || "",
          location: locationStr || "",
        });

        console.log(`[Scrape] Lead ${leads.length}: ${businessName}`);
      } catch {
        continue;
      }
    }

    console.log(
      `[Scrape] Query: "${searchQuery}" | Leads collected: ${leads.length}`
    );

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

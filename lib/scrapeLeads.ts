import playwright, { Browser } from "playwright-core";
import chromium from "@sparticuz/chromium";

export interface Lead {
  businessName: string;
  email: string;
  phone: string;
  website: string;
  location: string;
}

async function extractEmailFromWebsite(
  browser: Browser,
  url: string
): Promise<string> {
  let page;
  try {
    page = await browser.newPage();
    await page.goto(url, {
      timeout: 5000,
      waitUntil: "domcontentloaded",
    });
    const content = await page.content();
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = content.match(emailRegex);
    if (matches && matches.length > 0) {
      const filtered = matches.filter(
        (e) =>
          !e.includes("example.com") &&
          !e.includes("sentry.io") &&
          !e.includes("wixpress.com") &&
          !e.includes("schema.org") &&
          !e.endsWith(".png") &&
          !e.endsWith(".jpg")
      );
      return filtered.length > 0 ? filtered[0] : "";
    }
    return "";
  } catch {
    return "";
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {}
    }
  }
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
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
    });

    const page = await context.newPage();

    await page.goto("https://www.google.com/maps", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(2000);

    const searchBox = page.locator('#searchboxinput');
    await searchBox.waitFor({ timeout: 10000 });
    await searchBox.fill(searchQuery);
    await searchBox.press("Enter");

    await page.waitForTimeout(3000);

    await page.waitForSelector('[role="feed"]', { timeout: 15000 });

    // Scroll the results panel to load more listings
    const feed = page.locator('[role="feed"]');
    for (let i = 0; i < 5; i++) {
      await feed.evaluate((el) => el.scrollBy(0, 600));
      await page.waitForTimeout(1000);
    }

    const results = await feed.locator('div[jsaction] > div > div > a[href*="/maps/place/"]').all();

    const leads: Lead[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < Math.min(results.length, 15); i++) {
      try {
        const result = results[i];

        let businessName = "";
        try {
          const ariaLabel = await result.getAttribute("aria-label");
          if (ariaLabel) businessName = ariaLabel;
        } catch {}

        if (!businessName) {
          try {
            const nameEl = result.locator("span").first();
            businessName = (await nameEl.textContent()) || "";
          } catch {}
        }

        businessName = businessName.trim();
        if (!businessName) continue;

        // Click to open detail panel
        await result.click();
        await page.waitForTimeout(2000);

        let phone = "";
        let website = "";
        let locationStr = "";
        let email = "";

        // Extract from detail panel
        try {
          const detailPanel = page.locator('[role="main"]');
          await detailPanel.waitFor({ timeout: 5000 });

          // Phone
          try {
            const phoneEl = detailPanel.locator('button[data-item-id^="phone:tel:"]').first();
            if (await phoneEl.count() > 0) {
              const phoneLabel = await phoneEl.getAttribute("aria-label");
              if (phoneLabel) {
                phone = phoneLabel.replace(/\D/g, "");
                if (phone && !phone.startsWith("+")) {
                  phone = phoneLabel.match(/[\d\s\-+()]+/)?.[0]?.trim() || "";
                } else {
                  phone = phoneLabel.match(/[\d\s\-+()]+/)?.[0]?.trim() || "";
                }
              }
            }
          } catch {}

          // Try alternative phone extraction
          if (!phone) {
            try {
              const phoneButton = detailPanel.locator('button[data-item-id*="phone"]').first();
              if (await phoneButton.count() > 0) {
                const text = await phoneButton.textContent();
                phone = text?.trim() || "";
              }
            } catch {}
          }

          // Website
          try {
            const websiteEl = detailPanel.locator('a[data-item-id^="authority:"]').first();
            if (await websiteEl.count() > 0) {
              website = (await websiteEl.getAttribute("href")) || "";
            }
          } catch {}

          if (!website) {
            try {
              const webButton = detailPanel.locator('a[data-item-id*="authority"]').first();
              if (await webButton.count() > 0) {
                website = (await webButton.getAttribute("href")) || "";
              }
            } catch {}
          }

          // Address / Location
          try {
            const addressEl = detailPanel.locator('button[data-item-id^="address:"]').first();
            if (await addressEl.count() > 0) {
              const addrLabel = await addressEl.getAttribute("aria-label");
              locationStr = addrLabel || (await addressEl.textContent()) || "";
            }
          } catch {}

          if (!locationStr) {
            try {
              const addrButton = detailPanel.locator('button[data-item-id*="address"]').first();
              if (await addrButton.count() > 0) {
                locationStr = (await addrButton.textContent()) || "";
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
        } catch {}

        // Dedup check
        const dedupKey = `${businessName.toLowerCase()}|${phone}|${website}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        leads.push({
          businessName,
          email: email || "",
          phone: phone || "",
          website: website || "",
          location: locationStr || "",
        });
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

export interface ParsedPrompt {
  businessCategory: string;
  location: string;
}

const QUESTION_PREFIXES = /^(where\s+is\s+the\s+|where\s+are\s+the\s+|find\s+me\s+|show\s+me\s+|i\s+need\s+|i'm\s+looking\s+for\s+|looking\s+for\s+|search\s+for\s+)/i;

const LOCATION_SUFFIXES = /\s+(near\s+me|close\s+to\s+me|nearby|around\s+me|in\s+my\s+area)\s*$/i;

const FILLER_WORDS = /\b(the|a|an|some|any|good|best|top|nearest|closest|nearby|around)\b/gi;

export function parsePrompt(prompt: string): ParsedPrompt {
  const trimmed = prompt.trim();

  if (!trimmed) {
    return { businessCategory: "", location: "" };
  }

  // Step 1: Split on "in" if present — handles "coffee shops in New York"
  const inParts = trimmed.split(/\s+in\s+/i);
  if (inParts.length >= 2) {
    const businessCategory = cleanCategory(inParts[0]);
    const location = inParts.slice(1).join(" in ").trim();
    if (businessCategory && location) {
      return { businessCategory, location };
    }
  }

  // Step 2: Try splitting on "near" — handles "cake shops near downtown"
  const nearParts = trimmed.split(/\s+near\s+/i);
  if (nearParts.length >= 2) {
    const businessCategory = cleanCategory(nearParts[0]);
    const location = nearParts.slice(1).join(" near ").trim();
    if (businessCategory && location) {
      return { businessCategory, location };
    }
  }

  // Step 3: Try splitting on "around" — handles "pizza shops around Manhattan"
  const aroundParts = trimmed.split(/\s+around\s+/i);
  if (aroundParts.length >= 2) {
    const businessCategory = cleanCategory(aroundParts[0]);
    const location = aroundParts.slice(1).join(" around ").trim();
    if (businessCategory && location) {
      return { businessCategory, location };
    }
  }

  // Step 4: Strip prefixes and location suffixes, use remainder as category
  let cleaned = trimmed.replace(QUESTION_PREFIXES, "").trim();

  const nearMeMatch = cleaned.match(LOCATION_SUFFIXES);
  let location = "";
  if (nearMeMatch) {
    // "near me" etc. — no specific location, just search the category
    cleaned = cleaned.replace(LOCATION_SUFFIXES, "").trim();
  }

  const businessCategory = cleanCategory(cleaned);

  return { businessCategory, location };
}

function cleanCategory(raw: string): string {
  let cleaned = raw.replace(QUESTION_PREFIXES, "").trim();
  cleaned = cleaned.replace(LOCATION_SUFFIXES, "").trim();
  cleaned = cleaned.replace(FILLER_WORDS, " ").replace(/\s+/g, " ").trim();
  return cleaned;
}

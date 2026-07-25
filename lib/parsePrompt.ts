export interface ParsedPrompt {
  businessCategory: string;
  location: string;
}

export function parsePrompt(prompt: string): ParsedPrompt {
  const trimmed = prompt.trim();

  if (!trimmed) {
    return { businessCategory: "", location: "" };
  }

  const parts = trimmed.split(/\s+in\s+/i);

  if (parts.length >= 2) {
    const businessCategory = parts[0].trim();
    const location = parts.slice(1).join(" in ").trim();
    return { businessCategory, location };
  }

  return { businessCategory: trimmed, location: "" };
}

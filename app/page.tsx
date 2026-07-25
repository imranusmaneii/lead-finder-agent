"use client";

import { useState } from "react";

interface Lead {
  businessName: string;
  email: string;
  phone: string;
  website: string;
  location: string;
}

interface ApiResponse {
  leads: Lead[];
  excelBase64: string;
  filename: string;
  query: string;
  error?: string;
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [excelData, setExcelData] = useState<{
    base64: string;
    filename: string;
  } | null>(null);
  const [query, setQuery] = useState("");

  const handleSearch = async () => {
    if (!prompt.trim()) {
      setError("Please enter a search prompt.");
      return;
    }

    setLoading(true);
    setError("");
    setLeads([]);
    setExcelData(null);
    setQuery("");

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data: ApiResponse = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }

      setLeads(data.leads);
      setExcelData({ base64: data.excelBase64, filename: data.filename });
      setQuery(data.query);

      if (data.leads.length === 0) {
        setError("No leads found for this search. Try a different prompt.");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!excelData) return;

    const byteCharacters = atob(excelData.base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = excelData.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-3">
            Lead Finder Agent
          </h1>
          <p className="text-gray-400 text-lg">
            Find business leads from Google Maps using natural language
          </p>
        </div>

        {/* Search Box */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-8">
          <label
            htmlFor="prompt"
            className="block text-sm font-medium text-gray-300 mb-2"
          >
            Enter your search prompt
          </label>
          <div className="flex gap-3">
            <input
              id="prompt"
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder='e.g. "coffee shops in New York"'
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              disabled={loading}
            />
            <button
              onClick={handleSearch}
              disabled={loading || !prompt.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold px-8 py-3 rounded-lg transition flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Searching...
                </>
              ) : (
                "Find Leads"
              )}
            </button>
          </div>
          {loading && (
            <p className="text-gray-500 text-sm mt-3">
              Scraping Google Maps — this may take 10-40 seconds...
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-lg px-5 py-4 mb-8">
            {error}
          </div>
        )}

        {/* Results */}
        {leads.length > 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {leads.length} leads found
                </h2>
                <p className="text-gray-500 text-sm">Query: {query}</p>
              </div>
              <button
                onClick={handleDownload}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-2.5 rounded-lg transition flex items-center gap-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Download Excel
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800 text-gray-300">
                    <th className="text-left px-6 py-3 font-medium">
                      Business Name
                    </th>
                    <th className="text-left px-6 py-3 font-medium">Email</th>
                    <th className="text-left px-6 py-3 font-medium">Phone</th>
                    <th className="text-left px-6 py-3 font-medium">
                      Website
                    </th>
                    <th className="text-left px-6 py-3 font-medium">
                      Location
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => (
                    <tr
                      key={i}
                      className="border-t border-gray-800 hover:bg-gray-800/50 transition"
                    >
                      <td className="px-6 py-3 text-white font-medium max-w-[200px] truncate">
                        {lead.businessName || (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-400 max-w-[200px] truncate">
                        {lead.email || (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-400">
                        {lead.phone || (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-blue-400 max-w-[250px] truncate">
                        {lead.website ? (
                          <a
                            href={lead.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {lead.website}
                          </a>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-400 max-w-[250px] truncate">
                        {lead.location || (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

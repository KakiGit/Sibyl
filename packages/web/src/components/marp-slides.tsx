import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Presentation, Loader2, FileText, CheckCircle, XCircle, Copy, Download, Sparkles, BookOpen, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface WikiPage {
  id: string;
  slug: string;
  title: string;
  type: "entity" | "concept" | "source" | "summary";
  summary?: string;
  tags: string[];
}

interface MarpResult {
  marpContent: string;
  slides: string[];
  theme: string;
  sourcePages: Array<{
    id: string;
    slug: string;
    title: string;
    type: string;
  }>;
  title?: string;
}

interface MarpGenerationOptions {
  pageSlugs?: string[];
  query?: string;
  title?: string;
  theme?: "default" | "gaia" | "uncover";
  paginate?: boolean;
  useLlm?: boolean;
  maxPages?: number;
}

async function generateMarpSlides(options: MarpGenerationOptions): Promise<{ data: MarpResult }> {
  const response = await fetch("/api/marp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to generate slides");
  }
  return response.json();
}

async function fetchWikiPages(): Promise<{ data: WikiPage[] }> {
  const response = await fetch("/api/wiki-pages?limit=50");
  if (!response.ok) throw new Error("Failed to fetch wiki pages");
  return response.json();
}

const THEME_CONFIG = {
  default: { label: "Default", color: "bg-gray-100 text-gray-800" },
  gaia: { label: "Gaia", color: "bg-blue-100 text-blue-800" },
  uncover: { label: "Uncover", color: "bg-purple-100 text-purple-800" },
} as const;

const PAGE_TYPE_CONFIG = {
  entity: { label: "Entity", color: "bg-blue-100 text-blue-800" },
  concept: { label: "Concept", color: "bg-purple-100 text-purple-800" },
  source: { label: "Source", color: "bg-green-100 text-green-800" },
  summary: { label: "Summary", color: "bg-orange-100 text-orange-800" },
} as const;

function SlidePreview({ slides }: { slides: string[] }) {
  return (
    <div className="space-y-4">
      {slides.map((slide, index) => (
        <Card key={index}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline">Slide {index + 1}</Badge>
            </div>
            <div className="bg-muted rounded-lg p-4 whitespace-pre-wrap font-mono text-sm overflow-auto max-h-64">
              {slide}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SourcePageList({ pages }: { pages: Array<{ id: string; slug: string; title: string; type: string }> }) {
  if (pages.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">Source Pages:</p>
      <div className="flex gap-2 flex-wrap">
        {pages.map((page) => {
          const config = PAGE_TYPE_CONFIG[page.type as keyof typeof PAGE_TYPE_CONFIG] || PAGE_TYPE_CONFIG.concept;
          return (
            <Badge key={page.id} className={config.color}>
              <BookOpen className="h-3 w-3 mr-1" />
              {page.title}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}

export function MarpSlides() {
  const [mode, setMode] = useState<"select" | "query">("select");
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState<"default" | "gaia" | "uncover">("default");
  const [paginate, setPaginate] = useState(true);
  const [useLlm, setUseLlm] = useState(false);
  const [maxPages, setMaxPages] = useState(10);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  const { data: pagesData, isLoading: pagesLoading } = useQuery({
    queryKey: ["wikiPages"],
    queryFn: fetchWikiPages,
  });

  const generateMutation = useMutation({
    mutationFn: generateMarpSlides,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wikiPages"] });
    },
  });

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setCopied(false);

    if (mode === "select" && selectedSlugs.length > 0) {
      generateMutation.mutate({
        pageSlugs: selectedSlugs,
        title: title.trim() || undefined,
        theme,
        paginate,
        useLlm,
        maxPages,
      });
    } else if (mode === "query" && query.trim()) {
      generateMutation.mutate({
        query: query.trim(),
        title: title.trim() || undefined,
        theme,
        paginate,
        useLlm,
        maxPages,
      });
    }
  };

  const handleClear = () => {
    setSelectedSlugs([]);
    setQuery("");
    setTitle("");
    setTheme("default");
    setPaginate(true);
    setUseLlm(false);
    setMaxPages(10);
    setCopied(false);
    generateMutation.reset();
  };

  const handleCopy = async () => {
    if (generateMutation.data?.data?.marpContent) {
      await navigator.clipboard.writeText(generateMutation.data.data.marpContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (generateMutation.data?.data?.marpContent) {
      const blob = new Blob([generateMutation.data.data.marpContent], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "presentation"}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const togglePageSelection = (slug: string) => {
    setSelectedSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  const pages = pagesData?.data || [];
  const result = generateMutation.data?.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Presentation className="h-5 w-5" />
            Marp Slide Generation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
            <button
              type="button"
              onClick={() => setMode("select")}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${mode === "select" ? "bg-background text-foreground shadow" : ""}`}
            >
              Select Pages
            </button>
            <button
              type="button"
              onClick={() => setMode("query")}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${mode === "query" ? "bg-background text-foreground shadow" : ""}`}
            >
              Search Query
            </button>
          </div>

          <form onSubmit={handleGenerate} className="space-y-4">
            {mode === "select" && (
              <div>
                <label className="text-sm font-medium mb-2 block">Select Wiki Pages</label>
                {pagesLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                    ))}
                  </div>
                ) : pages.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 text-center">
                      <p className="text-muted-foreground">No wiki pages available. Create some pages first.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 max-h-64 overflow-auto p-2 border rounded-lg">
                    {pages.map((page) => {
                      const config = PAGE_TYPE_CONFIG[page.type];
                      const isSelected = selectedSlugs.includes(page.slug);
                      return (
                        <button
                          key={page.id}
                          type="button"
                          onClick={() => togglePageSelection(page.slug)}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            isSelected
                              ? "border-primary bg-primary/10"
                              : "border-muted hover:border-primary/50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm truncate">{page.title}</span>
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <Badge className={config.color}>
                              {config.label}
                            </Badge>
                            {isSelected && (
                              <Badge variant="default" className="ml-auto">
                                Selected
                              </Badge>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedSlugs.length > 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {selectedSlugs.length} pages selected
                  </p>
                )}
              </div>
            )}

            {mode === "query" && (
              <div>
                <label className="text-sm font-medium mb-2 block">Search Query</label>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter search query to find relevant pages..."
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={generateMutation.isPending}
                />
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium mb-2 block" htmlFor="presentation-title">Presentation Title</label>
                <input
                  id="presentation-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Optional title for the presentation"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={generateMutation.isPending}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block" htmlFor="theme-select">Theme</label>
                <select
                  id="theme-select"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as typeof theme)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={generateMutation.isPending}
                >
                  <option value="default">Default</option>
                  <option value="gaia">Gaia</option>
                  <option value="uncover">Uncover</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium mb-2 block" htmlFor="max-pages-select">Max Pages to Include</label>
                <select
                  id="max-pages-select"
                  value={maxPages}
                  onChange={(e) => setMaxPages(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={generateMutation.isPending}
                >
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={20}>20</option>
                </select>
              </div>
              <div className="flex items-center gap-4 pt-6">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="paginate"
                    checked={paginate}
                    onChange={(e) => setPaginate(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                    disabled={generateMutation.isPending}
                  />
                  <label htmlFor="paginate" className="text-sm cursor-pointer">
                    Show slide numbers
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <input
                type="checkbox"
                id="useLlm"
                checked={useLlm}
                onChange={(e) => setUseLlm(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
                disabled={generateMutation.isPending}
              />
              <label htmlFor="useLlm" className="text-sm cursor-pointer flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Use LLM enhancement (requires LLM configuration)
              </label>
            </div>

            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={
                  generateMutation.isPending ||
                  (mode === "select" && selectedSlugs.length === 0) ||
                  (mode === "query" && !query.trim())
                }
              >
                {generateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Presentation className="h-4 w-4" />
                )}
                <span className="ml-2">Generate Slides</span>
              </Button>
              <Button type="button" variant="outline" onClick={handleClear} disabled={generateMutation.isPending}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>

            {generateMutation.error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
                <XCircle className="h-4 w-4 text-red-600" />
                <p className="text-sm text-red-600">{(generateMutation.error as Error).message}</p>
              </div>
            )}
          </form>

          {!generateMutation.isPending && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <p className="text-sm text-green-600">
                  Generated {result.slides.length} slides from {result.sourcePages.length} pages!
                </p>
              </div>

              <div className="flex items-center gap-4">
                <Badge className={THEME_CONFIG[result.theme as keyof typeof THEME_CONFIG].color}>
                  Theme: {THEME_CONFIG[result.theme as keyof typeof THEME_CONFIG].label}
                </Badge>
                {result.title && (
                  <Badge variant="outline">
                    <FileText className="h-3 w-3 mr-1" />
                    {result.title}
                  </Badge>
                )}
              </div>

              <SourcePageList pages={result.sourcePages} />

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleCopy}>
                  {copied ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span className="ml-2">{copied ? "Copied!" : "Copy Markdown"}</span>
                </Button>
                <Button variant="outline" onClick={handleDownload}>
                  <Download className="h-4 w-4" />
                  <span className="ml-2">Download .md</span>
                </Button>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Full Marp Content</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted rounded-lg p-4 whitespace-pre-wrap font-mono text-sm overflow-auto max-h-96">
                    {result.marpContent}
                  </div>
                </CardContent>
              </Card>

              <SlidePreview slides={result.slides} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
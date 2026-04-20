import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, RefreshCw, BookOpen, XCircle, CheckCircle, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/components/toast";

interface SearchResult {
  page: {
    id: string;
    slug: string;
    title: string;
    type: "entity" | "concept" | "source" | "summary";
    summary?: string;
    tags: string[];
    updatedAt: number;
  };
  keywordScore: number;
  semanticScore: number;
  combinedScore: number;
  matchType: "keyword" | "semantic" | "hybrid";
}

interface SearchResponse {
  data: SearchResult[];
}

async function searchWiki(options: {
  query: string;
  type?: "entity" | "concept" | "source" | "summary";
  tags?: string[];
  useSemantic?: boolean;
  semanticThreshold?: number;
  limit?: number;
}): Promise<SearchResponse> {
  const response = await fetch(`/api/wiki-pages/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: options.query,
      type: options.type,
      tags: options.tags?.join(","),
      useSemantic: options.useSemantic ?? true,
      semanticThreshold: options.semanticThreshold ?? 0.3,
      limit: options.limit ?? 10,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to search");
  }
  return response.json();
}

async function rebuildSearchIndex(): Promise<{ data: { indexed: number } }> {
  const response = await fetch("/api/wiki-pages/search/rebuild-index", {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Failed to rebuild search index");
  }
  return response.json();
}

const PAGE_TYPE_CONFIG = {
  entity: { label: "Entity", color: "bg-blue-100 text-blue-800" },
  concept: { label: "Concept", color: "bg-purple-100 text-purple-800" },
  source: { label: "Source", color: "bg-green-100 text-green-800" },
  summary: { label: "Summary", color: "bg-orange-100 text-orange-800" },
} as const;

const MATCH_TYPE_CONFIG = {
  keyword: { label: "Keyword", color: "bg-gray-100 text-gray-800" },
  semantic: { label: "Semantic", color: "bg-cyan-100 text-cyan-800" },
  hybrid: { label: "Hybrid", color: "bg-indigo-100 text-indigo-800" },
} as const;

function ScoreBar({ score, label }: { score: number; label: string }) {
  const percentage = Math.min(Math.max(score * 100, 0), 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-20">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs font-mono w-8">{score.toFixed(2)}</span>
    </div>
  );
}

function ResultCard({ result }: { result: SearchResult }) {
  const pageTypeConfig = PAGE_TYPE_CONFIG[result.page.type];
  const matchTypeConfig = MATCH_TYPE_CONFIG[result.matchType];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium">{result.page.title}</p>
              <p className="text-xs text-muted-foreground">{result.page.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={matchTypeConfig.color}>{matchTypeConfig.label}</Badge>
            <Badge className={pageTypeConfig.color}>{pageTypeConfig.label}</Badge>
          </div>
        </div>

        {result.page.summary && (
          <p className="text-sm text-muted-foreground mb-3">{result.page.summary}</p>
        )}

        {result.page.tags.length > 0 && (
          <div className="flex gap-1 mb-3">
            {result.page.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="space-y-1">
          <ScoreBar score={result.keywordScore / 100} label="Keyword" />
          <ScoreBar score={result.semanticScore} label="Semantic" />
          <ScoreBar score={result.combinedScore} label="Combined" />
        </div>
      </CardContent>
    </Card>
  );
}

export function WikiSearch() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"entity" | "concept" | "source" | "summary" | "">("");
  const [tags, setTags] = useState("");
  const [useSemantic, setUseSemantic] = useState(true);
  const [limit, setLimit] = useState(10);
  const [autoSearch, setAutoSearch] = useState(true);
  const queryClient = useQueryClient();
  const toast = useToast();

  const debouncedQuery = useDebounce(query, 300);
  const debouncedTags = useDebounce(tags, 300);

  const autoSearchQuery = useQuery({
    queryKey: ["wikiAutoSearch", debouncedQuery, type, debouncedTags, useSemantic, limit],
    queryFn: async ({ signal }) => {
      if (!debouncedQuery.trim() || debouncedQuery.length < 2) return { data: [] };
      
      const tagArray = debouncedTags.trim()
        ? debouncedTags.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined;

      const response = await fetch(`/api/wiki-pages/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: debouncedQuery.trim(),
          type: type || undefined,
          tags: tagArray?.join(","),
          useSemantic,
          semanticThreshold: 0.3,
          limit,
        }),
        signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to search");
      }
      return response.json();
    },
    enabled: autoSearch && debouncedQuery.trim().length >= 2,
    retry: 1,
    staleTime: 30000,
  });

  const manualSearchMutation = useMutation({
    mutationFn: searchWiki,
    onSuccess: (data) => {
      queryClient.setQueryData(["wikiManualSearch"], data);
    },
    onError: (error) => {
      toast.error("Search failed", (error as Error).message);
    },
  });

  const rebuildMutation = useMutation({
    mutationFn: rebuildSearchIndex,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["wikiPages"] });
      toast.success("Index rebuilt", `Indexed ${data.data.indexed} pages`);
    },
    onError: (error) => {
      toast.error("Failed to rebuild index", (error as Error).message);
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const tagArray = tags.trim()
      ? tags.split(",").map((t) => t.trim()).filter(Boolean)
      : undefined;

    manualSearchMutation.mutate({
      query: query.trim(),
      type: type || undefined,
      tags: tagArray,
      useSemantic,
      limit,
    });
  };

  const handleClear = () => {
    setQuery("");
    setType("");
    setTags("");
    setUseSemantic(true);
    setLimit(10);
    manualSearchMutation.reset();
    queryClient.removeQueries({ queryKey: ["wikiAutoSearch"] });
  };

  const handleRebuild = () => {
    rebuildMutation.mutate();
  };

  const autoSearchResults = autoSearchQuery.data?.data || [];
  const manualSearchResults = manualSearchMutation.data?.data || [];
  
  const results = manualSearchMutation.data ? manualSearchResults : autoSearchResults;
  const isAutoSearching = autoSearchQuery.isLoading && !manualSearchMutation.data;
  const isManualSearching = manualSearchMutation.isPending;
  const isPending = isAutoSearching || isManualSearching || rebuildMutation.isPending;
  
  const searchError = manualSearchMutation.data ? null : (autoSearch ? autoSearchQuery.error : manualSearchMutation.error);
  const showAutoSearchIndicator = autoSearch && debouncedQuery !== query && query.length >= 2 && !manualSearchMutation.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5" />
            Wiki Search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium mb-2 block" htmlFor="search-query">Search Query</label>
                <input
                  id="search-query"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter search query..."
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isPending}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block" htmlFor="search-type">Filter by Type</label>
                <select
                  id="search-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as typeof type)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isPending}
                >
                  <option value="">All Types</option>
                  <option value="concept">Concept</option>
                  <option value="entity">Entity</option>
                  <option value="source">Source</option>
                  <option value="summary">Summary</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium mb-2 block" htmlFor="search-tags">Tags (comma-separated)</label>
                <input
                  id="search-tags"
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="ai, machine-learning..."
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isPending}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block" htmlFor="search-limit">Result Limit</label>
                <input
                  id="search-limit"
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value) || 10)}
                  min={1}
                  max={50}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoSearch"
                  checked={autoSearch}
                  onChange={(e) => setAutoSearch(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                  disabled={isPending}
                />
                <label htmlFor="autoSearch" className="text-sm cursor-pointer flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Auto-search (type 2+ chars)
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useSemantic"
                  checked={useSemantic}
                  onChange={(e) => setUseSemantic(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                  disabled={isPending}
                />
                <label htmlFor="useSemantic" className="text-sm cursor-pointer">
                  Semantic Search
                </label>
              </div>
            </div>

            {showAutoSearchIndicator && (
              <div className="flex items-center gap-2 p-2 bg-blue-50 rounded text-sm text-blue-600">
                <Loader2 className="h-3 w-3 animate-spin" />
                Searching...
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={isPending || !query.trim()}>
                {isManualSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="ml-2">Search</span>
              </Button>
              <Button type="button" variant="outline" onClick={handleClear} disabled={isPending}>
                <XCircle className="h-4 w-4 mr-2" />
                Clear
              </Button>
              <Button type="button" variant="outline" onClick={handleRebuild} disabled={rebuildMutation.isPending}>
                {rebuildMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">Rebuild Index</span>
              </Button>
            </div>

            {searchError && !autoSearch && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
                <XCircle className="h-4 w-4 text-red-600" />
                <p className="text-sm text-red-600">
                  {(searchError as Error).message}
                </p>
              </div>
            )}
          </form>

          {!isPending && rebuildMutation.isSuccess && (
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <p className="text-sm text-green-600">
                Search index rebuilt! Indexed {rebuildMutation.data.data.indexed} pages.
              </p>
            </div>
          )}

          {!isPending && results.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Found {results.length} results for "{autoSearch ? debouncedQuery : query}"
              </p>
              {results.map((result: SearchResult) => (
                <ResultCard key={result.page.id} result={result} />
              ))}
            </div>
          )}

          {!isPending && (autoSearchQuery.data || manualSearchMutation.data) && results.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-muted-foreground">No results found for this query.</p>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
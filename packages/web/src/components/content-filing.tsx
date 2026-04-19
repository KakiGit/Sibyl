import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, Loader2, FileText, CheckCircle, XCircle, History, Link2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface FilingResult {
  wikiPageId: string;
  slug: string;
  title: string;
  type: "entity" | "concept" | "source" | "summary";
  linkedPages: string[];
  filedAt: number;
}

interface FilingHistoryEntry {
  wikiPageId: string;
  title: string;
  slug: string;
  filedAt: number;
}

async function fileContent(options: {
  title: string;
  content: string;
  type?: "entity" | "concept" | "source" | "summary";
  tags?: string[];
  summary?: string;
}): Promise<{ data: FilingResult }> {
  const response = await fetch("/api/filing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to file content");
  }
  return response.json();
}

async function fileQueryResult(options: {
  query: string;
  title?: string;
  filingTags?: string[];
  types?: ("entity" | "concept" | "source" | "summary")[];
  maxPages?: number;
}): Promise<{ data: FilingResult }> {
  const response = await fetch("/api/filing/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to file query result");
  }
  return response.json();
}

async function fetchFilingHistory(limit: number = 10): Promise<{ data: FilingHistoryEntry[] }> {
  const response = await fetch(`/api/filing/history?limit=${limit}`);
  if (!response.ok) throw new Error("Failed to fetch filing history");
  return response.json();
}

const PAGE_TYPE_CONFIG = {
  entity: { label: "Entity", color: "bg-blue-100 text-blue-800" },
  concept: { label: "Concept", color: "bg-purple-100 text-purple-800" },
  source: { label: "Source", color: "bg-green-100 text-green-800" },
  summary: { label: "Summary", color: "bg-orange-100 text-orange-800" },
} as const;

function FilingResultDisplay({ result }: { result: FilingResult }) {
  const config = PAGE_TYPE_CONFIG[result.type];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium">{result.title}</p>
              <p className="text-xs text-muted-foreground">{result.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={config.color}>{config.label}</Badge>
            {result.linkedPages.length > 0 && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Link2 className="h-3 w-3" />
                {result.linkedPages.length}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FilingHistoryDisplay() {
  const { data, isLoading } = useQuery({
    queryKey: ["filingHistory"],
    queryFn: () => fetchFilingHistory(10),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  const history = data?.data || [];

  if (history.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <History className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No filing history yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {history.map((entry) => (
        <Card key={entry.wikiPageId}>
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileDown className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">{entry.title}</p>
                <p className="text-xs text-muted-foreground">{entry.slug}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(entry.filedAt).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ContentFiling() {
  const [mode, setMode] = useState<"content" | "query">("content");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [summary, setSummary] = useState("");
  const [type, setType] = useState<"entity" | "concept" | "source" | "summary">("summary");
  const [tags, setTags] = useState("");
  const [query, setQuery] = useState("");
  const [queryTitle, setQueryTitle] = useState("");
  const [queryTags, setQueryTags] = useState("");
  const [maxPages, setMaxPages] = useState(5);
  const [result, setResult] = useState<FilingResult | null>(null);
  const queryClient = useQueryClient();

  const fileContentMutation = useMutation({
    mutationFn: fileContent,
    onSuccess: (data) => {
      setResult(data.data);
      queryClient.invalidateQueries({ queryKey: ["filingHistory"] });
      queryClient.invalidateQueries({ queryKey: ["wikiPages"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const fileQueryMutation = useMutation({
    mutationFn: fileQueryResult,
    onSuccess: (data) => {
      setResult(data.data);
      queryClient.invalidateQueries({ queryKey: ["filingHistory"] });
      queryClient.invalidateQueries({ queryKey: ["wikiPages"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const handleFileContent = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && content.trim()) {
      fileContentMutation.mutate({
        title: title.trim(),
        content: content.trim(),
        type,
        tags: tags.trim() ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        summary: summary.trim() || undefined,
      });
    }
  };

  const handleFileQuery = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      fileQueryMutation.mutate({
        query: query.trim(),
        title: queryTitle.trim() || undefined,
        filingTags: queryTags.trim() ? queryTags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        maxPages,
      });
    }
  };

  const handleClear = () => {
    setTitle("");
    setContent("");
    setSummary("");
    setType("summary");
    setTags("");
    setQuery("");
    setQueryTitle("");
    setQueryTags("");
    setMaxPages(5);
    setResult(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            Content Filing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
            <button
              type="button"
              onClick={() => setMode("content")}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${mode === "content" ? "bg-background text-foreground shadow" : ""}`}
            >
              File Content
            </button>
            <button
              type="button"
              onClick={() => setMode("query")}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${mode === "query" ? "bg-background text-foreground shadow" : ""}`}
            >
              File Query Result
            </button>
          </div>

          {mode === "content" && (
            <form onSubmit={handleFileContent} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium mb-2 block">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Wiki page title"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={fileContentMutation.isPending}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as typeof type)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={fileContentMutation.isPending}
                  >
                    <option value="summary">Summary</option>
                    <option value="concept">Concept</option>
                    <option value="entity">Entity</option>
                    <option value="source">Source</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Content</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Enter the content to file into the wiki..."
                  rows={6}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  disabled={fileContentMutation.isPending}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium mb-2 block">Summary (optional)</label>
                  <input
                    type="text"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Brief summary of the content"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={fileContentMutation.isPending}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="research, analysis, important"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={fileContentMutation.isPending}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button type="submit" disabled={fileContentMutation.isPending || !title.trim() || !content.trim()}>
                  {fileContentMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  <span className="ml-2">File Content</span>
                </Button>
                <Button type="button" variant="outline" onClick={handleClear} disabled={fileContentMutation.isPending}>
                  Clear
                </Button>
              </div>

              {fileContentMutation.error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <p className="text-sm text-red-600">{(fileContentMutation.error as Error).message}</p>
                </div>
              )}
            </form>
          )}

          {mode === "query" && (
            <form onSubmit={handleFileQuery} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Query</label>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search query to find wiki pages..."
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={fileQueryMutation.isPending}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium mb-2 block">Title (optional)</label>
                  <input
                    type="text"
                    value={queryTitle}
                    onChange={(e) => setQueryTitle(e.target.value)}
                    placeholder="Custom title for filed result"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={fileQueryMutation.isPending}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={queryTags}
                    onChange={(e) => setQueryTags(e.target.value)}
                    placeholder="research, summary"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={fileQueryMutation.isPending}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Max Pages</label>
                  <select
                    value={maxPages}
                    onChange={(e) => setMaxPages(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={fileQueryMutation.isPending}
                  >
                    <option value={3}>3</option>
                    <option value={5}>5</option>
                    <option value={7}>7</option>
                    <option value={10}>10</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <Button type="submit" disabled={fileQueryMutation.isPending || !query.trim()}>
                  {fileQueryMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  <span className="ml-2">File Query Result</span>
                </Button>
                <Button type="button" variant="outline" onClick={handleClear} disabled={fileQueryMutation.isPending}>
                  Clear
                </Button>
              </div>

              {fileQueryMutation.error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <p className="text-sm text-red-600">{(fileQueryMutation.error as Error).message}</p>
                </div>
              )}
            </form>
          )}

          {!fileContentMutation.isPending && !fileQueryMutation.isPending && result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <p className="text-sm text-green-600">Content filed successfully!</p>
              </div>
              <FilingResultDisplay result={result} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            Filing History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FilingHistoryDisplay />
        </CardContent>
      </Card>
    </div>
  );
}
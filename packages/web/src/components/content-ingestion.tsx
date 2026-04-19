import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, FileText, CheckCircle, XCircle, Sparkles, Link } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface IngestStatus {
  unprocessed: number;
  processed: number;
  total: number;
}

interface IngestResult {
  rawResourceId: string;
  wikiPageId: string;
  slug: string;
  title: string;
  type: "entity" | "concept" | "source" | "summary";
  processed: boolean;
  crossReferences?: string[];
  llmGenerated?: boolean;
}

async function fetchIngestStatus(): Promise<{ data: IngestStatus }> {
  const response = await fetch("/api/ingest/status");
  if (!response.ok) throw new Error("Failed to fetch status");
  return response.json();
}

async function ingestTextContent(options: {
  filename: string;
  content: string;
  title?: string;
  type?: "entity" | "concept" | "source" | "summary";
  tags?: string[];
}): Promise<{ data: IngestResult }> {
  const response = await fetch("/api/ingest/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to ingest content");
  }
  return response.json();
}

async function ingestWithLlm(options: {
  filename: string;
  content: string;
  title?: string;
  type?: "entity" | "concept" | "source" | "summary";
  tags?: string[];
}): Promise<{ data: IngestResult }> {
  const response = await fetch("/api/ingest/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to ingest with LLM");
  }
  return response.json();
}

async function batchIngest(): Promise<{ data: { processed: IngestResult[]; failed: { rawResourceId: string; error: string }[]; total: number } }> {
  const response = await fetch("/api/ingest/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to batch ingest");
  }
  return response.json();
}

const PAGE_TYPE_CONFIG = {
  entity: { label: "Entity", color: "bg-blue-100 text-blue-800" },
  concept: { label: "Concept", color: "bg-purple-100 text-purple-800" },
  source: { label: "Source", color: "bg-green-100 text-green-800" },
  summary: { label: "Summary", color: "bg-orange-100 text-orange-800" },
} as const;

function IngestStatusDisplay() {
  const { data, isLoading } = useQuery({
    queryKey: ["ingestStatus"],
    queryFn: fetchIngestStatus,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  const status = data?.data || { unprocessed: 0, processed: 0, total: 0 };

  return (
    <div className="grid grid-cols-3 gap-4 text-center">
      <div className="p-3 bg-muted rounded-lg">
        <div className="text-2xl font-bold">{status.total}</div>
        <div className="text-xs text-muted-foreground">Total</div>
      </div>
      <div className="p-3 bg-green-50 rounded-lg">
        <div className="text-2xl font-bold text-green-700">{status.processed}</div>
        <div className="text-xs text-muted-foreground">Processed</div>
      </div>
      <div className="p-3 bg-orange-50 rounded-lg">
        <div className="text-2xl font-bold text-orange-700">{status.unprocessed}</div>
        <div className="text-xs text-muted-foreground">Pending</div>
      </div>
    </div>
  );
}

export function ContentIngestion() {
  const [filename, setFilename] = useState("");
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"entity" | "concept" | "source" | "summary">("concept");
  const [tags, setTags] = useState("");
  const [useLlm, setUseLlm] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const queryClient = useQueryClient();

  const ingestMutation = useMutation({
    mutationFn: ingestTextContent,
    onSuccess: (data) => {
      setResult(data.data);
      queryClient.invalidateQueries({ queryKey: ["ingestStatus"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["wikiPages"] });
    },
  });

  const llmIngestMutation = useMutation({
    mutationFn: ingestWithLlm,
    onSuccess: (data) => {
      setResult(data.data);
      queryClient.invalidateQueries({ queryKey: ["ingestStatus"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["wikiPages"] });
      queryClient.invalidateQueries({ queryKey: ["wikiLinks"] });
    },
  });

  const batchMutation = useMutation({
    mutationFn: batchIngest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingestStatus"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["wikiPages"] });
    },
  });

  const isPending = ingestMutation.isPending || llmIngestMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (filename.trim() && content.trim()) {
      const options = {
        filename: filename.trim(),
        content: content.trim(),
        title: title.trim() || undefined,
        type,
        tags: tags.trim() ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      };
      if (useLlm) {
        llmIngestMutation.mutate(options);
      } else {
        ingestMutation.mutate(options);
      }
    }
  };

  const handleBatchIngest = () => {
    batchMutation.mutate();
  };

  const handleClear = () => {
    setFilename("");
    setContent("");
    setTitle("");
    setType("concept");
    setTags("");
    setUseLlm(false);
    setResult(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Content Ingestion
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <IngestStatusDisplay />

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium mb-2 block">Filename</label>
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder="document-name.txt"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isPending}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Title (optional)</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Custom title for wiki page"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isPending}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Content</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter the content to be ingested into the wiki..."
                rows={6}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                disabled={isPending}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium mb-2 block">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as typeof type)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isPending}
                >
                  <option value="concept">Concept</option>
                  <option value="entity">Entity</option>
                  <option value="source">Source</option>
                  <option value="summary">Summary</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="ai, machine-learning, tutorial"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg">
              <input
                type="checkbox"
                id="useLlm"
                checked={useLlm}
                onChange={(e) => setUseLlm(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
                disabled={isPending}
              />
              <Sparkles className="h-4 w-4 text-purple-600" />
              <label htmlFor="useLlm" className="text-sm text-purple-800 cursor-pointer">
                Use LLM enhancement - generates structured content, summaries, and cross-references
              </label>
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={isPending || !filename.trim() || !content.trim()}>
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : useLlm ? (
                  <Sparkles className="h-4 w-4" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span className="ml-2">{useLlm ? "Ingest with LLM" : "Ingest"}</span>
              </Button>
              <Button type="button" variant="outline" onClick={handleClear} disabled={isPending}>
                Clear
              </Button>
            </div>

            {(ingestMutation.error || llmIngestMutation.error) && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
                <XCircle className="h-4 w-4 text-red-600" />
                <p className="text-sm text-red-600">{((ingestMutation.error || llmIngestMutation.error) as Error).message}</p>
              </div>
            )}
          </form>

          {!isPending && result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <p className="text-sm text-green-600">
                  {result.llmGenerated ? "Content ingested with LLM enhancement!" : "Content ingested successfully!"}
                </p>
              </div>

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
                      {result.llmGenerated && (
                        <Badge className="bg-purple-100 text-purple-800">
                          <Sparkles className="h-3 w-3 mr-1" />
                          LLM
                        </Badge>
                      )}
                      <Badge className={PAGE_TYPE_CONFIG[result.type].color}>
                        {PAGE_TYPE_CONFIG[result.type].label}
                      </Badge>
                    </div>
                  </div>
                  {result.crossReferences && result.crossReferences.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Link className="h-4 w-4" />
                        <span>Cross-references:</span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        {result.crossReferences.map((ref) => (
                          <Badge key={ref} className="bg-gray-100 text-gray-700">
                            [[{ref}]]
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Batch Processing</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Process all pending raw resources in batch. This will attempt to ingest all unprocessed documents.
          </p>
          <Button onClick={handleBatchIngest} disabled={batchMutation.isPending}>
            {batchMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            <span className="ml-2">Process All Pending</span>
          </Button>

          {batchMutation.error && (
            <p className="text-sm text-red-600 mt-3">{(batchMutation.error as Error).message}</p>
          )}

          {batchMutation.data && (
            <div className="mt-4 space-y-3">
              <p className="text-sm">
                Processed: {batchMutation.data.data.processed.length} / {batchMutation.data.data.total}
              </p>
              {batchMutation.data.data.failed.length > 0 && (
                <div className="text-sm text-orange-600">
                  {batchMutation.data.data.failed.length} resources failed to process
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
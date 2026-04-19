import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Search, Loader2, BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Citation {
  pageSlug: string;
  pageTitle: string;
  pageType: "entity" | "concept" | "source" | "summary";
  relevanceScore: number;
}

interface SynthesizeResult {
  query: string;
  answer: string;
  citations: Citation[];
  synthesizedAt: number;
  model?: string;
}

async function synthesizeQuery(query: string): Promise<{ data: SynthesizeResult }> {
  const response = await fetch("/api/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to synthesize query");
  }
  return response.json();
}

const PAGE_TYPE_CONFIG = {
  entity: { label: "Entity", color: "bg-blue-100 text-blue-800" },
  concept: { label: "Concept", color: "bg-purple-100 text-purple-800" },
  source: { label: "Source", color: "bg-green-100 text-green-800" },
  summary: { label: "Summary", color: "bg-orange-100 text-orange-800" },
} as const;

function CitationCard({ citation }: { citation: Citation }) {
  const config = PAGE_TYPE_CONFIG[citation.pageType];

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <BookOpen className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="font-medium text-sm">{citation.pageTitle}</p>
          <p className="text-xs text-muted-foreground">{citation.pageSlug}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge className={config.color}>{config.label}</Badge>
        <span className="text-xs text-muted-foreground">
          Score: {citation.relevanceScore}
        </span>
      </div>
    </div>
  );
}

function AnswerDisplay({ result }: { result: SynthesizeResult }) {
  const [activeTab, setActiveTab] = useState<"answer" | "citations">("answer");
  const processedAnswer = result.answer.replace(
    /\[\[([^\]]+)\]\]/g,
    '<a href="#" class="text-blue-600 hover:underline font-medium">[[<span class="underline">$1</span>]]</a>'
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-primary" />
          <span className="font-semibold">{result.query}</span>
        </div>
        {result.model && (
          <Badge variant="outline">Model: {result.model}</Badge>
        )}
      </div>

      <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
        <button
          type="button"
          onClick={() => setActiveTab("answer")}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${activeTab === "answer" ? "bg-background text-foreground shadow" : ""}`}
        >
          Answer
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("citations")}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${activeTab === "citations" ? "bg-background text-foreground shadow" : ""}`}
        >
          Citations ({result.citations.length})
        </button>
      </div>

      {activeTab === "answer" && (
        <Card>
          <CardContent className="p-6">
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: processedAnswer }}
            />
          </CardContent>
        </Card>
      )}

      {activeTab === "citations" && (
        <div className="space-y-3">
          {result.citations.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-muted-foreground">No citations available</p>
              </CardContent>
            </Card>
          ) : (
            result.citations.map((citation) => (
              <CitationCard key={citation.pageSlug} citation={citation} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function QuerySynthesis() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SynthesizeResult | null>(null);

  const mutation = useMutation({
    mutationFn: synthesizeQuery,
    onSuccess: (data) => {
      setResult(data.data);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      mutation.mutate(query.trim());
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5" />
            Query Synthesis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question about your wiki..."
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={mutation.isPending}
            />
            <Button type="submit" disabled={mutation.isPending || !query.trim()}>
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="ml-2">Synthesize</span>
            </Button>
          </form>
          {mutation.error && (
            <p className="text-sm text-red-600 mt-3">
              {(mutation.error as Error).message}
            </p>
          )}
        </CardContent>
      </Card>

      {mutation.isPending && (
        <Card>
          <CardContent className="p-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground mt-3">
              Synthesizing answer from wiki pages...
            </p>
          </CardContent>
        </Card>
      )}

      {!mutation.isPending && result && <AnswerDisplay result={result} />}
    </div>
  );
}
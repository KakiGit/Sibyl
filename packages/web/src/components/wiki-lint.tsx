import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle, Loader2, RefreshCw, Link2Off, Clock, FileWarning, GitMerge, AlertCircle, Brain, Lightbulb, BookOpen, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface LintIssue {
  type: "orphan" | "missing_page" | "stale" | "missing_reference" | "potential_conflict";
  severity: "high" | "medium" | "low";
  pageId?: string;
  pageSlug?: string;
  pageTitle?: string;
  details: string;
  suggestedAction?: string;
}

interface WikiPage {
  id: string;
  slug: string;
  title: string;
  type: "entity" | "concept" | "source" | "summary";
  updatedAt: number;
}

interface MissingRef {
  fromPage: WikiPage;
  referencedSlug: string;
}

interface Conflict {
  page1: WikiPage;
  page2: WikiPage;
  reason: string;
}

interface LintReport {
  totalPages: number;
  totalPagesWithIssues: number;
  issues: LintIssue[];
  orphanPages: WikiPage[];
  stalePages: WikiPage[];
  missingReferences: MissingRef[];
  potentialConflicts: Conflict[];
  suggestions: string[];
  lintedAt: number;
}

interface LlmLintIssue {
  type: "content_contradiction" | "missing_concept_page" | "improvement_suggestion" | "new_source_suggestion";
  severity: "high" | "medium" | "low";
  pageTitle?: string;
  details: string;
  suggestedAction?: string;
  relatedPages?: string[];
}

interface LlmLintReport {
  analyzedPages: number;
  issues: LlmLintIssue[];
  contradictions: { page1: string; page2: string; description: string }[];
  missingConcepts: { concept: string; mentionedIn: string[]; suggestedAction: string }[];
  improvementSuggestions: { pageTitle: string; suggestion: string }[];
  newSourceSuggestions: string[];
  analyzedAt: number;
  modelUsed?: string;
}

async function fetchLintReport(): Promise<{ data: LintReport }> {
  const response = await fetch("/api/lint");
  if (!response.ok) throw new Error("Failed to fetch lint report");
  return response.json();
}

async function runLint(): Promise<{ data: LintReport }> {
  const response = await fetch("/api/lint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) throw new Error("Failed to run lint");
  return response.json();
}

async function runLlmLint(skipLlm: boolean = false, maxPages: number = 10): Promise<{ data: LlmLintReport }> {
  const response = await fetch("/api/lint/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skipLlm, maxPagesToAnalyze: maxPages }),
  });
  if (!response.ok) throw new Error("Failed to run LLM lint");
  return response.json();
}

const ISSUE_TYPE_CONFIG = {
  orphan: { icon: Link2Off, label: "Orphan", color: "bg-purple-100 text-purple-800" },
  missing_reference: { icon: FileWarning, label: "Missing Ref", color: "bg-red-100 text-red-800" },
  stale: { icon: Clock, label: "Stale", color: "bg-yellow-100 text-yellow-800" },
  potential_conflict: { icon: GitMerge, label: "Conflict", color: "bg-orange-100 text-orange-800" },
  missing_page: { icon: AlertCircle, label: "Missing Page", color: "bg-red-100 text-red-800" },
} as const;

const LLM_ISSUE_TYPE_CONFIG = {
  content_contradiction: { icon: AlertTriangle, label: "Contradiction", color: "bg-red-100 text-red-800" },
  missing_concept_page: { icon: BookOpen, label: "Missing Concept", color: "bg-orange-100 text-orange-800" },
  improvement_suggestion: { icon: Lightbulb, label: "Improvement", color: "bg-blue-100 text-blue-800" },
  new_source_suggestion: { icon: Search, label: "New Source", color: "bg-green-100 text-green-800" },
} as const;

const SEVERITY_CONFIG = {
  high: { color: "bg-red-500", label: "High" },
  medium: { color: "bg-orange-500", label: "Medium" },
  low: { color: "bg-yellow-500", label: "Low" },
} as const;

function IssueCard({ issue }: { issue: LintIssue }) {
  const typeConfig = ISSUE_TYPE_CONFIG[issue.type];
  const severityConfig = SEVERITY_CONFIG[issue.severity];
  const Icon = typeConfig.icon;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <Badge className={typeConfig.color}>{typeConfig.label}</Badge>
            <span className={`px-2 py-0.5 rounded text-xs text-white ${severityConfig.color}`}>
              {severityConfig.label}
            </span>
          </div>
          {issue.pageTitle && (
            <span className="text-sm font-medium truncate max-w-200">{issue.pageTitle}</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-2">{issue.details}</p>
        {issue.suggestedAction && (
          <p className="text-xs text-blue-600 italic">{issue.suggestedAction}</p>
        )}
      </CardContent>
    </Card>
  );
}

function LlmIssueCard({ issue }: { issue: LlmLintIssue }) {
  const typeConfig = LLM_ISSUE_TYPE_CONFIG[issue.type];
  const severityConfig = SEVERITY_CONFIG[issue.severity];
  const Icon = typeConfig.icon;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <Badge className={typeConfig.color}>{typeConfig.label}</Badge>
            <span className={`px-2 py-0.5 rounded text-xs text-white ${severityConfig.color}`}>
              {severityConfig.label}
            </span>
          </div>
          {issue.pageTitle && (
            <span className="text-sm font-medium truncate max-w-200">{issue.pageTitle}</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-2">{issue.details}</p>
        {issue.suggestedAction && (
          <p className="text-xs text-blue-600 italic">{issue.suggestedAction}</p>
        )}
        {issue.relatedPages && issue.relatedPages.length > 0 && (
          <div className="flex gap-1 mt-2">
            {issue.relatedPages.map((slug) => (
              <Badge key={slug} variant="outline" className="text-xs">
                [[{slug}]]
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IssueStats({ report }: { report: LintReport }) {
  const stats = [
    { label: "Total Pages", value: report.totalPages, icon: Activity },
    { label: "Pages with Issues", value: report.totalPagesWithIssues, icon: AlertTriangle, color: report.totalPagesWithIssues > 0 ? "text-orange-600" : "text-green-600" },
    { label: "Orphans", value: report.orphanPages.length, icon: Link2Off },
    { label: "Missing Refs", value: report.missingReferences.length, icon: FileWarning, color: report.missingReferences.length > 0 ? "text-red-600" : "" },
    { label: "Stale", value: report.stalePages.length, icon: Clock },
    { label: "Conflicts", value: report.potentialConflicts.length, icon: GitMerge },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="p-3 bg-muted rounded-lg text-center">
          <stat.icon className={`h-4 w-4 mx-auto mb-1 ${stat.color || "text-muted-foreground"}`} />
          <div className="text-xl font-bold">{stat.value}</div>
          <div className="text-xs text-muted-foreground">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

export function WikiLint() {
  const [report, setReport] = useState<LintReport | null>(null);
  const [llmReport, setLlmReport] = useState<LlmLintReport | null>(null);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [llmFilter, setLlmFilter] = useState<"all" | "high" | "medium" | "low">("all");

  const { data: initialReport, isLoading: initialLoading } = useQuery({
    queryKey: ["lintReport"],
    queryFn: fetchLintReport,
  });

  const lintMutation = useMutation({
    mutationFn: runLint,
    onSuccess: (data) => {
      setReport(data.data);
    },
  });

  const llmLintMutation = useMutation({
    mutationFn: () => runLlmLint(false, 10),
    onSuccess: (data) => {
      setLlmReport(data.data);
    },
  });

  const currentReport = report || initialReport?.data;

  const filteredIssues = currentReport
    ? currentReport.issues.filter((issue) => filter === "all" || issue.severity === filter)
    : [];

  const filteredLlmIssues = llmReport
    ? llmReport.issues.filter((issue) => llmFilter === "all" || issue.severity === llmFilter)
    : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Wiki Health Check (Lint)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {initialLoading && !currentReport && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading lint report...</span>
            </div>
          )}

          {currentReport && <IssueStats report={currentReport} />}

          <div className="flex items-center gap-3">
            <Button onClick={() => lintMutation.mutate()} disabled={lintMutation.isPending}>
              {lintMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">Run Lint</span>
            </Button>

            {currentReport && currentReport.issues.length === 0 && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">Wiki is healthy!</span>
              </div>
            )}

            {currentReport && currentReport.issues.length > 0 && (
              <div className="flex items-center gap-2 text-orange-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{currentReport.issues.length} issues found</span>
              </div>
            )}
          </div>

          {lintMutation.error && (
            <p className="text-sm text-red-600">{(lintMutation.error as Error).message}</p>
          )}
        </CardContent>
      </Card>

      {currentReport && currentReport.suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Suggestions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {currentReport.suggestions.map((suggestion, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary">•</span>
                  {suggestion}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {currentReport && currentReport.issues.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Issues ({filteredIssues.length})</CardTitle>
              <div className="flex gap-2">
                {(["all", "high", "medium", "low"] as const).map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setFilter(sev)}
                    className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                      filter === sev ? "bg-primary text-white" : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    {sev === "all" ? "All" : sev.charAt(0).toUpperCase() + sev.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredIssues.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No issues with {filter} severity
                </p>
              ) : (
                filteredIssues.map((issue, i) => (
                  <IssueCard key={`${issue.pageId}-${issue.type}-${i}`} issue={issue} />
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5" />
            LLM-Enhanced Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Uses LLM to analyze wiki content for contradictions, missing concepts, and improvement suggestions.
          </p>
          <Button onClick={() => llmLintMutation.mutate()} disabled={llmLintMutation.isPending}>
            {llmLintMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Brain className="h-4 w-4" />
            )}
            <span className="ml-2">Run LLM Analysis</span>
          </Button>
          {llmReport && llmReport.modelUsed && (
            <p className="text-xs text-muted-foreground">
              Analyzed {llmReport.analyzedPages} pages using {llmReport.modelUsed}
            </p>
          )}
          {llmLintMutation.error && (
            <p className="text-sm text-red-600">{(llmLintMutation.error as Error).message}</p>
          )}
        </CardContent>
      </Card>

      {llmReport && llmReport.newSourceSuggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="h-5 w-5" />
              New Sources to Investigate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {llmReport.newSourceSuggestions.map((source, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-green-600">•</span>
                  {source}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {llmReport && llmReport.issues.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">LLM Insights ({filteredLlmIssues.length})</CardTitle>
              <div className="flex gap-2">
                {(["all", "high", "medium", "low"] as const).map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setLlmFilter(sev)}
                    className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                      llmFilter === sev ? "bg-primary text-white" : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    {sev === "all" ? "All" : sev.charAt(0).toUpperCase() + sev.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredLlmIssues.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No issues with {llmFilter} severity
                </p>
              ) : (
                filteredLlmIssues.map((issue, i) => (
                  <LlmIssueCard key={`${issue.type}-${i}`} issue={issue} />
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
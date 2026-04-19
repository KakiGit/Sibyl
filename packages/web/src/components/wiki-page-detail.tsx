import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Edit,
  Save,
  X,
  Clock,
  Tag,
  Link2,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const PAGE_TYPE_CONFIG = {
  entity: { label: "Entity", color: "bg-blue-100 text-blue-800" },
  concept: { label: "Concept", color: "bg-purple-100 text-purple-800" },
  source: { label: "Source", color: "bg-green-100 text-green-800" },
  summary: { label: "Summary", color: "bg-orange-100 text-orange-800" },
} as const;

interface WikiPageContent {
  title: string;
  type: "entity" | "concept" | "source" | "summary";
  slug: string;
  summary?: string;
  tags: string[];
  sourceIds: string[];
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface WikiPageDetailProps {
  pageId: string;
  onBack?: () => void;
}

async function fetchWikiPageContent(
  pageId: string,
): Promise<{ data: WikiPageContent }> {
  const response = await fetch(`/api/wiki-pages/${pageId}/content`);
  if (!response.ok) {
    throw new Error("Failed to fetch wiki page content");
  }
  return response.json();
}

async function updateWikiPageContent(
  pageId: string,
  data: { content: string; title?: string; summary?: string; tags?: string[] },
): Promise<{ data: WikiPageContent }> {
  const response = await fetch(`/api/wiki-pages/${pageId}/content`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update wiki page");
  }
  return response.json();
}

function formatMarkdownContent(content: string): string {
  return content
    .replace(
      /\[\[([^\]]+)\]\]/g,
      '<a href="#" class="text-blue-600 hover:underline font-medium">[[<span class="underline">$1</span>]]</a>',
    )
    .replace(
      /^### (.+)$/gm,
      '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>',
    )
    .replace(
      /^## (.+)$/gm,
      '<h2 class="text-xl font-semibold mt-6 mb-3">$1</h2>',
    )
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>')
    .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

function WikiLinksSection({ pageId }: { pageId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["wikiLinks", pageId],
    queryFn: async () => {
      const response = await fetch(`/api/wiki-links/graph`);
      if (!response.ok) throw new Error("Failed to fetch wiki links");
      return response.json();
    },
  });

  if (isLoading) {
    return <div className="h-12 bg-muted animate-pulse rounded" />;
  }

  const graphData = data?.data as
    | {
        nodes: Array<{
          id: string;
          slug: string;
          title: string;
          type: string;
          incomingLinks: number;
          outgoingLinks: number;
        }>;
        edges: Array<{ from: string; to: string; relationType: string }>;
      }
    | undefined;

  if (!graphData) {
    return null;
  }

  const currentNode = graphData.nodes.find((n) => n.id === pageId);
  const outgoingLinks = graphData.edges.filter((e) => e.from === pageId);
  const incomingLinks = graphData.edges.filter((e) => e.to === pageId);

  if (!currentNode) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Connections
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {outgoingLinks.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">
              References ({outgoingLinks.length})
            </p>
            <div className="space-y-1">
              {outgoingLinks.map((link) => {
                const targetNode = graphData.nodes.find(
                  (n) => n.id === link.to,
                );
                return targetNode ? (
                  <div
                    key={link.to}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="text-muted-foreground">→</span>
                    <span>{targetNode.title}</span>
                    <Badge variant="outline" className="text-xs">
                      {targetNode.type}
                    </Badge>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        )}
        {incomingLinks.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">
              Referenced by ({incomingLinks.length})
            </p>
            <div className="space-y-1">
              {incomingLinks.map((link) => {
                const sourceNode = graphData.nodes.find(
                  (n) => n.id === link.from,
                );
                return sourceNode ? (
                  <div
                    key={link.from}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="text-muted-foreground">←</span>
                    <span>{sourceNode.title}</span>
                    <Badge variant="outline" className="text-xs">
                      {sourceNode.type}
                    </Badge>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        )}
        {outgoingLinks.length === 0 && incomingLinks.length === 0 && (
          <p className="text-sm text-muted-foreground">No connections yet</p>
        )}
      </CardContent>
    </Card>
  );
}

export function WikiPageDetail({ pageId, onBack }: WikiPageDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editTags, setEditTags] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["wikiPageContent", pageId],
    queryFn: () => fetchWikiPageContent(pageId),
  });

  const updateMutation = useMutation({
    mutationFn: (data: {
      content: string;
      title?: string;
      summary?: string;
      tags?: string[];
    }) => updateWikiPageContent(pageId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wikiPageContent", pageId] });
      queryClient.invalidateQueries({ queryKey: ["wikiPages"] });
      setIsEditing(false);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-muted animate-pulse rounded w-32" />
        <Card>
          <CardContent className="p-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground mt-3 text-center">
              Loading page content...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <XCircle className="h-8 w-8 text-red-600 mx-auto" />
          <p className="text-red-600 mt-3">Failed to load wiki page</p>
          <Button variant="outline" onClick={onBack} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  const page = data.data;
  const config = PAGE_TYPE_CONFIG[page.type];

  const handleStartEdit = () => {
    setEditContent(page.content);
    setEditTitle(page.title);
    setEditSummary(page.summary || "");
    setEditTags(page.tags.join(", "));
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const tags = editTags.trim()
      ? editTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
    updateMutation.mutate({
      content: editContent,
      title: editTitle.trim() !== page.title ? editTitle.trim() : undefined,
      summary:
        editSummary.trim() !== page.summary ? editSummary.trim() : undefined,
      tags:
        tags && JSON.stringify(tags) !== JSON.stringify(page.tags)
          ? tags
          : undefined,
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent("");
    setEditTitle("");
    setEditSummary("");
    setEditTags("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="p-2">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{page.title}</h2>
            <Badge className={config.color}>{config.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{page.slug}</p>
        </div>
        {!isEditing && (
          <Button variant="outline" onClick={handleStartEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        )}
      </div>

      {isEditing ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Edit Page</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={updateMutation.isPending}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Summary</label>
              <input
                type="text"
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={updateMutation.isPending}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={updateMutation.isPending}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Content</label>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={15}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none font-mono text-sm"
                disabled={updateMutation.isPending}
              />
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleSaveEdit}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span className="ml-2">Save</span>
              </Button>
              <Button
                variant="outline"
                onClick={handleCancelEdit}
                disabled={updateMutation.isPending}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
            {updateMutation.error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
                <XCircle className="h-4 w-4 text-red-600" />
                <p className="text-sm text-red-600">
                  {(updateMutation.error as Error).message}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6">
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{
                __html: formatMarkdownContent(page.content),
              }}
            />
          </CardContent>
        </Card>
      )}

      {!isEditing && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium">Summary</p>
                <p className="text-sm text-muted-foreground">
                  {page.summary || "No summary"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium">Tags</p>
                <div className="flex gap-1 mt-1">
                  {page.tags.length > 0 ? (
                    page.tags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        <Tag className="h-3 w-3 mr-1" />
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      No tags
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Last Updated</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(page.updatedAt).toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
          <WikiLinksSection pageId={pageId} />
        </div>
      )}

      {!isEditing && !updateMutation.isPending && updateMutation.isSuccess && (
        <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <p className="text-sm text-green-600">Page updated successfully!</p>
        </div>
      )}
    </div>
  );
}

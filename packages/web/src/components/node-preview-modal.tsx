import { useQuery } from "@tanstack/react-query";
import { Brain, Layers, FileText, BookOpen, X, ExternalLink, Loader2, XCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { WikiContentRenderer } from "@/components/wiki-link-renderer";

interface GraphNode {
  id: string;
  slug: string;
  title: string;
  type: "entity" | "concept" | "source" | "summary";
  incomingLinks: number;
  outgoingLinks: number;
  isOrphan: boolean;
  isHub: boolean;
}

const PAGE_TYPE_CONFIG = {
  entity: { icon: Brain, label: "Entity", color: "#3B82F6", bgColor: "#DBEAFE" },
  concept: { icon: Layers, label: "Concept", color: "#8B5CF6", bgColor: "#EDE9FE" },
  source: { icon: FileText, label: "Source", color: "#22C55E", bgColor: "#DCFCE7" },
  summary: { icon: BookOpen, label: "Summary", color: "#F97316", bgColor: "#FFEDD5" },
} as const;

async function fetchWikiPageContent(pageId: string): Promise<{ data: { title: string; type: string; slug: string; summary?: string; content: string; tags: string[] } }> {
  const response = await fetch(`/api/wiki-pages/${pageId}/content`);
  if (!response.ok) throw new Error("Failed to fetch wiki page content");
  return response.json();
}

function ContentPreview({ content, maxLength = 500 }: { content: string; maxLength?: number }) {
  const previewContent = content.length > maxLength ? content.slice(0, maxLength) + "..." : content;
  const lines = previewContent.split("\n").slice(0, 15);
  const truncatedContent = lines.join("\n");
  
  return (
    <div className="max-h-64 overflow-y-auto">
      <WikiContentRenderer content={truncatedContent} />
      {content.length > maxLength && (
        <p className="text-xs text-muted-foreground mt-2 italic">
          Content truncated. Click "View Full Page" to see complete content.
        </p>
      )}
    </div>
  );
}

interface NodePreviewModalProps {
  node: GraphNode | null;
  onClose: () => void;
  onViewFullPage: (pageId: string) => void;
}

export function NodePreviewModal({ node, onClose, onViewFullPage }: NodePreviewModalProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["wikiPagePreview", node?.id],
    queryFn: () => fetchWikiPageContent(node!.id),
    enabled: !!node,
    staleTime: 60000,
  });

  if (!node) return null;

  const config = PAGE_TYPE_CONFIG[node.type];
  const Icon = config.icon;

  return (
    <Dialog open={!!node} onOpenChange={(open) => !open && onClose()}>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm" 
          onClick={onClose}
          aria-hidden="true"
        />
        <div className="relative bg-background rounded-lg shadow-xl border max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5" style={{ color: config.color }} />
              <h2 className="text-lg font-semibold">{node.title}</h2>
              <Badge style={{ backgroundColor: config.bgColor, color: config.color }}>
                {config.label}
              </Badge>
              {node.isHub && (
                <Badge className="bg-blue-100 text-blue-800">Hub</Badge>
              )}
              {node.isOrphan && (
                <Badge className="bg-red-100 text-red-800">Orphan</Badge>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close preview"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading content...</span>
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center py-8">
                <XCircle className="h-6 w-6 text-red-600" />
                <span className="ml-2 text-red-600">Failed to load content</span>
              </div>
            )}

            {data?.data && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="font-mono">{data.data.slug}</span>
                  <span className="flex items-center gap-1">
                    <ArrowLeft className="h-3 w-3" />
                    {node.incomingLinks} incoming
                  </span>
                  <span className="flex items-center gap-1">
                    <ArrowRight className="h-3 w-3" />
                    {node.outgoingLinks} outgoing
                  </span>
                </div>

                {data.data.summary && (
                  <p className="text-sm text-muted-foreground italic">
                    {data.data.summary}
                  </p>
                )}

                <ContentPreview content={data.data.content} maxLength={500} />

                {data.data.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {data.data.tags.slice(0, 5).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-4 border-t flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              Press <kbd className="px-1 py-0.5 rounded bg-muted text-xs font-mono">ESC</kbd> to close
            </p>
            <button
              onClick={() => onViewFullPage(node.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              View Full Page
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
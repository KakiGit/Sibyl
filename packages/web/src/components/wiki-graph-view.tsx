import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Network, Link2Off, GitBranch, Brain, Layers, FileText, BookOpen, ArrowRight, ArrowLeft, LayoutGrid, List } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { InteractiveGraph } from "@/components/interactive-graph";

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

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  relationType: string;
}

interface WikiGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalPages: number;
    totalLinks: number;
    orphanCount: number;
    hubCount: number;
  };
}

async function fetchWikiGraph(): Promise<{ data: WikiGraph }> {
  const response = await fetch("/api/wiki-links/graph");
  if (!response.ok) throw new Error("Failed to fetch wiki graph");
  return response.json();
}

const PAGE_TYPE_CONFIG = {
  entity: { icon: Brain, label: "Entity", color: "bg-blue-100 text-blue-800 border-blue-300" },
  concept: { icon: Layers, label: "Concept", color: "bg-purple-100 text-purple-800 border-purple-300" },
  source: { icon: FileText, label: "Source", color: "bg-green-100 text-green-800 border-green-300" },
  summary: { icon: BookOpen, label: "Summary", color: "bg-orange-100 text-orange-800 border-orange-300" },
} as const;

function GraphStats({ graph }: { graph: WikiGraph }) {
  const stats = [
    { label: "Pages", value: graph.stats.totalPages, icon: Network },
    { label: "Links", value: graph.stats.totalLinks, icon: ArrowRight },
    { label: "Orphans", value: graph.stats.orphanCount, icon: Link2Off, color: graph.stats.orphanCount > 0 ? "text-red-600" : "text-green-600" },
    { label: "Hubs", value: graph.stats.hubCount, icon: GitBranch },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

function NodeCard({ node }: { node: GraphNode }) {
  const config = PAGE_TYPE_CONFIG[node.type];
  const Icon = config.icon;

  return (
    <Card className={`hover:shadow-md transition-shadow ${node.isOrphan ? "border-red-400 border-2" : ""} ${node.isHub ? "border-blue-400 border-2" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm truncate max-w-150">{node.title}</span>
          </div>
          <Badge className={config.color}>{config.label}</Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" />
            {node.incomingLinks}
          </span>
          <span className="flex items-center gap-1">
            <ArrowRight className="h-3 w-3" />
            {node.outgoingLinks}
          </span>
          {node.isOrphan && (
            <Badge variant="outline" className="text-red-600 border-red-400">
              <Link2Off className="h-3 w-3 mr-1" />
              Orphan
            </Badge>
          )}
          {node.isHub && (
            <Badge variant="outline" className="text-blue-600 border-blue-400">
              <GitBranch className="h-3 w-3 mr-1" />
              Hub
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GraphViewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function WikiGraphView() {
  const [viewMode, setViewMode] = useState<"interactive" | "list">("interactive");
  const { data, isLoading, error } = useQuery({
    queryKey: ["wikiGraph"],
    queryFn: fetchWikiGraph,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Network className="h-5 w-5" />
            Wiki Graph View
          </CardTitle>
        </CardHeader>
        <CardContent>
          <GraphViewSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Network className="h-5 w-5" />
            Wiki Graph View
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Failed to load wiki graph. Please check if the server is running.
          </p>
        </CardContent>
      </Card>
    );
  }

  const graph = data?.data;

  if (!graph || graph.nodes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Network className="h-5 w-5" />
            Wiki Graph View
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Network className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No wiki pages to visualize.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create wiki pages to see the knowledge graph.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const sortedNodes = [...graph.nodes].sort((a, b) => {
    const scoreA = a.incomingLinks + a.outgoingLinks;
    const scoreB = b.incomingLinks + b.outgoingLinks;
    return scoreB - scoreA;
  });

  const orphanNodes = sortedNodes.filter((n) => n.isOrphan);
  const hubNodes = sortedNodes.filter((n) => n.isHub && !n.isOrphan);
  const regularNodes = sortedNodes.filter((n) => !n.isOrphan && !n.isHub);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Network className="h-5 w-5" />
              Wiki Graph View
            </CardTitle>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode("interactive")}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  viewMode === "interactive"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
                Graph
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  viewMode === "list"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <List className="h-4 w-4" />
                List
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <GraphStats graph={graph} />
          
          {viewMode === "interactive" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Interactive visualization of {graph.nodes.length} pages with {graph.stats.totalLinks} connections.
                Click nodes to see details. Hubs (3+ connections) shown larger, orphans shown with red dashed border.
              </p>
              <InteractiveGraph graph={graph} />
            </div>
          )}
          
          {viewMode === "list" && graph.stats.totalLinks > 0 && (
            <p className="text-sm text-muted-foreground">
              Visualizing {graph.nodes.length} pages with {graph.stats.totalLinks} connections.
              Hubs have 3+ connections, orphans have none.
            </p>
          )}
        </CardContent>
      </Card>

      {viewMode === "list" && hubNodes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-blue-600" />
              Hub Pages ({hubNodes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              These pages have many connections and are central to your knowledge graph.
            </p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {hubNodes.map((node) => (
                <NodeCard key={node.id} node={node} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {viewMode === "list" && orphanNodes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2Off className="h-5 w-5 text-red-600" />
              Orphan Pages ({orphanNodes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              These pages have no connections. Consider linking them to other pages.
            </p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {orphanNodes.map((node) => (
                <NodeCard key={node.id} node={node} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {viewMode === "list" && regularNodes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Network className="h-5 w-5" />
              All Pages ({regularNodes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {regularNodes.map((node) => (
                <NodeCard key={node.id} node={node} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
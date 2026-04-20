import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, Layers, FileText, BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { WikiPageDetail } from "./wiki-page-detail";
import { WikiLinkProvider } from "./wiki-link-renderer";

const PAGE_TYPE_CONFIG = {
  entity: { icon: Brain, label: "Entity", color: "bg-blue-100 text-blue-800" },
  concept: {
    icon: Layers,
    label: "Concept",
    color: "bg-purple-100 text-purple-800",
  },
  source: {
    icon: FileText,
    label: "Source",
    color: "bg-green-100 text-green-800",
  },
  summary: {
    icon: BookOpen,
    label: "Summary",
    color: "bg-orange-100 text-orange-800",
  },
} as const;

interface WikiPage {
  id: string;
  slug: string;
  title: string;
  type: "entity" | "concept" | "source" | "summary";
  summary?: string;
  tags: string[];
  updatedAt: number;
}

async function fetchWikiPages(type?: string): Promise<{ data: WikiPage[] }> {
  const url = type ? `/api/wiki-pages?type=${type}` : "/api/wiki-pages";
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch wiki pages");
  return response.json();
}

function WikiPageCard({
  page,
  onClick,
}: {
  page: WikiPage;
  onClick: () => void;
}) {
  const config = PAGE_TYPE_CONFIG[page.type];
  const Icon = config.icon;

  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer hover:border-primary/50"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{page.title}</CardTitle>
          </div>
          <Badge className={config.color}>{config.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {page.summary && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {page.summary}
          </p>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{page.slug}</span>
          {page.tags.length > 0 && (
            <div className="flex gap-1">
              {page.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function WikiPageListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-3 w-full mb-2" />
            <Skeleton className="h-3 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function WikiPageList({ type }: { type?: string }) {
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["wikiPages", type],
    queryFn: () => fetchWikiPages(type),
  });

  const existingSlugs = useMemo(() => {
    return (data?.data || []).map((p) => p.slug);
  }, [data]);

  const handleNavigateToSlug = (slug: string) => {
    const page = (data?.data || []).find((p) => p.slug === slug);
    if (page) {
      setSelectedPageId(page.id);
    }
  };

  if (selectedPageId) {
    return (
      <WikiLinkProvider existingSlugs={existingSlugs} onNavigate={handleNavigateToSlug}>
        <WikiPageDetail
          pageId={selectedPageId}
          onBack={() => setSelectedPageId(null)}
        />
      </WikiLinkProvider>
    );
  }

  if (isLoading) {
    return <WikiPageListSkeleton />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            Failed to load wiki pages. Please check if the server is running.
          </p>
        </CardContent>
      </Card>
    );
  }

  const pages = data?.data || [];

  if (pages.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">No wiki pages found.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Use the MCP tools or API to create new pages.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <WikiLinkProvider existingSlugs={existingSlugs} onNavigate={handleNavigateToSlug}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pages.map((page) => (
          <WikiPageCard
            key={page.id}
            page={page}
            onClick={() => setSelectedPageId(page.id)}
          />
        ))}
      </div>
    </WikiLinkProvider>
  );
}

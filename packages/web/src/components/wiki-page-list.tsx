import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Layers, FileText, BookOpen, RefreshCw, Trash2, Loader2, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { WikiPageDetail } from "./wiki-page-detail";
import { WikiLinkProvider } from "./wiki-link-renderer";
import { useToast } from "@/components/toast";

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

const PAGE_SIZE = 20;

interface WikiPage {
  id: string;
  slug: string;
  title: string;
  type: "entity" | "concept" | "source" | "summary";
  summary?: string;
  tags: string[];
  updatedAt: number;
}

async function fetchWikiPagesCount(type?: string): Promise<number> {
  const url = type ? `/api/wiki-pages/count?type=${type}` : "/api/wiki-pages/count";
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch count");
  const data = await response.json();
  return data.count || 0;
}

async function fetchWikiPagesPage({ type, limit, offset }: { type?: string; limit: number; offset: number }): Promise<{ data: WikiPage[]; nextOffset?: number; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  
  const response = await fetch(`/api/wiki-pages?${params}`);
  if (!response.ok) throw new Error("Failed to fetch wiki pages");
  const data = await response.json();
  
  return {
    data: data.data || [],
    nextOffset: offset + limit,
    hasMore: (data.data || []).length === limit,
  };
}

async function batchDeleteWikiPages(ids: string[]): Promise<{ deleted: string[]; failed: string[]; success: boolean }> {
  const response = await fetch("/api/wiki-pages/batch-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) throw new Error("Failed to batch delete wiki pages");
  return response.json();
}

function WikiPageCard({
  page,
  onClick,
  onHover,
  isSelected,
  onSelect,
  selectionMode,
}: {
  page: WikiPage;
  onClick: () => void;
  onHover?: () => void;
  isSelected: boolean;
  onSelect: () => void;
  selectionMode: boolean;
}) {
  const config = PAGE_TYPE_CONFIG[page.type];
  const Icon = config.icon;

  return (
    <Card
      className={`hover:shadow-md transition-shadow cursor-pointer hover:border-primary/50 ${isSelected ? "border-primary ring-2 ring-primary/20" : ""}`}
      onClick={selectionMode ? onSelect : onClick}
      onMouseEnter={onHover}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {selectionMode && (
              <button
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                className={`h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 mr-2 ${isSelected ? "bg-primary text-primary-foreground" : ""}`}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onSelect();
                }}
              >
                {isSelected && <Check className="h-3 w-3" />}
              </button>
            )}
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

function WikiPageListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const toast = useToast();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();

  const prefetchPage = useCallback((pageId: string) => {
    queryClient.prefetchQuery({
      queryKey: ["wikiPageContent", pageId],
      queryFn: async () => {
        const response = await fetch(`/api/wiki-pages/${pageId}/content`);
        if (!response.ok) throw new Error("Failed to fetch");
        return response.json();
      },
      staleTime: 60000,
    });
  }, [queryClient]);

  const { data: totalCount } = useQuery({
    queryKey: ["wikiPagesCount", type],
    queryFn: () => fetchWikiPagesCount(type),
  });

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["wikiPagesInfinite", type],
    queryFn: ({ pageParam }) => fetchWikiPagesPage({ type, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextOffset : undefined,
  });

  const allPages = useMemo(() => {
    return data?.pages.flatMap((p) => p.data) || [];
  }, [data]);

  const existingSlugs = useMemo(() => {
    return allPages.map((p) => p.slug);
  }, [allPages]);

  const handleNavigateToSlug = useCallback((slug: string) => {
    const page = allPages.find((p) => p.slug === slug);
    if (page) {
      setSelectedPageId(page.id);
    }
  }, [allPages]);

  const handleRefresh = useCallback(() => {
    refetch();
    toast.info("Refreshing wiki pages...");
  }, [refetch, toast]);

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBatchDeleting(true);
    try {
      const result = await batchDeleteWikiPages(Array.from(selectedIds));
      if (result.failed.length > 0) {
        toast.warning("Some deletions failed", `${result.failed.length} items could not be deleted`);
      } else {
        toast.success("Pages deleted", `${result.deleted.length} pages were deleted successfully`);
      }
      setSelectedIds(new Set());
      setSelectionMode(false);
      queryClient.invalidateQueries({ queryKey: ["wikiPagesInfinite"] });
      queryClient.invalidateQueries({ queryKey: ["wikiPagesCount"] });
    } catch {
      toast.error("Failed to delete pages", "Please try again");
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === allPages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allPages.map((p) => p.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  useEffect(() => {
    if (loadMoreRef.current && hasNextPage && !isFetchingNextPage) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            fetchNextPage();
          }
        },
        { threshold: 0.1 }
      );
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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

  if (allPages.length === 0) {
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
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectionMode(!selectionMode);
                setSelectedIds(new Set());
              }}
            >
              <Check className="h-4 w-4 mr-1" />
              {selectionMode ? "Cancel Selection" : "Select Multiple"}
            </Button>
            {selectionMode && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                >
                  {selectedIds.size === allPages.length ? "Deselect All" : "Select All"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBatchDelete}
                  disabled={selectedIds.size === 0 || isBatchDeleting}
                >
                  {isBatchDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-1" />
                  )}
                  Delete ({selectedIds.size})
                </Button>
              </>
            )}
            {!selectionMode && (
              <>
                <span className="text-sm text-muted-foreground">
                  Showing {allPages.length} of {totalCount || allPages.length} pages
                </span>
                {hasNextPage && (
                  <Badge variant="outline" className="text-xs">
                    More available
                  </Badge>
                )}
              </>
            )}
          </div>
          {!selectionMode && (
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading || isFetchingNextPage}>
              <RefreshCw className="h-3 w-3 mr-1" />
              Refresh
            </Button>
          )}
        </div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {allPages.map((page) => (
            <WikiPageCard
              key={page.id}
              page={page}
              onClick={() => setSelectedPageId(page.id)}
              onHover={() => prefetchPage(page.id)}
              isSelected={selectedIds.has(page.id)}
              onSelect={() => handleToggleSelect(page.id)}
              selectionMode={selectionMode}
            />
          ))}
        </div>
        
        {!selectionMode && hasNextPage && (
          <div ref={loadMoreRef} className="flex justify-center py-4">
            {isFetchingNextPage ? (
              <WikiPageListSkeleton count={3} />
            ) : (
              <Button variant="outline" onClick={() => fetchNextPage()}>
                Load more pages
              </Button>
            )}
          </div>
        )}
      </div>
    </WikiLinkProvider>
  );
}
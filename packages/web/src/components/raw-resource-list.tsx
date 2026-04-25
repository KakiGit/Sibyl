import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Image, Globe, TextIcon, Trash2, Loader2, CheckCircle, Clock, ExternalLink, RefreshCw, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/dialog";
import { CopyToClipboard } from "@/components/ui/copy-to-clipboard";
import { RawResourceDetail } from "./raw-resource-detail";
import { useToast } from "@/components/toast";

const RESOURCE_TYPE_CONFIG = {
  pdf: { icon: FileText, label: "PDF", color: "bg-red-100 text-red-800" },
  image: { icon: Image, label: "Image", color: "bg-blue-100 text-blue-800" },
  webpage: { icon: Globe, label: "Webpage", color: "bg-green-100 text-green-800" },
  text: { icon: TextIcon, label: "Text", color: "bg-gray-100 text-gray-800" },
} as const;

interface RawResource {
  id: string;
  type: "pdf" | "image" | "webpage" | "text";
  filename: string;
  sourceUrl?: string;
  contentPath: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  processed: boolean;
}

interface FetchRawResourcesParams {
  type?: string;
  processed?: boolean;
  limit?: number;
  offset?: number;
}

async function fetchRawResources(params: FetchRawResourcesParams = {}): Promise<{ data: RawResource[] }> {
  const queryParams = new URLSearchParams();
  if (params.type) queryParams.set("type", params.type);
  if (params.processed !== undefined) queryParams.set("processed", String(params.processed));
  if (params.limit) queryParams.set("limit", String(params.limit));
  if (params.offset) queryParams.set("offset", String(params.offset));
  const url = queryParams.toString() ? `/api/raw-resources?${queryParams.toString()}` : "/api/raw-resources?limit=50";
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch raw resources");
  return response.json();
}

async function fetchRawResourcesCount(type?: string, processed?: boolean): Promise<{ count: number }> {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (processed !== undefined) params.set("processed", String(processed));
  const url = params.toString() ? `/api/raw-resources/count?${params.toString()}` : "/api/raw-resources/count";
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch count");
  return response.json();
}

async function deleteRawResource(id: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/raw-resources/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete raw resource");
  return response.json();
}

async function batchDeleteRawResources(ids: string[]): Promise<{ deleted: string[]; failed: string[]; success: boolean }> {
  const response = await fetch("/api/raw-resources/batch-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) throw new Error("Failed to batch delete raw resources");
  return response.json();
}

async function fetchRawResourceStats(): Promise<{ data: { total: number; processed: number; unprocessed: number; byType: Record<string, number> } }> {
  const response = await fetch("/api/raw-index/stats");
  if (!response.ok) {
    const fallbackResponse = await fetch("/api/raw-resources");
    if (!fallbackResponse.ok) throw new Error("Failed to fetch stats");
    const fallbackData = await fallbackResponse.json();
    const resources = fallbackData.data || [];
    return {
      data: {
        total: resources.length,
        processed: resources.filter((r: RawResource) => r.processed).length,
        unprocessed: resources.filter((r: RawResource) => !r.processed).length,
        byType: resources.reduce((acc: Record<string, number>, r: RawResource) => {
          acc[r.type] = (acc[r.type] || 0) + 1;
          return acc;
        }, {}),
      },
    };
  }
  const json = await response.json();
  const stats = json.data?.stats || { pdfCount: 0, imageCount: 0, webpageCount: 0, textCount: 0, processedCount: 0, unprocessedCount: 0 };
  return {
    data: {
      total: stats.pdfCount + stats.imageCount + stats.webpageCount + stats.textCount,
      processed: stats.processedCount,
      unprocessed: stats.unprocessedCount,
      byType: {
        pdf: stats.pdfCount,
        image: stats.imageCount,
        webpage: stats.webpageCount,
        text: stats.textCount,
      },
    },
  };
}

function RawResourceCard({
  resource,
  onDelete,
  onView,
  isDeleting,
  isSelected,
  onSelect,
  selectionMode,
}: {
  resource: RawResource;
  onDelete: () => void;
  onView: () => void;
  isDeleting: boolean;
  isSelected: boolean;
  onSelect: () => void;
  selectionMode: boolean;
}) {
  const config = RESOURCE_TYPE_CONFIG[resource.type];
  const Icon = config.icon;
  const createdDate = new Date(resource.createdAt).toLocaleDateString();
  const contentPreview = resource.metadata?.contentPreview as string | undefined;

  return (
    <Card
      className={`hover:shadow-md transition-shadow cursor-pointer hover:border-primary/50 ${isSelected ? "border-primary ring-2 ring-primary/20" : ""}`}
      onClick={selectionMode ? onSelect : onView}
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
            <CardTitle className="text-base truncate max-w-[200px]">{resource.filename}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={config.color}>{config.label}</Badge>
            {resource.processed ? (
              <Badge className="bg-green-100 text-green-800">
                <CheckCircle className="h-3 w-3 mr-1" />
                Processed
              </Badge>
            ) : (
              <Badge className="bg-orange-100 text-orange-800">
                <Clock className="h-3 w-3 mr-1" />
                Pending
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {contentPreview && (
            <div className="text-xs text-muted-foreground line-clamp-2">
              {contentPreview.slice(0, 100)}...
            </div>
          )}
          {resource.sourceUrl && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ExternalLink className="h-3 w-3" />
              <a
                href={resource.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate hover:text-primary underline"
                onClick={(e) => e.stopPropagation()}
              >
                {resource.sourceUrl}
              </a>
            </div>
          )}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">{createdDate}</span>
            {!selectionMode && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  disabled={isDeleting}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RawResourceListSkeleton() {
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

function StatsDisplay() {
  const { data, isLoading } = useQuery({
    queryKey: ["rawResourceStats"],
    queryFn: fetchRawResourceStats,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  const stats = data?.data || { total: 0, processed: 0, unprocessed: 0, byType: {} };

  return (
    <div className="grid grid-cols-4 gap-4 text-center">
      <div className="p-3 bg-muted rounded-lg">
        <div className="text-2xl font-bold">{stats.total}</div>
        <div className="text-xs text-muted-foreground">Total</div>
      </div>
      <div className="p-3 bg-green-50 rounded-lg">
        <div className="text-2xl font-bold text-green-700">{stats.processed}</div>
        <div className="text-xs text-muted-foreground">Processed</div>
      </div>
      <div className="p-3 bg-orange-50 rounded-lg">
        <div className="text-2xl font-bold text-orange-700">{stats.unprocessed}</div>
        <div className="text-xs text-muted-foreground">Pending</div>
      </div>
      <div className="p-3 bg-blue-50 rounded-lg">
        <div className="text-2xl font-bold text-blue-700">{Object.keys(stats.byType).length}</div>
        <div className="text-xs text-muted-foreground">Types</div>
      </div>
    </div>
  );
}

export function RawResourceList({ type, processed }: { type?: string; processed?: boolean }) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const pageSize = 20;
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ["rawResources", type, processed, page, pageSize],
    queryFn: () => fetchRawResources({ type, processed, limit: pageSize, offset: page * pageSize }),
  });

  const { data: countData } = useQuery({
    queryKey: ["rawResourcesCount", type, processed],
    queryFn: () => fetchRawResourcesCount(type, processed),
  });

  const totalCount = countData?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  const deleteMutation = useMutation({
    mutationFn: deleteRawResource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rawResources"] });
      queryClient.invalidateQueries({ queryKey: ["rawResourceStats"] });
      queryClient.invalidateQueries({ queryKey: ["ingestStatus"] });
      queryClient.invalidateQueries({ queryKey: ["rawResourcesCount"] });
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  const handleDelete = (id: string) => {
    setDeletingId(id);
    deleteMutation.mutate(id);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBatchDeleting(true);
    try {
      const result = await batchDeleteRawResources(Array.from(selectedIds));
      if (result.failed.length > 0) {
        toast.warning("Some deletions failed", `${result.failed.length} items could not be deleted`);
      } else {
        toast.success("Items deleted", `${result.deleted.length} items were deleted successfully`);
      }
      setSelectedIds(new Set());
      setSelectionMode(false);
      queryClient.invalidateQueries({ queryKey: ["rawResources"] });
      queryClient.invalidateQueries({ queryKey: ["rawResourceStats"] });
      queryClient.invalidateQueries({ queryKey: ["ingestStatus"] });
      queryClient.invalidateQueries({ queryKey: ["rawResourcesCount"] });
    } catch {
      toast.error("Failed to delete items", "Please try again");
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const handleSelectAll = () => {
    const resources = data?.data || [];
    if (selectedIds.size === resources.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(resources.map((r) => r.id)));
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

  const handleView = (resourceId: string) => {
    setSelectedResourceId(resourceId);
  };

  const handleBackFromDetail = () => {
    setSelectedResourceId(null);
  };

  const handlePrevPage = () => {
    setPage((p) => Math.max(0, p - 1));
  };

  const handleNextPage = () => {
    setPage((p) => Math.min(totalPages - 1, p + 1));
  };

  if (selectedResourceId) {
    return <RawResourceDetail resourceId={selectedResourceId} onBack={handleBackFromDetail} />;
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <StatsDisplay />
        <RawResourceListSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState
            title="Failed to load raw resources"
            description="Please check if the server is running."
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        </CardContent>
      </Card>
    );
  }

  const resources = data?.data || [];

  return (
    <div className="space-y-4">
      <StatsDisplay />
      
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
                {selectedIds.size === resources.length ? "Deselect All" : "Select All"}
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["rawResources"] })}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          )}
        </div>

        {totalCount > pageSize && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages} ({totalCount} total)
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {resources.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No raw resources found"
              description="Use the Content Ingestion section or MCP tools to add new resources."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {resources.map((resource) => (
            <RawResourceCard
              key={resource.id}
              resource={resource}
              onDelete={() => handleDelete(resource.id)}
              onView={() => handleView(resource.id)}
              isDeleting={deletingId === resource.id}
              isSelected={selectedIds.has(resource.id)}
              onSelect={() => handleToggleSelect(resource.id)}
              selectionMode={selectionMode}
            />
          ))}
        </div>
      )}
    </div>
  );
}
import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Edit,
  Save,
  X,
  Clock,
  Link2,
  Loader2,
  CheckCircle,
  XCircle,
  Trash2,
  ExternalLink,
  FileText,
  Image,
  Globe,
  TextIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/ui/dialog";

const RESOURCE_TYPE_CONFIG = {
  pdf: { label: "PDF", color: "bg-red-100 text-red-800", icon: FileText },
  image: { label: "Image", color: "bg-blue-100 text-blue-800", icon: Image },
  webpage: { label: "Webpage", color: "bg-green-100 text-green-800", icon: Globe },
  text: { label: "Text", color: "bg-gray-100 text-gray-800", icon: TextIcon },
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

interface RawResourceContent {
  content: string;
  contentPath: string;
}

interface RawResourceDetailProps {
  resourceId: string;
  onBack?: () => void;
}

async function fetchRawResource(id: string): Promise<{ data: RawResource }> {
  const response = await fetch(`/api/raw-resources/${id}`);
  if (!response.ok) {
    throw new Error("Failed to fetch raw resource");
  }
  return response.json();
}

async function fetchRawResourceContent(id: string): Promise<{ data: RawResourceContent }> {
  const response = await fetch(`/api/raw-resources/${id}/content`);
  if (!response.ok) {
    throw new Error("Failed to fetch raw resource content");
  }
  return response.json();
}

async function updateRawResourceContent(
  id: string,
  data: { content: string },
): Promise<{ data: RawResourceContent }> {
  const response = await fetch(`/api/raw-resources/${id}/content`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update raw resource");
  }
  return response.json();
}

async function deleteRawResource(id: string): Promise<void> {
  const response = await fetch(`/api/raw-resources/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete raw resource");
  }
}

export function RawResourceDetail({ resourceId, onBack }: RawResourceDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: resourceData, isLoading: resourceLoading, error: resourceError } = useQuery({
    queryKey: ["rawResource", resourceId],
    queryFn: () => fetchRawResource(resourceId),
  });

  const { data: contentData, isLoading: contentLoading, error: contentError } = useQuery({
    queryKey: ["rawResourceContent", resourceId],
    queryFn: () => fetchRawResourceContent(resourceId),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { content: string }) => updateRawResourceContent(resourceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rawResourceContent", resourceId] });
      queryClient.invalidateQueries({ queryKey: ["rawResources"] });
      setIsEditing(false);
      toast.success("Resource updated", "Raw resource content saved successfully");
    },
    onError: (error) => {
      toast.error("Update failed", (error as Error).message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteRawResource(resourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rawResources"] });
      queryClient.invalidateQueries({ queryKey: ["rawResourceStats"] });
      setShowDeleteDialog(false);
      toast.success("Resource deleted", "Raw resource has been removed");
      onBack?.();
    },
    onError: (error) => {
      setShowDeleteDialog(false);
      toast.error("Delete failed", (error as Error).message);
    },
  });

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditContent("");
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isEditing) {
          handleCancelEdit();
        } else if (showDeleteDialog) {
          setShowDeleteDialog(false);
        } else {
          onBack?.();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditing, showDeleteDialog, onBack, handleCancelEdit]);

  const isLoading = resourceLoading || contentLoading;
  const error = resourceError || contentError;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-muted animate-pulse rounded w-32" />
        <Card>
          <CardContent className="p-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground mt-3 text-center">
              Loading resource content...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !resourceData?.data || !contentData?.data) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <XCircle className="h-8 w-8 text-red-600 mx-auto" />
          <p className="text-red-600 mt-3">Failed to load raw resource</p>
          <Button variant="outline" onClick={onBack} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  const resource = resourceData.data;
  const content = contentData.data;
  const config = RESOURCE_TYPE_CONFIG[resource.type];

  const handleStartEdit = () => {
    setEditContent(content.content);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    updateMutation.mutate({
      content: editContent,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="p-2">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <config.icon className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-bold">{resource.filename}</h2>
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
          <p className="text-sm text-muted-foreground">{resource.contentPath}</p>
        </div>
        {!isEditing && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleStartEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(true)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        )}
      </div>

      {isEditing ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Edit Content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
            <pre className="text-sm whitespace-pre-wrap bg-muted p-4 rounded-lg overflow-auto max-h-[60vh]">
              {content.content}
            </pre>
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
                <p className="text-sm font-medium">Type</p>
                <p className="text-sm text-muted-foreground">{config.label}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Status</p>
                <p className="text-sm text-muted-foreground">
                  {resource.processed ? "Processed" : "Pending"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium">Created</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(resource.createdAt).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium">Content Path</p>
                <p className="text-sm text-muted-foreground break-all">
                  {resource.contentPath}
                </p>
              </div>
              {resource.sourceUrl && (
                <div>
                  <p className="text-sm font-medium">Source URL</p>
                  <a
                    href={resource.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    {resource.sourceUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {resource.metadata && Object.keys(resource.metadata).length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Additional Metadata</p>
                  <div className="text-sm text-muted-foreground">
                    <pre className="bg-muted p-2 rounded overflow-auto text-xs">
                      {JSON.stringify(resource.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This is a raw resource that can be processed into wiki pages through the ingestion pipeline.
              </p>
              {!resource.processed && (
                <p className="text-sm text-orange-600">
                  This resource is pending processing and has not been converted to wiki content yet.
                </p>
              )}
              {resource.processed && (
                <p className="text-sm text-green-600">
                  This resource has been processed and may have generated wiki content.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {!isEditing && !updateMutation.isPending && updateMutation.isSuccess && (
        <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <p className="text-sm text-green-600">Resource updated successfully!</p>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Raw Resource"
        description={`Are you sure you want to delete "${resource.filename}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
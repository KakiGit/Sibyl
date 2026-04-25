import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Clock,
  Hash,
  FileText,
  Brain,
  Layers,
  BookOpen,
  Archive,
  TrendingUp,
  Calendar,
  Link2,
  Tag,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface WikiStats {
  totalPages: number;
  pagesByType: {
    entity: number;
    concept: number;
    source: number;
    summary: number;
  };
  totalTags: number;
  tagsDistribution: Record<string, number>;
  averageContentLength: number;
  totalContentLength: number;
  recentPages: Array<{
    id: string;
    slug: string;
    title: string;
    type: string;
    updatedAt: number;
  }>;
  oldestPage: {
    id: string;
    slug: string;
    title: string;
    createdAt: number;
  } | null;
  newestPage: {
    id: string;
    slug: string;
    title: string;
    createdAt: number;
  } | null;
  pagesWithSummary: number;
  pagesWithTags: number;
  pagesWithLinks: number;
}

interface ActivityStats {
  last24Hours: number;
  lastWeek: number;
  lastMonth: number;
  older: number;
}

interface TagStats {
  tag: string;
  count: number;
}

async function fetchWikiStats(): Promise<{ data: WikiStats }> {
  const response = await fetch("/api/wiki-stats");
  if (!response.ok) throw new Error("Failed to fetch wiki stats");
  return response.json();
}

async function fetchActivityStats(): Promise<{ data: ActivityStats }> {
  const response = await fetch("/api/wiki-stats/activity");
  if (!response.ok) throw new Error("Failed to fetch activity stats");
  return response.json();
}

async function fetchTagStats(): Promise<{ data: TagStats[] }> {
  const response = await fetch("/api/wiki-stats/tags");
  if (!response.ok) throw new Error("Failed to fetch tag stats");
  return response.json();
}

const PAGE_TYPE_CONFIG = {
  entity: { icon: Brain, label: "Entities", color: "bg-blue-100 text-blue-800" },
  concept: { icon: Layers, label: "Concepts", color: "bg-purple-100 text-purple-800" },
  source: { icon: Archive, label: "Sources", color: "bg-green-100 text-green-800" },
  summary: { icon: BookOpen, label: "Summaries", color: "bg-orange-100 text-orange-800" },
} as const;

function StatsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  color,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  description?: string;
  color?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        <Icon className={`h-4 w-4 ${color || "text-muted-foreground"}`} />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </Card>
  );
}

function TypeDistributionCard({ stats }: { stats: WikiStats }) {
  const types = Object.entries(stats.pagesByType);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Pages by Type
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {types.map(([type, count]) => {
          const config = PAGE_TYPE_CONFIG[type as keyof typeof PAGE_TYPE_CONFIG];
          const Icon = config.icon;
          const percentage = stats.totalPages > 0 ? Math.round((count / stats.totalPages) * 100) : 0;

          return (
            <div key={type} className="flex items-center gap-3">
              <Icon className="h-4 w-4" />
              <span className="text-sm flex-1">{config.label}</span>
              <Badge variant="outline">{count}</Badge>
              <span className="text-xs text-muted-foreground">{percentage}%</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ActivityCard({ activity }: { activity: ActivityStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-sm flex-1">Last 24 hours</span>
          <Badge variant="outline" className="text-green-700">{activity.last24Hours}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-sm flex-1">Last 7 days</span>
          <Badge variant="outline" className="text-blue-700">{activity.lastWeek}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-purple-500" />
          <span className="text-sm flex-1">Last 30 days</span>
          <Badge variant="outline" className="text-purple-700">{activity.lastMonth}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-gray-400" />
          <span className="text-sm flex-1">Older</span>
          <Badge variant="outline">{activity.older}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function TopTagsCard({ tags }: { tags: TagStats[] }) {
  const topTags = tags ? tags.slice(0, 10) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Tag className="h-5 w-5" />
          Top Tags
        </CardTitle>
      </CardHeader>
      <CardContent>
        {topTags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags found</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {topTags.map(({ tag, count }) => (
              <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                {tag}
                <span className="text-xs text-muted-foreground">{count}</span>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContentMetricsCard({ stats }: { stats: WikiStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Content Metrics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-sm flex-1">Average content length</span>
          <Badge variant="outline">{stats.averageContentLength} chars</Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm flex-1">Total content size</span>
          <Badge variant="outline">{formatBytes(stats.totalContentLength)}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm flex-1">Pages with wiki links</span>
          <Badge variant="outline">{stats.pagesWithLinks}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <Hash className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm flex-1">Pages with summary</span>
          <Badge variant="outline">{stats.pagesWithSummary}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <Tag className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm flex-1">Pages with tags</span>
          <Badge variant="outline">{stats.pagesWithTags}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentPagesCard({ pages }: { pages: WikiStats["recentPages"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Recently Updated
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {pages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pages yet</p>
        ) : (
          pages.map((page) => (
            <div key={page.id} className="flex items-center gap-3 text-sm">
              <span className="font-medium truncate max-w-200">{page.title}</span>
              <Badge variant="outline" className="text-xs">{page.type}</Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(page.updatedAt).toLocaleDateString()}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function TimelineCard({ stats }: { stats: WikiStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Timeline
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats.oldestPage && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">First page created</p>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{stats.oldestPage.title}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(stats.oldestPage.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}
        {stats.newestPage && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Latest page created</p>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{stats.newestPage.title}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(stats.newestPage.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WikiStatsView() {
  const { data: statsData, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ["wikiStats"],
    queryFn: fetchWikiStats,
  });

  const { data: activityData } = useQuery({
    queryKey: ["wikiActivity"],
    queryFn: fetchActivityStats,
  });

  const { data: tagsData } = useQuery({
    queryKey: ["wikiTags"],
    queryFn: fetchTagStats,
  });

  if (statsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Wiki Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StatsSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (statsError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Wiki Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="Failed to load statistics"
            description="Please check if the server is running."
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        </CardContent>
      </Card>
    );
  }

  const stats = statsData?.data;

  if (!stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Wiki Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No statistics available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Wiki Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard title="Total Pages" value={stats.totalPages} icon={FileText} />
            <StatCard title="Total Tags" value={stats.totalTags} icon={Hash} />
            <StatCard
              title="Avg Length"
              value={stats.averageContentLength}
              icon={FileText}
              description="characters"
            />
            <StatCard
              title="With Links"
              value={stats.pagesWithLinks}
              icon={Link2}
              color="text-blue-600"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <TypeDistributionCard stats={stats} />
        {activityData?.data && <ActivityCard activity={activityData.data} />}
        <ContentMetricsCard stats={stats} />
        {tagsData?.data && <TopTagsCard tags={tagsData.data} />}
        <RecentPagesCard pages={stats.recentPages} />
        <TimelineCard stats={stats} />
      </div>
    </div>
  );
}
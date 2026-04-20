import { useQuery } from "@tanstack/react-query";
import { FileText, Brain, BookOpen, Layers, Search, Upload, Activity, FileDown, Network, Filter, Shield, Archive, BarChart3, Presentation } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WikiPageList } from "@/components/wiki-page-list";
import { QuerySynthesis } from "@/components/query-synthesis";
import { ContentIngestion } from "@/components/content-ingestion";
import { WikiLint } from "@/components/wiki-lint";
import { ContentFiling } from "@/components/content-filing";
import { WikiGraphView } from "@/components/wiki-graph-view";
import { WikiSearch } from "@/components/wiki-search";
import { AuthStatus } from "@/components/auth-status";
import { WebSocketStatus } from "@/components/websocket-status";
import { RawResourceList } from "@/components/raw-resource-list";
import { WikiStatsView } from "@/components/wiki-stats";
import { MarpSlides } from "@/components/marp-slides";

async function fetchStats() {
  const response = await fetch("/api/wiki-pages");
  if (!response.ok) throw new Error("Failed to fetch stats");
  const data = await response.json();
  return {
    total: data.data?.length || 0,
    entities: data.data?.filter((p: unknown) => (p as { type: string }).type === "entity").length || 0,
    concepts: data.data?.filter((p: unknown) => (p as { type: string }).type === "concept").length || 0,
    sources: data.data?.filter((p: unknown) => (p as { type: string }).type === "source").length || 0,
    summaries: data.data?.filter((p: unknown) => (p as { type: string }).type === "summary").length || 0,
  };
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: fetchStats,
  });

  if (statsLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              <div className="h-8 w-16 bg-muted animate-pulse rounded mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const stats = statsData || {
    total: 0,
    entities: 0,
    concepts: 0,
    sources: 0,
    summaries: 0,
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Total Pages" value={stats.total} icon={BookOpen} />
      <StatCard title="Entities" value={stats.entities} icon={Brain} />
      <StatCard title="Concepts" value={stats.concepts} icon={Layers} />
      <StatCard title="Sources" value={stats.sources} icon={FileText} />
    </div>
  );
}

function WikiPages() {
  return (
    <div className="space-y-4">
      <WikiPageList />
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sibyl</h1>
            <p className="text-muted-foreground text-sm">
              Memory System for Knowledge Management
            </p>
          </div>
          <WebSocketStatus />
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-8">
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Wiki Statistics
            </h2>
            <WikiStatsView />
          </section>
          <section>
            <h2 className="text-lg font-semibold mb-4">Dashboard</h2>
            <Dashboard />
          </section>
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Authentication
            </h2>
            <AuthStatus />
          </section>
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Wiki Search
            </h2>
            <WikiSearch />
          </section>
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Content Ingestion
            </h2>
            <ContentIngestion />
          </section>
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Archive className="h-5 w-5" />
              Raw Resources
            </h2>
            <RawResourceList />
          </section>
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Search className="h-5 w-5" />
              Query Synthesis
            </h2>
            <QuerySynthesis />
          </section>
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileDown className="h-5 w-5" />
              Content Filing
            </h2>
            <ContentFiling />
          </section>
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Wiki Health Check (Lint)
            </h2>
            <WikiLint />
          </section>
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Presentation className="h-5 w-5" />
              Marp Slide Generation
            </h2>
            <MarpSlides />
          </section>
          <section>
            <h2 className="text-lg font-semibold mb-4">Wiki Pages</h2>
            <WikiPages />
          </section>
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Network className="h-5 w-5" />
              Wiki Graph View
            </h2>
            <WikiGraphView />
          </section>
        </div>
      </main>
    </div>
  );
}
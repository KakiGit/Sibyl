import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  FileText, Brain, BookOpen, Layers, Search, Upload, Network, 
  Settings, Home, ChevronRight, Keyboard
} from "lucide-react";
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
import { ToastProvider } from "@/components/toast";
import { ErrorBoundary } from "@/components/error-boundary";
import { useKeyboardShortcuts, KeyboardShortcut } from "@/hooks/use-keyboard-shortcuts";

async function fetchStats() {
  const response = await fetch("/api/wiki-stats");
  if (!response.ok) throw new Error("Failed to fetch stats");
  const data = await response.json();
  return {
    total: data.data?.totalPages || 0,
    entities: data.data?.pagesByType?.entity || 0,
    concepts: data.data?.pagesByType?.concept || 0,
    sources: data.data?.pagesByType?.source || 0,
    summaries: data.data?.pagesByType?.summary || 0,
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

const TABS_CONFIG = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "search", label: "Search", icon: Search },
  { id: "ingest", label: "Ingest", icon: Upload },
  { id: "pages", label: "Wiki Pages", icon: BookOpen },
  { id: "graph", label: "Graph", icon: Network },
  { id: "tools", label: "Tools", icon: Settings },
] as const;

function ShortcutHelp({ shortcuts }: { shortcuts: KeyboardShortcut[] }) {
  return (
    <div className="p-4 bg-muted/50 rounded-lg">
      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
        <Keyboard className="h-4 w-4" />
        Keyboard Shortcuts
      </h4>
      <div className="grid gap-1 text-xs">
        {shortcuts.map((shortcut, index) => (
          <div key={index} className="flex justify-between">
            <span className="text-muted-foreground">{shortcut.description}</span>
            <span className="font-mono">{shortcut.key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SidebarTab({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      {active && <ChevronRight className="h-3 w-3 ml-auto" />}
    </button>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("overview");
  const [showShortcuts, setShowShortcuts] = useState(false);

  const shortcuts: KeyboardShortcut[] = useMemo(() => [
    { key: "1", ctrl: true, action: () => setActiveTab("overview"), description: "Overview" },
    { key: "2", ctrl: true, action: () => setActiveTab("search"), description: "Search" },
    { key: "3", ctrl: true, action: () => setActiveTab("ingest"), description: "Ingest" },
    { key: "4", ctrl: true, action: () => setActiveTab("pages"), description: "Wiki Pages" },
    { key: "5", ctrl: true, action: () => setActiveTab("graph"), description: "Graph" },
    { key: "6", ctrl: true, action: () => setActiveTab("tools"), description: "Tools" },
    { key: "/", ctrl: true, action: () => setActiveTab("search"), description: "Quick search" },
    { key: "?", shift: true, action: () => setShowShortcuts((prev) => !prev), description: "Show shortcuts" },
  ], []);

  useKeyboardShortcuts(shortcuts);

  return (
    <ToastProvider>
      <ErrorBoundary>
        <div className="min-h-screen bg-background flex">
          <aside className="w-64 border-r bg-card/50 p-4 flex flex-col">
          <div className="mb-6">
            <h1 className="text-xl font-bold tracking-tight">Sibyl</h1>
            <p className="text-muted-foreground text-xs">
              Memory System for Knowledge Management
            </p>
          </div>
          
          <nav className="flex-1 space-y-1">
            {TABS_CONFIG.map((tab) => (
              <SidebarTab
                key={tab.id}
                label={tab.label}
                icon={tab.icon}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </nav>
          
          <div className="mt-4 pt-4 border-t">
            <WebSocketStatus />
            <button
              onClick={() => setShowShortcuts(!showShortcuts)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-muted text-muted-foreground hover:text-foreground mt-2"
            >
              <Keyboard className="h-4 w-4" />
              <span>Shortcuts</span>
            </button>
          </div>
          
          {showShortcuts && (
            <div className="mt-4">
              <ShortcutHelp shortcuts={shortcuts} />
            </div>
          )}
        </aside>
        
        <main className="flex-1 overflow-auto">
          <header className="border-b bg-card/30 px-6 py-3 sticky top-0 z-10">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                {TABS_CONFIG.find((t) => t.id === activeTab)?.icon && (
                  <span className="text-muted-foreground">
                    {(() => {
                      const Icon = TABS_CONFIG.find((t) => t.id === activeTab)?.icon;
                      return Icon ? <Icon className="h-5 w-5" /> : null;
                    })()}
                  </span>
                )}
                {TABS_CONFIG.find((t) => t.id === activeTab)?.label}
              </h2>
              <AuthStatus />
            </div>
          </header>
          
          <div className="p-6">
            {activeTab === "overview" && (
              <div className="space-y-6">
                <section>
                  <WikiStatsView />
                </section>
                <section>
                  <h3 className="text-md font-semibold mb-4">Dashboard</h3>
                  <Dashboard />
                </section>
              </div>
            )}
            
            {activeTab === "search" && (
              <div className="space-y-6">
                <WikiSearch />
                <QuerySynthesis />
              </div>
            )}
            
            {activeTab === "ingest" && (
              <div className="space-y-6">
                <ContentIngestion />
                <RawResourceList />
              </div>
            )}
            
            {activeTab === "pages" && (
              <div className="space-y-6">
                <WikiPageList />
              </div>
            )}
            
            {activeTab === "graph" && (
              <div className="space-y-6">
                <WikiGraphView />
              </div>
            )}
            
            {activeTab === "tools" && (
              <div className="space-y-6">
                <ContentFiling />
                <WikiLint />
                <MarpSlides />
              </div>
            )}
          </div>
        </main>
      </div>
      </ErrorBoundary>
    </ToastProvider>
  );
}
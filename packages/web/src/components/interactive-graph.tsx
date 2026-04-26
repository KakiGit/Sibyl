import { useState, useEffect, useRef, useCallback } from "react";
import { Brain, Layers, FileText, BookOpen, Loader2, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NodePreviewModal } from "@/components/node-preview-modal";
import * as d3 from "d3";

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

interface SimulatedNode extends GraphNode, d3.SimulationNodeDatum {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  index?: number;
}

interface D3Link extends d3.SimulationLinkDatum<SimulatedNode> {
  id: string;
}

const PAGE_TYPE_CONFIG = {
  entity: { icon: Brain, label: "Entity", color: "#3B82F6", bgColor: "#DBEAFE" },
  concept: { icon: Layers, label: "Concept", color: "#8B5CF6", bgColor: "#EDE9FE" },
  source: { icon: FileText, label: "Source", color: "#22C55E", bgColor: "#DCFCE7" },
  summary: { icon: BookOpen, label: "Summary", color: "#F97316", bgColor: "#FFEDD5" },
} as const;

function HoverTooltip({ node, position }: { node: SimulatedNode | null; position: { x: number; y: number } }) {
  if (!node) return null;

  const config = PAGE_TYPE_CONFIG[node.type];

  return (
    <div
      style={{
        left: position.x + 15,
        top: position.y + 15,
      }}
      className="fixed z-50 bg-popover border border-border shadow-xl rounded-md px-3 py-2 pointer-events-none animate-in fade-in-0 zoom-in-95 duration-150"
    >
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm text-popover-foreground">{node.title}</span>
        <Badge
          className="text-xs"
          style={{ backgroundColor: config.bgColor, color: config.color }}
        >
          {config.label}
        </Badge>
      </div>
    </div>
  );
}

interface InteractiveGraphProps {
  graph: WikiGraph;
  onViewFullPage?: (pageId: string) => void;
}

export function InteractiveGraph({ graph, onViewFullPage }: InteractiveGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedNode, setSelectedNode] = useState<SimulatedNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<SimulatedNode | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  const simulationRef = useRef<d3.Simulation<SimulatedNode, D3Link> | null>(null);
  const nodeDataRef = useRef<SimulatedNode[]>([]);
  const selectedNodeRef = useRef<SimulatedNode | null>(null);

  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      const rect = containerRef.current!.getBoundingClientRect();
      setDimensions({ width: rect.width, height: Math.max(400, rect.height) });
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedNode) {
        e.preventDefault();
        setSelectedNode(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNode]);

  const handleViewFullPage = useCallback((pageId: string) => {
    setSelectedNode(null);
    onViewFullPage?.(pageId);
  }, [onViewFullPage]);

  useEffect(() => {
    if (graph.nodes.length === 0 || dimensions.width === 0 || dimensions.height === 0) {
      return;
    }

    const width = dimensions.width;
    const height = dimensions.height;

    const nodes: SimulatedNode[] = graph.nodes.map(d => ({
      ...d,
      x: width / 2,
      y: height / 2,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
    }));

    nodeDataRef.current = nodes;

    const links: D3Link[] = graph.edges.map(d => ({
      id: d.id,
      source: nodes.find(n => n.id === d.from)!,
      target: nodes.find(n => n.id === d.to)!,
    }));

    const simulation = d3.forceSimulation<SimulatedNode, D3Link>(nodes)
      .force("link", d3.forceLink<SimulatedNode, D3Link>(links).id(d => d.id))
      .force("charge", d3.forceManyBody())
      .force("x", d3.forceX(width / 2))
      .force("y", d3.forceY(height / 2));

    simulationRef.current = simulation;

    const svg = d3.select(svgRef.current!);

    svg.selectAll("*").remove();

    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);
    zoomRef.current = zoom;

    const link = g.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 1);

    const node = g.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer");

    node.each(function(d) {
      const nodeGroup = d3.select(this);
      const nodeConfig = PAGE_TYPE_CONFIG[d.type];
      const radius = d.isHub ? 8 : d.isOrphan ? 5 : 6;

      if (d.isOrphan) {
        nodeGroup.append("circle")
          .attr("r", radius + 3)
          .attr("fill", "none")
          .attr("stroke", "#EF4444")
          .attr("stroke-width", 1.5)
          .attr("stroke-dasharray", "3 2")
          .attr("opacity", 0.6);
      }

      nodeGroup.append("circle")
        .attr("class", "node-circle")
        .attr("r", radius)
        .attr("fill", nodeConfig.bgColor)
        .attr("stroke", nodeConfig.color)
        .attr("stroke-width", 1.5);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node as any).call(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      d3.drag<any, any>()
        .on("start", (event: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          event.subject.fx = event.subject.x;
          event.subject.fy = event.subject.y;
        })
        .on("drag", (event: any) => {
          event.subject.fx = event.x;
          event.subject.fy = event.y;
        })
        .on("end", (event: any) => {
          if (!event.active) simulation.alphaTarget(0);
          event.subject.fx = null;
          event.subject.fy = null;
        })
    );

    node.on("mouseenter", function(event: MouseEvent, d: SimulatedNode) {
      setHoveredNode(d);
      setMousePosition({ x: event.clientX, y: event.clientY });

      const nodeGroup = d3.select(this);
      const nodeConfig = PAGE_TYPE_CONFIG[d.type];
      nodeGroup.select(".node-circle")
        .transition()
        .duration(150)
        .attr("r", d.isHub ? 12 : d.isOrphan ? 8 : 9)
        .attr("stroke-width", 3)
        .attr("stroke", d.id === selectedNodeRef.current?.id ? "#6366F1" : nodeConfig.color);

      link
        .transition()
        .duration(150)
        .attr("stroke", (l: D3Link) => 
          ((l.source as SimulatedNode).id === d.id || (l.target as SimulatedNode).id === d.id) ? "#6366F1" : "#999"
        )
        .attr("stroke-width", (l: D3Link) => 
          ((l.source as SimulatedNode).id === d.id || (l.target as SimulatedNode).id === d.id) ? 2 : 1
        )
        .attr("stroke-opacity", (l: D3Link) =>
          ((l.source as SimulatedNode).id === d.id || (l.target as SimulatedNode).id === d.id) ? 1 : 0.6
        );
    });

    node.on("mouseleave", function() {
      setHoveredNode(null);

      const nodeGroup = d3.select(this);
      const d = nodeGroup.datum() as SimulatedNode;
      const nodeConfig = PAGE_TYPE_CONFIG[d.type];
      nodeGroup.select(".node-circle")
        .transition()
        .duration(150)
        .attr("r", d.isHub ? 8 : d.isOrphan ? 5 : 6)
        .attr("stroke-width", d.id === selectedNodeRef.current?.id ? 3 : 1.5)
        .attr("stroke", d.id === selectedNodeRef.current?.id ? "#6366F1" : nodeConfig.color);

      link
        .transition()
        .duration(150)
        .attr("stroke", (l: D3Link) => 
          ((l.source as SimulatedNode).id === selectedNodeRef.current?.id || (l.target as SimulatedNode).id === selectedNodeRef.current?.id) ? "#6366F1" : "#999"
        )
        .attr("stroke-width", (l: D3Link) => 
          ((l.source as SimulatedNode).id === selectedNodeRef.current?.id || (l.target as SimulatedNode).id === selectedNodeRef.current?.id) ? 2 : 1
        )
        .attr("stroke-opacity", 0.6);
    });

    node.on("mousemove", (event: MouseEvent) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    });

    node.on("click", (event: MouseEvent, d: SimulatedNode) => {
      event.stopPropagation();
      setSelectedNode(d);
    });

    svg.on("click", () => {
      setSelectedNode(null);
    });

    simulation.on("tick", () => {
      link
        .attr("x1", (d: D3Link) => (d.source as SimulatedNode).x)
        .attr("y1", (d: D3Link) => (d.source as SimulatedNode).y)
        .attr("x2", (d: D3Link) => (d.target as SimulatedNode).x)
        .attr("y2", (d: D3Link) => (d.target as SimulatedNode).y);

      node.attr("transform", (d: SimulatedNode) => `translate(${d.x},${d.y})`);

      });

    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, [graph, dimensions.width, dimensions.height]);

  useEffect(() => {
    if (!svgRef.current || !selectedNode) return;

    const svg = d3.select(svgRef.current);
    const nodeSelection = svg.selectAll("g g");

    (nodeSelection.selectAll(".node-circle") as any)
      .attr("stroke", (d: SimulatedNode) => d.id === selectedNode.id ? "#6366F1" : PAGE_TYPE_CONFIG[d.type].color)
      .attr("stroke-width", (d: SimulatedNode) => d.id === selectedNode.id ? 3 : 1.5);

    (svg.selectAll("line") as any)
      .attr("stroke", (d: D3Link) => 
        ((d.source as SimulatedNode).id === selectedNode.id || (d.target as SimulatedNode).id === selectedNode.id) ? "#6366F1" : "#999"
      )
      .attr("stroke-width", (d: D3Link) => 
        ((d.source as SimulatedNode).id === selectedNode.id || (d.target as SimulatedNode).id === selectedNode.id) ? 2 : 1
      );
  }, [selectedNode]);

  if (dimensions.width === 0) {
    return (
      <div ref={containerRef} className="h-[400px] bg-muted/30 rounded-lg flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-muted-foreground">Preparing canvas...</span>
        </div>
      </div>
    );
  }

  if (graph.nodes.length === 0) {
    return (
      <div ref={containerRef} className="h-[400px] bg-muted/30 rounded-lg flex items-center justify-center">
        <p className="text-muted-foreground">No nodes to display</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-[400px] bg-muted/30 rounded-lg overflow-hidden">
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="absolute inset-0"
      />

      <HoverTooltip node={hoveredNode} position={mousePosition} />

      <NodePreviewModal 
        node={selectedNode} 
        onClose={() => setSelectedNode(null)}
        onViewFullPage={handleViewFullPage}
      />

      <div className="absolute bottom-4 left-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Brain className="h-3 w-3 text-blue-500" />
        <span>Entity</span>
        <Layers className="h-3 w-3 text-purple-500" />
        <span>Concept</span>
        <FileText className="h-3 w-3 text-green-500" />
        <span>Source</span>
        <BookOpen className="h-3 w-3 text-orange-500" />
        <span>Summary</span>
      </div>

      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-background shadow-md"
          onClick={() => {
            if (svgRef.current && zoomRef.current) {
              d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1.5);
            }
          }}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-background shadow-md"
          onClick={() => {
            if (svgRef.current && zoomRef.current) {
              d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 0.67);
            }
          }}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-background shadow-md"
          onClick={() => {
            if (svgRef.current && zoomRef.current) {
              d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.transform, d3.zoomIdentity);
            }
          }}
          aria-label="Reset zoom"
          title="Reset zoom"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="absolute bottom-4 right-4 text-xs text-muted-foreground">
        Hover to preview • Click for details • ESC to close • Scroll to zoom
      </div>
    </div>
  );
}
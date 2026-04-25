import { useState, useEffect, useRef, useCallback } from "react";
import { Brain, Layers, FileText, BookOpen, X, ExternalLink, ArrowLeft, ArrowRight, Loader2, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

interface SimulatedNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  index?: number;
}

interface D3Link {
  source: SimulatedNode;
  target: SimulatedNode;
  id: string;
}

const PAGE_TYPE_CONFIG = {
  entity: { icon: Brain, label: "Entity", color: "#3B82F6", bgColor: "#DBEAFE" },
  concept: { icon: Layers, label: "Concept", color: "#8B5CF6", bgColor: "#EDE9FE" },
  source: { icon: FileText, label: "Source", color: "#22C55E", bgColor: "#DCFCE7" },
  summary: { icon: BookOpen, label: "Summary", color: "#F97316", bgColor: "#FFEDD5" },
} as const;

interface SelectedNodeDetailsProps {
  node: SimulatedNode;
  onClose: () => void;
}

function SelectedNodeDetails({ node, onClose }: SelectedNodeDetailsProps) {
  const config = PAGE_TYPE_CONFIG[node.type];
  
  return (
    <Card className="absolute top-4 right-4 w-64 shadow-lg z-10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <config.icon className="h-4 w-4" style={{ color: config.color }} />
            {node.title}
          </CardTitle>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge className="text-xs" style={{ backgroundColor: config.bgColor, color: config.color }}>
            {config.label}
          </Badge>
          {node.isHub && (
            <Badge className="text-xs bg-blue-100 text-blue-800">Hub</Badge>
          )}
          {node.isOrphan && (
            <Badge className="text-xs bg-red-100 text-red-800">Orphan</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Slug: {node.slug}</p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" />
              {node.incomingLinks} incoming
            </span>
            <span className="flex items-center gap-1">
              <ArrowRight className="h-3 w-3" />
              {node.outgoingLinks} outgoing
            </span>
          </div>
        </div>
        <div className="pt-2 flex items-center gap-2 text-xs">
          <ExternalLink className="h-3 w-3" />
          <span className="text-muted-foreground">View in wiki pages section</span>
        </div>
      </CardContent>
    </Card>
  );
}

interface InteractiveGraphProps {
  graph: WikiGraph;
}

export function InteractiveGraph({ graph }: InteractiveGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedNode, setSelectedNode] = useState<SimulatedNode | null>(null);
  const [isLayoutReady, setIsLayoutReady] = useState(false);
  const simulationRef = useRef<d3.Simulation<SimulatedNode, D3Link> | null>(null);
  
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
    if (graph.nodes.length === 0 || dimensions.width === 0 || dimensions.height === 0) {
      return;
    }
    
    setIsLayoutReady(false);
    
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
    
    const links: D3Link[] = graph.edges.map(d => ({
      ...d,
      source: nodes.find(n => n.id === d.from)!,
      target: nodes.find(n => n.id === d.to)!,
    }));
    
    const simulation = d3.forceSimulation<SimulatedNode, D3Link>(nodes)
      .force("link", d3.forceLink<D3Link>(links).id(d => d.id).distance(30))
      .force("charge", d3.forceManyBody().strength(-100))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(8));
    
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
      const g = d3.select(this);
      const config = PAGE_TYPE_CONFIG[d.type];
      const radius = d.isHub ? 8 : d.isOrphan ? 5 : 6;
      
      if (d.isOrphan) {
        g.append("circle")
          .attr("r", radius + 3)
          .attr("fill", "none")
          .attr("stroke", "#EF4444")
          .attr("stroke-width", 1.5)
          .attr("stroke-dasharray", "3 2")
          .attr("opacity", 0.6);
      }
      
      g.append("circle")
        .attr("r", radius)
        .attr("fill", config.bgColor)
        .attr("stroke", config.color);
      
      g.append("title").text(d.title);
    });
    
    node.call(
      d3.drag<SVGGElement, SimulatedNode>()
        .on("start", (event: d3.D3DragEvent<SVGGElement, SimulatedNode, SimulatedNode>) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          event.subject.fx = event.subject.x;
          event.subject.fy = event.subject.y;
        })
        .on("drag", (event: d3.D3DragEvent<SVGGElement, SimulatedNode, SimulatedNode>) => {
          event.subject.fx = event.x;
          event.subject.fy = event.y;
        })
        .on("end", (event: d3.D3DragEvent<SVGGElement, SimulatedNode, SimulatedNode>) => {
          if (!event.active) simulation.alphaTarget(0);
          event.subject.fx = null;
          event.subject.fy = null;
        })
    );
    
    node.on("click", (event: MouseEvent, d: SimulatedNode) => {
      event.stopPropagation();
      setSelectedNode(d);
    });
    
    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
      
      node.attr("transform", d => `translate(${d.x},${d.y})`);
      
      if (simulation.alpha() < 0.01 && !isLayoutReady) {
        setIsLayoutReady(true);
      }
    });
    
    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, [graph, dimensions.width, dimensions.height]);
  
  useEffect(() => {
    if (!svgRef.current || !selectedNode) return;
    
    const svg = d3.select(svgRef.current);
    const node = svg.selectAll<SVGGElement, SimulatedNode>("g g");
    
    node.selectAll("circle:nth-child(2)")
      .attr("stroke", d => d.id === selectedNode.id ? "#6366F1" : PAGE_TYPE_CONFIG[d.type].color)
      .attr("stroke-width", d => d.id === selectedNode.id ? 3 : 1.5);
    
    svg.selectAll<SVGLineElement, D3Link>("line")
      .attr("stroke", d => 
        d.source.id === selectedNode.id || d.target.id === selectedNode.id ? "#6366F1" : "#999"
      )
      .attr("stroke-width", d => 
        d.source.id === selectedNode.id || d.target.id === selectedNode.id ? 2 : 1
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
      
      {!isLayoutReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/30">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Arranging nodes...</span>
          </div>
        </div>
      )}
      
      {selectedNode && (
        <SelectedNodeDetails node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
      
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
        Drag to rearrange • Click for details • Scroll to zoom
      </div>
    </div>
  );
}
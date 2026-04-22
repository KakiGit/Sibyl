import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Brain, Layers, FileText, BookOpen, X, ExternalLink, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedNode, setSelectedNode] = useState<SimulatedNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [isLayoutReady, setIsLayoutReady] = useState(false);
  const simulationRef = useRef<d3.Simulation<SimulatedNode, D3Link> | null>(null);
  const nodesRef = useRef<SimulatedNode[]>([]);
  const linksRef = useRef<D3Link[]>([]);
  
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
    
    const nodes: SimulatedNode[] = graph.nodes.map(d => ({
      ...d,
      x: 0,
      y: 0,
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
    
    nodesRef.current = nodes;
    linksRef.current = links;
    
    const simulation = d3.forceSimulation<SimulatedNode, D3Link>(nodes)
      .force("link", d3.forceLink<D3Link>(links).id(d => d.id))
      .force("charge", d3.forceManyBody())
      .force("x", d3.forceX())
      .force("y", d3.forceY());
    
    simulationRef.current = simulation;
    
    simulation.on("tick", () => {
      if (!svgRef.current) return;
      
      const svg = d3.select(svgRef.current);
      
      svg.selectAll<SVGLineElement, D3Link>(".link")
        .attr("x1", d => d.source.x + dimensions.width / 2)
        .attr("y1", d => d.source.y + dimensions.height / 2)
        .attr("x2", d => d.target.x + dimensions.width / 2)
        .attr("y2", d => d.target.y + dimensions.height / 2);
      
      svg.selectAll<SVGGElement, SimulatedNode>(".node")
        .attr("transform", d => `translate(${d.x + dimensions.width / 2},${d.y + dimensions.height / 2})`);
      
      if (simulation.alpha() < 0.01) {
        setIsLayoutReady(true);
      }
    });
    
    if (svgRef.current) {
      const svg = d3.select(svgRef.current);
      
      svg.selectAll(".link")
        .data(links)
        .join("line")
        .attr("class", "link")
        .attr("stroke", "#999")
        .attr("stroke-opacity", 0.6)
        .attr("stroke-width", 1);
      
      const nodeGroup = svg.selectAll<SVGGElement, SimulatedNode>(".node")
        .data(nodes)
        .join("g")
        .attr("class", "node")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5);
      
      nodeGroup.each(function(d) {
        const group = d3.select(this);
        const config = PAGE_TYPE_CONFIG[d.type];
        const radius = d.isHub ? 8 : d.isOrphan ? 5 : 6;
        
        if (d.isOrphan) {
          group.append("circle")
            .attr("r", radius + 3)
            .attr("fill", "none")
            .attr("stroke", "#EF4444")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "4 2")
            .attr("opacity", 0.5);
        }
        
        group.append("circle")
          .attr("r", radius)
          .attr("fill", config.bgColor)
          .attr("stroke", config.color);
        
        group.append("title").text(d.title);
      });
      
      nodeGroup.call(
        d3.drag<SVGGElement, SimulatedNode>()
          .on("start", (event) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
          })
          .on("drag", (event) => {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
          })
          .on("end", (event) => {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
          })
      );
      
      nodeGroup.on("click", (_, d) => setSelectedNode(d));
      nodeGroup.on("mouseenter", (_, d) => setHoveredNode(d.id));
      nodeGroup.on("mouseleave", () => setHoveredNode(null));
    }
    
    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, [graph, dimensions.width, dimensions.height]);
  
  useEffect(() => {
    if (!svgRef.current || hoveredNode === null || selectedNode === null) return;
    
    const svg = d3.select(svgRef.current);
    
    svg.selectAll<SVGLineElement, D3Link>(".link")
      .attr("stroke", d => {
        const isHighlighted = 
          hoveredNode === d.source.id ||
          hoveredNode === d.target.id ||
          selectedNode?.id === d.source.id ||
          selectedNode?.id === d.target.id;
        return isHighlighted ? "#6366F1" : "#999";
      })
      .attr("stroke-width", d => {
        const isHighlighted = 
          hoveredNode === d.source.id ||
          hoveredNode === d.target.id ||
          selectedNode?.id === d.source.id ||
          selectedNode?.id === d.target.id;
        return isHighlighted ? 2 : 1;
      })
      .attr("stroke-opacity", d => {
        const isHighlighted = 
          hoveredNode === d.source.id ||
          hoveredNode === d.target.id ||
          selectedNode?.id === d.source.id ||
          selectedNode?.id === d.target.id;
        return isHighlighted ? 1 : 0.6;
      });
    
    svg.selectAll<SVGGElement, SimulatedNode>(".node")
      .select("circle:nth-child(2)")
      .attr("stroke", d => {
        const isSelected = selectedNode?.id === d.id;
        const isHovered = hoveredNode === d.id;
        return isSelected ? "#6366F1" : isHovered ? "#4B5563" : PAGE_TYPE_CONFIG[d.type].color;
      })
      .attr("stroke-width", d => {
        const isSelected = selectedNode?.id === d.id;
        const isHovered = hoveredNode === d.id;
        return isSelected || isHovered ? 3 : 1.5;
      });
  }, [hoveredNode, selectedNode]);
  
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
        viewBox={`${-dimensions.width / 2} ${-dimensions.height / 2} ${dimensions.width} ${dimensions.height}`}
        className="absolute inset-0"
        style={{ maxWidth: "100%", height: "auto" }}
      >
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
      
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
      
      <div className="absolute bottom-4 right-4 text-xs text-muted-foreground">
        Drag nodes to rearrange • Click for details
      </div>
    </div>
  );
}
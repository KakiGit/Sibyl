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
  index?: number;
}

interface D3Link {
  source: string | SimulatedNode;
  target: string | SimulatedNode;
  id: string;
}

const PAGE_TYPE_CONFIG = {
  entity: { icon: Brain, label: "Entity", color: "#3B82F6", bgColor: "#DBEAFE" },
  concept: { icon: Layers, label: "Concept", color: "#8B5CF6", bgColor: "#EDE9FE" },
  source: { icon: FileText, label: "Source", color: "#22C55E", bgColor: "#DCFCE7" },
  summary: { icon: BookOpen, label: "Summary", color: "#F97316", bgColor: "#FFEDD5" },
} as const;

function useD3ForceLayout(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number) {
  const [simulatedNodes, setSimulatedNodes] = useState<SimulatedNode[]>([]);
  const [isLayoutReady, setIsLayoutReady] = useState(false);
  const [layoutProgress, setLayoutProgress] = useState(0);
  const simulationRef = useRef<d3.Simulation<SimulatedNode, D3Link> | null>(null);
  const nodesRef = useRef<SimulatedNode[]>([]);
  
  const nodeCount = nodes.length;
  const maxIterations = useMemo(() => {
    if (nodeCount <= 20) return 150;
    if (nodeCount <= 50) return 100;
    if (nodeCount <= 100) return 75;
    return 50;
  }, [nodeCount]);
  
  useEffect(() => {
    if (nodes.length === 0 || width === 0 || height === 0) {
      setSimulatedNodes([]);
      nodesRef.current = [];
      setIsLayoutReady(false);
      setLayoutProgress(0);
      return;
    }
    
    setIsLayoutReady(false);
    setLayoutProgress(0);
    
    const initialNodes: SimulatedNode[] = nodes.map((node) => ({
      ...node,
      x: width / 2 + (Math.random() - 0.5) * 100,
      y: height / 2 + (Math.random() - 0.5) * 100,
      vx: 0,
      vy: 0,
    }));
    
    nodesRef.current = initialNodes;
    setSimulatedNodes(initialNodes);
    
    const links: D3Link[] = edges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
    }));
    
    const simulation = d3.forceSimulation<SimulatedNode, D3Link>(initialNodes)
      .force("link", d3.forceLink<SimulatedNode, D3Link>(links)
        .id((d: SimulatedNode) => d.id)
        .distance(120)
        .strength(0.5))
      .force("charge", d3.forceManyBody()
        .strength(-200)
        .distanceMax(300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide<SimulatedNode>()
        .radius((d: SimulatedNode) => d.isHub ? 40 : d.isOrphan ? 30 : 35)
        .strength(0.7))
      .alphaDecay(0.02)
      .velocityDecay(0.4)
      .stop();
    
    simulationRef.current = simulation;
    
    let iterations = 0;
    const animate = () => {
      if (iterations < maxIterations && simulationRef.current) {
        simulationRef.current.tick();
        iterations++;
        
        const currentNodes = nodesRef.current.map((node) => {
          const padding = 50;
          return {
            ...node,
            x: Math.max(padding, Math.min(width - padding, node.x)),
            y: Math.max(padding, Math.min(height - padding, node.y)),
          };
        });
        
        nodesRef.current = currentNodes;
        setSimulatedNodes([...currentNodes]);
        setLayoutProgress(Math.round((iterations / maxIterations) * 100));
        
        requestAnimationFrame(animate);
      } else {
        setIsLayoutReady(true);
      }
    };
    
    requestAnimationFrame(animate);
    
    return () => {
      simulationRef.current = null;
    };
  }, [nodes, edges, width, height, maxIterations]);
  
  return { simulatedNodes, isLayoutReady, layoutProgress };
}

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
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedNode, setSelectedNode] = useState<SimulatedNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  
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
  
  const { simulatedNodes, isLayoutReady, layoutProgress } = useD3ForceLayout(
    graph.nodes,
    graph.edges,
    dimensions.width,
    dimensions.height
  );
  
  const nodeMap = useMemo(() => {
    const map = new Map<string, SimulatedNode>();
    simulatedNodes.forEach(n => map.set(n.id, n));
    return map;
  }, [simulatedNodes]);
  
  const handleNodeClick = useCallback((node: SimulatedNode) => {
    setSelectedNode(node);
  }, []);
  
  const handleCloseDetails = useCallback(() => {
    setSelectedNode(null);
  }, []);
  
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
  
  if (simulatedNodes.length === 0) {
    return (
      <div ref={containerRef} className="h-[400px] bg-muted/30 rounded-lg flex items-center justify-center">
        <p className="text-muted-foreground">No nodes to display</p>
      </div>
    );
  }
  
  if (!isLayoutReady) {
    return (
      <div ref={containerRef} className="relative h-[400px] bg-muted/30 rounded-lg overflow-hidden">
        <svg width={dimensions.width} height={dimensions.height} className="absolute inset-0">
          {simulatedNodes.map((node) => {
            const config = PAGE_TYPE_CONFIG[node.type];
            const radius = node.isHub ? 24 : node.isOrphan ? 16 : 20;
            return (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                <circle r={radius} fill={config.bgColor} stroke={config.color} strokeWidth={2} opacity={0.7} />
              </g>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <div className="text-sm text-muted-foreground">Optimizing layout...</div>
            <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-100" 
                style={{ width: `${layoutProgress}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground">{layoutProgress}%</div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div ref={containerRef} className="relative h-[400px] bg-muted/30 rounded-lg overflow-hidden">
      <svg
        width={dimensions.width}
        height={dimensions.height}
        className="absolute inset-0"
      >
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        {graph.edges.map((edge) => {
          const fromNode = nodeMap.get(edge.from);
          const toNode = nodeMap.get(edge.to);
          
          if (!fromNode || !toNode) return null;
          
          const isHighlighted = 
            hoveredNode === edge.from || 
            hoveredNode === edge.to ||
            selectedNode?.id === edge.from ||
            selectedNode?.id === edge.to;
          
          return (
            <line
              key={edge.id}
              x1={fromNode.x}
              y1={fromNode.y}
              x2={toNode.x}
              y2={toNode.y}
              stroke={isHighlighted ? "#6366F1" : "#CBD5E1"}
              strokeWidth={isHighlighted ? 2 : 1}
              strokeOpacity={isHighlighted ? 1 : 0.6}
              className="transition-all duration-200"
            />
          );
        })}
        
        {simulatedNodes.map((node) => {
          const config = PAGE_TYPE_CONFIG[node.type];
          const isSelected = selectedNode?.id === node.id;
          const isHovered = hoveredNode === node.id;
          const isConnectedToSelected = selectedNode && graph.edges.some(
            e => (e.from === selectedNode.id && e.to === node.id) ||
                 (e.to === selectedNode.id && e.from === node.id)
          );
          
          const radius = node.isHub ? 24 : node.isOrphan ? 16 : 20;
          const scale = isSelected ? 1.3 : isHovered ? 1.15 : isConnectedToSelected ? 1.1 : 1;
          
          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              onClick={() => handleNodeClick(node)}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer"
              style={{ transition: "transform 0.2s ease-out" }}
            >
              {node.isOrphan && (
                <circle
                  r={radius + 4}
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  opacity={0.6}
                />
              )}
              
              <circle
                r={radius * scale}
                fill={config.bgColor}
                stroke={isSelected ? "#6366F1" : config.color}
                strokeWidth={isSelected ? 3 : 2}
                filter={isSelected || isHovered ? "url(#glow)" : undefined}
                className="transition-all duration-200"
              />
              
              <text
                y={radius * scale + 16}
                textAnchor="middle"
                fontSize={11}
                fill={isSelected ? "#6366F1" : "#374151"}
                fontWeight={isSelected || isHovered ? 600 : 400}
                className="select-none"
              >
                {node.title.length > 15 ? node.title.slice(0, 15) + "..." : node.title}
              </text>
              
              {(node.isHub || node.isOrphan) && (
                <text
                  y={-radius * scale - 8}
                  textAnchor="middle"
                  fontSize={9}
                  fill={node.isHub ? "#3B82F6" : "#EF4444"}
                  fontWeight={500}
                  className="select-none"
                >
                  {node.isHub ? "Hub" : "Orphan"}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      
      {selectedNode && (
        <SelectedNodeDetails node={selectedNode} onClose={handleCloseDetails} />
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
        Click a node to see details
      </div>
    </div>
  );
}
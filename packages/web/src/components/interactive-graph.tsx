import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Brain, Layers, FileText, BookOpen, X, ExternalLink, ArrowLeft, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
}

const PAGE_TYPE_CONFIG = {
  entity: { icon: Brain, label: "Entity", color: "#3B82F6", bgColor: "#DBEAFE" },
  concept: { icon: Layers, label: "Concept", color: "#8B5CF6", bgColor: "#EDE9FE" },
  source: { icon: FileText, label: "Source", color: "#22C55E", bgColor: "#DCFCE7" },
  summary: { icon: BookOpen, label: "Summary", color: "#F97316", bgColor: "#FFEDD5" },
} as const;

function useForceDirectedLayout(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number) {
  const [simulatedNodes, setSimulatedNodes] = useState<SimulatedNode[]>([]);
  const animationRef = useRef<number | null>(null);
  
  const initializeNodes = useCallback(() => {
    if (nodes.length === 0) return [];
    
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 3;
    
    return nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      const jitter = Math.random() * 50 - 25;
      return {
        ...node,
        x: centerX + radius * Math.cos(angle) + jitter,
        y: centerY + radius * Math.sin(angle) + jitter,
        vx: 0,
        vy: 0,
      };
    });
  }, [nodes, width, height]);
  
  useEffect(() => {
    if (nodes.length === 0 || width === 0 || height === 0) {
      setSimulatedNodes([]);
      return;
    }
    
    const initialNodes = initializeNodes();
    setSimulatedNodes(initialNodes);
    
    const nodeMap = new Map<string, SimulatedNode>();
    initialNodes.forEach(n => nodeMap.set(n.id, n));
    
    const adjacencyList = new Map<string, Set<string>>();
    edges.forEach(edge => {
      if (!adjacencyList.has(edge.from)) adjacencyList.set(edge.from, new Set());
      if (!adjacencyList.has(edge.to)) adjacencyList.set(edge.to, new Set());
      adjacencyList.get(edge.from)!.add(edge.to);
      adjacencyList.get(edge.to)!.add(edge.from);
    });
    
    const simulate = () => {
      const currentNodes = [...simulatedNodes];
      
      for (let i = 0; i < currentNodes.length; i++) {
        const node = currentNodes[i];
        if (!nodeMap.has(node.id)) continue;
        
        for (let j = i + 1; j < currentNodes.length; j++) {
          const other = currentNodes[j];
          if (!nodeMap.has(other.id)) continue;
          
          const dx = other.x - node.x;
          const dy = other.y - node.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = 80;
          
          if (distance < minDist) {
            const force = (minDist - distance) / distance * 0.5;
            const fx = dx * force;
            const fy = dy * force;
            node.vx -= fx;
            node.vy -= fy;
            other.vx += fx;
            other.vy += fy;
          }
          
          const repulsion = 50 / (distance * distance);
          node.vx -= dx * repulsion * 0.01;
          node.vy -= dy * repulsion * 0.01;
          other.vx += dx * repulsion * 0.01;
          other.vy += dy * repulsion * 0.01;
        }
        
        const connected = adjacencyList.get(node.id);
        if (connected) {
          for (const targetId of connected) {
            const target = nodeMap.get(targetId);
            if (!target) continue;
            
            const dx = target.x - node.x;
            const dy = target.y - node.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
            const idealDist = 150;
            
            const attraction = (distance - idealDist) * 0.01;
            node.vx += dx * attraction;
            node.vy += dy * attraction;
          }
        }
        
        const centerX = width / 2;
        const centerY = height / 2;
        node.vx += (centerX - node.x) * 0.001;
        node.vy += (centerY - node.y) * 0.001;
        
        node.vx *= 0.9;
        node.vy *= 0.9;
        
        node.x += node.vx;
        node.y += node.vy;
        
        const padding = 40;
        node.x = Math.max(padding, Math.min(width - padding, node.x));
        node.y = Math.max(padding, Math.min(height - padding, node.y));
      }
      
      currentNodes.forEach(n => nodeMap.set(n.id, n));
      setSimulatedNodes(currentNodes);
    };
    
    let iterations = 0;
    const maxIterations = 300;
    
    const animate = () => {
      if (iterations < maxIterations) {
        simulate();
        iterations++;
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [nodes, edges, width, height, initializeNodes]);
  
  return simulatedNodes;
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
  
  const simulatedNodes = useForceDirectedLayout(
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
  
  if (dimensions.width === 0 || simulatedNodes.length === 0) {
    return (
      <div ref={containerRef} className="h-[400px] bg-muted/30 rounded-lg flex items-center justify-center">
        <p className="text-muted-foreground">Initializing graph...</p>
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
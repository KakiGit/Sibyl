import { Wifi, WifiOff, Loader2, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useWebSocket, type WebSocketStatus } from "@/hooks/use-websocket";
import { useWorkQueue } from "@/hooks/use-work-queue";

function StatusIndicator({ status }: { status: WebSocketStatus }) {
  switch (status) {
    case "connected":
      return <Wifi className="h-3 w-3 text-green-500" />;
    case "connecting":
      return <Loader2 className="h-3 w-3 text-yellow-500 animate-spin" />;
    case "disconnected":
      return <WifiOff className="h-3 w-3 text-gray-400" />;
    case "error":
      return <WifiOff className="h-3 w-3 text-red-500" />;
  }
}

function StatusText({ status }: { status: WebSocketStatus }) {
  switch (status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting...";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Error";
  }
}

export function WebSocketStatus() {
  const { status, clientId } = useWebSocket({
    autoReconnect: true,
    reconnectDelay: 3000,
    maxReconnectAttempts: 5,
  });

  const { status: queueStatus } = useWorkQueue();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="flex items-center gap-1">
          <StatusIndicator status={status} />
          <span className="text-xs">
            <StatusText status={status} />
          </span>
        </Badge>
        {clientId && status === "connected" && (
          <span className="text-xs text-muted-foreground">
            ID: {clientId.slice(-6)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="flex items-center gap-1">
          <Activity className={`h-3 w-3 ${queueStatus.active ? "text-orange-500" : "text-gray-400"}`} />
          <span className="text-xs">
            {queueStatus.active ? "LLM Active" : "LLM Inactive"}
          </span>
        </Badge>
        {queueStatus.queueLength > 0 && (
          <span className="text-xs text-muted-foreground">
            {queueStatus.queueLength} task(s)
          </span>
        )}
      </div>
    </div>
  );
}
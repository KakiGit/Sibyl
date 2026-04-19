import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Key, CheckCircle, AlertCircle } from "lucide-react";

async function fetchAuthStatus() {
  const response = await fetch("/api/auth/status");
  if (!response.ok) throw new Error("Failed to fetch auth status");
  return response.json();
}

async function loginWithApiKey(apiKey: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Login failed");
  }
  return response.json();
}

export function AuthStatus() {
  const [apiKey, setApiKey] = useState("");
  const [storedToken, setStoredToken] = useState<string | null>(
    localStorage.getItem("sibyl_token")
  );

  const { data: statusData, isLoading } = useQuery({
    queryKey: ["auth-status"],
    queryFn: fetchAuthStatus,
  });

  const loginMutation = useMutation({
    mutationFn: loginWithApiKey,
    onSuccess: (data) => {
      localStorage.setItem("sibyl_token", data.data.token);
      setStoredToken(data.data.token);
      setApiKey("");
    },
  });

  const handleLogin = () => {
    if (apiKey.trim()) {
      loginMutation.mutate(apiKey.trim());
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("sibyl_token");
    setStoredToken(null);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-4 w-24 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  const status = statusData?.data || { enabled: false };

  if (!status.enabled) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Authentication
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {storedToken ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-yellow-500" />
            )}
            <span className="text-sm">
              {storedToken ? "Authenticated" : "Not authenticated"}
            </span>
          </div>

          {storedToken ? (
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Enter API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="flex-1 px-3 py-1 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Button
                  size="sm"
                  onClick={handleLogin}
                  disabled={!apiKey.trim() || loginMutation.isPending}
                >
                  {loginMutation.isPending ? "Logging in..." : "Login"}
                </Button>
              </div>
              {loginMutation.error && (
                <p className="text-sm text-red-500">
                  {(loginMutation.error as Error).message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                <Key className="h-3 w-3 inline mr-1" />
                Use your SIBYL_API_KEY to authenticate
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
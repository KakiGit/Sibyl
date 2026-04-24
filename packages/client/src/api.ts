import { getServerUrl } from "@sibyl/shared";

const API_KEY_HEADER = "x-api-key";

export interface RequestOptions {
  server?: string;
  apiKey?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}

export function getApiKey(options?: RequestOptions): string | undefined {
  return options?.apiKey || process.env.SIBYL_API_KEY;
}

export function getApiClientUrl(options?: RequestOptions): string {
  return options?.server || getServerUrl();
}

export async function apiFetch(
  endpoint: string,
  options?: RequestOptions
): Promise<Response> {
  const serverUrl = getApiClientUrl(options);
  const apiKey = getApiKey(options);
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (apiKey) {
    headers[API_KEY_HEADER] = apiKey;
  }
  
  const url = `${serverUrl}${endpoint}`;
  
  return fetch(url, {
    method: options?.method || "GET",
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
}

export async function apiGet(
  endpoint: string,
  options?: RequestOptions
): Promise<Response> {
  return apiFetch(endpoint, { ...options, method: "GET" });
}

export async function apiPost(
  endpoint: string,
  body: unknown,
  options?: RequestOptions
): Promise<Response> {
  return apiFetch(endpoint, { ...options, method: "POST", body });
}

export async function apiPut(
  endpoint: string,
  body: unknown,
  options?: RequestOptions
): Promise<Response> {
  return apiFetch(endpoint, { ...options, method: "PUT", body });
}

export async function apiDelete(
  endpoint: string,
  options?: RequestOptions
): Promise<Response> {
  return apiFetch(endpoint, { ...options, method: "DELETE" });
}
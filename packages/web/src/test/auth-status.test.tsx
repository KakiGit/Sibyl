import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthStatus } from "../components/auth-status";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const mockLocalStorage = () => {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((key) => delete store[key]);
    },
  };
};

Object.defineProperty(window, "localStorage", {
  value: mockLocalStorage(),
});

describe("AuthStatus", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("should not render when auth is disabled", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url: string | URL | Request) => {
      if (String(url) === "/api/auth/status") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { enabled: false } }),
        } as Response);
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    render(<AuthStatus />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.queryByText("Authentication")).not.toBeInTheDocument();
    });
  });

  it("should show not authenticated when auth enabled and no token", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url: string | URL | Request) => {
      if (String(url) === "/api/auth/status") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { enabled: true } }),
        } as Response);
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    render(<AuthStatus />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Authentication")).toBeInTheDocument();
      expect(screen.getByText("Not authenticated")).toBeInTheDocument();
    });
  });

  it("should show authenticated when token stored", async () => {
    window.localStorage.setItem("sibyl_token", "test-token");

    vi.spyOn(global, "fetch").mockImplementation((url: string | URL | Request) => {
      if (String(url) === "/api/auth/status") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { enabled: true } }),
        } as Response);
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    render(<AuthStatus />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Authenticated")).toBeInTheDocument();
      expect(screen.getByText("Logout")).toBeInTheDocument();
    });
  });

  it("should show API key input when not authenticated", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url: string | URL | Request) => {
      if (String(url) === "/api/auth/status") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { enabled: true } }),
        } as Response);
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    render(<AuthStatus />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter API key")).toBeInTheDocument();
      expect(screen.getByText("Login")).toBeInTheDocument();
    });
  });

  it("should login with API key", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url: string | URL | Request, options?: RequestInit) => {
      if (String(url) === "/api/auth/status") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { enabled: true } }),
        } as Response);
      }
      if (String(url) === "/api/auth/login" && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { token: "new-token" } }),
        } as Response);
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    render(<AuthStatus />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter API key")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Enter API key");
    fireEvent.change(input, { target: { value: "test-api-key" } });

    const loginButton = screen.getByText("Login");
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(window.localStorage.getItem("sibyl_token")).toBe("new-token");
      expect(screen.getByText("Authenticated")).toBeInTheDocument();
    });
  });

  it("should show error on login failure", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url: string | URL | Request, options?: RequestInit) => {
      if (String(url) === "/api/auth/status") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { enabled: true } }),
        } as Response);
      }
      if (String(url) === "/api/auth/login" && options?.method === "POST") {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "Invalid API key" }),
        } as Response);
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    render(<AuthStatus />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter API key")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Enter API key");
    fireEvent.change(input, { target: { value: "wrong-key" } });

    const loginButton = screen.getByText("Login");
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByText("Invalid API key")).toBeInTheDocument();
    });
  });

  it("should logout and clear token", async () => {
    window.localStorage.setItem("sibyl_token", "test-token");

    vi.spyOn(global, "fetch").mockImplementation((url: string | URL | Request) => {
      if (String(url) === "/api/auth/status") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { enabled: true } }),
        } as Response);
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    render(<AuthStatus />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Authenticated")).toBeInTheDocument();
    });

    const logoutButton = screen.getByText("Logout");
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(window.localStorage.getItem("sibyl_token")).toBeNull();
      expect(screen.getByText("Not authenticated")).toBeInTheDocument();
    });
  });

  it("should disable login button when API key empty", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url: string | URL | Request) => {
      if (String(url) === "/api/auth/status") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { enabled: true } }),
        } as Response);
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    render(<AuthStatus />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter API key")).toBeInTheDocument();
    });

    const loginButton = screen.getByText("Login");
    expect(loginButton).toBeDisabled();
  });

  it("should enable login button when API key provided", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url: string | URL | Request) => {
      if (String(url) === "/api/auth/status") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { enabled: true } }),
        } as Response);
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    render(<AuthStatus />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter API key")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Enter API key");
    fireEvent.change(input, { target: { value: "some-key" } });

    const loginButton = screen.getByText("Login");
    expect(loginButton).not.toBeDisabled();
  });
});
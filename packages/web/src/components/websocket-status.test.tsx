import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WebSocketStatus } from "./websocket-status";

vi.mock("@/hooks/use-websocket", () => ({
  useWebSocket: vi.fn(() => ({
    status: "connected",
    clientId: "test-client-123456",
  })),
}));

describe("WebSocketStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders connected status", () => {
    render(<WebSocketStatus />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("renders client ID when connected", () => {
    render(<WebSocketStatus />);
    expect(screen.getByText(/ID: 123456/)).toBeInTheDocument();
  });
});
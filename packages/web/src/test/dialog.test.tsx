import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "@/components/ui/dialog";

describe("ConfirmDialog", () => {
  it("renders when open is true", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Test Dialog"
        description="Test description"
        onConfirm={() => {}}
      />
    );
    expect(screen.getByText("Test Dialog")).toBeInTheDocument();
    expect(screen.getByText("Test description")).toBeInTheDocument();
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("does not render when open is false", () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={() => {}}
        title="Test Dialog"
        description="Test description"
        onConfirm={() => {}}
      />
    );
    expect(screen.queryByText("Test Dialog")).not.toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Test Dialog"
        description="Test description"
        onConfirm={onConfirm}
      />
    );
    fireEvent.click(screen.getByText("Confirm"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onOpenChange(false) when cancel button is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Test Dialog"
        description="Test description"
        onConfirm={() => {}}
      />
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows custom confirm label", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete Item"
        description="Are you sure?"
        onConfirm={() => {}}
        confirmLabel="Delete"
      />
    );
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Test Dialog"
        description="Test description"
        onConfirm={() => {}}
        loading={true}
      />
    );
    expect(screen.getByText("Processing...")).toBeInTheDocument();
  });

  it("disables buttons when loading", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Test Dialog"
        description="Test description"
        onConfirm={() => {}}
        loading={true}
      />
    );
    const confirmButton = screen.getByText("Processing...").closest("button");
    const cancelButton = screen.getByText("Cancel").closest("button");
    expect(confirmButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();
  });

  it("applies destructive variant styling", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete Item"
        description="This will permanently delete the item"
        onConfirm={() => {}}
        variant="destructive"
      />
    );
    const confirmButton = screen.getByText("Confirm").closest("button");
    expect(confirmButton?.className).toContain("bg-red-600");
  });

  it("closes on backdrop click", () => {
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Test Dialog"
        description="Test description"
        onConfirm={() => {}}
      />
    );
    const backdrop = document.querySelector(".fixed.inset-0.bg-black\\/50");
    fireEvent.click(backdrop!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
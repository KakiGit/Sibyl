import * as React from "react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
}

interface DialogHeaderProps {
  children: React.ReactNode;
  className?: string;
}

interface DialogTitleProps {
  children: React.ReactNode;
  className?: string;
}

interface DialogDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

interface DialogFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div 
        className="fixed inset-0 bg-black/50" 
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
        {children}
      </div>
    </div>
  );
}

export function DialogContent({ children, className }: DialogContentProps) {
  return (
    <div 
      className={cn(
        "relative bg-background rounded-lg shadow-lg p-6 w-full max-w-md",
        "border border-border",
        className
      )}
      role="dialog"
      aria-modal="true"
    >
      {children}
    </div>
  );
}

export function DialogHeader({ children, className }: DialogHeaderProps) {
  return (
    <div className={cn("mb-4", className)}>
      {children}
    </div>
  );
}

export function DialogTitle({ children, className }: DialogTitleProps) {
  return (
    <h2 className={cn("text-lg font-semibold", className)}>
      {children}
    </h2>
  );
}

export function DialogDescription({ children, className }: DialogDescriptionProps) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {children}
    </p>
  );
}

export function DialogFooter({ children, className }: DialogFooterProps) {
  return (
    <div className={cn("mt-6 flex justify-end gap-3", className)}>
      {children}
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  variant = "default",
  loading = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: "default" | "destructive";
  loading?: boolean;
}) {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            onClick={handleCancel}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={cn(
              "px-4 py-2 text-sm rounded-md text-primary-foreground disabled:opacity-50",
              variant === "destructive" 
                ? "bg-red-600 hover:bg-red-700" 
                : "bg-primary hover:bg-primary/90"
            )}
          >
            {loading ? "Processing..." : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
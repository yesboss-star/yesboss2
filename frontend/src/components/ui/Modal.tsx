"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { forwardRef, HTMLAttributes } from "react";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  className?: string;
}

const Modal = ({ open, onOpenChange, children, size = "md", className }: ModalProps) => {
  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    full: "max-w-[95vw]",
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full mx-4",
            "glass rounded-2xl shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            sizeClasses[size],
            className
          )}
        >
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

const ModalHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center justify-between p-6 pb-4", className)}
      {...props}
    />
  )
);
ModalHeader.displayName = "ModalHeader";

const ModalTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <Dialog.Title
      ref={ref}
      className={cn("text-xl font-semibold", className)}
      {...props}
    />
  )
);
ModalTitle.displayName = "ModalTitle";

const ModalClose = forwardRef<HTMLButtonElement, HTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => (
    <Dialog.Close asChild>
      <button
        ref={ref}
        className={cn(
          "absolute right-4 top-4 rounded-lg p-2 text-text-muted hover:text-foreground hover:bg-surface transition-colors cursor-pointer",
          className
        )}
        {...props}
      >
        <X className="w-5 h-5" />
        <span className="sr-only">Close</span>
      </button>
    </Dialog.Close>
  )
);
ModalClose.displayName = "ModalClose";

const ModalContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("px-6 pb-6", className)}
      {...props}
    />
  )
);
ModalContent.displayName = "ModalContent";

const ModalFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center justify-end gap-3 p-6 pt-0", className)}
      {...props}
    />
  )
);
ModalFooter.displayName = "ModalFooter";

export { Modal, ModalHeader, ModalTitle, ModalClose, ModalContent, ModalFooter };

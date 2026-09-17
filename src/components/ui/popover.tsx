import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Popover({
  children,
  ...props
}: ComponentPropsWithoutRef<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root {...props}>{children}</PopoverPrimitive.Root>;
}

export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className,
  align = "end",
  sideOffset = 8,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & { children?: ReactNode }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-[80] w-64 rounded-lg border border-border bg-surface p-3 text-fg shadow-float outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "origin-[var(--radix-popover-content-transform-origin)]",
          className,
        )}
        {...props}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

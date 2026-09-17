import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function Hint({
  title,
  body,
  className,
  side = "bottom",
}: {
  title: string;
  body: string;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-md text-subtle hover:text-fg",
            className,
          )}
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
        >
          <CircleHelp className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} align="end">
        <p className="text-sm font-medium text-fg">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
      </PopoverContent>
    </Popover>
  );
}

import * as React from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ActionTooltipProps {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactElement;
}

// The span is the hover target so the tooltip still fires when the child button is disabled
// (disabled buttons get pointer-events-none). Requires an ancestor TooltipProvider.
export const ActionTooltip: React.FC<ActionTooltipProps> = ({ label, hint, className, children }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className={cn("inline-flex", className)}>{children}</span>
    </TooltipTrigger>
    <TooltipContent>
      <p>{label}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </TooltipContent>
  </Tooltip>
);

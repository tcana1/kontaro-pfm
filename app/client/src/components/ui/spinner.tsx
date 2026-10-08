
import { cn } from "@/lib/utils";

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
}

export function Spinner({ className, size = "md", ...props }: SpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8"
  };

  return (
    <div
      className={cn("animate-spin", sizeClasses[size], className)}
      {...props}
    >
      <div className="h-full w-full border-4 border-current border-t-transparent text-primary rounded-full" />
    </div>
  );
}

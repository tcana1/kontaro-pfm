import { useTranslation } from "react-i18next";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface ChartStateProps {
  className?: string;
}

export function ChartLoadingState({ className }: ChartStateProps) {
  const { t } = useTranslation();
  return (
    <div className={cn("h-96 flex items-center justify-center", className)} role="status">
      <Spinner size="lg" />
      <span className="sr-only">{t('Loading report data...')}</span>
    </div>
  );
}

export function ChartEmptyState({ message, className }: ChartStateProps & { message: string }) {
  return (
    <div className={cn("h-96 flex items-center justify-center text-muted-foreground", className)}>
      <p className="text-sm">{message}</p>
    </div>
  );
}

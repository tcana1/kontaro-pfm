import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDateFnsLocale } from '@/lib/date-fns-locale';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { format } from 'date-fns';
import { Check, Copy, FileText, StepForward, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetClose,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getMcpUrl } from '@/lib/config';
import { insightRunsQueryKey } from '@/hooks/useInsightRun';
import { useQueryClient } from '@tanstack/react-query';
import type { InsightRun } from '@/hooks/useInsightRun';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  run: InsightRun | null;
  selectedMonth: Date;
}

function CopyableBlock({ text, multiline = false }: { text: string; multiline?: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: t('Copied') });
    setTimeout(() => setCopied(false), 1500);
  };

  if (multiline) {
    return (
      <div className="relative rounded-md border border-gray-200 dark:border-gray-700 bg-muted overflow-hidden">
        <pre className="px-3 py-2.5 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre leading-relaxed">
          {text}
        </pre>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="absolute top-2 right-2 gap-1 h-6 text-xs bg-background"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? t('Copied') : t('Copy')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 min-w-0 rounded-md border border-gray-200 dark:border-gray-700 bg-muted px-2 py-1.5 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-nowrap">
        {text}
      </code>
      <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0 gap-1">
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? t('Copied') : t('Copy')}
      </Button>
    </div>
  );
}

function EmptyState({ selectedMonth }: { selectedMonth: Date }) {
  const { t } = useTranslation();
  const dateLocale = useDateFnsLocale();
  const monthLabel = format(selectedMonth, 'MMMM yyyy', { locale: dateLocale });
  const mcpUrl = getMcpUrl();
  const requestText = t('Run the monthly financial analysis for {{month}} and save it.', { month: monthLabel });
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: insightRunsQueryKey });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-base font-semibold">{t('No analysis for this month yet')}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {t('Connect the PFM assistant (MCP server) to your AI agent and ask it to run the monthly analysis. The report is saved here automatically.')}
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <StepForward className="h-4 w-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="space-y-1 min-w-0 flex-1">
            <p className="text-sm font-medium">{t('1. Create your API key')}</p>
            <p className="text-xs text-muted-foreground">
              {t('Generate one under')}{' '}
              <a href="/settings?tab=profile" className="underline">
                {t('Settings → Profile → API Key')}
              </a>
              .
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <StepForward className="h-4 w-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="space-y-1 min-w-0 flex-1">
            <p className="text-sm font-medium">{t('2. Connect the MCP server to your agent')}</p>
            <p className="text-xs text-muted-foreground">
              {t('Add this to your')}{' '}
              <code className="text-xs">.claude/mcp.json</code>
              {' '}{t('(Claude Code) or your agent\'s equivalent MCP config. Replace the placeholder with your API key:')}
            </p>
            <CopyableBlock multiline text={JSON.stringify({
              mcpServers: {
                pfm: {
                  type: 'http',
                  url: mcpUrl,
                  headers: { 'x-api-key': 'pfm_your_key_here' },
                },
              },
            }, null, 2)} />
          </div>
        </div>

        <div className="flex items-start gap-3">
          <StepForward className="h-4 w-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="space-y-1 min-w-0 flex-1">
            <p className="text-sm font-medium">{t('3. Ask for the analysis')}</p>
            <p className="text-xs text-muted-foreground">
              {t('Paste this into your agent — it will run the analysis and save the report here:')}
            </p>
            <CopyableBlock text={requestText} />
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <p className="text-xs text-muted-foreground">
          {t('Saved a report?')}{' '}
          <button onClick={handleRefresh} className="underline">
            {t('Refresh')}
          </button>
        </p>
      </div>
    </div>
  );
}

export default function InsightDrawer({ open, onOpenChange, run, selectedMonth }: Props) {
  const { t } = useTranslation();
  const dateLocale = useDateFnsLocale();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Hide the default absolute close button; we render our own in the sticky header */}
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0 [&>button:last-child]:hidden">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-6 py-4 bg-background border-b">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-base font-semibold capitalize">
                {t('Analysis')} — {format(selectedMonth, 'MMMM yyyy', { locale: dateLocale })}
              </p>
              {run && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {run.model} &middot; {format(new Date(run.created_at), 'PP', { locale: dateLocale })}
                </p>
              )}
            </div>
          </div>
          <SheetClose className="mt-0.5 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X className="h-4 w-4" />
            <span className="sr-only">{t('Close')}</span>
          </SheetClose>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {run ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{run.content}</ReactMarkdown>
            </div>
          ) : (
            <EmptyState selectedMonth={selectedMonth} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

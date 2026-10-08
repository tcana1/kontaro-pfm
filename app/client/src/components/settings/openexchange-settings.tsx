
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { importerFetch } from '@/lib/importer';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OpenExchangeStatus {
  configured: boolean;
}

// ── Main component ─────────────────────────────────────────────────────────────

const OpenExchangeSettings: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [keyInput, setKeyInput] = useState('');

  // ── Query ──────────────────────────────────────────────────────────────────

  const { data: status, isLoading } = useQuery<OpenExchangeStatus>({
    queryKey: ['openexchange-key'],
    queryFn: async () => {
      const res = await importerFetch('/openexchange-key');
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Importer error ${res.status}: ${text}`);
      }
      return res.json();
    },
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await importerFetch('/openexchange-key', {
        method: 'PUT',
        body: JSON.stringify({ key }),
      });
      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        throw new Error(`Importer error ${res.status}: ${text}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['openexchange-key'] });
      setKeyInput('');
      toast({ title: t('OpenExchange key saved') });
    },
    onError: (error) => {
      toast({ title: t('Error saving key'), description: String(error), variant: 'destructive' });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      const res = await importerFetch('/openexchange-key', { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        throw new Error(`Importer error ${res.status}: ${text}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['openexchange-key'] });
      toast({ title: t('OpenExchange key removed') });
    },
    onError: (error) => {
      toast({ title: t('Error removing key'), description: String(error), variant: 'destructive' });
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('OpenExchange API Key')}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          {t('Used for currency conversion in C6 Global EUR/USD statements. Get your free key at')}{' '}
          <a
            href="https://openexchangerates.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            openexchangerates.org
          </a>
          .
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">{t('Loading…')}</p>
      ) : (
        <div className="space-y-4">
          {/* Current status */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{t('Status:')}</span>
            {status?.configured ? (
              <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                {t('Configured ✓')}
              </span>
            ) : (
              <span className="text-sm text-gray-500">{t('Not configured')}</span>
            )}
          </div>

          {/* Save form */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold">
              {status?.configured ? t('Replace Key') : t('Set Key')}
            </h4>
            <div className="space-y-1">
              <Label className="text-xs">{t('API Key')}</Label>
              <Input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={t('Paste your OpenExchangeRates API key')}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => saveMutation.mutate(keyInput)}
                disabled={saveMutation.isPending || !keyInput.trim()}
              >
                {saveMutation.isPending ? t('Saving…') : t('Save')}
              </Button>
              {status?.configured && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => removeMutation.mutate()}
                  disabled={removeMutation.isPending}
                >
                  {removeMutation.isPending ? t('Removing…') : t('Remove Key')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpenExchangeSettings;

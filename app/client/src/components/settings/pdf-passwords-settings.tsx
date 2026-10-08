
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { importerFetch } from '@/lib/importer';
import { useFinance } from '@/contexts/finance-context';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PdfPassword {
  id: string;
  label: string;
  created_at: string;
}

interface AddPasswordState {
  label: string;
  password: string;
}

const emptyPassword = (): AddPasswordState => ({ label: '', password: '' });

// ── Main component ─────────────────────────────────────────────────────────────

const PdfPasswordsSettings: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { locale } = useFinance();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddPasswordState>(emptyPassword());

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: passwords = [], isLoading } = useQuery<PdfPassword[]>({
    queryKey: ['pdf-passwords'],
    queryFn: async () => {
      const res = await importerFetch('/pdf-passwords');
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Importer error ${res.status}: ${text}`);
      }
      return res.json();
    },
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (form: AddPasswordState) => {
      const res = await importerFetch('/pdf-passwords', {
        method: 'POST',
        body: JSON.stringify({ label: form.label, password: form.password }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Importer error ${res.status}: ${text}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdf-passwords'] });
      setAddForm(emptyPassword());
      setShowAddForm(false);
      toast({ title: t('PDF password saved') });
    },
    onError: (error) => {
      toast({ title: t('Error saving PDF password'), description: String(error), variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await importerFetch(`/pdf-passwords/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        throw new Error(`Importer error ${res.status}: ${text}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdf-passwords'] });
      toast({ title: t('PDF password deleted') });
    },
    onError: (error) => {
      toast({ title: t('Error deleting PDF password'), description: String(error), variant: 'destructive' });
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(locale, { dateStyle: 'medium' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {t('Passwords are stored encrypted and never shown again.')}
      </p>

      {/* Passwords table */}
      {isLoading ? (
        <p className="text-sm text-gray-500">{t('Loading PDF passwords…')}</p>
      ) : passwords.length === 0 ? (
        <p className="text-sm text-gray-500">{t('No PDF passwords configured yet.')}</p>
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Label')}</TableHead>
                <TableHead>{t('Added')}</TableHead>
                <TableHead className="text-right">{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {passwords.map((pw) => (
                <TableRow key={pw.id}>
                  <TableCell className="text-sm font-medium">{pw.label}</TableCell>
                  <TableCell className="text-sm text-gray-500">{formatDate(pw.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteMutation.mutate(pw.id)}
                      disabled={deleteMutation.isPending}
                    >
                      {t('Delete')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add password form */}
      {showAddForm ? (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
          <h4 className="text-sm font-semibold">{t('Add PDF Password')}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('Label')}</Label>
              <Input
                value={addForm.label}
                onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
                placeholder={t('e.g. Itaú PDF')}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('Password')}</Label>
              <Input
                type="password"
                value={addForm.password}
                onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={t('PDF password')}
                className="text-xs"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAddForm(false);
                setAddForm(emptyPassword());
              }}
            >
              {t('Cancel')}
            </Button>
            <Button
              size="sm"
              onClick={() => createMutation.mutate(addForm)}
              disabled={createMutation.isPending || !addForm.label || !addForm.password}
            >
              {createMutation.isPending ? t('Saving…') : t('Save Password')}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setShowAddForm(true)}>
          {t('Add Password')}
        </Button>
      )}
    </div>
  );
};

export default PdfPasswordsSettings;

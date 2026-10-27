
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { useFinance } from '@/contexts/finance-context';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Pencil, Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import LanguageSettings from '@/components/settings/language-settings';
import CurrencySettings from '@/components/settings/currency-settings';

import { getImporterUrl } from '@/lib/config';
const IMPORTER_URL = getImporterUrl();

const ProfileSettings: React.FC = () => {
  const { t } = useTranslation();
  const { user, updateProfile, updatePassword } = useAuth();
  const { locale, showInstallmentProjection, setShowInstallmentProjection } = useFinance();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isLoading, setIsLoading] = useState(false);

  // ── Name inline edit ──────────────────────────────────────────────────────
  const [nameEditing, setNameEditing] = useState(false);
  const [inlineName, setInlineName] = useState('');

  const startNameEdit = () => {
    setInlineName(user?.user_metadata?.full_name || '');
    setNameEditing(true);
  };

  const cancelNameEdit = () => setNameEditing(false);

  const saveNameEdit = async () => {
    setIsLoading(true);
    try {
      await updateProfile({ full_name: inlineName });
      setNameEditing(false);
      toast({ title: t('Success'), description: t('Profile updated successfully') });
    } catch {
      toast({ title: t('Error'), description: t('Failed to update profile'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Email dialog ──────────────────────────────────────────────────────────
  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');

  const openEmailDialog = () => {
    setNewEmail('');
    setEmailPassword('');
    setEmailOpen(true);
  };

  const handleEmailUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !emailPassword) {
      toast({ title: t('Error'), description: t('Please enter both your new email and current password'), variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: emailPassword,
      });
      if (verifyError) {
        toast({ title: t('Error'), description: verifyError.status === 429 ? t('Too many attempts. Wait a minute and try again.') : t('Current password is incorrect'), variant: 'destructive' });
        return;
      }
      await supabase.auth.updateUser({ email: newEmail });
      toast({
        title: t('Email Update Initiated'),
        description: t('Please check both your current and new email addresses for confirmation links.'),
      });
      setEmailOpen(false);
    } catch {
      toast({ title: t('Error'), description: t('Failed to update email'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Password dialog ───────────────────────────────────────────────────────
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const openPasswordDialog = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordOpen(true);
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: t('Error'), description: t('Passwords do not match'), variant: 'destructive' });
      return;
    }
    if (!currentPassword) {
      toast({ title: t('Error'), description: t('Please enter your current password'), variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword,
      });
      if (verifyError) {
        toast({ title: t('Error'), description: verifyError.status === 429 ? t('Too many attempts. Wait a minute and try again.') : t('Current password is incorrect'), variant: 'destructive' });
        return;
      }
      await updatePassword(newPassword);
      setPasswordOpen(false);
      toast({ title: t('Success'), description: t('Password updated successfully') });
    } catch (err) {
      // updatePassword already toasts the GoTrue message (e.g. "Password should be at least 6 characters").
      if (!(err instanceof Error)) {
        toast({ title: t('Error'), description: t('Failed to update password'), variant: 'destructive' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── API Key ───────────────────────────────────────────────────────────────
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const { data: apiKey } = useQuery({
    queryKey: ['api-key'],
    queryFn: async () => {
      // maybeSingle: most users never generate a key, so zero rows is the norm.
      const { data, error } = await supabase
        .from('user_api_keys')
        .select('key_preview, created_at, last_used_at')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Atomically read-and-clear key_plaintext_once (only available once, right after
  // account creation). Returns null if already consumed or not set.
  React.useEffect(() => {
    supabase.rpc('reveal_and_clear_api_key').then(({ data, error }) => {
      if (error) {
        console.error('reveal_and_clear_api_key error:', error);
        return;
      }
      if (data) {
        setRevealedKey(data);
        queryClient.invalidateQueries({ queryKey: ['api-key'] });
      }
    });
  }, [queryClient]);

  const rotateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('rotate_api_key');
      if (error) throw error;
      return data as string;
    },
    onSuccess: (newKey) => {
      setRevealedKey(newKey);
      queryClient.invalidateQueries({ queryKey: ['api-key'] });
    },
    onError: (error) => {
      toast({ title: t('Error rotating API key'), description: String(error), variant: 'destructive' });
    },
  });

  const handleCopy = () => {
    if (!revealedKey) return;
    navigator.clipboard.writeText(revealedKey);
    toast({ title: t('Copied'), description: t('API key copied to clipboard.') });
  };

  // ── Shared field row ──────────────────────────────────────────────────────

  const FieldRow = ({ label, value, actionSlot }: { label: string; value: React.ReactNode; actionSlot: React.ReactNode }) => (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium mt-0.5">{value}</p>
      </div>
      {actionSlot}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Account — name + email + password — with Language filling the spare width alongside it */}
      <div className="flex flex-col md:flex-row md:items-start gap-20">
        <div className="max-w-lg flex-1">
          <h2 className="text-lg font-medium mb-1">{t('Account')}</h2>

          {nameEditing ? (
            <div className="flex items-center gap-2 py-3 border-b border-gray-100 dark:border-gray-800">
              <Input
                value={inlineName}
                onChange={(e) => setInlineName(e.target.value)}
                className="h-8 text-sm"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') saveNameEdit(); if (e.key === 'Escape') cancelNameEdit(); }}
              />
              <button onClick={saveNameEdit} disabled={isLoading} className="text-green-600 hover:text-green-700 p-1 rounded disabled:opacity-50">
                <Check className="h-4 w-4" />
              </button>
              <button onClick={cancelNameEdit} className="text-muted-foreground hover:text-foreground p-1 rounded">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <FieldRow
              label={t('Name')}
              value={user?.user_metadata?.full_name || <span className="text-muted-foreground italic">{t('Not set')}</span>}
              actionSlot={
                <button onClick={startNameEdit} className="text-muted-foreground hover:text-foreground p-1 rounded" title={t('Edit')}>
                  <Pencil className="h-4 w-4" />
                </button>
              }
            />
          )}
          <FieldRow
            label={t('Email')}
            value={user?.email}
            actionSlot={
              <button onClick={openEmailDialog} className="text-sm text-muted-foreground hover:text-foreground">
                {t('Edit')}
              </button>
            }
          />
          <FieldRow
            label={t('Password')}
            value={<span className="tracking-widest">••••••••</span>}
            actionSlot={
              <button onClick={openPasswordDialog} className="text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">
                {t('Change Password')}
              </button>
            }
          />
        </div>

        <div className="w-full md:w-64 md:flex-shrink-0">
          <LanguageSettings />
        </div>
      </div>

      {/* Email dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('Change Email')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEmailUpdate} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>{t('New Email Address')}</Label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>{t('Current Password')}</Label>
              <Input type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEmailOpen(false)}>{t('Cancel')}</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? t('Saving…') : t('Save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Password dialog */}
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('Change Password')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePasswordUpdate} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>{t('Current Password')}</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>{t('New Password')}</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('Confirm New Password')}</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setPasswordOpen(false)}>{t('Cancel')}</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? t('Saving…') : t('Save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Separator />

      {/* Currency, locale & date format */}
      <CurrencySettings />

      <Separator />

      {/* Installment projection */}
      <div className="flex items-start justify-between gap-6 max-w-xl">
        <div>
          <h2 className="text-lg font-medium">{t('Installment Projection')}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {t('Show the installments your card bill is expected to charge this month but the bank has not reported yet. Projected amounts are shown separately and never counted as actual transactions.')}
          </p>
        </div>
        <Switch
          checked={showInstallmentProjection}
          onCheckedChange={setShowInstallmentProjection}
          aria-label={t('Installment Projection')}
        />
      </div>

      <Separator />

      {/* API Key */}
      <div className="space-y-4 max-w-xl">
        <div>
          <h2 className="text-lg font-medium">{t('API Key')}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {t("Only needed for scripts or CLI tools. Most people don't need one.")}{' '}
            <a
              href={`${IMPORTER_URL}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-700 dark:hover:text-gray-300"
            >
              {t('Click here to view the API Docs')}
            </a>
          </p>
        </div>

        {revealedKey ? (
          <div className="flex flex-col md:flex-row items-start md:items-center gap-2">
            <Input value={revealedKey} readOnly className="font-mono text-sm" />
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCopy}>{t('Copy')}</Button>
              <Button variant="ghost" onClick={() => setRevealedKey(null)}>{t('Done')}</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row items-start md:items-center gap-2">
            <Input
              value={apiKey ? `••••••••${apiKey.key_preview}` : '—'}
              readOnly
              className="font-mono text-sm"
            />
            <Button
              variant={apiKey ? 'destructive' : 'outline'}
              onClick={() => rotateMutation.mutate()}
              disabled={rotateMutation.isPending}
            >
              {rotateMutation.isPending
                ? (apiKey ? t('Rotating…') : t('Generating…'))
                : (apiKey ? t('Rotate Key') : t('Generate Key'))}
            </Button>
          </div>
        )}

        {!revealedKey && apiKey && (
          <p className="text-xs text-gray-500 dark:text-gray-500">
            {apiKey.last_used_at
              ? t('Last used {{date}}', {
                  date: new Date(apiKey.last_used_at).toLocaleString(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })
              : t('Never used')}
          </p>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-500">
          {revealedKey
            ? t("Copy your key now — it won't be shown again.")
            : apiKey
              ? t('Rotating generates a new key and immediately invalidates the old one. Update any scripts or services using the previous key.')
              : t('Generates a key you can use to authenticate scripts or CLI tools with the importer.')}
        </p>
      </div>
    </div>
  );
};

export default ProfileSettings;

import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useFinance } from '@/contexts/finance-context';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { supabaseService } from '@/services/supabase-service';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LocaleAmountInput } from '@/components/ui/locale-amount-input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Account } from '@shared/schema';
import { CacheUtils } from '@/lib/cacheUtils';
import { tKey } from '@/lib/i18n-keys';

interface AccountFormProps {
  account?: Account | null;
  onSuccess: () => void;
  onCancel: () => void;
}

// Create a function to generate schema based on mode
const createFormSchema = (isEditing: boolean) => z.object({
  name: z.string().min(1, tKey('Account name is required')),
  typeId: z.number().min(1, tKey('Account type is required')),
  startingBalance: isEditing
    ? z.string().optional()
    : z.string().refine(val => !isNaN(Number(val)), {
        message: tKey('Starting balance must be a valid number'),
      }),
  icon: z.string().optional(),
  last4: z.string().max(4, tKey('Last 4 digits must not exceed 4 characters')).optional(),
  is_active: z.boolean().default(true),
});

const AccountForm: React.FC<AccountFormProps> = ({
  account,
  onSuccess,
  onCancel
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { currency } = useFinance();
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);

  // Determine if we're editing or creating
  const isEditing = !!account;

  // Create schema based on editing mode
  const formSchema = createFormSchema(isEditing);

  // Default form values
  const defaultValues = {
    name: account?.name || '',
    typeId: account?.type_id || 1, // Default to checking (type_id = 1)
    ...(isEditing ? {} : { startingBalance: '0' }), // Only include startingBalance for new accounts
    icon: account?.icon || 'ri-bank-line',
    last4: account?.last4 || '',
    is_active: account?.is_active ?? true,
  };

  // Setup form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });


  // Create or update mutation
  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {


      if (isEditing) {
        // For editing, only update account basic info (no starting balance changes)
        // Note: slug is immutable, so we don't update it
        const payload = {
          name: values.name,
          type_id: values.typeId,
          icon: values.icon,
          last4: values.last4,
          is_active: values.is_active,
        };

        // Update account basic info
        const { error: accountError } = await supabase.from('accounts').update(payload).eq('id', account?.id);
        if (accountError) throw accountError;
      } else {
        // For new accounts, let the database trigger handle slug generation
        const payload = {
          name: values.name,
          // auto_generate_account_slug() fills this in, but only when it arrives NULL or ''
          slug: '',
          type_id: values.typeId,
          starting_balance_temp: parseFloat(values.startingBalance || '0'),
          icon: values.icon,
          last4: values.last4,
          is_active: values.is_active,
          user_id: user!.id,
        };

        const { data, error } = await supabase.from('accounts').insert([payload]).select();
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: isEditing ? t('Account updated') : t('Account created'),
        description: isEditing
          ? t('The account has been successfully updated')
          : t('The account has been successfully created'),
      });

      // Fire-and-forget invalidation for better UI responsiveness
      CacheUtils.invalidateAccountRelated(queryClient, isEditing && account?.id ? account.id : undefined);
      CacheUtils.invalidateTransactionRelated(queryClient);
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: t('Error'),
        description: isEditing ? t('Failed to update account: {{message}}', { message: error.message }) : t('Failed to create account: {{message}}', { message: error.message }),
        variant: 'destructive',
      });
    },
  });

  // Archive/Reactivate mutation
  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!account) return;

      const newActiveStatus = !account.is_active;
      const { error } = await supabase.from('accounts').update({ is_active: newActiveStatus }).eq('id', account.id);
      if (error) throw error;

      return newActiveStatus;
    },
    onSuccess: (newStatus) => {
      toast({
        title: newStatus ? t('Account reactivated') : t('Account archived'),
        description: newStatus
          ? t('The account has been reactivated and will appear in transaction forms')
          : t('The account has been archived and will no longer appear in transaction forms'),
      });

      // Fire-and-forget invalidation for better UI responsiveness
      CacheUtils.invalidateAccountRelated(queryClient);
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: t('Error'),
        description: account?.is_active ? t('Failed to archive account: {{message}}', { message: error.message }) : t('Failed to reactivate account: {{message}}', { message: error.message }),
        variant: 'destructive',
      });
    },
  });

  // Form submit handler
  const onSubmit = (values: z.infer<typeof formSchema>) => {
    mutation.mutate(values);
  };

  // Handle archive action
  const handleArchiveAction = () => {
    setShowArchiveDialog(false);
    archiveMutation.mutate();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" role="form">
        {/* Name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Account Name')}</FormLabel>
              <FormControl>
                <Input {...field} placeholder={t('Main Bank Account')} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Slug - display only when editing */}
        {isEditing && account?.slug && (
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              {t('Slug')}
            </label>
            <Input
              value={account.slug}
              disabled
              className="opacity-60"
            />
            <p className="text-xs text-gray-500">
              {t('Slug cannot be modified after account creation. Used for PDF imports.')}
            </p>
          </div>
        )}

        {/* Type */}
        <FormField
          control={form.control}
          name="typeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Account Type')}</FormLabel>
              <Select
                onValueChange={(value) => field.onChange(parseInt(value))}
                defaultValue={field.value?.toString()}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('Select account type')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="1">{t('Checking')}</SelectItem>
                  <SelectItem value="2">{t('Credit Card')}</SelectItem>
                  <SelectItem value="3">{t('Tracking')}</SelectItem>
                  <SelectItem value="4">{t('Savings')}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Starting Balance - only show for new accounts */}
        {!isEditing && (
          <FormField
            control={form.control}
            name="startingBalance"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Starting Balance')}</FormLabel>
                <FormControl>
                  <LocaleAmountInput
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    className="!h-10 !px-3 !py-2"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Archive/Reactivate Account - only show for editing */}
        {isEditing && (
          <div className="rounded-md border p-4">
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowArchiveDialog(true)}
                disabled={archiveMutation.isPending}
                className={account?.is_active ? "hover:bg-red-600 hover:text-white" : ""}
              >
                {archiveMutation.isPending
                  ? (account?.is_active ? t('Archiving...') : t('Reactivating...'))
                  : (account?.is_active ? t('Archive Account') : t('Reactivate Account'))}
              </Button>
              <div className="space-y-1">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {account?.is_active
                    ? t('This account is active and appears in transaction forms')
                    : t('This account is archived and hidden from transaction forms')}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex space-x-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onCancel}
          >
            {t('Cancel')}
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t('Saving...') : isEditing ? t('Update') : t('Save')}
          </Button>
        </div>
      </form>

      {/* Archive/Reactivate Confirmation Dialog */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {account?.is_active ? t('Archive Account') : t('Reactivate Account')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {account?.is_active
                ? t('Are you sure you want to archive this account? It will be hidden from transaction forms but all transaction history will be preserved. You can reactivate it at any time.')
                : t('Are you sure you want to reactivate this account? It will appear in transaction forms again.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchiveAction}
              className={account?.is_active ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {account?.is_active ? t('Archive Account') : t('Reactivate Account')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  );
};

export default AccountForm;

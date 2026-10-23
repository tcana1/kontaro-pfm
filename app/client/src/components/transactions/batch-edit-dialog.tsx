import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useHistoryContext } from "@/contexts/history-context";
import { useAuth } from "@/contexts/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { BatchUpdateTransactionCommand } from "@/lib/commands/transaction-commands";
import { Transaction } from "@shared/schema";
import { BatchEditValidator, type BatchEditRestrictions } from '@/utils/batch-edit-validator';
import TransactionEditFields, { type FieldRestriction } from './transaction-edit-fields';

// Import standard form components for modal
import { Info } from 'lucide-react';
import { localDateString } from '@/lib/date-utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface BatchEditDialogProps {
  isOpen: boolean;
  onClose: (wasSuccessful?: boolean, failedTransactionIds?: number[]) => void;
  selectedTransactions: Transaction[];
  onFailedTransactions?: (failureInfo: { ids: number[], errors: Map<number, string> }) => void;
}

interface BatchEditFormData {
  date: Date | null;
  category_id: string;
  account_id: string;
  status_id: string;
  notes: string;
  is_ignored: string; // 'no-change' | 'true' | 'false'
}

const BatchEditDialog: React.FC<BatchEditDialogProps> = ({
  isOpen,
  onClose,
  selectedTransactions,
  onFailedTransactions,
}) => {
  const [formData, setFormData] = useState<BatchEditFormData>({
    date: null,
    category_id: '',
    account_id: '',
    status_id: '',
    notes: '',
    is_ignored: 'no-change',
  });

  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [restrictions, setRestrictions] = useState<BatchEditRestrictions>();
  const updateButtonRef = useRef<HTMLButtonElement>(null);
  const { toast } = useToast();
  const { execute } = useHistoryContext();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleFieldChange = (field: keyof BatchEditFormData, value: string | Date | boolean | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const restrictionFor = (field: string): FieldRestriction => ({
    disabled: restrictions?.disabledFields.has(field),
    reason: restrictions?.restrictionReasons.has(field) ? t(restrictions.restrictionReasons.get(field)!) : undefined,
  });

  const handleCategorySelectionComplete = () => {
    // Move focus to Update button for smooth Enter+Enter workflow
    setTimeout(() => updateButtonRef.current?.focus(), 100);
  };


  const buildUpdateData = (): Partial<Transaction> => {
    const updateData: any = {};

    // Only include fields that have been changed (non-empty values)
    if (formData.date) {
      const dateString = localDateString(formData.date);
      updateData.payment_date = dateString;
      updateData.purchase_date = dateString; // Assuming same date for both
    }
    
    if (formData.category_id && formData.category_id !== 'no-change') {
      updateData.category_id = parseInt(formData.category_id);
    }
    
    if (formData.account_id && formData.account_id !== 'no-change') {
      updateData.account_id = parseInt(formData.account_id);
    }
    
    if (formData.status_id) {
      updateData.status_id = parseInt(formData.status_id);
    }
    
    if (formData.notes) {
      updateData.notes = formData.notes;
    }
    
    if (formData.is_ignored !== 'no-change') {
      updateData.is_ignored = formData.is_ignored === 'true';
    }

    return updateData;
  };

  const handleSubmit = async () => {
    if (!user) {
      toast({
        title: t('Error'),
        description: t('User not authenticated.'),
        variant: "destructive"
      });
      return;
    }

    const updateData = buildUpdateData();
    
    // Check if any fields were actually changed
    if (Object.keys(updateData).length === 0) {
      toast({
        title: t('No Changes'),
        description: t('Please make at least one change to update the transactions.'),
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    
    const command = new BatchUpdateTransactionCommand(
      selectedTransactions,
      updateData,
      user.id,
      queryClient
    );

    try {
      await execute(command);
      
      toast({
        title: t('Success'),
        description: t('Updated {{count}} transactions successfully.', { count: selectedTransactions.length }),
      });
      
      resetForm();
      onClose(true, []);
    } catch (error) {
      console.error('Batch update failed:', error);
      
      // Handle partial failures
      if (error instanceof Error && error.message.includes('Failed to update')) {
        const failureInfo = command.getFailedTransactions();
        
        if (failureInfo.ids.length > 0 && onFailedTransactions) {
          onFailedTransactions(failureInfo);
        }
        
        // Check if there were any successful updates
        const successfulCount = selectedTransactions.length - failureInfo.ids.length;
        if (successfulCount > 0) {
          toast({
            title: t('Partial Success'),
            description: t('Updated {{success}} of {{total}} transactions. {{failed}} failed - check error icons for details.', { success: successfulCount, total: selectedTransactions.length, failed: failureInfo.ids.length }),
            variant: "destructive",
          });
        } else {
          toast({
            title: t('Update Failed'),
            description: t('All {{count}} transactions failed to update - check error icons for details.', { count: selectedTransactions.length }),
            variant: "destructive",
          });
        }
        // Always close dialog so user can investigate errors
        resetForm();
        onClose(true, failureInfo.ids);
      } else {
        toast({
          title: t('Error'),
          description: t('Failed to update transactions. Please try again.'),
          variant: "destructive",
        });
        // Close dialog even for unexpected errors
        resetForm();
        onClose(false, []);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      date: null,
      category_id: '',
      account_id: '',
      status_id: '',
      notes: '',
      is_ignored: 'no-change',
    });
  };

  const handleCancel = () => {
    resetForm();
    onClose(false, []);
  };

  // Analyze transaction restrictions
  React.useEffect(() => {
    const analysis = BatchEditValidator.analyzeSelectedTransactions(selectedTransactions);
    setRestrictions(analysis);
  }, [selectedTransactions]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (event.key === 'Enter' && !isLoading) {
        // Don't submit if focus is on category select or within a popover
        const activeElement = document.activeElement;
        if (activeElement?.closest('[role="combobox"]') || 
            activeElement?.closest('[data-radix-popper-content-wrapper]') ||
            document.querySelector('[data-radix-popper-content-wrapper]')) {
          return; // Let the category select handle the Enter key
        }
        
        event.preventDefault();
        handleSubmit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading]);

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('Edit {{count}} Transactions', { count: selectedTransactions.length })}
          </DialogTitle>
        </DialogHeader>

        {restrictions && !restrictions.canProceed ? (
          // Not Allowed Dialog for linked transactions
          <div className="space-y-4 py-4">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  <Info className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-red-800">
                    {t('Batch Edit Not Allowed')}
                  </h3>
                  <p className="mt-1 text-sm text-red-700">
                    {t(restrictions.restrictionReasons.get('linked_transactions') ?? '')}
                  </p>
                  <p className="mt-2 text-sm text-red-600">
                    {t('Please edit these transactions individually instead.')}
                  </p>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button
                onClick={handleCancel}
                className="w-full"
              >
                {t('Close')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {restrictions && restrictions.disabledFields.size > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <div className="flex items-center gap-2">
              <p className="text-sm text-yellow-800">
                {t('Some fields are disabled due to transaction types in your selection ({{count}} restrictions)', { count: restrictions.disabledFields.size })}
              </p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-yellow-600 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{t('Disabled Fields:')}</p>
                      {Array.from(restrictions.disabledFields).map(field => (
                        <div key={field} className="text-xs">
                          <span className="font-medium">
                            {field === 'payment_date' ? t('Date') :
                             field === 'category_id' ? t('Category') :
                             field === 'accountId' ? t('Account') : field}:
                          </span>
                          <span className="ml-1">{t(restrictions.restrictionReasons.get(field) ?? '')}</span>
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}

        <TransactionEditFields
          mode="batch"
          date={formData.date}
          onDateChange={(date) => handleFieldChange('date', date)}
          dateRestriction={restrictionFor('payment_date')}
          statusId={formData.status_id}
          onStatusChange={(value) => handleFieldChange('status_id', value)}
          isIgnored={formData.is_ignored}
          onIsIgnoredChange={(value) => handleFieldChange('is_ignored', value)}
          categoryId={formData.category_id || 'no-change'}
          onCategoryChange={(value) => handleFieldChange('category_id', value)}
          categoryRestriction={restrictionFor('category_id')}
          onCategorySelectionComplete={handleCategorySelectionComplete}
          accountId={formData.account_id}
          onAccountChange={(value) => handleFieldChange('account_id', value)}
          accountRestriction={restrictionFor('account_id')}
          notes={formData.notes}
          onNotesChange={(value) => handleFieldChange('notes', value)}
        />

            <DialogFooter className="flex gap-2 sm:gap-0 sm:justify-between justify-between items-stretch sm:items-center pt-4">
              <Button variant="outline" className="w-full sm:w-auto" onClick={handleCancel} disabled={isLoading}>
                {t('Cancel')}
              </Button>
              <Button ref={updateButtonRef} className="w-full sm:w-auto" onClick={handleSubmit} disabled={isLoading}>
                {isLoading ? t('Updating...') : t('Update {{count}} Transactions', { count: selectedTransactions.length })}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BatchEditDialog;
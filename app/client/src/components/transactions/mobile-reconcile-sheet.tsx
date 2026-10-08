import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import LocaleAmountInput from '@/components/ui/locale-amount-input';

interface MobileReconcileSheetProps {
  open: boolean;
  onClose: () => void;
  onReconcile: (bankBalance: number) => void;
  isReconciling: boolean;
}

const MobileReconcileSheet: React.FC<MobileReconcileSheetProps> = ({
  open,
  onClose,
  onReconcile,
  isReconciling,
}) => {
  const { t } = useTranslation();
  const [bankBalance, setBankBalance] = useState('');
  const [isNegative, setIsNegative] = useState(true);

  // Clear input when sheet opens; reset sign to negative (most common case)
  useEffect(() => {
    if (open) {
      setBankBalance('');
      setIsNegative(true);
    }
  }, [open]);

  const handleSubmit = () => {
    const absValue = parseFloat(bankBalance);
    if (isNaN(absValue)) return;
    const value = isNegative ? -Math.abs(absValue) : Math.abs(absValue);
    onClose();
    onReconcile(value);
  };

  const canSubmit = !!bankBalance && !isNaN(parseFloat(bankBalance)) && !isReconciling;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="px-6 pb-8 pt-4">
        <SheetHeader className="mb-4">
          <SheetTitle>{t('Reconcile account')}</SheetTitle>
        </SheetHeader>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {t('Enter the current bank balance to reconcile transactions with Cleared status.')}
        </p>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('Bank balance')}
          </label>
          <div className="flex gap-2 items-center">
            <Button
              type="button"
              variant={isNegative ? 'default' : 'outline'}
              size="sm"
              className="h-10 w-10 text-lg font-bold shrink-0"
              onClick={() => setIsNegative(!isNegative)}
              disabled={isReconciling}
            >
              {isNegative ? '−' : '+'}
            </Button>
            <div className="flex-1">
              <LocaleAmountInput
                value={bankBalance}
                onChange={setBankBalance}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSubmit) handleSubmit();
                }}
                className="text-base h-10"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={isReconciling}
          >
            {t('Cancel')}
          </Button>
          <Button
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {isReconciling ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                {t('Processing…')}
              </div>
            ) : (
              t('Reconcile')
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileReconcileSheet;

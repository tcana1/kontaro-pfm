import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { useMoney } from '@/hooks/useMoney';

interface ReconciliationMismatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  calculatedBalance: number;
  bankBalance: number;
  difference: number;
  transactionCount: number;
}

const ReconciliationMismatchDialog: React.FC<ReconciliationMismatchDialogProps> = ({
  isOpen,
  onClose,
  onProceed,
  calculatedBalance,
  bankBalance,
  difference,
  transactionCount,
}) => {
  const { t } = useTranslation();
  const money = useMoney();
  const isDifferencePositive = difference > 0;
  const adjustmentAmount = Math.abs(difference);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            {t('Reconciliation Mismatch Detected')}
          </DialogTitle>
          <DialogDescription className="text-left space-y-3 pt-2">
            <p>
              {t("We've detected a {{amount}} difference in the reconciliation:", { amount: money(adjustmentAmount) })}
            </p>
            
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md space-y-2 text-sm">
              <div className="flex justify-between">
                <span>{t('Calculated balance:')}</span>
                <span className="font-mono">{money(calculatedBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('Bank statement balance:')}</span>
                <span className="font-mono">{money(bankBalance)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-medium">{t('Difference:')}</span>
                <span className={`font-mono font-medium ${isDifferencePositive ? 'text-green-600' : 'text-red-600'}`}>
                  {isDifferencePositive ? '+' : ''}{money(difference)}
                </span>
              </div>
            </div>

            <p>
              {t('Do you want to proceed? This will create an adjustment transaction of {{amount}} to bring your balance in line with the bank statement.', { amount: money(-difference) })}
            </p>

            <p className="text-xs text-gray-600 dark:text-gray-400">
              {t('{{count}} cleared transaction(s) will be marked as reconciled.', { count: transactionCount })}
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button 
            variant="outline" 
            onClick={onClose}
            className="w-full sm:w-auto"
          >
            {t('Cancel')}
          </Button>
          <Button
            onClick={onProceed}
            className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white"
          >
            {t('Create Adjustment & Proceed')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReconciliationMismatchDialog;
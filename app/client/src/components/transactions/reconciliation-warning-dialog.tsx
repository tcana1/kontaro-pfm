import React from 'react';
import { useTranslation } from 'react-i18next';
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

interface ReconciliationWarningDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  transactionId: number;
  warningType: 'status' | 'edit';
}

const ReconciliationWarningDialog: React.FC<ReconciliationWarningDialogProps> = ({
  isOpen,
  onClose,
  onProceed,
  transactionId,
  warningType
}) => {
  const { t } = useTranslation();

  const getTitle = () => {
    return warningType === 'status'
      ? t('Change Status of Reconciled Transaction?')
      : t('Remove Transaction from Reconciliation?');
  };

  const getDescription = () => {
    if (warningType === 'status') {
      return t('This transaction is part of a completed reconciliation. Changing its status will remove it from the reconciliation. Do you want to continue?');
    } else {
      return (
        <div className="space-y-4">
          <p>{t('This transaction is part of a completed reconciliation.')}<br />{t('This action will:')}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t('Change its status back to Cleared')}</li>
            <li>{t('Allow you to edit date, amount and account')}</li>
            <li>{t('Require this transaction to be reconciled again in the future')}</li>
            <li>{t('Possibly affect your account balance calculations')}</li>
          </ul>
          <p>{t('Do you want to proceed?')}</p>
        </div>
      );
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{getTitle()}</AlertDialogTitle>
          <AlertDialogDescription>
            {getDescription()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>{t('Cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onProceed}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {t('Remove & Edit')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ReconciliationWarningDialog;
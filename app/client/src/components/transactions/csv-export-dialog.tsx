
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFinance } from '@/contexts/finance-context';
import { generateCSV } from '@/utils/csv-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';

interface CSVExportDialogProps {
  open: boolean;
  onClose: () => void;
}

const CSVExportDialog: React.FC<CSVExportDialogProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const { transactions = [] } = useFinance() as any;
  const [dateRange, setDateRange] = useState<[Date | undefined, Date | undefined]>([undefined, undefined]);
  const [exportAll, setExportAll] = useState(true);
  
  const handleExport = () => {
    if (!transactions) return;
    
    let filteredTransactions = transactions;
    
    if (!exportAll && dateRange[0] && dateRange[1]) {
      filteredTransactions = transactions.filter((t: any) => {
        const date = new Date(t.paymentDate);
        return date >= dateRange[0]! && date <= dateRange[1]!;
      });
    }
    
    const csv = generateCSV(filteredTransactions);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onClose();
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Export Transactions')}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={exportAll}
              onChange={(e) => setExportAll(e.target.checked)}
            />
            <span>{t('Export all transactions')}</span>
          </label>
          
          {!exportAll && (
            <div className="space-y-2">
              <Label>{t('Select Date Range')}</Label>
              <div className="flex gap-2">
                <Calendar
                  selected={dateRange[0]}
                  onSelect={(date) => setDateRange([date, dateRange[1]])}
                  mode="single"
                />
                <Calendar
                  selected={dateRange[1]}
                  onSelect={(date) => setDateRange([dateRange[0], date])}
                  mode="single"
                />
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('Cancel')}</Button>
          <Button onClick={handleExport}>
            {exportAll ? t('Export All Transactions') : t('Export Selected Transactions')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CSVExportDialog;

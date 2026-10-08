
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFinance } from '@/contexts/finance-context';
import { parseCSV, validateCSVRow } from '@/utils/csv-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { supabaseService } from '@/services/supabase-service';
import TransactionTable from './transaction-table';

interface CSVImportDialogProps {
  open: boolean;
  onClose: () => void;
}

const CSVImportDialog: React.FC<CSVImportDialogProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const { accounts } = useFinance();
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [totalRecords, setTotalRecords] = useState(0);
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const content = await file.text();
    const rows = parseCSV(content);
    const validRows = rows.filter(validateCSVRow);
    
    setFile(file);
    setTotalRecords(validRows.length);
    setPreviewData(validRows.slice(0, 10).map(row => ({
      date: row.date,
      description: row.description,
      payee: row.payee,
      amount: parseFloat(row.amount),
      notes: row.notes,
      accountId: parseInt(selectedAccountId),
      type: 'regular',
      userId: 1
    })));
  };
  
  const handleImport = async () => {
    if (!file || !selectedAccountId) return;
    
    const content = await file.text();
    const rows = parseCSV(content);
    const validRows = rows.filter(validateCSVRow);
    
    for (const row of validRows) {
      await supabaseService.createUniqueTransaction({
        date: row.date,
        description: row.description,
        payee: row.payee,
        amount: parseFloat(row.amount),
        notes: row.notes,
        accountId: parseInt(selectedAccountId),
        type: 'regular',
        userId: 1
      });
    }
    
    onClose();
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('Import Transactions from CSV')}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t('Select account')} />
              </SelectTrigger>
              <SelectContent>
                {accounts.sort((a, b) => a.name.localeCompare(b.name)).map(account => (
                  <SelectItem key={account.id} value={account.id.toString()}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="flex-1"
            />
          </div>
          
          {previewData.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">
                {t('Preview (showing {{shown}} of {{total}} records)', { shown: previewData.length, total: totalRecords })}
              </h3>
              {/* @ts-expect-error preview usage with subset of required props */}
              <TransactionTable transactions={previewData} showPagination={false} />
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('Cancel')}</Button>
          <Button onClick={handleImport} disabled={!file || !selectedAccountId}>
            {t('Import {{count}} Records', { count: totalRecords })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CSVImportDialog;

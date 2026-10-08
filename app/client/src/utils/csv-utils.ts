
import { Transaction } from "@shared/schema";
import { parse } from "date-fns";

interface CSVRow {
  date: string;
  description: string;
  payee: string;
  amount: string;
  notes: string;
}

export function parseCSV(csvContent: string): CSVRow[] {
  const lines = csvContent.split('\n');
  return lines
    .filter(line => line.trim())
    .map(line => {
      const [date, description, payee, amount, notes] = line.split(',').map(field => field.trim());
      return { date, description, payee, amount, notes };
    });
}

export function validateCSVRow(row: CSVRow): boolean {
  try {
    // Validate date format
    parse(row.date, 'yyyy-MM-dd', new Date());
    
    // Validate amount is a number
    const amount = parseFloat(row.amount);
    if (isNaN(amount)) return false;
    
    // Require description
    if (!row.description.trim()) return false;
    
    return true;
  } catch {
    return false;
  }
}

export function generateCSV(transactions: Transaction[]): string {
  const headers = ['Date', 'Description', 'Payee', 'Amount', 'Notes', 'Category', 'Category Group', 'Account'];
  const rows = transactions.map(t => [
    t.payment_date,
    t.description,
    t.payee || '',
    t.amount.toString(),
    t.notes || '',
    t.category_name || '',
    (t as any).category_group_name || '',
    t.account_name || ''
  ]);
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

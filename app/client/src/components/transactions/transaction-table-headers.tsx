import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Check, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

type SortDir = 'asc' | 'desc';

interface ColumnDef {
  sortKey: string;
  label: string;
  translate?: boolean;       // default true
  width: string;
  defaultSortDir: SortDir;
  hidden?: boolean;          // hidden md:table-cell
  align?: 'center' | 'right';
  labelClass?: string;
  guardEdit?: boolean;       // onClick guards on !editingTransactionId
  chevronNoSpace?: boolean;  // preserves original: no space before ${} in installment col
}

const COLUMNS: ColumnDef[] = [
  { sortKey: 'payment_date',       label: 'Date',     width: 'w-[90px]',  defaultSortDir: 'desc', align: 'center' },
  { sortKey: 'payee',              label: 'Payee',    width: 'w-[200px]', defaultSortDir: 'asc' },
  { sortKey: 'categories.name',    label: 'Category', width: 'w-[220px]', defaultSortDir: 'asc', labelClass: 'p-1' },
  { sortKey: 'notes',              label: 'Notes',    width: 'w-[150px]', defaultSortDir: 'asc', hidden: true },
  { sortKey: 'account_name',       label: 'Account',  width: 'w-[120px]', defaultSortDir: 'asc', hidden: true },
  { sortKey: 'amount',             label: 'Amount',   width: 'w-[100px]', defaultSortDir: 'desc', align: 'right' },
  { sortKey: 'installment_number', label: 'P.',       width: 'w-[60px]',  defaultSortDir: 'asc', hidden: true, translate: false, labelClass: 'text-center block w-full', guardEdit: true, chevronNoSpace: true },
];

interface TableHeadersProps {
  isAllSelected: boolean;
  isIndeterminate: boolean;
  onSelectAll: (checked: boolean) => void;
  isSelectDisabled: boolean;
  // omit to render non-interactive (skeleton) mode
  sortField?: string;
  sortDirection?: SortDir;
  onSortChange?: (field: string, dir: SortDir) => void;
  editingTransactionId?: number | null;
}

export const TableHeaders: React.FC<TableHeadersProps> = ({
  isAllSelected,
  isIndeterminate,
  onSelectAll,
  isSelectDisabled,
  sortField,
  sortDirection,
  onSortChange,
  editingTransactionId,
}) => {
  const { t } = useTranslation();
  const interactive = !!onSortChange;

  const chevronClass = (col: ColumnDef): string => {
    const indicator = sortField === col.sortKey
      ? sortDirection === 'asc' ? 'rotate-180 opacity-100' : 'opacity-100'
      : 'opacity-40';
    const sep = col.chevronNoSpace ? '' : ' ';
    return `ml-1 h-4 w-4 transition-transform${sep}${indicator}`;
  };

  return (
    <thead className="sticky z-20 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700" style={{ top: "39px" }}>
      <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
        <th className="px-4 py-3 font-medium w-[30px]">
          <div className="flex h-4">
            <Checkbox
              checked={isAllSelected ? true : isIndeterminate ? "indeterminate" : false}
              onCheckedChange={onSelectAll}
              disabled={isSelectDisabled}
            />
          </div>
        </th>
        <th className="px-1 py-3 w-[15px]"></th>

        {COLUMNS.map((col) => {
          const label = col.translate === false ? col.label : t(col.label);
          const hiddenClass = col.hidden ? 'hidden md:table-cell ' : '';
          const alignThClass = col.align === 'right' ? ' text-right' : col.align === 'center' ? ' text-center' : '';
          const alignDivClass = col.align === 'right' ? ' justify-end' : '';
          const cursorClass = interactive ? ' cursor-pointer' : '';

          const handleClick = interactive && onSortChange
            ? () => { if (!col.guardEdit || !editingTransactionId) onSortChange(col.sortKey, col.defaultSortDir); }
            : undefined;

          return (
            <th
              key={col.sortKey}
              className={`${hiddenClass}px-4 py-3 font-medium ${col.width}${alignThClass}${cursorClass}`}
              onClick={handleClick}
            >
              <div className={`flex items-center${alignDivClass}`}>
                <span className={col.labelClass}>{label}</span>
                {interactive && <ChevronDown className={chevronClass(col)} />}
              </div>
            </th>
          );
        })}

        <th className="px-4 py-3 font-medium w-[50px] text-center">
          <Check className="h-4 w-4 text-gray-500 mx-auto" />
        </th>
        <th className="hidden md:table-cell px-2 py-3 font-medium w-[35px] text-center">
          <EyeOff className="h-4 w-4 text-gray-500 mx-auto" />
        </th>
        {/* Buffer column for scrollbar clearance */}
        <th className="w-[20px]"></th>
      </tr>
    </thead>
  );
};

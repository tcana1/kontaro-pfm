import React from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

import AmountInput from './inline-form-fields/amount-input';
import CategorySelect from './inline-form-fields/category-select';
import NotesInput from './inline-form-fields/notes-input';

interface EditableSplitRowProps {
  split: {
    id: string;
    categoryId: string;
    amount: string;
    notes: string;
  };
  onSplitChange: (updated: { id: string; categoryId: string; amount: string; notes: string }) => void;
  onRemove: () => void;
  canRemove: boolean;
  error?: {
    categoryId?: string;
    amount?: string;
  };
}

const EditableSplitRow: React.FC<EditableSplitRowProps> = ({
  split,
  onSplitChange,
  onRemove,
  canRemove,
  error,
}) => {
  const update = (field: string, value: string) =>
    onSplitChange({ ...split, [field]: value });

  return (
    <tr className="border-b border-blue-200 dark:border-blue-800 border-l-2 border-l-violet-300 dark:border-l-violet-600 bg-blue-50/80 dark:bg-blue-900/20">
      {/* Checkbox col — empty */}
      <td className="py-1 px-2 text-sm h-[25px]" />

      {/* Tags col — empty */}
      <td className="py-1 px-1 text-sm h-[25px]" />

      {/* Date col — tree connector */}
      <td className="py-1 px-2 text-sm h-[25px]">
        <span className="text-muted-foreground/50 select-none text-base leading-none">╰</span>
      </td>

      {/* Payee col — empty */}
      <td className="py-1 px-2 text-sm h-[25px]" />

      {/* Category col */}
      <td className="py-1 px-2 text-sm h-[25px]">
        <div className="pl-4">
          <CategorySelect
            value={split.categoryId}
            onChange={(v) => update('categoryId', v)}
            error={error?.categoryId}
          />
        </div>
      </td>

      {/* Notes col */}
      <td className="py-1 px-2 text-sm h-[25px]">
        <NotesInput
          value={split.notes}
          onChange={(v) => update('notes', v)}
        />
      </td>

      {/* Account col — empty */}
      <td className="py-1 px-2 text-sm h-[25px]" />

      {/* Amount col */}
      <td className="py-1 px-2 text-sm h-[25px]">
        <AmountInput
          value={split.amount}
          onChange={(v) => update('amount', v)}
          error={error?.amount}
        />
      </td>

      {/* Installment col — empty */}
      <td className="py-1 px-2 text-sm h-[25px]" />

      {/* Status col — remove button */}
      <td className="py-1 px-2 text-sm h-[25px]">
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={onRemove}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </td>

      {/* Ignore col — empty */}
      <td className="py-1 px-2 text-sm h-[25px]" />

      {/* Buffer col */}
      <td className="w-[20px]" />
    </tr>
  );
};

export default EditableSplitRow;

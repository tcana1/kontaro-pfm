import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Menu, FilePenLine, Tag, Layers, Merge, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileTransactionFabProps {
  hasSelection: boolean;
  selectedCount: number;
  selectedIsSplit: boolean;
  onAdd: () => void;
  onBatchEdit: () => void;
  onBatchTag: () => void;
  onCollapseSelected: () => void;
  onExplodeSelected: () => void;
  onMergeSelected: () => void;
  onDeleteSelected: () => void;
}

const MobileTransactionFab: React.FC<MobileTransactionFabProps> = ({
  hasSelection,
  selectedCount,
  selectedIsSplit,
  onAdd,
  onBatchEdit,
  onBatchTag,
  onCollapseSelected,
  onExplodeSelected,
  onMergeSelected,
  onDeleteSelected,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);

  // Close speed dial when selection state changes
  useEffect(() => {
    setOpen(false);
  }, [hasSelection]);

  // Close on outside tap
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const action = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const canCollapse = selectedCount >= 2;
  const canExplode = selectedCount === 1 && selectedIsSplit;
  const canMerge = selectedCount === 2;

  type Item = { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean };
  const items: Item[] = [];
  if (hasSelection) {
    items.push({ icon: <FilePenLine className="h-4 w-4" />, label: t('Edit'), onClick: action(onBatchEdit) });
    items.push({ icon: <Tag className="h-4 w-4" />, label: t('Tag'), onClick: action(onBatchTag) });
  }
  if (canCollapse) items.push({ icon: <Layers className="h-4 w-4" />, label: t('Combine ({{count}})', { count: selectedCount }), onClick: action(onCollapseSelected) });
  if (canExplode) items.push({ icon: <Layers className="h-4 w-4" />, label: t('Explode'), onClick: action(onExplodeSelected) });
  if (canMerge) items.push({ icon: <Merge className="h-4 w-4" />, label: t('Merge'), onClick: action(onMergeSelected) });
  if (hasSelection) items.push({ icon: <Trash2 className="h-4 w-4" />, label: t('Delete'), onClick: action(onDeleteSelected), danger: true });

  return (
    <div ref={fabRef} className="fixed bottom-6 right-4 z-50 md:hidden flex flex-col items-end gap-2">
      {/* Speed dial items */}
      <div
        aria-hidden={!open}
        className={cn(
          'flex flex-col items-end gap-2 transition-all duration-150',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
      >
        {items.map((item, i) => (
          <button
            key={i}
            onClick={item.onClick}
            className={cn(
              'flex items-center gap-2 bg-blue-50 dark:bg-gray-700 shadow-md rounded-full px-4 py-2.5 text-sm font-medium border border-blue-100 dark:border-gray-600 whitespace-nowrap',
              'transition-all duration-150',
              open ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
              item.danger ? 'text-red-500 dark:text-red-400' : 'text-gray-800 dark:text-gray-200',
            )}
            style={{ transitionDelay: open ? `${i * 35}ms` : '0ms' }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Main FAB button */}
      <button
        onClick={() => {
          if (!hasSelection) {
            onAdd();
          } else {
            setOpen(v => !v);
          }
        }}
        className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center transition-transform duration-200 active:scale-95"
        aria-label={hasSelection ? t('Bulk actions') : t('Add transaction')}
      >
        {hasSelection
          ? open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />
          : <Plus className="h-6 w-6" />
        }
      </button>
    </div>
  );
};

export default MobileTransactionFab;

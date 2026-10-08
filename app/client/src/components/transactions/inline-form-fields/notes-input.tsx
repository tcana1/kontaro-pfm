import React from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NotesInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  onKeyDown?: (event: React.KeyboardEvent) => boolean;
  registerFieldRef?: (fieldName: string, element: HTMLElement | null) => void;
  fieldName?: string;
}

const NotesInput: React.FC<NotesInputProps> = ({
  value,
  onChange,
  onBlur,
  error,
  onKeyDown,
  registerFieldRef,
  fieldName,
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <Input
        ref={(el) => {
          if (registerFieldRef && fieldName) {
            registerFieldRef(fieldName, el);
          }
        }}
        id="notes"
        type="text"
        placeholder={t('Additional notes...')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          // Handle keyboard navigation
          if (onKeyDown) {
            onKeyDown(e);
          }
        }}
        className={`h-7 p-2 ${error ? "border-red-500" : ""}`}
      />
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
};

export default NotesInput;

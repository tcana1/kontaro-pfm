import React from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';

interface InstallmentInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
  onKeyDown?: (event: React.KeyboardEvent) => boolean;
  registerFieldRef?: (fieldName: string, element: HTMLElement | null) => void;
  fieldName?: string;
}

const InstallmentInput: React.FC<InstallmentInputProps> = ({
  value,
  onChange,
  onBlur,
  error,
  onKeyDown,
  registerFieldRef,
  fieldName
}) => {
  const { t } = useTranslation();
  return (
    <Input
      ref={(el) => {
        if (registerFieldRef && fieldName) {
          registerFieldRef(fieldName, el);
        }
      }}
      type="text"
      placeholder={t("01/12")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (onKeyDown) {
          onKeyDown(e);
        }
      }}
      className={`h-7 p-2 
        w-[50px] p-1 text-center ${error ? 'border-red-500' : ''}`}
    />
  );
};

export default InstallmentInput;

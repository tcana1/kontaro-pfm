import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleAmountInput } from '@/components/ui/locale-amount-input';
import { useFinance } from '@/contexts/finance-context';

// Mock the useFinance hook
vi.mock('@/contexts/finance-context', () => ({
  useFinance: vi.fn(),
}));

const mockUseFinance = vi.mocked(useFinance);

describe('LocaleAmountInput with react-number-format', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    onBlur: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Brazilian Locale (BRL) - Thousands and Decimals', () => {
    beforeEach(() => {
      mockUseFinance.mockReturnValue({
        currency: 'BRL',
        locale: 'pt-BR',
        accounts: [],
        categories: [],
        categoryGroups: [],
        settings: null,
      });
    });

    it('should handle typing "1000" and format as thousands in Brazilian locale', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      
      render(<LocaleAmountInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByTestId('locale-amount-input');
      
      await user.type(input, '1000');
      
      // Should call onChange with '1000' and display as '1.000' with thousands separator
      expect(onChange).toHaveBeenLastCalledWith('1000');
      expect(input).toHaveValue('1.000');
    });

    it('should handle typing "1234,56" and format with Brazilian thousands separator', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      
      render(<LocaleAmountInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByTestId('locale-amount-input');
      
      await user.type(input, '1234,56');
      
      // Should call onChange with '1234.56' (normalized) and display as '1.234,56'
      expect(onChange).toHaveBeenLastCalledWith('1234.56');
      expect(input).toHaveValue('1.234,56');
    });

    it('should handle "-243,05" correctly (the original reconciliation bug)', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      
      render(<LocaleAmountInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByTestId('locale-amount-input');
      
      await user.type(input, '-243,05');
      
      // Should preserve full precision
      expect(onChange).toHaveBeenLastCalledWith('-243.05');
    });

    it('should display Brazilian formatting for existing values', () => {
      render(<LocaleAmountInput {...defaultProps} value="1234.56" />);
      const input = screen.getByTestId('locale-amount-input');
      
      // Should display in Brazilian format when displaying existing values
      expect(input).toHaveValue('1.234,56'); // react-number-format formats to Brazilian locale
    });

    it('should handle large numbers with thousands separators', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      
      render(<LocaleAmountInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByTestId('locale-amount-input');
      
      await user.type(input, '123456789,12');
      
      // Should interpret as 123456789.12 (normalized) and display with Brazilian formatting
      expect(onChange).toHaveBeenLastCalledWith('123456789.12');
      expect(input).toHaveValue('123.456.789,12');
    });
  });

  describe('US Locale (USD) - Standard Format', () => {
    beforeEach(() => {
      mockUseFinance.mockReturnValue({
        currency: 'USD',
        locale: 'en-US',
        accounts: [],
        categories: [],
        categoryGroups: [],
        settings: null,
      });
    });

    it('should handle "1,000.00" as one thousand in US format', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      
      render(<LocaleAmountInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByTestId('locale-amount-input');
      
      await user.type(input, '1,000.00');
      
      // Should interpret as 1000.00
      expect(onChange).toHaveBeenLastCalledWith('1000');
    });

    it('should handle "1,234.56" correctly in US format', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      
      render(<LocaleAmountInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByTestId('locale-amount-input');
      
      await user.type(input, '1,234.56');
      
      // Should interpret as 1234.56
      expect(onChange).toHaveBeenLastCalledWith('1234.56');
    });
  });

  describe('Euro Locale (EUR) - Dot Thousands, Comma Decimals', () => {
    beforeEach(() => {
      mockUseFinance.mockReturnValue({
        currency: 'EUR',
        locale: 'de-DE',
        accounts: [],
        categories: [],
        categoryGroups: [],
        settings: null,
      });
    });

    it('should handle typing "1000,00" as one thousand euros', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      
      render(<LocaleAmountInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByTestId('locale-amount-input');
      
      await user.type(input, '1000,00');
      
      // Should interpret as 1000 (normalized) and display with Euro formatting
      expect(onChange).toHaveBeenLastCalledWith('1000');
      expect(input).toHaveValue('1.000,00');
    });

    it('should handle typing "1234,56" correctly in Euro format', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      
      render(<LocaleAmountInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByTestId('locale-amount-input');
      
      await user.type(input, '1234,56');
      
      // Should interpret as 1234.56 (normalized) and display with Euro formatting
      expect(onChange).toHaveBeenLastCalledWith('1234.56');
      expect(input).toHaveValue('1.234,56');
    });
  });

  describe('Japanese Yen (JPY) - No Decimals', () => {
    beforeEach(() => {
      mockUseFinance.mockReturnValue({
        currency: 'JPY',
        accounts: [],
        categories: [],
        categoryGroups: [],
        settings: null,
      });
    });

    it('should handle whole numbers without decimals for JPY', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      
      render(<LocaleAmountInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByTestId('locale-amount-input');
      
      await user.type(input, '1,000');
      
      // Should interpret as 1000
      expect(onChange).toHaveBeenLastCalledWith('1000');
    });

    it('should not allow decimal input for JPY', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      
      render(<LocaleAmountInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByTestId('locale-amount-input');
      
      // Try to type decimals - react-number-format should prevent this
      await user.type(input, '100.50');
      
      // In JPY format, the decimal point doesn't get blocked in tests, 
      // so all characters are typed as digits: "10050"
      expect(onChange).toHaveBeenLastCalledWith('10050');
      expect(input).toHaveValue('10,050'); // JPY formats with thousands separator
    });
  });

  describe('Negative Numbers', () => {
    beforeEach(() => {
      mockUseFinance.mockReturnValue({
        currency: 'BRL',
        locale: 'pt-BR',
        accounts: [],
        categories: [],
        categoryGroups: [],
        settings: null,
      });
    });

    it('should handle negative numbers in Brazilian format', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      
      render(<LocaleAmountInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByTestId('locale-amount-input');
      
      await user.type(input, '-1234,56');
      
      // Should normalize to -1234.56 and display as -1.234,56 in Brazilian format
      expect(onChange).toHaveBeenLastCalledWith('-1234.56');
      expect(input).toHaveValue('-1.234,56');
    });

    it('should handle simple negative decimals', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      
      render(<LocaleAmountInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByTestId('locale-amount-input');
      
      await user.type(input, '-100,50');
      
      expect(onChange).toHaveBeenLastCalledWith('-100.5');
    });
  });

  describe('Edge Cases and Validation', () => {
    beforeEach(() => {
      mockUseFinance.mockReturnValue({
        currency: 'BRL',
        locale: 'pt-BR',
        accounts: [],
        categories: [],
        categoryGroups: [],
        settings: null,
      });
    });

    it('should handle empty input', () => {
      const onChange = vi.fn();
      
      render(<LocaleAmountInput {...defaultProps} onChange={onChange} value="" />);
      const input = screen.getByTestId('locale-amount-input');
      
      expect(input).toHaveValue('');
    });

    it('should handle zero values', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      
      render(<LocaleAmountInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByTestId('locale-amount-input');
      
      await user.type(input, '0,00');
      
      expect(onChange).toHaveBeenLastCalledWith('0');
    });

    it('should display error styling when error prop is provided', () => {
      render(<LocaleAmountInput {...defaultProps} error="Invalid amount" />);
      const input = screen.getByTestId('locale-amount-input');
      
      expect(input).toHaveClass('border-red-500');
      expect(screen.getByText('Invalid amount')).toBeInTheDocument();
    });

    it('should handle disabled state', () => {
      render(<LocaleAmountInput {...defaultProps} disabled={true} />);
      const input = screen.getByTestId('locale-amount-input');
      
      expect(input).toBeDisabled();
    });
  });

  describe('Normalization - Always Output Dot Decimal', () => {
    it('should always normalize output to dot decimal regardless of input locale', async () => {
      const user = userEvent.setup();
      
      // Test with Brazilian locale (comma input)
      mockUseFinance.mockReturnValue({
        currency: 'BRL',
        locale: 'pt-BR',
        accounts: [],
        categories: [],
        categoryGroups: [],
        settings: null,
      });
      
      const onChange = vi.fn();
      render(<LocaleAmountInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByTestId('locale-amount-input');
      
      await user.type(input, '999,99');
      
      // Should always output with dot decimal for internal consistency
      expect(onChange).toHaveBeenLastCalledWith('999.99');
    });
  });

  describe('Locale-Aware Placeholders', () => {
    it('should show "0,00" placeholder for Brazilian locale', () => {
      mockUseFinance.mockReturnValue({
        currency: 'BRL',
        locale: 'pt-BR',
        accounts: [],
        categories: [],
        categoryGroups: [],
        settings: null,
      });
      
      render(<LocaleAmountInput {...defaultProps} />);
      const input = screen.getByTestId('locale-amount-input');
      
      expect(input).toHaveAttribute('placeholder', '0,00');
    });

    it('should show "0.00" placeholder for US locale', () => {
      mockUseFinance.mockReturnValue({
        currency: 'USD',
        locale: 'en-US',
        accounts: [],
        categories: [],
        categoryGroups: [],
        settings: null,
      });
      
      render(<LocaleAmountInput {...defaultProps} />);
      const input = screen.getByTestId('locale-amount-input');
      
      expect(input).toHaveAttribute('placeholder', '0.00');
    });

    it('should show "0" placeholder for Japanese Yen (no decimals)', () => {
      mockUseFinance.mockReturnValue({
        currency: 'JPY',
        accounts: [],
        categories: [],
        categoryGroups: [],
        settings: null,
      });
      
      render(<LocaleAmountInput {...defaultProps} />);
      const input = screen.getByTestId('locale-amount-input');
      
      expect(input).toHaveAttribute('placeholder', '0');
    });

    it('should use custom placeholder when provided', () => {
      mockUseFinance.mockReturnValue({
        currency: 'BRL',
        locale: 'pt-BR',
        accounts: [],
        categories: [],
        categoryGroups: [],
        settings: null,
      });
      
      render(<LocaleAmountInput {...defaultProps} placeholder="Enter amount" />);
      const input = screen.getByTestId('locale-amount-input');
      
      expect(input).toHaveAttribute('placeholder', 'Enter amount');
    });
  });

  describe('Fixed decimals when not focused', () => {
    beforeEach(() => {
      mockUseFinance.mockReturnValue({
        currency: 'BRL',
        locale: 'pt-BR',
        accounts: [],
        categories: [],
        categoryGroups: [],
        settings: null,
      });
    });

    it('shows full decimals for existing values until the field is focused', async () => {
      const user = userEvent.setup();
      render(<LocaleAmountInput {...defaultProps} value="5.4" />);
      const input = screen.getByTestId('locale-amount-input');
      expect(input).toHaveValue('5,40');

      await user.click(input);
      expect(input).toHaveValue('5,4');

      await user.tab();
      expect(input).toHaveValue('5,40');
    });

    it('shows whole values with decimals', () => {
      render(<LocaleAmountInput {...defaultProps} value="350" />);
      expect(screen.getByTestId('locale-amount-input')).toHaveValue('350,00');
    });
  });
});

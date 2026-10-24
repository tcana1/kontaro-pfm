import React, { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/contexts/finance-context', () => ({ useFinance: () => ({ accounts: [] }) }));
vi.mock('@/services/supabase-service', () => ({
  supabaseService: { getPayees: vi.fn().mockResolvedValue([{ name: 'Existing Shop', default_category_id: 3 }, { name: 'Plain Shop', default_category_id: null }]) },
}));
import PayeeInput from '@/components/transactions/inline-form-fields/payee-input';

let saved = '';
const Harness = () => {
  const [v, setV] = useState('Old Name');
  return (
    <div>
      <PayeeInput value={v} onChange={setV} onToAccountIdChange={() => {}} />
      <button onClick={() => { saved = v; }}>Save</button>
    </div>
  );
};
const setup = () => render(<QueryClientProvider client={new QueryClient()}><Harness /></QueryClientProvider>);

describe('PayeeInput commit', () => {
  it('commits a typed new name when clicking Save', async () => {
    saved = ''; const user = userEvent.setup(); setup();
    const input = screen.getByRole('textbox');
    await user.clear(input); await user.type(input, 'Brand New');
    await user.click(screen.getByText('Save'));
    expect(saved).toBe('Brand New');
  });
  it('commits a typed new name after an earlier dropdown selection in the same focus', async () => {
    saved = ''; const user = userEvent.setup(); setup();
    const input = screen.getByRole('textbox');
    await user.clear(input); await user.type(input, 'Exist');
    const opt = await screen.findByText('Existing Shop');
    await user.click(opt);
    await user.clear(input); await user.type(input, 'Brand New 2');
    await user.click(screen.getByText('Save'));
    expect(saved).toBe('Brand New 2');
  });

  it('applies the payee default category only when one exists', async () => {
    const user = userEvent.setup();
    const onCategoryChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PayeeInput value="Old Name" onChange={() => {}} onToAccountIdChange={() => {}} onCategoryChange={onCategoryChange} />
      </QueryClientProvider>
    );
    const input = screen.getByRole('textbox');
    await user.clear(input); await user.type(input, 'Plain');
    await user.click(await screen.findByText('Plain Shop'));
    expect(onCategoryChange).not.toHaveBeenCalled();
    await user.clear(input); await user.type(input, 'Exist');
    await user.click(await screen.findByText('Existing Shop'));
    expect(onCategoryChange).toHaveBeenCalledWith(3);
  });
});

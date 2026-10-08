import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransferForm } from '@/components/transactions/transfer-form';

vi.mock('@/services/supabase-service', () => ({ supabaseService: { createLinkedTransactions: vi.fn() } }));

const accounts = [
  { id: 1, name: 'Alpha', is_active: true, type_id: 1 },
  { id: 2, name: 'Beta', is_active: true, type_id: 1 },
  { id: 3, name: 'Gamma', is_active: true, type_id: 1 },
] as any;

describe('TransferForm', () => {
  it('survives picking a source account and drops it from the destination list', async () => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};

    render(<TransferForm accounts={accounts} userId="u" specialCategoryId={1} />);

    const user = userEvent.setup();
    const [from] = screen.getAllByRole('combobox');
    await user.click(from);
    await user.click(await screen.findByRole('option', { name: /Alpha/ }));
    await waitFor(() => expect(from.textContent).toContain('Alpha'));

    await user.click(screen.getAllByRole('combobox')[1]);
    const options = await screen.findAllByRole('option');
    expect(options.map(o => o.textContent)).toEqual(expect.not.arrayContaining([expect.stringContaining('Alpha')]));
    expect(options).toHaveLength(2);
  });

  it('clears the destination when the chosen source collides with it', async () => {
    const user = userEvent.setup();
    render(<TransferForm accounts={accounts} userId="u" specialCategoryId={1} />);

    await user.click(screen.getAllByRole('combobox')[1]);
    await user.click(await screen.findByRole('option', { name: /Beta/ }));
    await waitFor(() => expect(screen.getAllByRole('combobox')[1].textContent).toContain('Beta'));

    await user.click(screen.getAllByRole('combobox')[0]);
    await user.click(await screen.findByRole('option', { name: /Beta/ }));

    await waitFor(() => expect(screen.getAllByRole('combobox')[1].textContent).toContain('Select destination account'));
  });
});

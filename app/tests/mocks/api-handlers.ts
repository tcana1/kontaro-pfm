import { http, HttpResponse } from 'msw';
import { mockAccounts, mockCategories, mockCategoryGroups, mockTransactions, mockSettings } from './mock-data';

// Create a set of standard API handlers for tests
export const handlers = [
  // Categories endpoints
  http.get('/api/categories', () => {
    return HttpResponse.json(mockCategories);
  }),
  
  http.get('/api/categories/:id', ({ params }) => {
    const id = params.id;
    const category = mockCategories.find(cat => cat.id === Number(id));
    if (!category) {
      return HttpResponse.json({ message: 'Category not found' }, { status: 404 });
    }
    return HttpResponse.json(category);
  }),
  
  http.post('/api/categories', async ({ request }) => {
    const category = await request.json();
    const newCategory = { ...category, id: mockCategories.length + 1 };
    return HttpResponse.json(newCategory, { status: 201 });
  }),
  
  // Category Groups endpoints
  http.get('/api/category-groups', () => {
    return HttpResponse.json(mockCategoryGroups);
  }),
  
  http.get('/api/category-groups/:id', ({ params }) => {
    const id = params.id;
    const group = mockCategoryGroups.find(g => g.id === Number(id));
    if (!group) {
      return HttpResponse.json({ message: 'Category group not found' }, { status: 404 });
    }
    return HttpResponse.json(group);
  }),
  
  // Accounts endpoints
  http.get('/api/accounts', () => {
    return HttpResponse.json(mockAccounts);
  }),
  
  http.get('/api/accounts/:id', ({ params }) => {
    const id = params.id;
    const account = mockAccounts.find(a => a.id === Number(id));
    if (!account) {
      return HttpResponse.json({ message: 'Account not found' }, { status: 404 });
    }
    return HttpResponse.json(account);
  }),
  
  // Transactions endpoints
  http.get('/api/transactions', ({ request }) => {
    // Support basic pagination/filtering
    const url = new URL(request.url);
    const limit = url.searchParams.get('limit');
    const offset = url.searchParams.get('offset');
    const category_id = url.searchParams.get('category_id');
    const account_id = url.searchParams.get('account_id');
    
    let filteredTransactions = [...mockTransactions];
    
    if (category_id) {
      filteredTransactions = filteredTransactions.filter(t => t.category_id === Number(category_id));
    }
    
    if (account_id) {
      filteredTransactions = filteredTransactions.filter(t => t.account_id === Number(account_id));
    }
    
    if (limit && offset) {
      const start = Number(offset);
      const end = start + Number(limit);
      filteredTransactions = filteredTransactions.slice(start, end);
    }
    
    return HttpResponse.json(filteredTransactions);
  }),
  
  http.get('/api/transactions/:id', ({ params }) => {
    const id = params.id;
    const transaction = mockTransactions.find(t => t.id === Number(id));
    if (!transaction) {
      return HttpResponse.json({ message: 'Transaction not found' }, { status: 404 });
    }
    return HttpResponse.json(transaction);
  }),
  
  http.post('/api/transactions', async ({ request }) => {
    const transaction = await request.json();
    const newTransaction = { ...transaction, id: mockTransactions.length + 1 };
    return HttpResponse.json(newTransaction, { status: 201 });
  }),
  
  // Settings endpoints
  http.get('/api/settings', () => {
    return HttpResponse.json(mockSettings);
  }),
  
  http.put('/api/settings', async ({ request }) => {
    const updates = await request.json();
    const updatedSettings = { ...mockSettings, ...updates };
    return HttpResponse.json(updatedSettings);
  }),
  
  // Payees search endpoint
  http.get('/api/payees/search', ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';
    const payees = ['Landlord', 'Whole Foods', 'ABC Corp', 'Electric Company', 'Water Utility', 'Internet Provider'];
    const filteredPayees = payees.filter(p => p.toLowerCase().includes(query.toLowerCase()));
    return HttpResponse.json(filteredPayees);
  }),
  
  // Dashboard summary
  http.get('/api/dashboard/summary', () => {
    const summary = {
      totalBalance: mockAccounts.reduce((sum, account) => sum + account.balance, 0),
      currentMonthIncome: 4500.00,
      currentMonthExpenses: -1625.50,
      topExpenseCategories: [
        { category_id: 1, categoryName: 'Rent/Mortgage', amount: -1500.00, color: '#9370DB' },
        { category_id: 2, categoryName: 'Groceries', amount: -125.50, color: '#3CB371' },
      ],
      recentTransactions: mockTransactions.slice(0, 3),
    };
    return HttpResponse.json(summary);
  }),
];
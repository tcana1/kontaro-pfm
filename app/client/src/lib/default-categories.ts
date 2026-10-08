// Content for the /categories empty-state "starter set" preview. Names are
// plain i18n strings (translated where the user reviews/edits them, before
// anything is sent to the database) — see pages/category-setup.tsx.

export interface DefaultCategoryTemplate {
  key: string;
  name: string;
  color: string;
}

export interface DefaultCategoryGroupTemplate {
  key: string;
  name: string;
  emoji?: string;
  color: string;
  isIncome?: boolean;
  // When set, categories are added into this existing group instead of a new one.
  groupId?: number;
  categories: DefaultCategoryTemplate[];
}

export const DEFAULT_CATEGORY_GROUPS: DefaultCategoryGroupTemplate[] = [
  {
    key: 'housing',
    name: 'Housing',
    emoji: '🏠',
    color: '#F59E0B',
    categories: [
      { key: 'rent', name: 'Rent / Mortgage', color: '#F59E0B' },
      { key: 'utilities', name: 'Utilities', color: '#F59E0B' },
      { key: 'internet', name: 'Internet & Phone', color: '#F59E0B' },
      { key: 'repairs', name: 'Repairs', color: '#F59E0B' },
    ],
  },
  {
    key: 'food',
    name: 'Food',
    emoji: '🍔',
    color: '#EF4444',
    categories: [
      { key: 'groceries', name: 'Groceries', color: '#EF4444' },
      { key: 'restaurants', name: 'Restaurants & Delivery', color: '#EF4444' },
    ],
  },
  {
    key: 'transport',
    name: 'Transport',
    emoji: '🚗',
    color: '#3B82F6',
    categories: [
      { key: 'fuel', name: 'Fuel', color: '#3B82F6' },
      { key: 'transit', name: 'Public Transit', color: '#3B82F6' },
      { key: 'ridehailing', name: 'Ride-hailing', color: '#3B82F6' },
      { key: 'maintenance', name: 'Maintenance', color: '#3B82F6' },
    ],
  },
  {
    key: 'health',
    name: 'Health',
    emoji: '🏥',
    color: '#10B981',
    categories: [
      { key: 'pharmacy', name: 'Pharmacy', color: '#10B981' },
      { key: 'doctor', name: 'Doctor & Dentist', color: '#10B981' },
      { key: 'gym', name: 'Gym', color: '#10B981' },
    ],
  },
  {
    key: 'personal',
    name: 'Personal',
    emoji: '👤',
    color: '#8B5CF6',
    categories: [
      { key: 'clothing', name: 'Clothing', color: '#8B5CF6' },
      { key: 'subscriptions', name: 'Subscriptions', color: '#8B5CF6' },
      { key: 'entertainment', name: 'Entertainment', color: '#8B5CF6' },
    ],
  },
  {
    key: 'income',
    name: 'Income',
    color: '#10B981',
    isIncome: true,
    groupId: -1,
    categories: [
      { key: 'salary', name: 'Salary', color: '#10B981' },
      { key: 'other_income', name: 'Other Income', color: '#22C55E' },
    ],
  },
];

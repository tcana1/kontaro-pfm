// Type declarations for schema imports in tests

declare module '@shared/schema' {
  export interface User {
    id: number;
    username: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    createdAt: Date;
  }

  export interface Settings {
    id: number;
    userId: string;
    currency: string;
    locale: string;
    theme: string;
    dateFormat: string;
  }

  export interface CategoryGroup {
    id: number;
    name: string;
    userId: string;
    description: string;
    isActive: boolean;
    color: string;
  }

  export interface Category {
    id: number;
    name: string;
    color: string;
    groupId: number;
    userId: string;
    isIncome: boolean;
    isActive: boolean;
  }

  export interface AccountType {
    id: number;
    name: string;
    description?: string;
    createdAt?: Date;
  }

  export interface Account {
    id: number;
    name: string;
    typeId: number;
    type?: AccountType; // Optional relation to AccountType
    balance: number;
    is_active: boolean;
    userId: string;
  }

  export interface Transaction {
    id: number;
    description: string;
    payee: string;
    amount: number;
    date: Date;
    categoryId: number;
    accountId: number;
    userId: string;
    notes: string | null;
    type: string;
    toAccountId: number | null;
  }

}
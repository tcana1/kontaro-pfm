import { pgTable, text, serial, integer, boolean, timestamp, decimal, date, jsonb, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Define Supabase auth schema
export const auth = {
  users: pgTable("auth.users", {
    id: uuid("id").primaryKey(),
    email: text("email"),
    created_at: timestamp("created_at"),
    // Add other fields as needed, but these are the essential ones
  })
};

// Account Types schema
export const accountTypes = pgTable("account_types", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Account schema
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  type_id: integer("type_id").notNull().references(() => accountTypes.id),
  starting_balance_temp: decimal("starting_balance_temp").default("0"),
  user_id: uuid("user_id").notNull().default("00000000-0000-0000-0000-000000000000"),
  icon: varchar("icon", { length: 255 }).default("ri-bank-line"),
  last4: varchar("last4", { length: 255 }),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertAccountTypesSchema = createInsertSchema(accountTypes).pick({
  name: true,
  description: true,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as unknown as z.ZodType<any>;

export type InsertAccountType = z.infer<typeof insertAccountTypesSchema>;
export type AccountType = typeof accountTypes.$inferSelect;

export const insertAccountSchema = createInsertSchema(accounts).pick({
  name: true,
  slug: true,
  type_id: true,
  starting_balance_temp: true,
  user_id: true,
  icon: true,
  last4: true,
  is_active: true,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as unknown as z.ZodType<any>;

export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accounts.$inferSelect;

// CategoryGroup schema
export const categoryGroups = pgTable("category_groups", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  user_id: uuid("user_id").notNull().default("00000000-0000-0000-0000-000000000000"),
  emoji: varchar("emoji", { length: 255 }),
  color: varchar("color", { length: 255 }).default("#6B7280"),
  is_income: boolean("is_income").notNull().default(false),
  created_at: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const insertCategoryGroupSchema = createInsertSchema(categoryGroups).pick({
  name: true,
  user_id: true,
  emoji: true,
  color: true,
  is_income: true,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as unknown as z.ZodType<any>;

export type InsertCategoryGroup = z.infer<typeof insertCategoryGroupSchema>;
export type CategoryGroup = typeof categoryGroups.$inferSelect;

// Category schema
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 255 }).default("#3B82F6"),
  group_id: integer("group_id").notNull().references(() => categoryGroups.id),
  user_id: uuid("user_id").notNull().default("00000000-0000-0000-0000-000000000000"),
  created_at: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const insertCategorySchema = createInsertSchema(categories).pick({
  name: true,
  color: true,
  group_id: true,
  user_id: true,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as unknown as z.ZodType<any>;

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

export type CategoryWithGroup = Category & {
  category_groups?: CategoryGroup;
};

// Transaction Statuses schema
export const transactionStatuses = pgTable("transaction_statuses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

// Transaction schema
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  unique_hash: varchar("unique_hash", { length: 64 }).unique().notNull(),
  account_id: integer("account_id").notNull().references(() => accounts.id),
  payment_date: date("payment_date").notNull(),
  purchase_date: date("purchase_date").notNull(),
  payee: varchar("payee", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  is_installment: boolean("is_installment").default(false),
  installment_number: integer("installment_number"),
  installment_total: integer("installment_total"),
  status_id: integer("status_id").notNull().references(() => transactionStatuses.id),
  user_id: uuid("user_id").notNull().default("00000000-0000-0000-0000-000000000000"),
  type: text("type").notNull().default("transaction"),
  to_account_id: integer("to_account_id").references(() => accounts.id),
  created_at: timestamp("created_at").defaultNow(),
});

// Transaction Splits schema - NEW TABLE
export const transactionSplits = pgTable("transaction_splits", {
  id: serial("id").primaryKey(),
  transaction_id: integer("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  category_id: integer("category_id").references(() => categories.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  observation: text("observation"),
  created_at: timestamp("created_at").defaultNow(),
});

// Settings schema
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  user_id: uuid("user_id").notNull().default("00000000-0000-0000-0000-000000000000"),
  currency: text("currency").notNull().default("USD"),
  locale: text("locale").notNull().default("en-US"),
  theme: text("theme").notNull().default("light"),
  dateFormat: text("date_format").notNull().default("default"),
});

// Categorization Rules schema
export const categorizationRules = pgTable("categorization_rules", {
  id: serial("id").primaryKey(),
  payee_keyword: varchar("payee_keyword", { length: 100 }).notNull(),
  category_id: integer("category_id").notNull().references(() => categories.id),
});

// Relations
export const accountTypesRelations = relations(accountTypes, ({ many }) => ({
  accounts: many(accounts),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  type: one(accountTypes, { fields: [accounts.type_id], references: [accountTypes.id] }),
  transactions: many(transactions),
  transfersTo: many(transactions, { relationName: "toAccount" }),
}));

export const categoryGroupsRelations = relations(categoryGroups, ({ many }) => ({
  categories: many(categories),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  group: one(categoryGroups, { fields: [categories.group_id], references: [categoryGroups.id] }),
  transactions: many(transactions),
  transactionSplits: many(transactionSplits),
  categorizationRules: many(categorizationRules),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  account: one(accounts, { fields: [transactions.account_id], references: [accounts.id] }),
  toAccount: one(accounts, {
    fields: [transactions.to_account_id],
    references: [accounts.id],
    relationName: "toAccount"
  }),
  status: one(transactionStatuses, { fields: [transactions.status_id], references: [transactionStatuses.id] }),
  splits: many(transactionSplits),
}));

export const transactionStatusesRelations = relations(transactionStatuses, ({ many }) => ({
  transactions: many(transactions),
}));

export const transactionSplitsRelations = relations(transactionSplits, ({ one }) => ({
  transaction: one(transactions, { fields: [transactionSplits.transaction_id], references: [transactions.id] }),
  category: one(categories, { fields: [transactionSplits.category_id], references: [categories.id] }),
}));

export const settingsRelations = relations(settings, ({ one }) => ({
  user: one(auth.users, { fields: [settings.user_id], references: [auth.users.id] }),
}));

export const categorizationRulesRelations = relations(categorizationRules, ({ one }) => ({
  category: one(categories, { fields: [categorizationRules.category_id], references: [categories.id] }),
}));

// Insert schemas
export const insertTransactionSchema = createInsertSchema(transactions).pick({
  unique_hash: true,
  account_id: true,
  payment_date: true,
  purchase_date: true,
  payee: true,
  is_installment: true,
  installment_number: true,
  installment_total: true,
  status_id: true,
  user_id: true,
  type: true,
  to_account_id: true,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as unknown as z.ZodType<any>;

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export interface Transaction {
  id: number;
  user_id: string;
  type: string;
  account_id: number;
  payment_date: string;
  purchase_date: string;
  payee: string;
  amount: string;
  description?: string;
  notes?: string;
  unique_hash: string;
  is_installment?: boolean;
  installment_number?: number;
  installment_total?: number;
  to_account_id?: number;
  to_account_name?: string;
  category_name?: string;
  account_name?: string;
  category_group_emoji?: string;
  category_is_income?: boolean;
  splits?: TransactionSplit[];
  status: { id: number; name: string };
  is_ignored?: boolean;
  tag_id?: number | null;
  tag_name?: string | null;
  tag_color?: string | null;
}

export const insertTransactionSplitSchema = createInsertSchema(transactionSplits).pick({
  transaction_id: true,
  category_id: true,
  amount: true,
  observation: true,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as unknown as z.ZodType<any>;

export type InsertTransactionSplit = z.infer<typeof insertTransactionSplitSchema>;
export type TransactionSplit = typeof transactionSplits.$inferSelect;

export const insertSettingsSchema = createInsertSchema(settings).pick({
  user_id: true,
  currency: true,
  locale: true,
  theme: true,
  dateFormat: true,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as unknown as z.ZodType<any>;

export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;

export const insertCategorizationRuleSchema = createInsertSchema(categorizationRules).pick({
  payee_keyword: true,
  category_id: true,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as unknown as z.ZodType<any>;

export type InsertCategorizationRule = z.infer<typeof insertCategorizationRuleSchema>;
export type CategorizationRule = typeof categorizationRules.$inferSelect;

// Tags schema
export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 7 }).notNull().default("#6B7280"),
  archived: boolean("archived").notNull().default(false),
  created_at: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const insertTagSchema = createInsertSchema(tags).pick({
  name: true,
  color: true,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as unknown as z.ZodType<any>;

export type InsertTag = z.infer<typeof insertTagSchema>;
export type Tag = typeof tags.$inferSelect;
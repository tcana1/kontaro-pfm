import { Account, Transaction } from "@shared/schema";

/**
 * Process credit card payment from an external account (not tracked in the app)
 * 
 * @param creditCardAccountId The credit card account ID to record payment to
 * @param amount Positive amount being paid
 * @param date Date of the payment
 * @param userId User ID
 * @param description Optional custom description
 * @param notes Optional notes
 * @param categoryId Category ID (a special payment category should be used)
 * @returns The payment transaction
 */
export function createCreditCardPaymentTransaction(
  creditCardAccountId: number,
  amount: number,
  date: string,
  userId: string,
  description: string = "Credit Card Payment",
  notes: string | null = null,
  categoryId: number
): Record<string, unknown> {
  // Ensure amount is positive
  const paymentAmount = Math.abs(amount);

  // Credit card payment (positive amount to decrease credit card debt)
  return {
    description,
    amount: paymentAmount,
    date,
    categoryId,
    accountId: creditCardAccountId,
    userId,
    notes,
    type: "payment",
    isRecurring: false
  };
}

/**
 * Filter function to exclude transfer and payment transactions for reports
 */
export function excludeTransfersAndPayments(transaction: Transaction): boolean {
  return transaction.type !== "transfer" && transaction.type !== "payment";
}

/**
 * Determine if an account is a credit card based on its type
 */
export function isCreditCard(account: Account): boolean {
  // Check if type relation is loaded and use it
  if ((account as any).type) {
    return (account as any).type.name === "credit_card";
  }
  // Fall back to checking type_id directly (credit_card = 2)
  return account.type_id === 2;
}

/**
 * Generate a standardized payee name for payment transactions
 */
export function generatePaymentPayeeName(account: Account, direction: 'to' | 'from'): string {
  return `Payment ${direction} ${account.name}`;
}

/**
 * Parse a payee string to determine if it's a payment payee and extract account info
 */
export function parsePaymentPayee(payeeString: string): { 
  isPayment: boolean; 
  accountId?: number; 
  direction?: 'to' | 'from' 
} {
  if (!payeeString) {
    return { isPayment: false };
  }

  // Match pattern: "Payment to [Account Name]" or "Payment from [Account Name]"
  const paymentRegex = /^Payment (to|from) (.+)$/;
  const match = payeeString.match(paymentRegex);
  
  if (!match) {
    return { isPayment: false };
  }

  const direction = match[1] as 'to' | 'from';
  const accountName = match[2];

  // Note: We can't extract accountId from just the name without additional context
  // This would typically be handled by the component using this utility
  return {
    isPayment: true,
    direction,
    // accountId would need to be resolved by the caller using the accountName
  };
}


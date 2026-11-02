// Transfers change custody, not the amount donated or spent on the campaign.
export function calculateCampaignFunds(grossIncome: number, expenses: number, refunds: number, treasuryTransfers: number) {
  const income = grossIncome - refunds;
  const balance = income - expenses;
  return { income, expenses, refunds, treasuryTransfers, balance, heldBalance: balance - treasuryTransfers };
}

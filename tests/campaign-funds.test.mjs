import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCampaignFunds } from '../src/lib/campaign-funds.ts';

test('weekly transfers preserve income and campaign funds while reducing money held', () => {
  const first = calculateCampaignFunds(100_000_000, 10_000_000, 0, 30_000_000);
  const second = calculateCampaignFunds(100_000_000, 10_000_000, 0, 30_000_000 + 40_000_000);
  assert.equal(second.income, 100_000_000);
  assert.equal(second.expenses, 10_000_000);
  assert.equal(second.balance, 90_000_000);
  assert.equal(second.heldBalance, 20_000_000);
  assert.equal(first.balance, second.balance);
  assert.equal(first.heldBalance - second.heldBalance, 40_000_000);
});
test('refunds reduce contributions exactly once, independently of treasury transfers', () => {
  const funds = calculateCampaignFunds(100_000_000, 10_000_000, 5_000_000, 70_000_000);
  assert.equal(funds.income, 95_000_000);
  assert.equal(funds.balance, 85_000_000);
  assert.equal(funds.heldBalance, 15_000_000);
});
test('correcting a transfer back to a donation preserves held money but changes expense totals', () => {
  const transfer = calculateCampaignFunds(100, 10, 0, 70);
  const donation = calculateCampaignFunds(100, 80, 0, 0);
  assert.equal(transfer.heldBalance, donation.heldBalance);
  assert.equal(transfer.income, donation.income);
  assert.equal(donation.expenses - transfer.expenses, 70);
});
test('campaigns remain separate and negative balances reveal incomplete funding', () => {
  assert.equal(calculateCampaignFunds(10, 0, 0, 15).heldBalance, -5);
  assert.equal(calculateCampaignFunds(50, 0, 0, 0).heldBalance, 50);
  assert.deepEqual(calculateCampaignFunds(0, 0, 0, 0), {income:0, expenses:0, refunds:0, treasuryTransfers:0, balance:0, heldBalance:0});
});

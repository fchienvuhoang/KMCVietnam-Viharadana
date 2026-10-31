import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMbPages, parseMbStatement } from '../src/lib/mbbank.ts';
const cell = (text, x, y) => ({ text, x, y });
function sample() {
  return [{ width: 842, cells: [
    cell('Military Commercial Joint Stock Bank', 600, 30),
    cell('Account No: 0001234567', 20, 70),
    cell('Account name: TEST ACCOUNT', 20, 90),
    cell('Currency: VND', 20, 110),
    cell('From: 01/08/2026 To: 15/08/2026', 20, 130),
    cell('15/08/2026 10:09', 22, 200), cell('FT26227946123407', 89, 200),
    cell('5,000,000.00', 242, 200), cell('0.00', 334, 200),
    cell('Cung duong', 355, 195), cell('thien phap', 355, 205),
    cell('COUNTERPARTY', 570, 200), cell('000999', 708, 200),
    cell('15/08/2026 10:08', 22, 245), cell('TT26227474002303', 89, 245),
    cell('0.00', 242, 245), cell('7,000,000.00', 310, 245),
    cell('Hoan lai', 355, 245),
    cell('Tổng phát sinh trong kỳ/Total', 20, 290),
    cell('5,000,000', 242, 285), cell('.00', 250, 295),
    cell('7,000,000.00', 310, 290),
    cell('Chứng từ này được xuất', 20, 330),
  ] }];
}
test('MB: exact amounts, multiline description, leading zeros and Vietnam time', () => {
  const parsed = parseMbPages(sample());
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.meta.sourceBank, 'MB');
  assert.equal(parsed.meta.accountNumber, '0001234567');
  assert.equal(parsed.meta.closingBalance, null);
  assert.equal(parsed.rows[0].description, 'Cung duong thien phap');
  assert.equal(parsed.rows[0].debitAmount, 5000000);
  assert.equal(parsed.rows[1].creditAmount, 7000000);
  assert.equal(parsed.rows[0].transactionDate.toISOString(), '2026-08-15T03:09:00.000Z');
  assert.equal(parsed.rows[0].detail, 'MB:0001234567:FT26227946123407');
  assert.deepEqual(parseMbPages(sample()).rows, parsed.rows);
});
test('MB: rejects missing rows instead of silently importing incomplete totals', () => {
  const pages = sample();
  pages[0].cells = pages[0].cells.filter(c => c.y < 240 || c.y > 250);
  assert.throws(() => parseMbPages(pages), /không khớp/);
});
test('MB: rejects malformed amounts, missing totals and invalid dates', () => {
  for (const [original, replacement] of [['5,000,000.00', 'bad'], ['15/08/2026 10:09', '32/08/2026 10:09'], ['Tổng phát sinh trong kỳ/Total', 'missing']]) {
    const pages = sample();
    pages[0].cells.find(c => c.text === original).text = replacement;
    assert.throws(() => parseMbPages(pages));
  }
});
test('MB: collects transactions across pages', () => {
  const [page] = sample();
  const pages = [ { width: page.width, cells: page.cells.filter(c => c.y < 240) }, { width: page.width, cells: page.cells.filter(c => c.y >= 240) } ];
  assert.equal(parseMbPages(pages).rows.length, 2);
});
test('MB: rejects duplicate reference numbers', () => {
  const pages = sample();
  pages[0].cells.find(c => c.text === 'TT26227474002303').text = 'FT26227946123407';
  assert.throws(() => parseMbPages(pages), /trùng/);
});

test('MB: rejects Excel or renamed non-PDF files before parsing', async () => {
  await assert.rejects(() => parseMbStatement(Buffer.from('not a PDF')), /PDF sao kê MB gốc/);
});

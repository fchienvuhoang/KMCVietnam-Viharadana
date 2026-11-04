import type { ParsedStatement, StatementTransactionRow } from "./bank-statement";

type PdfCell = { text: string; x: number; y: number };
export type MbPdfPage = { width: number; cells: PdfCell[] };

export async function parseMbStatement(buffer: Buffer): Promise<ParsedStatement> {
  if (buffer.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("Vui lòng chọn file PDF sao kê MB gốc.");
  }
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  try {
    const document = await task.promise;
    const pages: MbPdfPage[] = [];
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const cells: PdfCell[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        cells.push({ text: item.str.trim(), x, y });
      }
      pages.push({ width: viewport.width, cells });
    }
    return parseMbPages(pages);
  } finally {
    await task.destroy();
  }
}

// Text coordinates preserve column boundaries and descriptions spanning several lines.
export function parseMbPages(pages: MbPdfPage[]): ParsedStatement {
  const first = pages[0];
  if (!first) throw new Error("PDF không có trang nào.");
  const lines = textLines(first.cells);
  const header = lines.join("\n");
  if (!/Military Commercial Joint Stock Bank|NGÂN HÀNG TMCP QUÂN ĐỘI/i.test(header)) {
    throw new Error("Vui lòng chọn sao kê PDF MB có lớp văn bản, đúng mẫu Sổ phụ chi tiết.");
  }
  const accountNumber = header.match(/Account No:\s*(\d+)/i)?.[1];
  const accountName = header.match(/Account name:\s*([^\n]+)/i)?.[1]?.trim();
  const period = header.match(/From:\s*(\d{2}\/\d{2}\/\d{4}).*To:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const currency = header.match(/Currency:\s*(\w+)/i)?.[1];
  if (!accountNumber || !period || currency !== "VND") {
    throw new Error("Không đọc được tài khoản, kỳ sao kê hoặc đơn vị VND trong PDF MB.");
  }

  const rows: StatementTransactionRow[] = [];
  let totals: [number, number] | undefined;
  for (const page of pages) {
    const sorted = [...page.cells].sort((a, b) => a.y - b.y || a.x - b.x);
    const anchors = sorted.filter(cell => cell.x < page.width * 0.1 && /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/.test(cell.text));
    const totalLabel = sorted.find(cell => /Tổng phát sinh trong kỳ|Total$/.test(cell.text));
    const footer = sorted.find(cell => /Chứng từ này được xuất/.test(cell.text));
    const endY = totalLabel ? totalLabel.y - 10 : (footer?.y ?? Infinity) - 10;
    for (let index = 0; index < anchors.length; index++) {
      const anchor = anchors[index];
      const start = index ? (anchors[index - 1].y + anchor.y) / 2 : anchor.y - 20;
      const end = index + 1 < anchors.length ? (anchor.y + anchors[index + 1].y) / 2 : endY;
      const inRow = sorted.filter(cell => cell.y >= start && cell.y < end);
      const column = (left: number, right: number) => inRow.filter(cell => cell.x / page.width >= left && cell.x / page.width < right).map(cell => cell.text).join(" ");
      const reference = column(0.1, 0.27);
      const debitAmount = mbAmount(column(0.27, 0.34));
      const creditAmount = mbAmount(column(0.34, 0.415));
      const description = column(0.415, 0.672);
      if (!/^(?:[A-Z]{2}\d+|CHG[A-Z0-9]+)$/.test(reference) || !description || (debitAmount > 0) === (creditAmount > 0)) {
        throw new Error(`Không đọc chính xác giao dịch MB dòng ${rows.length + 1}; chưa nhập dữ liệu.`);
      }
      rows.push({
        transactionDate: mbDate(anchor.text), statementRow: rows.length + 1,
        description, detail: reference.startsWith("CHG")
          ? `MB:${accountNumber}:${reference}:${debitAmount > 0 ? "debit" : "credit"}:${debitAmount || creditAmount}`
          : `MB:${accountNumber}:${reference}`,
        debitAmount, creditAmount, balanceAfter: null,
        raw: { transactionNumber: reference, transactionDate: anchor.text, beneficiary: column(0.672, 0.835), counterpartyAccount: column(0.835, 0.92), bank: column(0.92, 1) },
      });
    }
    if (totalLabel) {
      const totalCells = sorted.filter(cell => cell.y >= totalLabel.y - 12 && cell.y <= totalLabel.y + 12);
      const amount = (left: number, right: number) => mbAmount(totalCells.filter(cell => cell.x / page.width >= left && cell.x / page.width < right).map(cell => cell.text).join(""));
      totals = [amount(0.27, 0.34), amount(0.34, 0.415)];
    }
  }
  if (!rows.length || !totals) throw new Error("Không tìm thấy giao dịch hoặc tổng phát sinh trong PDF MB; chưa nhập dữ liệu.");
  const actual = rows.reduce((sum, row) => [sum[0] + row.debitAmount, sum[1] + row.creditAmount], [0, 0]);
  if (actual.some((amount, index) => Math.abs(amount - totals![index]) > 0.005)) {
    throw new Error("Tổng nợ/có đọc được không khớp tổng phát sinh của PDF MB; chưa nhập dữ liệu.");
  }
  if (new Set(rows.map(row => row.detail)).size !== rows.length) throw new Error("PDF MB có mã bút toán trùng; vui lòng kiểm tra file.");
  return { sheetName: "MB PDF", meta: { sourceBank: "MB", accountNumber, accountName: accountName ?? null, currency, fromDate: mbDate(period[1]), toDate: mbDate(period[2]), openingBalance: null, closingBalance: null }, rows };
}

function textLines(cells: PdfCell[]) {
  const lines: { y: number; cells: PdfCell[] }[] = [];
  for (const cell of [...cells].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find(line => Math.abs(line.y - cell.y) < 2);
    if (line) line.cells.push(cell); else lines.push({ y: cell.y, cells: [cell] });
  }
  return lines.map(line => line.cells.sort((a, b) => a.x - b.x).map(cell => cell.text).join(" "));
}
function mbAmount(text: string) {
  const value = text.replace(/\s/g, "");
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/.test(value)) throw new Error("Không đọc được số tiền trong PDF MB.");
  const amount = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(amount)) throw new Error("Số tiền MB không hợp lệ.");
  return amount;
}
function mbDate(text: string) {
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (!match) throw new Error("Ngày giao dịch MB không hợp lệ.");
  const [, day, month, year, hour = "12", minute = "00"] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+07:00`);
  if (!Number.isFinite(date.getTime()) || Number(hour) > 23 || Number(minute) > 59 || new Date(date.getTime() + 7 * 3600000).getUTCDate() !== Number(day)) throw new Error("Ngày giao dịch MB không hợp lệ.");
  return date;
}

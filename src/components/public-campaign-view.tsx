"use client";

import { CircleCheck, Download, HeartHandshake, Info, Link2, Loader2, Search, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicCampaignData, PublicCampaignTransaction } from "@/lib/public-campaign";
import { downloadElementAsPng } from "@/lib/download-element-image";
import { normalizeTransferText } from "@/lib/text";

const statusLabels = {
  ACTIVE: "Đang chạy",
  PAUSED: "Tạm dừng",
  COMPLETED: "Hoàn tất",
};

const statusClassNames = {
  ACTIVE: "border-[#9fd3bd] bg-[#effaf5] text-[#256b52]",
  PAUSED: "border-amber-200 bg-amber-50 text-amber-700",
  COMPLETED: "border-[#dbc7d1] bg-[#fbf6f8] text-[#725967]",
};

export function PublicCampaignView({ data }: { data: PublicCampaignData }) {
  const [query, setQuery] = useState("");
  const [selectedTransaction, setSelectedTransaction] = useState<PublicCampaignTransaction | null>(null);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const normalizedQuery = normalizeTransferText(query);

  const filteredTransactions = useMemo(() => {
    if (!normalizedQuery) {
      return [...data.transactions].sort(compareTransactionNewestFirst);
    }

    return data.transactions.filter((transaction) => {
      return normalizeTransferText(
        `${transaction.description} ${transaction.refundLinks.map((link) => link.description).join(" ")}`,
      ).includes(normalizedQuery);
    }).sort(compareTransactionNewestFirst);
  }, [data.transactions, normalizedQuery]);

  return (
    <div className="min-h-screen bg-[#fff8fb] text-[#2d1726]">
      <header
        className="public-campaign-hero relative isolate overflow-hidden border-b border-[#dba8bf] bg-[#f7eaf0]"
      >
        <Image
          src="/assets/dhamma-celestial-mangosteen-painted-mobile.jpg"
          alt=""
          fill
          priority
          sizes="(max-width: 767px) 100vw, 1px"
          className="object-cover object-top md:hidden"
        />
        <Image
          src="/assets/dhamma-celestial-mangosteen-painted.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 768px) 100vw, 1px"
          className="hidden object-cover object-center md:block"
        />
        <div className="absolute inset-0 bg-[#fff8fb]/35 sm:bg-[#fff8fb]/58" />
        <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-9 lg:py-12">
          <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)] lg:gap-10">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-white bg-white shadow-[0_5px_16px_rgba(76,23,59,0.2)] sm:h-16 sm:w-16">
                  <Image
                    src="/assets/dhamma-group-logo.jpg"
                    alt="Logo Dhamma Group"
                    fill
                    sizes="64px"
                    className="scale-[1.16] object-cover"
                  />
                </span>
                <span className="rounded-md bg-[#4c173b] px-3 py-1.5 font-mono text-xs font-semibold text-white shadow-sm">
                  Thiện pháp {data.code}
                </span>
                <span className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${statusClassNames[data.status]}`}>
                  {statusLabels[data.status]}
                </span>
              </div>

              <p className="mt-6 text-xs font-bold uppercase text-[#a43d6a] sm:text-sm">
                DĀNA PUÑÑA
              </p>
              <h1 className="mt-2 max-w-3xl break-words rounded-lg border border-white/70 bg-white/50 px-4 py-3 text-2xl font-bold leading-tight text-[#4a1838] shadow-[0_8px_22px_rgba(76,23,59,0.1)] backdrop-blur-sm sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-4xl sm:shadow-none sm:backdrop-blur-none">
                {data.name}
              </h1>
              {data.description ? (
                <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-[#624b59] sm:text-base">
                  {data.description}
                </p>
              ) : null}
            </div>

            <section className="overflow-hidden rounded-lg border border-[#d79bb8] bg-white/95 shadow-lg shadow-[#4c173b]/12" aria-label="Tổng quan tịnh tài">
              <div className="bg-[#4c173b] px-5 py-5 text-white sm:px-6">
                <p className="text-xs font-semibold uppercase text-[#f2c5d8]">Tịnh tài hiện còn</p>
                <p className="mt-2 break-words text-3xl font-bold leading-tight sm:text-4xl">{money(data.balance)}</p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-y divide-[#efd3df]">
                <SummaryStat label="Hùn phước sau hoàn lại" value={money(data.income)} tone="jade" />
                <SummaryStat label="Đã cúng dường" value={money(data.expenses)} tone="gold" />
                <SummaryStat label="Đã hoàn lại" value={money(data.refunds)} tone="gold" />
                <SummaryStat label="Lượt hùn phước" value={data.transactionCount.toLocaleString("vi-VN")} tone="dark" />
              </div>
            </section>
          </div>

          <div className="mt-5 flex max-w-3xl items-start gap-2 border-l-2 border-[#b94f79] pl-3 text-xs leading-5 text-[#624b59]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a43d6a]" />
            <p>
              Hoàn lại là những khoản chuyển trả cho thí chủ để thí chủ tác ý lại,
              hoặc do thí chủ chuyển nhầm thiện pháp nên được hoàn lại.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
        {data.donations.length > 0 ? (
          <section className="mb-5 rounded-lg border border-[#edcddb] bg-white p-4 sm:p-5">
            <h2 className="text-lg font-bold text-[#4a1838]">Chi tiết các khoản cúng dường và bill chuyển tiền</h2>
            <div className="mt-4 space-y-4">
              {data.donations.map((donation, index) => {
                const bills = data.bills.filter((bill) => bill.transactionId === donation.id);
                return (
                  <article key={donation.id} className="rounded-lg border border-[#edcddb] bg-[#fff8fb] p-4">
                    <h3 className="font-semibold text-[#4a1838]">{index + 1}. {bills[0]?.title ?? donation.title}</h3>
                    <p className="mt-1 text-sm text-[#78636f]">
                      {new Date(donation.transactionDate).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} · {money(donation.amount)}
                      {bills.length > 0 ? ` · ${bills.length.toLocaleString("vi-VN")} bill` : ""}
                    </p>
                    {bills.length === 0 ? <p className="mt-3 text-sm text-[#78636f]">Chưa có bill chuyển tiền.</p> : (
                      <div className="-mx-1 mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
                        {bills.map((bill, billIndex) => (
                          <button
                            key={bill.id}
                            type="button"
                            onClick={() => setSelectedBillId(bill.id)}
                            className="group w-28 shrink-0 snap-start overflow-hidden rounded-lg border border-[#e8b8cc] bg-white text-left shadow-sm transition hover:border-[#cf7da1] hover:shadow-md sm:w-auto"
                            aria-label={`Xem bill ${billIndex + 1}: ${bill.title ?? donation.title}`}
                          >
                            <span className="relative block h-32 overflow-hidden bg-white sm:h-auto sm:aspect-[3/4]">
                              <Image
                                src={`/thien-phap/media/${bill.id}`}
                                alt={`Bill ${bill.title ?? donation.title}`}
                                fill
                                unoptimized
                                sizes="(max-width: 639px) 112px, (max-width: 1023px) 50vw, 33vw"
                                className="object-contain transition duration-300 group-hover:scale-[1.02]"
                              />
                            </span>
                            <span className="block truncate px-2.5 py-2 text-xs font-medium text-[#624b59]">
                              Bill {billIndex + 1}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
        {data.bills.some((bill) => !bill.transactionId) ? (
          <section className="mb-5 rounded-lg border border-[#edcddb] bg-white p-3 shadow-[0_10px_30px_rgba(76,23,59,0.08)] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#4a1838]">Bill chưa gắn khoản cúng dường</h2>
                <p className="mt-1 text-xs text-[#78636f]">
                  {data.bills.filter((bill) => !bill.transactionId).length.toLocaleString("vi-VN")} hình ảnh minh bạch của thiện pháp
                </p>
              </div>
            </div>
            <div className="-mx-1 mt-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
              {data.bills.filter((bill) => !bill.transactionId).map((bill, index) => (
                <button
                  key={bill.id}
                  type="button"
                  onClick={() => setSelectedBillId(bill.id)}
                  className="group w-28 shrink-0 snap-start overflow-hidden rounded-lg border border-[#e8b8cc] bg-[#fff8fb] text-left shadow-sm transition hover:border-[#cf7da1] hover:shadow-md sm:w-auto"
                  aria-label={`Xem bill chuyển tiền số ${index + 1}`}
                >
                  <span className="relative block h-32 overflow-hidden bg-zinc-100 sm:h-auto sm:aspect-[3/4]">
                    <Image
                      src={`/thien-phap/media/${bill.id}`}
                      alt={`Bill chuyển tiền số ${index + 1} của thiện pháp ${data.code}`}
                      fill
                      unoptimized
                      sizes="(max-width: 639px) 112px, (max-width: 1023px) 33vw, 25vw"
                      className="object-contain transition duration-300 group-hover:scale-[1.02]"
                    />
                  </span>
                  <span className="block truncate px-3 py-2 text-xs font-medium text-[#624b59]">
                    Bill {index + 1}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border border-[#edcddb] bg-white p-3 shadow-[0_10px_30px_rgba(76,23,59,0.08)] sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#b63f70] text-white shadow-sm">
                <HeartHandshake className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold leading-6 text-[#4a1838]">
                  Phương danh thí chủ hùn phước
                </h2>
                <p className="mt-1 text-xs text-[#78636f]">
                  {filteredTransactions.length.toLocaleString("vi-VN")} / {data.transactions.length.toLocaleString("vi-VN")} giao dịch công khai
                </p>
              </div>
            </div>
            <div className="relative w-full sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#9b7c8b]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm theo phương danh hoặc nội dung"
                className="min-h-10 w-full rounded-md border border-[#e4b2c8] bg-[#fffafd] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#b63f70] focus:ring-2 focus:ring-[#f8dce8]"
              />
            </div>
          </div>

          <div className="mt-5 space-y-3 md:hidden">
            {filteredTransactions.map((transaction, index) => (
              <PublicTransactionCard
                key={transaction.id}
                transaction={transaction}
                index={index + 1}
                onViewDetails={() => setSelectedTransaction(transaction)}
              />
            ))}
            {filteredTransactions.length === 0 ? <EmptyState /> : null}
          </div>

          <div className="mt-5 hidden overflow-hidden rounded-lg border border-[#edcddb] md:block">
            <div className="max-h-[720px] overflow-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="sticky top-0 bg-[#fff1f6] text-xs uppercase text-[#684e5b]">
                  <tr>
                    <th className="px-4 py-3">Ngày</th>
                    <th className="px-4 py-3">Phương danh thí chủ hùn phước</th>
                    <th className="px-4 py-3">Loại</th>
                    <th className="px-4 py-3 text-right">Số tiền</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f3dfe7] bg-white">
                  {filteredTransactions.map((transaction) => (
                    <PublicTransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      onViewDetails={() => setSelectedTransaction(transaction)}
                    />
                  ))}
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {selectedTransaction ? (
        <TransactionReceiptModal
          campaignName={data.name}
          campaignCode={data.code}
          transaction={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
        />
      ) : null}
      {selectedBillId ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Xem ảnh bill chuyển tiền"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedBillId(null);
          }}
        >
          <button
            type="button"
            onClick={() => setSelectedBillId(null)}
            aria-label="Đóng ảnh bill"
            className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-700 shadow-lg"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="relative h-full max-h-[90vh] w-full max-w-4xl">
            <Image
              src={`/thien-phap/media/${selectedBillId}`}
              alt="Bill chuyển tiền được phóng lớn"
              fill
              unoptimized
              sizes="100vw"
              className="object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PublicTransactionCard({
  transaction,
  index,
  onViewDetails,
}: {
  transaction: PublicCampaignTransaction;
  index: number;
  onViewDetails?: () => void;
}) {
  const meta = transactionMeta(transaction);

  return (
    <article
      className="cursor-pointer overflow-hidden rounded-lg border border-[#e8b8cc] bg-white shadow-[0_6px_18px_rgba(76,23,59,0.09)] transition hover:border-[#cf7da1] hover:shadow-[0_8px_24px_rgba(76,23,59,0.14)]"
      role="button"
      tabIndex={0}
      onClick={onViewDetails}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && onViewDetails) {
          event.preventDefault();
          onViewDetails();
        }
      }}
      aria-label="Xem chi tiết giao dịch"
    >
      <div className={`grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-[#efd0dd] p-3 ${meta.cardHeaderClassName}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d887a9] bg-[#fffafd] text-sm font-bold text-[#a3315f] shadow-sm">
          {index.toLocaleString("vi-VN")}
        </span>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#75616c]">{dateOnly(transaction.transactionDate)}</div>
            <div className={`mt-1 inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${meta.className}`}>
              {meta.label}
            </div>
          </div>
          <div className="shrink-0 rounded-full border border-[#e5afc6] bg-white px-3 py-2 text-right shadow-[0_3px_10px_rgba(76,23,59,0.1)]">
            <span className={`whitespace-nowrap text-sm font-bold ${meta.amountClassName}`}>
              {money(meta.amount)}
            </span>
          </div>
        </div>
      </div>
      <p className="whitespace-pre-wrap break-words px-3 py-4 text-sm font-semibold leading-6 text-[#31222b]">
        {transaction.description}
      </p>
      <div className="px-3 pb-3">
        <RefundRelationship transaction={transaction} />
        {onViewDetails ? (
          <button
            type="button"
            onClick={onViewDetails}
            className="mt-3 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
          >
            Xem chi tiết
          </button>
        ) : null}
      </div>
    </article>
  );
}

function PublicTransactionRow({
  transaction,
  onViewDetails,
}: {
  transaction: PublicCampaignTransaction;
  onViewDetails: () => void;
}) {
  const meta = transactionMeta(transaction);

  return (
    <tr
      className="cursor-pointer transition-colors hover:bg-[#fff7fa]"
      onClick={onViewDetails}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onViewDetails();
        }
      }}
      aria-label="Xem chi tiết giao dịch"
    >
      <td className="whitespace-nowrap px-4 py-3 align-top text-[#75616c]">{dateOnly(transaction.transactionDate)}</td>
      <td className="max-w-2xl px-4 py-3 align-top">
        <div className="whitespace-pre-wrap break-words font-semibold text-[#31222b]">{transaction.description}</div>
        <RefundRelationship transaction={transaction} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 align-top">
        <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${meta.className}`}>
          {meta.label}
        </span>
      </td>
      <td className={`whitespace-nowrap px-4 py-3 text-right align-top font-bold ${meta.amountClassName}`}>
        {money(meta.amount)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right align-top">
        <button
          type="button"
          onClick={onViewDetails}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
        >
          Chi tiết
        </button>
      </td>
    </tr>
  );
}

function TransactionReceiptModal({
  campaignName,
  campaignCode,
  transaction,
  onClose,
}: {
  campaignName: string;
  campaignCode: string;
  transaction: PublicCampaignTransaction;
  onClose: () => void;
}) {
  const receiptRef = useRef<HTMLElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const meta = transactionMeta(transaction);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={receiptRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-receipt-title"
        className="relative max-h-[calc(100vh-2rem)] w-full max-w-[420px] overflow-y-auto rounded-2xl border border-emerald-900/10 bg-[#fffdf7] shadow-2xl"
      >
        <div className="relative p-4 sm:p-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết giao dịch"
            data-image-export-ignore="true"
            className="absolute right-3 top-3 rounded-full bg-white/80 p-2 text-zinc-500 shadow-sm ring-1 ring-zinc-200 transition hover:text-zinc-900"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="pr-9 text-center">
            <span className="mx-auto mb-2 block h-12 w-12 overflow-hidden rounded-full border-2 border-white bg-white shadow-[0_5px_16px_rgba(76,23,59,0.18)]">
              <Image
                src="/assets/dhamma-group-logo.jpg"
                alt="Logo Dhamma Group"
                width={48}
                height={48}
                className="h-full w-full scale-[1.12] object-cover"
              />
            </span>
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CircleCheck className="h-5 w-5" />
            </div>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Chi tiết giao dịch
            </p>
            <h2 id="transaction-receipt-title" className="mt-1 text-base font-semibold leading-5 text-zinc-950">
              {campaignName}
            </h2>
            <p className="mt-1 font-mono text-xs text-zinc-500">{campaignCode}</p>
          </div>

          <div className="my-3 border-t border-dashed border-zinc-300" />

          <div className="text-center">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
              {meta.label}
            </span>
            <div className={`mt-1.5 text-2xl font-bold tracking-tight ${meta.amountClassName}`}>
              {money(meta.amount)}
            </div>
          </div>

          <div className="mt-4 rounded-xl border-2 border-[#b63f70] bg-white/90 p-3.5 shadow-[0_8px_24px_rgba(76,23,59,0.12)]">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#b63f70]" />
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#a3315f]">
                Nội dung chuyển khoản
              </div>
            </div>
            <div className="mt-2 whitespace-pre-wrap break-words text-base font-bold leading-6 text-zinc-950">
              {transaction.description}
            </div>
          </div>

          <div className="my-3 border-t border-dashed border-zinc-300" />

          <dl className="rounded-xl border border-white/80 bg-white/72 p-3 text-sm shadow-sm backdrop-blur-[2px]">
            <ReceiptRow label="Ngày giao dịch" value={dateOnly(transaction.transactionDate)} />
          </dl>

          <RefundRelationship transaction={transaction} />

          <div className="mt-4 border-t border-dashed border-zinc-300 pt-3 text-center text-[11px] leading-4 text-zinc-500">
            Thông tin được trích từ danh sách giao dịch công khai
          </div>

          <button
            type="button"
            data-image-export-ignore="true"
            disabled={isDownloading}
            onClick={async () => {
              if (!receiptRef.current) return;
              setIsDownloading(true);
              try {
                await downloadElementAsPng(
                  receiptRef.current,
                  `giao-dich-${campaignCode}-${transaction.id}`,
                );
              } finally {
                setIsDownloading(false);
              }
            }}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#4c173b] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#612149] disabled:cursor-wait disabled:opacity-70"
          >
            {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isDownloading ? "Đang tạo ảnh..." : "Tải ảnh giao dịch"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-5">
      <dt className="shrink-0 text-xs text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-900">{value}</dd>
    </div>
  );
}

function RefundRelationship({ transaction }: { transaction: PublicCampaignTransaction }) {
  const linkedAmount = transaction.refundLinks.reduce((sum, link) => sum + link.amount, 0);
  const isIncoming = transaction.creditAmount > 0;

  if (isIncoming && linkedAmount <= 0) {
    return null;
  }
  if (!isIncoming && transaction.outflowType !== "REFUND") {
    return null;
  }

  const fullyRefunded = isIncoming &&
    Math.round(linkedAmount * 100) >= Math.round(transaction.creditAmount * 100);

  return (
    <div className={`mt-2 border-l-2 pl-2.5 text-xs leading-5 ${
      fullyRefunded ? "border-rose-400 text-rose-700" : "border-violet-300 text-violet-700"
    }`}>
      <div className="flex items-center gap-1.5 font-semibold">
        {fullyRefunded ? <CircleCheck className="h-3.5 w-3.5 shrink-0" /> : <Link2 className="h-3.5 w-3.5 shrink-0" />}
        {isIncoming
          ? fullyRefunded
            ? `Đã hoàn hết ${money(linkedAmount)}`
            : `Đã hoàn ${money(linkedAmount)} / ${money(transaction.creditAmount)}`
          : linkedAmount > 0
            ? `Đã liên kết ${money(linkedAmount)} / ${money(transaction.debitAmount)}`
            : "Chưa liên kết khoản nhận"}
      </div>
      {transaction.refundLinks.length > 0 ? (
        <ul className="mt-1 space-y-1 text-zinc-600">
          {transaction.refundLinks.map((link, index) => (
            <li key={`${link.transactionDate}-${link.amount}-${index}`} className="break-words">
              {isIncoming ? "Hoàn ngày" : "Hoàn cho khoản nhận ngày"} {dateOnly(link.transactionDate)}: {link.description} ({money(link.amount)})
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function EmptyState() {
  return <div className="px-3 py-10 text-center text-sm text-[#806b76]">Không có giao dịch phù hợp.</div>;
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "jade" | "gold" | "dark";
}) {
  const color = tone === "jade" ? "text-[#2d765b]" : tone === "gold" ? "text-[#a93d68]" : "text-[#4a1838]";

  return (
    <div className="min-w-0 bg-[#fffafd] px-4 py-3 sm:px-5 sm:py-4">
      <div className="text-xs leading-5 text-[#75606e]">{label}</div>
      <div className={`mt-1 break-words text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}

function transactionMeta(transaction: PublicCampaignTransaction) {
  if (transaction.creditAmount > 0) {
    return {
      label: "Hùn phước",
      amount: transaction.creditAmount,
      className: "border-[#9fd9c0] bg-[#effbf5] text-[#247257]",
      amountClassName: "text-[#b33969]",
      cardHeaderClassName: "bg-[#fff5f9]",
    };
  }

  if (transaction.outflowType === "REFUND") {
    return {
      label: "Hoàn lại",
      amount: transaction.debitAmount,
      className: "border-[#cfb4e8] bg-[#f7f0fd] text-[#7543a0]",
      amountClassName: "text-[#7543a0]",
      cardHeaderClassName: "bg-[#faf5fe]",
    };
  }

  return {
    label: "Cúng dường",
    amount: transaction.debitAmount,
    className: "border-[#e7c27d] bg-[#fff8e9] text-[#9a6417]",
    amountClassName: "text-[#9a6417]",
    cardHeaderClassName: "bg-[#fffaf0]",
  };
}

function compareTransactionNewestFirst(left: PublicCampaignTransaction, right: PublicCampaignTransaction) {
  const dateDifference = new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime();
  if (dateDifference !== 0) {
    return dateDifference;
  }

  const createdAtDifference = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }

  return (right.statementRow ?? 0) - (left.statementRow ?? 0);
}

function money(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function dateOnly(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

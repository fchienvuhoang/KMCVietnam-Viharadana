"use client";

import {
  AlertCircle,
  ArrowUpFromLine,
  Ban,
  CheckCircle2,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  LogOut,
  Loader2,
  Link2,
  Plus,
  Search,
  Settings,
  Tags,
  Trash2,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type React from "react";
import type {
  CampaignSummary,
  DashboardData,
  DashboardState,
  TransactionSummary,
} from "@/lib/dashboard";
import { downloadElementAsPng } from "@/lib/download-element-image";
import { normalizeTransferText, splitKeywords } from "@/lib/text";

type Props = {
  state: DashboardState;
};

type ImportResponse = {
  fileName: string;
  totalRows: number;
  insertedRows: number;
  duplicateRows: number;
  unmatchedRows: number;
  accountNumber: string | null;
  closingBalance: number | null;
};

type CampaignModalState =
  | {
      mode: "create";
    }
  | {
      mode: "edit";
      campaign: CampaignSummary;
    };

type AllocationRow = {
  campaignId: string;
  amount: string;
};

type RefundLinkRow = {
  originalTransactionId: string;
  amount: string;
};

type RefundCandidate = {
  id: string;
  transactionDate: string;
  description: string;
  detail: string;
  originalAmount: number;
  refundedAmount: number;
  refundableAmount: number;
};

type RefundCandidatesResponse = {
  refundAmount: number;
  links: { originalTransactionId: string; amount: number }[];
  candidates: RefundCandidate[];
};

type StatementExpense = {
  id: string;
  transactionDate: string;
  description: string;
  amount: number;
};

type CampaignBill = {
  transactionId: string | null;
  title: string | null;
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

const statusLabels = {
  ACTIVE: "Đang chạy",
  PAUSED: "Tạm dừng",
  COMPLETED: "Hoàn tất",
};

const statusClassNames = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PAUSED: "border-amber-200 bg-amber-50 text-amber-700",
  COMPLETED: "border-zinc-200 bg-zinc-50 text-zinc-600",
};

const selectionStatusLabels = {
  ACTIVE: "Đang hoạt động",
  PAUSED: "Tạm dừng",
  COMPLETED: "Hoàn tất",
};

const selectionStatusPriority = {
  ACTIVE: 0,
  PAUSED: 1,
  COMPLETED: 2,
};

export function DashboardShell({ state }: Props) {
  if (!state.ok) {
    return <SetupScreen state={state} />;
  }

  return <Dashboard data={state.data} />;
}

function Dashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [mainTab, setMainTab] = useState<"overview" | "transactions">("overview");
  const [activeTab, setActiveTab] = useState("all");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null);
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(null);
  const [campaignModal, setCampaignModal] = useState<CampaignModalState | null>(null);
  const [allocationTransaction, setAllocationTransaction] = useState<TransactionSummary | null>(null);
  const [refundTransaction, setRefundTransaction] = useState<TransactionSummary | null>(null);

  const filteredTransactions = useMemo(() => {
    const normalizedQuery = normalizeTransferText(query);

    return data.transactions.filter((transaction) => {
      const matchesTab =
        activeTab === "all" ||
        (activeTab === "unmatched" && !transaction.campaign && transaction.allocations.length === 0) ||
        transaction.campaign?.id === activeTab ||
        transaction.allocations.some((allocation) => allocation.campaign.id === activeTab);

      if (!matchesTab) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return normalizeTransferText(
        `${transaction.description} ${transaction.detail} ${transaction.campaign?.name ?? ""} ${transaction.allocations.map((allocation) => allocation.campaign.name).join(" ")}`,
      ).includes(normalizedQuery);
    }).sort(compareTransactionNewestFirst);
  }, [activeTab, data.transactions, query]);

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setImportResult(null);
    setIsImporting(true);

    try {
      const form = event.currentTarget;
      const response = await fetch("/api/import", {
        method: "POST",
        body: new FormData(form),
      });
      const json = await readJson<ImportResponse>(response);
      setImportResult(json);
      setMessage(`Đã import ${json.insertedRows}/${json.totalRows} giao dịch mới.`);
      form.reset();
      router.refresh();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsImporting(false);
    }
  }

  async function handleCampaignCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSavingCampaign(true);

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      const payload = campaignPayloadFromForm(formData);
      await readJson(
        await fetch("/api/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      setMessage(`Đã tạo thiện pháp ${payload.code}.`);
      form.reset();
      setCampaignModal(null);
      router.refresh();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsSavingCampaign(false);
    }
  }

  async function handleCampaignUpdate(event: FormEvent<HTMLFormElement>, campaignId: string) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSavingCampaign(true);

    try {
      const formData = new FormData(event.currentTarget);
      const payload = campaignPayloadFromForm(formData);
      await readJson(
        await fetch(`/api/campaigns/${campaignId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      setMessage(`Đã cập nhật thiện pháp ${payload.code}.`);
      setCampaignModal(null);
      router.refresh();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsSavingCampaign(false);
    }
  }

  async function handleCampaignDelete(campaign: CampaignSummary) {
    if (campaign.transactionCount > 0) {
      setError("Chỉ có thể xóa thiện pháp chưa có giao dịch sao kê.");
      setMessage(null);
      return;
    }

    const confirmed = window.confirm(`Xóa thiện pháp "${campaign.code}"? Hành động này sẽ xóa cả bộ từ khóa.`);
    if (!confirmed) {
      return;
    }

    setError(null);
    setMessage(null);
    setDeletingCampaignId(campaign.id);

    try {
      await readJson(
        await fetch(`/api/campaigns/${campaign.id}`, {
          method: "DELETE",
        }),
      );
      setMessage(`Đã xóa thiện pháp ${campaign.code}.`);
      setCampaignModal(null);
      router.refresh();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setDeletingCampaignId(null);
    }
  }

  async function assignTransaction(
    transactionId: string,
    campaignId: string | null,
    outflowType?: "DONATION" | "REFUND" | "TREASURER_TRANSFER",
  ) {
    setError(null);
    setMessage(null);
    setPendingTransactionId(transactionId);

    try {
      await readJson(
        await fetch(`/api/transactions/${transactionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId, ...(outflowType ? { outflowType } : {}) }),
        }),
      );
      router.refresh();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setPendingTransactionId(null);
    }
  }

  async function assignTransactions(transactionIds: string[], campaignId: string) {
    setError(null);
    setMessage(null);
    setIsBulkAssigning(true);

    try {
      const result = await readJson<{ updatedCount: number; campaignCode: string }>(
        await fetch("/api/transactions/bulk-assign", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionIds, campaignId }),
        }),
      );
      setMessage(
        `Đã gán ${result.updatedCount.toLocaleString("vi-VN")} giao dịch vào thiện pháp ${result.campaignCode}.`,
      );
      router.refresh();
      return true;
    } catch (caught) {
      setError(getErrorMessage(caught));
      return false;
    } finally {
      setIsBulkAssigning(false);
    }
  }

  async function allocateTransaction(transactionId: string, allocations: { campaignId: string; amount: number }[]) {
    setError(null);
    setMessage(null);
    setPendingTransactionId(transactionId);

    try {
      await readJson(
        await fetch(`/api/transactions/${transactionId}/allocations`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allocations }),
        }),
      );
      setMessage("Đã chia giao dịch cho các thiện pháp.");
      setAllocationTransaction(null);
      router.refresh();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setPendingTransactionId(null);
    }
  }

  async function saveRefundLinks(
    transactionId: string,
    links: { originalTransactionId: string; amount: number }[],
  ) {
    setError(null);
    setMessage(null);
    setPendingTransactionId(transactionId);

    try {
      await readJson(
        await fetch(`/api/transactions/${transactionId}/refund-links`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ links }),
        }),
      );
      setMessage("Đã liên kết khoản hoàn với khoản nhận ban đầu.");
      setRefundTransaction(null);
      router.refresh();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setPendingTransactionId(null);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/dang-nhap");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#f7f7f4] text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              KMCVietnam-Vihāradāna
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">
              Quản lý thiện pháp và sao kê
            </h1>
          </div>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <HeaderStat label="Giao dịch" value={data.overview.transactionCount.toLocaleString("vi-VN")} />
              <HeaderStat label="Chưa phân loại" value={data.overview.unmatchedCount.toLocaleString("vi-VN")} />
              <HeaderStat
                label="TK ngân hàng"
                value={data.bankAccount?.balanceAsOf ? money(data.overview.bankBalance) : "Chưa có số dư"}
                tone="emerald"
              />
              <HeaderStat
                label="Còn ở tài khoản"
                value={money(data.overview.trackedFundBalance)}
                tone="amber"
              />
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center justify-center gap-2 self-start rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 lg:self-end"
            >
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <StatusMessages message={message} error={error} />

        <Panel>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <PanelTitle icon={Upload} title="Import sao kê MB" />
              <form className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleImport}>
                <input
                  name="file"
                  type="file"
                  accept=".pdf,application/pdf"
                  aria-label="Chọn file PDF sao kê MB"
                  aria-describedby="mb-import-help"
                  required
                  className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                />
                <button
                  disabled={isImporting}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Import MB PDF
                </button>
              </form>
              <p id="mb-import-help" className="mt-2 text-xs leading-5 text-zinc-500">
                Chọn PDF gốc từ MB, mẫu Sổ phụ chi tiết kiêm báo nợ/báo có. Tối đa 4 MB.
              </p>
              {data.latestImport ? (
                <p className="mt-3 text-xs leading-5 text-zinc-500">
                  Lần import gần nhất: {data.latestImport.fileName}, {dateTime(data.latestImport.importedAt)}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 xl:w-80">
              <button
                type="button"
                onClick={() => setCampaignModal({ mode: "create" })}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                <Plus className="h-4 w-4" />
                Thêm thiện pháp
              </button>
              {importResult ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    {importResult.fileName}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2">
                    <StatLine label="Mới" value={importResult.insertedRows} />
                    <StatLine label="Trùng" value={importResult.duplicateRows} />
                    <StatLine label="Tổng dòng" value={importResult.totalRows} />
                    <StatLine label="Chưa khớp" value={importResult.unmatchedRows} />
                  </dl>
                </div>
              ) : null}
            </div>
          </div>
        </Panel>

        <section className="space-y-5">
          <div className="flex gap-2 rounded-md border border-zinc-200 bg-white p-1">
            <MainTabButton
              active={mainTab === "overview"}
              count={data.campaigns.length}
              onClick={() => setMainTab("overview")}
            >
              Tổng quan thiện pháp
            </MainTabButton>
            <MainTabButton
              active={mainTab === "transactions"}
              count={data.overview.transactionCount}
              onClick={() => setMainTab("transactions")}
            >
              Giao dịch sao kê
            </MainTabButton>
          </div>

          {mainTab === "overview" ? (
            <>
              <Panel>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <PanelTitle icon={Settings} title="Danh sách thiện pháp" />
                </div>
                <CampaignTable
                  campaigns={data.campaigns}
                  onSelect={(campaign) => setCampaignModal({ mode: "edit", campaign })}
                />
              </Panel>

              <Panel>
                <PanelTitle icon={Wallet} title="Tổng hợp thu chi" />
                <FundSummaryTable data={data} />
              </Panel>

              <Panel>
                <PanelTitle icon={ArrowUpFromLine} title="Danh sách khoản chi từ sao kê" />
                <DebitTransactionTable
                  transactions={data.debitTransactions}
                  campaigns={data.campaigns}
                  pendingTransactionId={pendingTransactionId}
                  onAssign={assignTransaction}
                  onLinkRefund={setRefundTransaction}
                />
              </Panel>
            </>
          ) : (
            <Panel>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <PanelTitle icon={FileSpreadsheet} title="Giao dịch sao kê" />
                <div className="relative w-full lg:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Tìm nội dung, mã giao dịch..."
                    className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              </div>

              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                <TabButton
                  active={activeTab === "all"}
                  count={data.overview.transactionCount}
                  onClick={() => setActiveTab("all")}
                >
                  Tất cả
                </TabButton>
                <TabButton
                  active={activeTab === "unmatched"}
                  count={data.overview.unmatchedCount}
                  onClick={() => setActiveTab("unmatched")}
                >
                  Chưa phân loại
                </TabButton>
                {data.campaigns.map((campaign) => (
                  <TabButton
                    key={campaign.id}
                    active={activeTab === campaign.id}
                    count={campaign.transactionCount}
                    onClick={() => setActiveTab(campaign.id)}
                  >
                    {campaign.code}
                  </TabButton>
                ))}
              </div>

              <TransactionTable
                key={`${activeTab}:${normalizeTransferText(query)}`}
                transactions={filteredTransactions}
                campaigns={data.campaigns}
                pendingTransactionId={pendingTransactionId}
                isBulkAssigning={isBulkAssigning}
                onAssign={assignTransaction}
                onBulkAssign={assignTransactions}
                onSplit={setAllocationTransaction}
              />
            </Panel>
          )}
        </section>
        {campaignModal ? (
          <CampaignModal
            state={campaignModal}
            isSaving={isSavingCampaign}
            isDeleting={campaignModal.mode === "edit" && deletingCampaignId === campaignModal.campaign.id}
            onClose={() => setCampaignModal(null)}
            onCreate={handleCampaignCreate}
            onUpdate={handleCampaignUpdate}
            onDelete={handleCampaignDelete}
          />
        ) : null}
        {allocationTransaction ? (
          <AllocationModal
            transaction={allocationTransaction}
            campaigns={data.campaigns}
            isSaving={pendingTransactionId === allocationTransaction.id}
            onClose={() => setAllocationTransaction(null)}
            onSave={allocateTransaction}
          />
        ) : null}
        {refundTransaction ? (
          <RefundLinkModal
            transaction={refundTransaction}
            isSaving={pendingTransactionId === refundTransaction.id}
            onClose={() => setRefundTransaction(null)}
            onSave={saveRefundLinks}
          />
        ) : null}
      </main>
    </div>
  );
}

function TransactionTable({
  transactions,
  campaigns,
  pendingTransactionId,
  isBulkAssigning,
  onAssign,
  onBulkAssign,
  onSplit,
}: {
  transactions: TransactionSummary[];
  campaigns: CampaignSummary[];
  pendingTransactionId: string | null;
  isBulkAssigning: boolean;
  onAssign: (transactionId: string, campaignId: string | null, outflowType?: "DONATION" | "REFUND" | "TREASURER_TRANSFER") => void;
  onBulkAssign: (transactionIds: string[], campaignId: string) => Promise<boolean>;
  onSplit: (transaction: TransactionSummary) => void;
}) {
  const sortedCampaigns = sortCampaignsForSelection(campaigns);
  const [detailTransaction, setDetailTransaction] = useState<TransactionSummary | null>(null);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
  const [bulkCampaignId, setBulkCampaignId] = useState("");
  const selectAllToolbarRef = useRef<HTMLInputElement>(null);
  const selectAllTableRef = useRef<HTMLInputElement>(null);
  const allTransactionsSelected =
    transactions.length > 0 && transactions.every((transaction) => selectedTransactionIds.has(transaction.id));

  useEffect(() => {
    const isPartiallySelected = selectedTransactionIds.size > 0 && !allTransactionsSelected;
    for (const checkbox of [selectAllToolbarRef.current, selectAllTableRef.current]) {
      if (checkbox) checkbox.indeterminate = isPartiallySelected;
    }
  }, [allTransactionsSelected, selectedTransactionIds.size]);

  function toggleTransaction(transactionId: string) {
    setSelectedTransactionIds((current) => {
      const next = new Set(current);
      if (next.has(transactionId)) next.delete(transactionId);
      else next.add(transactionId);
      return next;
    });
  }

  function toggleAllTransactions() {
    setSelectedTransactionIds(
      allTransactionsSelected ? new Set() : new Set(transactions.map((transaction) => transaction.id)),
    );
  }

  async function handleBulkAssign() {
    if (!bulkCampaignId || selectedTransactionIds.size === 0) return;
    const saved = await onBulkAssign([...selectedTransactionIds], bulkCampaignId);
    if (saved) {
      setSelectedTransactionIds(new Set());
      setBulkCampaignId("");
    }
  }

  return (
    <>
      <div className="mt-4 flex flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-700">
            <input
              ref={selectAllToolbarRef}
              type="checkbox"
              checked={allTransactionsSelected}
              disabled={transactions.length === 0 || isBulkAssigning || pendingTransactionId !== null}
              onChange={toggleAllTransactions}
              className="h-4 w-4 rounded border-zinc-300 accent-emerald-600"
            />
            Chọn tất cả kết quả
          </label>
          <span className="text-xs text-zinc-500">
            Đã chọn {selectedTransactionIds.size.toLocaleString("vi-VN")} giao dịch
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={bulkCampaignId}
            disabled={isBulkAssigning || pendingTransactionId !== null}
            onChange={(event) => setBulkCampaignId(event.target.value)}
            className={`min-h-10 min-w-60 rounded-md border px-3 py-2 text-sm font-medium shadow-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60 ${campaignSelectClassName(bulkCampaignId, sortedCampaigns)}`}
          >
            <option value="">Chọn thiện pháp để gán</option>
            <CampaignOptionGroups campaigns={sortedCampaigns} />
          </select>
          <button
            type="button"
            disabled={
              selectedTransactionIds.size === 0 ||
              !bulkCampaignId ||
              isBulkAssigning ||
              pendingTransactionId !== null
            }
            onClick={() => void handleBulkAssign()}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBulkAssigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tags className="h-4 w-4" />}
            {isBulkAssigning ? "Đang gán..." : "Gán các giao dịch đã chọn"}
          </button>
          {selectedTransactionIds.size > 0 ? (
            <button
              type="button"
              disabled={isBulkAssigning}
              onClick={() => setSelectedTransactionIds(new Set())}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
              aria-label="Bỏ chọn tất cả giao dịch"
              title="Bỏ chọn"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-md border border-zinc-200">
        <div className="max-h-[620px] overflow-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="sticky top-0 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  ref={selectAllTableRef}
                  type="checkbox"
                  checked={allTransactionsSelected}
                  disabled={transactions.length === 0 || isBulkAssigning || pendingTransactionId !== null}
                  onChange={toggleAllTransactions}
                  aria-label="Chọn tất cả giao dịch đang hiển thị"
                  className="h-4 w-4 rounded border-zinc-300 accent-emerald-600"
                />
              </th>
              <th className="px-3 py-2">Ngày</th>
              <th className="px-3 py-2">Nội dung chuyển khoản</th>
              <th className="px-3 py-2">Chi tiết</th>
              <th className="px-3 py-2 text-right">Có</th>
              <th className="px-3 py-2 text-right">Nợ</th>
              <th className="px-3 py-2">Thiện pháp</th>
              <th className="px-3 py-2">Gán</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white">
            {transactions.map((transaction) => (
              <tr
                key={transaction.id}
                className={
                  selectedTransactionIds.has(transaction.id)
                    ? "bg-emerald-50 hover:bg-emerald-100/70"
                    : transaction.campaign || transaction.allocations.length > 0
                    ? "hover:bg-zinc-50"
                    : "bg-rose-50/50 hover:bg-rose-50"
                }
              >
                <td className="px-3 py-2 align-top">
                  <input
                    type="checkbox"
                    checked={selectedTransactionIds.has(transaction.id)}
                    disabled={isBulkAssigning || pendingTransactionId !== null}
                    onChange={() => toggleTransaction(transaction.id)}
                    aria-label={`Chọn giao dịch ${transaction.description}`}
                    className="h-4 w-4 rounded border-zinc-300 accent-emerald-600"
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{dateOnly(transaction.transactionDate)}</td>
                <td className="max-w-md px-3 py-2 align-top">
                  <div className="whitespace-pre-wrap break-words font-medium text-zinc-900">
                    {transaction.description}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {transaction.matchedKeyword ?? "Chưa có keyword khớp"}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setDetailTransaction(transaction)}
                    className="max-w-52 truncate rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-mono text-zinc-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                    title="Mở chi tiết giao dịch"
                  >
                    {transaction.detail || "Xem chi tiết"}
                  </button>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-emerald-700">
                  {transaction.creditAmount > 0 ? money(transaction.creditAmount) : "-"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-amber-700">
                  {transaction.debitAmount > 0 ? money(transaction.debitAmount) : "-"}
                </td>
                <td className="px-3 py-2">
                  {transaction.allocations.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {transaction.allocations.map((allocation) => (
                        <span
                          key={allocation.id}
                          className="inline-flex rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700"
                        >
                          {allocation.campaign.code}: {money(allocation.amount)}
                        </span>
                      ))}
                    </div>
                  ) : transaction.campaign ? (
                    <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                      {transaction.campaign.code}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">
                      Chưa phân loại
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={transaction.campaign?.id ?? ""}
                      disabled={pendingTransactionId === transaction.id || isBulkAssigning}
                      onChange={(event) => onAssign(transaction.id, event.target.value || null)}
                      className={`w-56 rounded-md border px-3 py-2 text-xs font-medium shadow-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-wait disabled:opacity-70 ${campaignSelectClassName(transaction.campaign?.id, sortedCampaigns)}`}
                    >
                      <option value="">
                        {transaction.allocations.length > 0 ? "Đã chia" : "Chưa phân loại"}
                      </option>
                      <CampaignOptionGroups campaigns={sortedCampaigns} />
                    </select>
                    {pendingTransactionId === transaction.id ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-emerald-700">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Đang lưu...
                      </span>
                    ) : null}
                    {transaction.creditAmount > 0 ? (
                      <button
                        type="button"
                        disabled={pendingTransactionId === transaction.id || isBulkAssigning}
                        onClick={() => onSplit(transaction)}
                        className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Chia
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-zinc-500">
                  Không có giao dịch phù hợp.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </div>
      {detailTransaction ? (
        <StatementReceiptModal transaction={detailTransaction} onClose={() => setDetailTransaction(null)} />
      ) : null}
    </>
  );
}

function StatementReceiptModal({
  transaction,
  onClose,
}: {
  transaction: TransactionSummary;
  onClose: () => void;
}) {
  const receiptRef = useRef<HTMLElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const isCredit = transaction.creditAmount > 0;
  const amount = isCredit ? transaction.creditAmount : transaction.debitAmount;
  const transactionType = isCredit
    ? "Tiền vào"
    : transaction.outflowType === "TREASURER_TRANSFER"
      ? "Chuyển thủ quỹ"
    : transaction.outflowType === "REFUND"
      ? "Hoàn lại"
      : "Tiền ra";
  const campaignText = transaction.allocations.length > 0
    ? transaction.allocations.map((allocation) => allocation.campaign.code).join(", ")
    : transaction.campaign?.code ?? "Chưa phân loại";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={receiptRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="statement-receipt-title"
        className="relative max-h-[calc(100vh-2rem)] w-full max-w-[430px] overflow-y-auto rounded-2xl border border-white/70 bg-[#fffdf9] shadow-2xl"
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden="true">
          <Image
            src="/assets/dhamma-celestial-mangosteen-deva-mobile.jpg"
            alt=""
            fill
            sizes="430px"
            className="object-cover object-top opacity-70 saturate-[0.95]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#fffdf9]/35 via-[#fffdf9]/58 to-[#fffdf9]/72" />
        </div>

        <div className="relative p-5 sm:p-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết giao dịch"
            data-image-export-ignore="true"
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-zinc-500 shadow-sm hover:text-zinc-900"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="pr-10 text-center">
            <span className="mx-auto mb-3 block h-14 w-14 overflow-hidden rounded-full border-2 border-white bg-white shadow-[0_5px_16px_rgba(76,23,59,0.18)]">
              <Image
                src="/assets/kmc-vietnam-mark.svg"
                alt="Logo KMCVietnam-Vihāradāna"
                width={56}
                height={56}
                className="h-full w-full scale-[1.12] object-cover"
              />
            </span>
            <span className={`mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full ${isCredit ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {isCredit ? <ArrowUpFromLine className="h-5 w-5 rotate-180" /> : <ArrowUpFromLine className="h-5 w-5" />}
            </span>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Chi tiết giao dịch sao kê
            </p>
            <h2 id="statement-receipt-title" className={`mt-2 text-3xl font-bold tracking-tight ${isCredit ? "text-emerald-700" : "text-amber-700"}`}>
              {money(amount)}
            </h2>
            <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${isCredit ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              {transactionType}
            </span>
          </div>

          <div className="my-5 border-t border-dashed border-zinc-300" />

          <div className="rounded-xl border-2 border-[#b63f70] bg-white/90 p-4 shadow-[0_8px_24px_rgba(76,23,59,0.12)]">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#b63f70]" />
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#a3315f]">
                Nội dung chuyển khoản
              </div>
            </div>
            <div className="mt-2.5 whitespace-pre-wrap break-words text-[17px] font-bold leading-7 text-zinc-950">
              {transaction.description}
            </div>
          </div>

          <div className="my-5 border-t border-dashed border-zinc-300" />

          <dl className="space-y-4 rounded-xl border border-white/80 bg-white/72 p-4 text-sm shadow-sm backdrop-blur-[2px]">
            <StatementReceiptRow label="Ngày giao dịch" value={dateOnly(transaction.transactionDate)} />
            <StatementReceiptRow label="Mã giao dịch" value={transaction.detail || "—"} mono />
            <StatementReceiptRow label="Thiện pháp" value={campaignText} />
          </dl>

          <div className="mt-5 border-t border-dashed border-zinc-300 pt-4 text-center text-[11px] leading-5 text-zinc-500">
            KMCVietnam-Vihāradāna · Thông tin trích từ sao kê
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
                  `giao-dich-${transaction.detail || transaction.id}`,
                );
              } finally {
                setIsDownloading(false);
              }
            }}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#4c173b] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#612149] disabled:cursor-wait disabled:opacity-70"
          >
            {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isDownloading ? "Đang tạo ảnh..." : "Tải ảnh giao dịch"}
          </button>
        </div>
      </section>
    </div>
  );
}

function StatementReceiptRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-3">
      <dt className="text-xs leading-5 text-zinc-500">{label}</dt>
      <dd className={`break-words text-right font-semibold leading-5 text-zinc-900 ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function CampaignTable({
  campaigns,
  onSelect,
}: {
  campaigns: CampaignSummary[];
  onSelect: (campaign: CampaignSummary) => void;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-md border border-zinc-200">
      <div className="overflow-auto">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Mã</th>
              <th className="px-3 py-2">Thiện pháp</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2">Từ khóa</th>
              <th className="px-3 py-2 text-right">Hùn phước</th>
              <th className="px-3 py-2 text-right">Tổng chi</th>
              <th className="px-3 py-2 text-right">Hoàn lại</th>
              <th className="px-3 py-2 text-right">Quỹ thiện pháp còn</th>
              <th className="px-3 py-2 text-right">Đã chuyển thủ quỹ</th>
              <th className="px-3 py-2 text-right">Còn trong tài khoản</th>
              <th className="px-3 py-2 text-right">GD</th>
              <th className="px-3 py-2 text-right">Link công khai</th>
              <th className="px-3 py-2 text-right">Sửa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white">
            {campaigns.map((campaign) => (
              <tr
                key={campaign.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(campaign)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(campaign);
                  }
                }}
                className="cursor-pointer hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none"
              >
                <td className="whitespace-nowrap px-3 py-2">
                  <span className="rounded-md bg-zinc-950 px-2 py-1 font-mono text-xs font-medium text-white">
                    {campaign.code}
                  </span>
                </td>
                <td className="max-w-xs px-3 py-2">
                  <div className="font-medium text-zinc-900">{campaign.name}</div>
                  {campaign.description ? (
                    <div className="mt-1 line-clamp-1 text-xs text-zinc-500">{campaign.description}</div>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span className={`rounded-md border px-2 py-1 text-xs font-medium ${statusClassNames[campaign.status]}`}>
                    {statusLabels[campaign.status]}
                  </span>
                </td>
                <td className="max-w-xs px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {campaign.keywords.slice(0, 4).map((keyword) => {
                      const isDisabled = !keyword.active || campaign.status === "COMPLETED";

                      return (
                        <span
                          key={keyword.id}
                          title={isDisabled ? "Từ khóa đã bị vô hiệu hóa" : "Từ khóa đang hoạt động"}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                            isDisabled
                              ? "bg-zinc-100 text-zinc-400 line-through"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {isDisabled ? <Ban className="h-3 w-3" /> : null}
                          {keyword.keyword}
                        </span>
                      );
                    })}
                    {campaign.keywords.length > 4 ? (
                      <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-500">
                        +{campaign.keywords.length - 4}
                      </span>
                    ) : null}
                    {campaign.keywords.length > 0 &&
                    (campaign.status === "COMPLETED" || campaign.keywords.every((keyword) => !keyword.active)) ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-500">
                        <Ban className="h-3 w-3" />
                        Đã vô hiệu hóa
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-emerald-700">
                  {money(campaign.income)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-amber-700">
                  {money(campaign.expenses)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-rose-700">
                  {money(campaign.refunds)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-zinc-950">
                  {money(campaign.balance)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-blue-700">{money(campaign.treasuryTransfers)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{money(campaign.heldBalance)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-600">
                  {campaign.transactionCount.toLocaleString("vi-VN")}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <a
                    href={publicCampaignPath(campaign.code)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex items-center justify-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Thí chủ xem
                  </a>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-500">
                  <Settings className="ml-auto h-4 w-4" />
                </td>
              </tr>
            ))}
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-zinc-500">
                  Chưa có thiện pháp nào.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DebitTransactionTable({
  transactions,
  campaigns,
  pendingTransactionId,
  onAssign,
  onLinkRefund,
}: {
  transactions: TransactionSummary[];
  campaigns: CampaignSummary[];
  pendingTransactionId: string | null;
  onAssign: (transactionId: string, campaignId: string | null, outflowType?: "DONATION" | "REFUND" | "TREASURER_TRANSFER") => void;
  onLinkRefund: (transaction: TransactionSummary) => void;
}) {
  const sortedCampaigns = sortCampaignsForSelection(campaigns);
  const [detailTransaction, setDetailTransaction] = useState<TransactionSummary | null>(null);

  return (
    <>
      <div className="mt-4 overflow-hidden rounded-md border border-zinc-200">
        <div className="max-h-[420px] overflow-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="sticky top-0 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Ngày</th>
              <th className="px-3 py-2">Nội dung chuyển khoản</th>
              <th className="px-3 py-2">Chi tiết</th>
              <th className="px-3 py-2 text-right">Nợ</th>
              <th className="px-3 py-2">Thiện pháp</th>
              <th className="px-3 py-2">Loại chuyển ra</th>
              <th className="px-3 py-2">Gán / liên kết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white">
            {transactions.map((transaction) => (
              <tr
                key={transaction.id}
                className={transaction.campaign ? "hover:bg-zinc-50" : "bg-amber-50/60 hover:bg-amber-50"}
              >
                <td className="whitespace-nowrap px-3 py-2 align-top text-zinc-600">
                  {dateOnly(transaction.transactionDate)}
                </td>
                <td className="max-w-md px-3 py-2 align-top">
                  <div className="whitespace-pre-wrap break-words font-medium text-zinc-900">
                    {transaction.description}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top text-xs">
                  <button
                    type="button"
                    onClick={() => setDetailTransaction(transaction)}
                    className="max-w-52 truncate rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-mono text-zinc-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                    title="Mở chi tiết giao dịch"
                  >
                    {transaction.detail || "Xem chi tiết"}
                  </button>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right align-top font-medium text-amber-700">
                  {money(transaction.debitAmount)}
                </td>
                <td className="px-3 py-2 align-top">
                  {transaction.campaign ? (
                    <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                      {transaction.campaign.code}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                      Chưa gán
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <select
                    value={transaction.outflowType}
                    disabled={pendingTransactionId === transaction.id}
                    onChange={(event) =>
                      onAssign(
                        transaction.id,
                        transaction.campaign?.id ?? null,
                        event.target.value as "DONATION" | "REFUND" | "TREASURER_TRANSFER",
                      )
                    }
                    className="w-32 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  >
                    <option value="DONATION">Cúng dường</option>
                    <option value="REFUND">Hoàn lại</option>
                    <option value="TREASURER_TRANSFER">Chuyển thủ quỹ</option>
                  </select>
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-col items-start gap-2">
                    <select
                      value={transaction.campaign?.id ?? ""}
                        disabled={pendingTransactionId === transaction.id}
                      onChange={(event) =>
                        onAssign(transaction.id, event.target.value || null, transaction.outflowType)
                      }
                      className={`w-56 rounded-md border px-3 py-2 text-xs font-medium shadow-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-wait disabled:opacity-70 ${campaignSelectClassName(transaction.campaign?.id, sortedCampaigns)}`}
                    >
                      <option value="">Chưa gán</option>
                      <CampaignOptionGroups campaigns={sortedCampaigns} />
                    </select>
                    {pendingTransactionId === transaction.id ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-emerald-700">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Đang lưu...
                      </span>
                    ) : null}
                    {transaction.outflowType === "REFUND" && transaction.campaign ? (
                      <button
                        type="button"
                        onClick={() => onLinkRefund(transaction)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        {transaction.refundLinks.length > 0
                          ? `Đã liên kết ${money(transaction.refundLinks.reduce((sum, link) => sum + link.amount, 0))}`
                          : "Liên kết khoản nhận"}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-zinc-500">
                  Chưa có khoản chi nào từ cột NỢ trong sao kê.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </div>
      {detailTransaction ? (
        <StatementReceiptModal transaction={detailTransaction} onClose={() => setDetailTransaction(null)} />
      ) : null}
    </>
  );
}

function compareTransactionNewestFirst(left: TransactionSummary, right: TransactionSummary) {
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

function FundSummaryTable({ data }: { data: DashboardData }) {
  const totalCampaignIncome = data.campaigns.reduce((sum, campaign) => sum + campaign.income, 0);
  const totalCampaignRefunds = data.campaigns.reduce((sum, campaign) => sum + campaign.refunds, 0);
  const totalExpenses = data.overview.totalExpenses;
  const currentAmount = totalCampaignIncome + totalCampaignRefunds - totalExpenses - data.overview.treasuryTransfers;
  const bankDifference = data.bankAccount?.balanceAsOf ? data.overview.bankBalance - currentAmount : null;

  const rows = [
    {
      label: "Tổng hùn phước sau hoàn lại",
      value: totalCampaignIncome,
      note: "Tổng tiền vào của các thiện pháp sau khi trừ hoàn lại.",
      className: "text-emerald-700",
    },
    {
      label: "Tổng chi đã ghi nhận",
      value: totalExpenses,
      note: "Cột NỢ trong sao kê, không gồm chuyển thủ quỹ.",
      className: "text-amber-700",
    },
    {
      label: "Đã chuyển thủ quỹ",
      value: data.overview.treasuryTransfers,
      note: "Chuyển nơi giữ tiền; không tính là chi cúng dường.",
      className: "text-blue-700",
    },
    {
      label: "Còn trong tài khoản theo sao kê đã nhập",
      value: currentAmount,
      note: "Hùn phước cộng hoàn lại, trừ khoản chi, hoàn tiền và tiền đã chuyển thủ quỹ. Đây là số theo các giao dịch đã nhập.",
      className: "text-zinc-950",
    },
    {
      label: "Số dư tài khoản ngân hàng",
      value: data.bankAccount?.balanceAsOf ? data.overview.bankBalance : null,
      note: data.bankAccount
        ? `${data.bankAccount.bankName} ${data.bankAccount.accountNumber}`
        : "Chưa có thông tin tài khoản từ sao kê.",
      className: "text-zinc-950",
    },
    {
      label: "Chênh lệch tài khoản và sổ theo dõi",
      value: bankDifference,
      note: data.bankAccount?.balanceAsOf ? "Số dư ngân hàng trừ số tiền hiện tại theo thu chi." : "Sao kê chưa cung cấp số dư tài khoản để đối chiếu.",
      className: bankDifference === 0 ? "text-zinc-700" : "text-rose-700",
    },
    {
      label: "Thu chưa phân loại",
      value: data.overview.unmatchedIncome,
      note: "Khoản thu chưa nằm trong tổng thu thiện pháp.",
      className: "text-rose-700",
    },
    {
      label: "Chi từ sao kê chưa gán",
      value: data.overview.unmatchedDebit,
      note: "Dòng NỢ chưa được gán vào thiện pháp nào.",
      className: "text-amber-700",
    },
  ];

  return (
    <div className="mt-4 overflow-hidden rounded-md border border-zinc-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
          <tr>
            <th className="px-3 py-2">Khoản mục</th>
            <th className="px-3 py-2">Cách tính / ghi chú</th>
            <th className="px-3 py-2 text-right">Số tiền</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="px-3 py-2 font-medium text-zinc-900">{row.label}</td>
              <td className="px-3 py-2 text-zinc-500">{row.note}</td>
              <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${row.className}`}>
                {row.value == null ? "Chưa có số dư" : money(row.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RefundLinkModal({
  transaction,
  isSaving,
  onClose,
  onSave,
}: {
  transaction: TransactionSummary;
  isSaving: boolean;
  onClose: () => void;
  onSave: (
    transactionId: string,
    links: { originalTransactionId: string; amount: number }[],
  ) => Promise<void>;
}) {
  const [data, setData] = useState<RefundCandidatesResponse | null>(null);
  const [rows, setRows] = useState<RefundLinkRow[]>([]);
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/transactions/${transaction.id}/refund-links`)
      .then((response) => readJson<RefundCandidatesResponse>(response))
      .then((response) => {
        if (!active) return;
        setData(response);
        setRows(
          response.links.length > 0
            ? response.links.map((link) => ({
                originalTransactionId: link.originalTransactionId,
                amount: String(link.amount),
              }))
            : [{ originalTransactionId: "", amount: "" }],
        );
      })
      .catch((error) => {
        if (active) setLoadError(getErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [transaction.id]);

  const normalizedQuery = normalizeTransferText(query);
  const visibleCandidates = (data?.candidates ?? []).filter((candidate) =>
    !normalizedQuery || normalizeTransferText(
      `${candidate.description} ${candidate.detail} ${dateOnly(candidate.transactionDate)}`,
    ).includes(normalizedQuery),
  );
  const linkedTotal = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const selectedIds = rows.map((row) => row.originalTransactionId).filter(Boolean);
  const isValid = Boolean(data) && rows.length > 0 && rows.every((row) => {
    const candidate = data?.candidates.find((item) => item.id === row.originalTransactionId);
    return candidate && Number(row.amount) > 0 && Number(row.amount) <= candidate.refundableAmount;
  }) && new Set(selectedIds).size === selectedIds.length &&
    Math.round(linkedTotal * 100) === Math.round((data?.refundAmount ?? 0) * 100);

  function updateRow(index: number, patch: Partial<RefundLinkRow>) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  function selectCandidate(index: number, candidateId: string) {
    const candidate = data?.candidates.find((item) => item.id === candidateId);
    const otherTotal = rows.reduce(
      (sum, row, rowIndex) => sum + (rowIndex === index ? 0 : Number(row.amount) || 0),
      0,
    );
    const amount = candidate
      ? Math.min(candidate.refundableAmount, Math.max(0, (data?.refundAmount ?? 0) - otherTotal))
      : 0;
    updateRow(index, {
      originalTransactionId: candidateId,
      amount: amount > 0 ? String(amount) : "",
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-zinc-950/40 px-3 py-5 sm:px-4 sm:py-8">
      <div className="w-full max-w-4xl rounded-md border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-950">Liên kết khoản hoàn</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Khoản hoàn: <strong className="text-amber-700">{money(transaction.debitAmount)}</strong>
              {transaction.campaign ? ` · ${transaction.campaign.code}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="space-y-4 px-4 py-4 sm:px-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!isValid) return;
            void onSave(transaction.id, rows.map((row) => ({
              originalTransactionId: row.originalTransactionId,
              amount: Number(row.amount),
            })));
          }}
        >
          <div className="rounded-md bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">
            {transaction.description}
          </div>

          {loadError ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{loadError}</div>
          ) : !data ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải các khoản nhận...
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm thí chủ, nội dung chuyển khoản, mã giao dịch..."
                  className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div className="space-y-3">
                {rows.map((row, index) => {
                  const selectedCandidate = data.candidates.find((candidate) => candidate.id === row.originalTransactionId);
                  const options = selectedCandidate && !visibleCandidates.some((candidate) => candidate.id === selectedCandidate.id)
                    ? [selectedCandidate, ...visibleCandidates]
                    : visibleCandidates;
                  return (
                    <div key={index} className="rounded-md border border-zinc-200 p-3">
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
                        <select
                          value={row.originalTransactionId}
                          onChange={(event) => selectCandidate(index, event.target.value)}
                          className="min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                          required
                        >
                          <option value="">Chọn khoản nhận vào</option>
                          {options.map((candidate) => (
                            <option
                              key={candidate.id}
                              value={candidate.id}
                              disabled={
                                (selectedIds.includes(candidate.id) && candidate.id !== row.originalTransactionId) ||
                                candidate.refundableAmount <= 0
                              }
                            >
                              {dateOnly(candidate.transactionDate)} · {money(candidate.refundableAmount)} còn lại · {candidate.description}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          max={selectedCandidate?.refundableAmount}
                          value={row.amount}
                          onChange={(event) => updateRow(index, { amount: event.target.value })}
                          placeholder="Số tiền hoàn"
                          className="min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                          required
                        />
                        <button
                          type="button"
                          disabled={rows.length <= 1}
                          onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-50 disabled:opacity-30"
                          aria-label="Xóa liên kết"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {selectedCandidate ? (
                        <div className="mt-2 grid gap-1 text-xs text-zinc-500 sm:grid-cols-3">
                          <span>Nhận: {money(selectedCandidate.originalAmount)}</span>
                          <span>Đã hoàn trước: {money(selectedCandidate.refundedAmount)}</span>
                          <span>Có thể hoàn: {money(selectedCandidate.refundableAmount)}</span>
                          <span className="break-words sm:col-span-3">{selectedCandidate.description}</span>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setRows((current) => [...current, { originalTransactionId: "", amount: "" }])}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <Plus className="h-4 w-4" /> Thêm khoản nhận
              </button>

              <div className="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <div>
                  <div className="text-zinc-500">Đã liên kết</div>
                  <div className="mt-1 font-semibold text-zinc-950">{money(linkedTotal)}</div>
                </div>
                <div className="text-right">
                  <div className="text-zinc-500">Còn phải liên kết</div>
                  <div className={`mt-1 font-semibold ${linkedTotal === data.refundAmount ? "text-emerald-700" : "text-rose-700"}`}>
                    {money(data.refundAmount - linkedTotal)}
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              Hủy
            </button>
            <button
              disabled={!isValid || isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Lưu liên kết
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AllocationModal({
  transaction,
  campaigns,
  isSaving,
  onClose,
  onSave,
}: {
  transaction: TransactionSummary;
  campaigns: CampaignSummary[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (
    transactionId: string,
    allocations: { campaignId: string; amount: number }[],
  ) => Promise<void>;
}) {
  const availableCampaigns = sortCampaignsForSelection(
    campaigns.filter((campaign) => campaign.status !== "COMPLETED"),
  );
  const [rows, setRows] = useState<AllocationRow[]>(() =>
    transaction.allocations.length >= 2
      ? transaction.allocations.map((allocation) => ({
          campaignId: allocation.campaign.id,
          amount: String(allocation.amount),
        }))
      : [
          { campaignId: "", amount: "" },
          { campaignId: "", amount: "" },
        ],
  );
  const allocatedTotal = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const remaining = transaction.creditAmount - allocatedTotal;
  const selectedCampaignIds = rows.map((row) => row.campaignId).filter(Boolean);
  const isValid =
    rows.length >= 2 &&
    rows.every((row) => row.campaignId && Number(row.amount) > 0) &&
    new Set(selectedCampaignIds).size === selectedCampaignIds.length &&
    Math.round(allocatedTotal * 100) === Math.round(transaction.creditAmount * 100);

  function updateRow(index: number, patch: Partial<AllocationRow>) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-zinc-950/40 px-4 py-8">
      <div className="w-full max-w-2xl rounded-md border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-950">Chia giao dịch cho nhiều thiện pháp</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Số tiền giao dịch: <strong className="text-zinc-900">{money(transaction.creditAmount)}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="space-y-4 px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!isValid) return;
            void onSave(
              transaction.id,
              rows.map((row) => ({ campaignId: row.campaignId, amount: Number(row.amount) })),
            );
          }}
        >
          <p className="rounded-md bg-zinc-50 p-3 text-sm leading-6 text-zinc-600">
            {transaction.description}
          </p>

          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <select
                  value={row.campaignId}
                  onChange={(event) => updateRow(index, { campaignId: event.target.value })}
                  className="min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium shadow-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  required
                >
                  <option value="">Chọn thiện pháp</option>
                  <CampaignOptionGroups
                    campaigns={availableCampaigns}
                    currentCampaignId={row.campaignId}
                    disabledCampaignIds={selectedCampaignIds}
                    showName
                  />
                </select>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={row.amount}
                  onChange={(event) => updateRow(index, { amount: event.target.value })}
                  placeholder="Số tiền"
                  className="min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                  required
                />
                <button
                  type="button"
                  disabled={rows.length <= 2}
                  onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-50 disabled:opacity-30"
                  aria-label="Xóa phần phân bổ"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setRows((current) => [...current, { campaignId: "", amount: "" }])}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <Plus className="h-4 w-4" />
            Thêm thiện pháp
          </button>

          <div className="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <div>
              <div className="text-zinc-500">Đã phân bổ</div>
              <div className="mt-1 font-semibold text-zinc-950">{money(allocatedTotal)}</div>
            </div>
            <div className="text-right">
              <div className="text-zinc-500">Còn lại</div>
              <div className={`mt-1 font-semibold ${remaining === 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {money(remaining)}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={!isValid || isSaving}
              className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Lưu phân bổ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function sortCampaignsForSelection(campaigns: CampaignSummary[]) {
  return [...campaigns].sort((left, right) => {
    const statusDifference =
      selectionStatusPriority[left.status] - selectionStatusPriority[right.status];
    if (statusDifference !== 0) return statusDifference;
    return left.code.localeCompare(right.code, "vi");
  });
}

function campaignOptionLabel(campaign: CampaignSummary) {
  const marker = campaign.status === "ACTIVE" ? "●" : "○";
  return `${marker} ${campaign.code} — ${selectionStatusLabels[campaign.status]}`;
}

function publicCampaignOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (configured || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/+$/, "");
}

const statementIntroductions = [
  "KMCVietnam-Vihāradāna xin kính gửi đến quý vị bản cập nhật sao kê của thiện pháp",
  "Chúng con xin phép cập nhật thông tin tịnh tài của thiện pháp",
  "KMCVietnam-Vihāradāna trân trọng gửi quý vị phần tổng hợp minh bạch của thiện pháp",
  "Kính mời quý vị cùng theo dõi thông tin thu chi mới nhất của thiện pháp",
  "Chúng con xin được chia sẻ bản cập nhật tịnh tài dành cho thiện pháp",
];

const statementGreeting =
  "KÍNH CHÚC QUÝ VỊ NGÀY MỚI AN VUI TRONG CHÁNH PHÁP, THUẬN DUYÊN TẠO CÁC THIỆN NGHIỆP, VUN BỒI VÀ LÀM VIÊN MÃN CÁC PĀRAMĪ.";

const statementTotals = [
  "Tính đến hôm nay, tổng tịnh tài quý vị đã cùng phát tâm hùn phước là:",
  "Tổng số tịnh tài được ghi nhận đến thời điểm cập nhật là:",
  "Đến ngày hôm nay, thiện pháp đã nhận được tổng tịnh tài hùn phước:",
  "Số tịnh tài quý vị đồng phát tâm đóng góp hiện được ghi nhận là:",
  "Tổng tịnh tài đã được cập nhật minh bạch đến hôm nay là:",
];

const statementLinkInvitations = [
  "Kính mời quý vị xem danh sách giao dịch và thông tin chi tiết tại:",
  "Toàn bộ số liệu được công khai tại đường dẫn dưới đây, kính mời quý vị theo dõi:",
  "Quý vị có thể kiểm tra phần sao kê minh bạch và các giao dịch tại:",
  "Thông tin chi tiết của từng khoản tịnh tài được cập nhật tại:",
  "Kính mời quý vị cùng theo dõi bản sao kê công khai qua đường dẫn:",
];

const statementBlessings = [
  "🌺 Sādhu! Sādhu! Sādhu!",
  "   Lành thay! Lành thay! Lành thay!",
  "🌺 Idaṃ me puññaṃ nibbānassa paccayo hotu.",
  "   Nguyện phước báu này của tôi là duyên lành đưa đến Niết-bàn.",
  "🌺 Buddhasāsanaṃ ciraṃ tiṭṭhatu.",
  "   Nguyện Giáo pháp của Đức Phật trường tồn lâu dài.",
];

function buildCampaignStatement(campaign: CampaignSummary, expenses: StatementExpense[] = []) {
  const variant = hashText(campaign.code) % statementIntroductions.length;
  const date = vietnamDate(new Date());
  const code = campaign.code.toLocaleUpperCase("vi-VN");
  const name = campaign.name.trim().replace(/[.。]+$/, "").toLocaleUpperCase("vi-VN");
  const publicUrl = `${publicCampaignOrigin()}${publicCampaignPath(campaign.code)}`;

  if (campaign.code.toLocaleLowerCase("vi-VN") === "tp04") {
    return [
      `🏦 CẬP NHẬT SAO KÊ THIỆN PHÁP ${code} · ${date}`,
      `🌺 ${name}`,
      "",
      `💰 Tổng hùn phước: ${money(campaign.income)}`,
      `💝 Tổng cúng dường: ${money(campaign.expenses)}`,
      `🌿 Quỹ thiện pháp còn: ${money(campaign.balance)}`,
      `🏦 Đã chuyển thủ quỹ: ${money(campaign.treasuryTransfers)}`,
      `💳 Còn trong tài khoản: ${money(campaign.heldBalance)}`,
      "",
      `CHI TIẾT ${String(expenses.length).padStart(2, "0")} KHOẢN CÚNG DƯỜNG`,
      ...expenses.map((expense, index) =>
        `${index + 1}. ${shortVietnamDate(expense.transactionDate)} · ${money(expense.amount)} – ${formatTp04ExpenseDescription(expense.description)}`,
      ),
      "",
      `🔎 Xem chi tiết: ${publicUrl}`,
      ...statementBlessings,
    ].join("\n");
  }

  return [
    `🏦 CẬP NHẬT SAO KÊ THIỆN PHÁP ${code}`,
    `NGÀY ${date}`,
    "",
    `🏦 Đã chuyển thủ quỹ: ${money(campaign.treasuryTransfers)}`,
    `💳 Còn trong tài khoản: ${money(campaign.heldBalance)}`,
    "",
    statementGreeting,
    "",
    `🙏 ${statementIntroductions[variant]} ${code}:`,
    name,
    "",
    `💰 ${statementTotals[variant]}`,
    money(campaign.income),
    "",
    `🔎 ${statementLinkInvitations[variant]}`,
    publicUrl,
    "",
    ...statementBlessings,
  ].join("\n");
}

function formatTp04ExpenseDescription(description: string) {
  const normalized = normalizeTransferText(description);
  const knownDescriptions: Array<[string[], string]> = [
    [["50 hop dao lam", "myanmar"], "Cúng dường 50 hộp dao lam tới chư Tăng Myanmar."],
    [["dat bat 2000 vi", "pol"], "Cúng dường đặt bát 2.000 vị tại POL."],
    [["vt pa auk", "pausi"], "Cúng dường vật thực Pa-Auk, POL Pa-Auk Pausi."],
    [["mahavihara", "m obi"], "Cúng dường Kathina Mahāvihāra Hmawbi."],
    [["mawlamyine"], "Cúng dường Kathina Pa-Auk Mawlamyine."],
    [["ntt14"], "Cúng dường Kathina chùa Ngài Tam Tạng 14."],
    [["jatila"], "Cúng dường Kathina chùa Ngài Jatila."],
    [["dhamma gone"], "Cúng dường lễ dâng y Kathina Pa-Auk Dhamma Gone."],
    [["01 bo y", "kathina pol"], "Cúng dường 01 bộ y Kathina POL."],
  ];
  const known = knownDescriptions.find(([keywords]) =>
    keywords.every((keyword) => normalized.includes(keyword)),
  );
  if (known) return known[1];

  const cleaned = description
    .replace(/\btp04\b/gi, "")
    .replace(/\b(?:nh[oó]m\s+)?dhamma(?:\s+group)?(?:\s+vn)?\b/gi, "")
    .replace(/\bcd\b/i, "Cúng dường")
    .replace(/\s*[-–—]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.。]+$/, "");
  return `${cleaned || "Khoản cúng dường"}.`;
}

function vietnamDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("day")}.${value("month")}.${value("year")}`;
}

function shortVietnamDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function hashText(value: string) {
  return [...value].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 0);
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through for browsers that block Clipboard API access.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const didCopy = document.execCommand("copy");
  textarea.remove();
  return didCopy;
}

function CampaignOptionGroups({
  campaigns,
  currentCampaignId,
  disabledCampaignIds = [],
  showName = false,
}: {
  campaigns: CampaignSummary[];
  currentCampaignId?: string;
  disabledCampaignIds?: string[];
  showName?: boolean;
}) {
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "ACTIVE");
  const inactiveCampaigns = campaigns.filter((campaign) => campaign.status !== "ACTIVE");

  const renderOption = (campaign: CampaignSummary) => (
    <option
      key={campaign.id}
      value={campaign.id}
      disabled={
        disabledCampaignIds.includes(campaign.id) && campaign.id !== currentCampaignId
      }
    >
      {campaignOptionLabel(campaign)}{showName ? ` — ${campaign.name}` : ""}
    </option>
  );

  return (
    <>
      {activeCampaigns.length > 0 ? (
        <optgroup label="● ĐANG HOẠT ĐỘNG">
          {activeCampaigns.map(renderOption)}
        </optgroup>
      ) : null}
      {inactiveCampaigns.length > 0 ? (
        <optgroup label="○ KHÔNG HOẠT ĐỘNG">
          {inactiveCampaigns.map(renderOption)}
        </optgroup>
      ) : null}
    </>
  );
}

function campaignSelectClassName(campaignId: string | undefined, campaigns: CampaignSummary[]) {
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) return "border-zinc-300 bg-white text-zinc-700";
  if (campaign.status === "ACTIVE") {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }
  if (campaign.status === "PAUSED") {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }
  return "border-zinc-300 bg-zinc-100 text-zinc-600";
}

function CampaignStatementTemplate({ campaign }: { campaign: CampaignSummary }) {
  const [copied, setCopied] = useState(false);
  const [expenses, setExpenses] = useState<StatementExpense[] | null>(null);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const includesExpenseDetails = campaign.code.toLocaleLowerCase("vi-VN") === "tp04";
  const sortedExpenses = useMemo(() =>
    [...(expenses ?? [])].sort((left, right) =>
      new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime(),
    ),
  [expenses]);
  const expensesMatchTotal = expenses?.reduce((sum, expense) => sum + expense.amount, 0) === campaign.expenses;
  const isStatementReady = !includesExpenseDetails || (expenses !== null && expensesMatchTotal);
  const statement = buildCampaignStatement(campaign, sortedExpenses);

  useEffect(() => {
    if (!includesExpenseDetails) return;

    const controller = new AbortController();
    fetch(`/api/campaigns/${campaign.id}/statement-expenses`, { signal: controller.signal })
      .then((response) => readJson<{ transactions: StatementExpense[] }>(response))
      .then(({ transactions }) => setExpenses(transactions))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setExpenseError(getErrorMessage(error));
      });

    return () => controller.abort();
  }, [campaign.id, includesExpenseDetails]);

  async function handleCopy() {
    if (!isStatementReady) return;
    const didCopy = await copyToClipboard(statement);
    if (!didCopy) return;

    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <section className="overflow-hidden rounded-md border border-[#e3c8d4] bg-[#fffafb]">
      <div className="flex flex-col gap-3 border-b border-[#ecd8e1] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#4c173b]">Mẫu sao kê để chia sẻ</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Mẫu tự cập nhật tổng hùn phước và link công khai của thiện pháp này.
          </p>
        </div>
      </div>
      {includesExpenseDetails && !expenses ? (
        <p className="px-4 py-2 text-xs text-zinc-600">
          {expenseError ?? "Đang tải chi tiết các khoản cúng dường..."}
        </p>
      ) : null}
      {includesExpenseDetails && expenses && !expensesMatchTotal ? (
        <p className="px-4 py-2 text-xs text-rose-700">
          Tổng chi tiết chưa khớp tổng cúng dường. Vui lòng tải lại trang trước khi sao chép.
        </p>
      ) : null}
      {isStatementReady ? (
        <div className={includesExpenseDetails ? "border-t border-[#ecd8e1]" : undefined}>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <h4 className="text-sm font-semibold text-[#4c173b]">Nội dung sao kê dạng văn bản</h4>
            <button
              type="button"
              onClick={() => void handleCopy()}
              aria-label={copied ? "Đã sao chép nội dung sao kê" : "Sao chép nội dung sao kê"}
              title={copied ? "Đã sao chép" : "Sao chép nội dung sao kê"}
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition ${
                copied
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-[#c998ad] bg-white text-[#6b2349] hover:bg-[#f9eaf1]"
              }`}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <div
            role="textbox"
            aria-readonly="true"
            aria-label={`Mẫu sao kê thiện pháp ${campaign.code}`}
            className={`w-full select-text overflow-y-auto whitespace-pre-wrap break-words border-t border-zinc-100 bg-white px-4 py-2 text-sm leading-5 text-zinc-800 ${includesExpenseDetails ? "max-h-[28rem]" : "h-64"}`}
          >
            {statement.split("\n").map((line, index) => (
              <div key={`${index}-${line}`}>{line || <br />}</div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CampaignBillManager({ campaign }: { campaign: CampaignSummary }) {
  const [expenses, setExpenses] = useState<StatementExpense[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [bills, setBills] = useState<CampaignBill[] | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/campaigns/${campaign.id}/statement-expenses`, { signal: controller.signal })
      .then((response) => readJson<{ transactions: StatementExpense[] }>(response))
      .then(({ transactions }) => setExpenses(transactions))
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(getErrorMessage(caught)); });
    fetch(`/api/campaigns/${campaign.id}/bills`, { signal: controller.signal })
      .then((response) => readJson<{ bills: CampaignBill[] }>(response))
      .then(({ bills: loadedBills }) => setBills(loadedBills))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(getErrorMessage(caught));
      });
    return () => controller.abort();
  }, [campaign.id]);

  async function uploadBills(files: File[], expense: StatementExpense) {
    if (files.length === 0) return;
    setError(null);
    setIsUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("transactionId", expense.id);
        formData.set("title", titles[expense.id] ?? formatTp04ExpenseDescription(expense.description));
        const result = await readJson<{ bill: CampaignBill }>(await fetch(
          `/api/campaigns/${campaign.id}/bills`,
          { method: "POST", body: formData },
        ));
        setBills((current) => [result.bill, ...(current ?? [])]);
      }

    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsUploading(false);
    }
  }

  async function deleteBill(bill: CampaignBill) {
    if (!window.confirm(`Xóa ảnh bill “${bill.originalName}”?`)) return;
    setError(null);
    setDeletingId(bill.id);
    try {
      await readJson(await fetch(`/api/campaign-bills/${bill.id}`, { method: "DELETE" }));
      setBills((current) => current?.filter((item) => item.id !== bill.id) ?? []);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-md border border-[#e3c8d4] bg-[#fffafb]">
      <div className="border-b border-[#ecd8e1] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#4c173b]">Hình ảnh bill chuyển tiền</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          Ảnh tải lên sẽ tự động xuất hiện tại trang công khai. Hỗ trợ JPG, PNG, WebP; tối đa 4 MB mỗi ảnh.
        </p>
      </div>

      <div className="p-4">
        <div className="space-y-3">
          {expenses.map((expense, index) => (
            <div key={expense.id} className="rounded-md border border-[#e3c8d4] bg-white p-3">
              <p className="text-sm font-semibold">{index + 1}. {formatTp04ExpenseDescription(expense.description)}</p>
              <p className="mt-1 text-xs text-zinc-500">{shortVietnamDate(expense.transactionDate)} · {money(expense.amount)}</p>
              <label className="mt-3 block text-xs">Tên khoản cúng dường hiển thị cùng bill
                <input className="mt-1 w-full rounded border p-2" maxLength={255} value={titles[expense.id] ?? formatTp04ExpenseDescription(expense.description)} onChange={(event) => setTitles((current) => ({ ...current, [expense.id]: event.target.value }))} />
              </label>
              <label className="mt-3 block cursor-pointer rounded border-2 border-dashed border-[#d8b4c4] p-3 text-center text-sm text-[#6b2349]">
                {isUploading ? "Đang tải ảnh lên..." : "Tải bill cho khoản cúng dường này"}
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={isUploading || !((titles[expense.id] ?? expense.description).trim())} className="sr-only" onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void uploadBills(files, expense); }} />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {bills?.filter((bill) => bill.transactionId === expense.id).map((bill) => (
                  <div key={bill.id} className="rounded border p-2">
                    <a href={`/thien-phap/media/${bill.id}`} target="_blank" rel="noreferrer"><Image src={`/thien-phap/media/${bill.id}`} alt={bill.title ?? expense.description} width={120} height={160} unoptimized className="h-40 w-30 object-contain" /></a>
                    <button type="button" disabled={deletingId === bill.id} onClick={() => void deleteBill(bill)} className="mt-1 text-xs text-rose-600">Xóa bill</button>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500">{bills?.filter((bill) => bill.transactionId === expense.id).length ?? 0} ảnh bill đã tải lên</p>
            </div>
          ))}
          {expenses.length === 0 ? <p className="text-xs text-zinc-500">Chưa có khoản chi cúng dường được gắn với thiện pháp này.</p> : null}
        </div>

        {error ? <p role="alert" className="mt-3 text-xs text-rose-700">{error}</p> : null}
        {bills === null && !error ? <p className="mt-3 text-xs text-zinc-500">Đang tải danh sách ảnh...</p> : null}
        {bills?.length === 0 ? <p className="mt-3 text-xs text-zinc-500">Chưa có ảnh bill nào.</p> : null}
        {bills && bills.some((bill) => !bill.transactionId) ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {bills.filter((bill) => !bill.transactionId).map((bill) => (
              <article key={bill.id} className="overflow-hidden rounded-md border border-zinc-200 bg-white">
                <a
                  href={`/thien-phap/media/${bill.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="relative block aspect-[3/4] bg-zinc-100"
                  title={`Mở ảnh ${bill.originalName}`}
                >
                  <Image
                    src={`/thien-phap/media/${bill.id}`}
                    alt={`Bill chuyển tiền ${bill.originalName}`}
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 50vw, 210px"
                    className="object-contain"
                  />
                </a>
                <div className="flex items-center gap-2 p-2">
                  <p className="min-w-0 flex-1 truncate text-xs text-zinc-600" title={bill.originalName}>
                    {bill.title ?? "Bill chưa gắn khoản cúng dường"}
                  </p>
                  <button
                    type="button"
                    disabled={deletingId === bill.id}
                    onClick={() => void deleteBill(bill)}
                    aria-label={`Xóa ảnh ${bill.originalName}`}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    {deletingId === bill.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CampaignModal({
  state,
  isSaving,
  isDeleting,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  state: CampaignModalState;
  isSaving: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (event: FormEvent<HTMLFormElement>, campaignId: string) => void;
  onDelete: (campaign: CampaignSummary) => void;
}) {
  const campaign = state.mode === "edit" ? state.campaign : null;
  const canDelete = campaign ? campaign.transactionCount === 0 : false;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-950/40 px-4 py-8">
      <div className="w-full max-w-2xl rounded-md border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-zinc-100 p-2 text-zinc-700">
                <Tags className="h-4 w-4" />
              </span>
              <h2 className="text-base font-semibold text-zinc-950">
                {campaign ? "Sửa thiện pháp" : "Thêm thiện pháp"}
              </h2>
            </div>
            {campaign ? (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <MiniStat label="Hùn phước" value={money(campaign.income)} />
                  <MiniStat label="Chi" value={money(campaign.expenses)} />
                  <MiniStat label="Đã chuyển thủ quỹ" value={money(campaign.treasuryTransfers)} />
                  <MiniStat label="Còn trong tài khoản" value={money(campaign.heldBalance)} />
                  <MiniStat label="GD" value={campaign.transactionCount.toLocaleString("vi-VN")} />
                </div>
                <a
                  href={publicCampaignPath(campaign.code)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  Mở link public
                </a>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          key={campaign?.id ?? "create"}
          className="space-y-4 px-5 py-4"
          onSubmit={(event) => (campaign ? onUpdate(event, campaign.id) : onCreate(event))}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Input name="code" label="Mã" defaultValue={campaign?.code ?? ""} placeholder="cntt10" required />
            <Select name="status" label="Trạng thái" defaultValue={campaign?.status ?? "ACTIVE"}>
              <option value="ACTIVE">Đang chạy</option>
              <option value="PAUSED">Tạm dừng</option>
              <option value="COMPLETED">Hoàn tất</option>
            </Select>
          </div>
          <Input
            name="name"
            label="Tên thiện pháp"
            defaultValue={campaign?.name ?? ""}
            placeholder="Cúng dường y áo..."
            required
          />
          <Textarea
            name="keywords"
            label="Từ khóa"
            rows={5}
            defaultValue={campaign?.keywords.map((keyword) => keyword.keyword).join("\n") ?? ""}
            placeholder={"cntt10\nchùa tam tạng 10\ncung duong y ao"}
          />
          <Textarea name="description" label="Ghi chú" rows={3} defaultValue={campaign?.description ?? ""} />

          {campaign ? <CampaignBillManager campaign={campaign} /> : null}
          {campaign ? <CampaignStatementTemplate campaign={campaign} /> : null}

          <div className="flex flex-col-reverse gap-3 border-t border-zinc-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            {campaign ? (
              <div>
                <button
                  type="button"
                  disabled={!canDelete || isDeleting}
                  onClick={() => onDelete(campaign)}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400"
                >
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Xóa
                </button>
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  {canDelete ? "Có thể xóa vì chưa có giao dịch sao kê." : "Không thể xóa khi đã có giao dịch sao kê."}
                </p>
              </div>
            ) : (
              <span />
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Hủy
              </button>
              <button
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tags className="h-4 w-4" />}
                {campaign ? "Cập nhật" : "Tạo thiện pháp"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function SetupScreen({ state }: { state: Exclude<DashboardState, { ok: true }> }) {
  return (
    <div className="min-h-screen bg-[#f7f7f4] px-4 py-8 text-zinc-950">
      <div className="mx-auto max-w-3xl rounded-md border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-1 h-5 w-5 text-amber-600" />
          <div>
            <h1 className="text-xl font-semibold">Cần cấu hình PostgreSQL</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{state.message}</p>
          </div>
        </div>
        <div className="mt-5 space-y-3 text-sm">
          <pre className="overflow-x-auto rounded-md bg-zinc-950 p-4 text-zinc-50">
            <code>{'DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"'}</code>
          </pre>
          <pre className="overflow-x-auto rounded-md bg-zinc-100 p-4 text-zinc-800">
            <code>{"pnpm db:generate\npnpm db:push\npnpm db:seed\npnpm dev"}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

function HeaderStat({ label, value, tone = "zinc" }: { label: string; value: string; tone?: "zinc" | "emerald" | "amber" }) {
  const color = tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-zinc-950";
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">{children}</div>;
}

function PanelTitle({ icon: Icon, title }: { icon: typeof Upload; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="rounded-md bg-zinc-100 p-2 text-zinc-700">
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="text-sm font-semibold text-zinc-950">{title}</h2>
    </div>
  );
}

function TabButton({
  active,
  children,
  count,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium ${
        active
          ? "border-zinc-950 bg-zinc-950 text-white"
          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {children}
      {typeof count === "number" ? <TabCountBadge active={active} count={count} /> : null}
    </button>
  );
}

function MainTabButton({
  active,
  children,
  count,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
        active ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950"
      }`}
    >
      {children}
      {typeof count === "number" ? <TabCountBadge active={active} count={count} /> : null}
    </button>
  );
}

function TabCountBadge({ active, count }: { active: boolean; count: number }) {
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold ${
        active ? "bg-white/15 text-white" : "bg-zinc-100 text-zinc-600"
      }`}
    >
      {count.toLocaleString("vi-VN")}
    </span>
  );
}

function Input({
  label,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <input
        {...props}
        className={`mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 ${className}`}
      />
    </label>
  );
}

function Textarea({
  label,
  className = "",
  rows = 3,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <textarea
        rows={rows}
        {...props}
        className={`mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 ${className}`}
      />
    </label>
  );
}

function Select({
  label,
  children,
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <select
        {...props}
        className={`mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 ${className}`}
      >
        {children}
      </select>
    </label>
  );
}

function StatusMessages({ message, error }: { message: string | null; error: string | null }) {
  if (!message && !error) {
    return null;
  }

  return (
    <div
      className={`rounded-md border p-3 text-sm ${
        error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      <div className="flex items-start gap-2">
        {error ? <AlertCircle className="mt-0.5 h-4 w-4" /> : <CheckCircle2 className="mt-0.5 h-4 w-4" />}
        <span>{error ?? message}</span>
      </div>
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-emerald-700/70">{label}</dt>
      <dd className="font-semibold">{value.toLocaleString("vi-VN")}</dd>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-zinc-50 p-2">
      <div className="text-zinc-500">{label}</div>
      <div className="mt-1 font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

function campaignPayloadFromForm(formData: FormData) {
  return {
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    status: String(formData.get("status") ?? "ACTIVE"),
    keywords: splitKeywords(String(formData.get("keywords") ?? "")),
  };
}

function publicCampaignPath(code: string) {
  return `/thien-phap/${encodeURIComponent(code)}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof json.error === "string" ? json.error : "Request failed.");
  }

  return json as T;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Có lỗi không xác định.";
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

function dateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

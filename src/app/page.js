"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Box,
  ChevronRight,
  FileClock,
  FileUp,
  Info,
  PackageSearch,
  MessageSquarePlus,
  Percent,
  ReceiptText,
  SendHorizontal,
  ShoppingBag,
  ShoppingCart,
  Square,
  Undo2,
  X,
} from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useApp } from "@/components/app-context";
import { CountUp, easeOut, rise, stagger } from "@/components/motion";
import { Button, Card, EmptyState, ErrorMessage, formatDate, formatMoney } from "@/components/ui";
import { buildWorkspaceSummary, calculateMonthlyOrders, calculateMonthlyTotals, calculatePaymentAudit, calculateReturns, monthOverMonth } from "@/lib/data";
import { applyChatEvent, chatHistory, readNdjson } from "@/lib/chat-stream";
import { createDemoImports } from "@/lib/demo";
import { formatUzbekDate, translateReport } from "@/lib/translations";

// The intro plays once per page load; returning to the dashboard shows the numbers straight away.
let introPlayed = false;

const chartColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
const transactionTypes = ["payment", "fee", "refund", "adjustment"];
const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const axisTick = { fontSize: 12 };

function ChartTooltip({ active, payload, label, formatValue }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      {label && <strong>{label}</strong>}
      {payload.map((entry) => <span key={entry.name}><i style={{ background: entry.color || entry.payload?.fill }} />{entry.name}: {formatValue(entry)}</span>)}
    </div>
  );
}

export default function DashboardPage() {
  const [intro] = useState(() => !introPlayed);
  useEffect(() => { introPlayed = true; }, []);
  const { imports, t, language, save, notify } = useApp();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [chartType, setChartType] = useState("line");
  const [aiStatus, setAiStatus] = useState("checking");
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const chatAbort = useRef(null);
  const [aiOpen, setAiOpen] = useState(false);
  const fabRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);
  const [now] = useState(() => new Date());
  const audit = useMemo(() => calculatePaymentAudit(imports), [imports]);
  const returns = useMemo(() => calculateReturns(imports), [imports]);
  const monthlyOrders = useMemo(() => calculateMonthlyOrders(imports), [imports]);
  const workspace = useMemo(() => buildWorkspaceSummary(imports), [imports]);
  const monthlyData = useMemo(() => calculateMonthlyTotals(imports), [imports]);
  const recentReturns = [...returns.records].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);
  const recentImports = [...imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt)).slice(0, 4);
  const refundTotal = monthlyData.reduce((total, item) => total + item.refunds, 0);
  const revenueTotal = monthlyData.reduce((total, item) => total + item.revenue, 0);
  const latestTransactions = imports.filter((item) => item.reportType === "payments")
    .flatMap((item) => item.rows.map((row) => ({ ...row, _fileName: item.fileName })))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);
  const hasData = imports.some((item) => item.rows.length);
  const today = language === "uz" ? formatUzbekDate(now, { weekday: true }) : new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-US", { weekday: "long", day: "numeric", month: "short", year: "numeric" }).format(now);
  // Compare full months only: the month in progress would always look like a drop. ("Undated" sorts after any date, so it is excluded too.)
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dated = monthlyData.filter((item) => item.month < currentMonth);
  const fullOrderMonths = monthlyOrders.filter((item) => item.month < currentMonth);
  const orderMonthSet = new Set(fullOrderMonths.map((item) => item.month));
  const kpis = [
    { id: "revenue", label: t("revenue"), note: t("grossFromOrders"), value: revenueTotal, kind: "money", icon: Banknote, glow: "var(--accent)", change: monthOverMonth(dated.filter((item) => orderMonthSet.has(item.month)), "revenue") },
    { id: "refunds", label: t("refunds"), note: t("refundsFromReports"), value: refundTotal, kind: "money", icon: Undo2, glow: "var(--violet)", change: monthOverMonth(dated.filter((item) => item.refunds > 0), "refunds"), upIsBad: true },
    { id: "returnRate", label: t("returnRate"), note: `${returns.totalReturns} ${t("returnsTotal").toLowerCase()}`, value: returns.returnRate === null ? null : returns.returnRate * 100, kind: "percent", icon: Percent, glow: "var(--teal)", change: null },
    { id: "orders", label: t("orders"), note: `${imports.filter((item) => item.reportType === "orders").length} ${t("ordersReport").toLowerCase()}`, value: audit.orderCount, kind: "integer", icon: ShoppingCart, glow: "var(--indigo)", change: monthOverMonth(fullOrderMonths, "orders") },
  ];

  useEffect(() => {
    let active = true;
    fetch("/api/analytics")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not check AI configuration.");
        return response.json();
      })
      .then((data) => { if (active) setAiStatus(data.configured ? "ready" : "missing"); })
      .catch(() => { if (active) setAiStatus("unavailable"); });
    return () => { active = false; };
  }, []);

  const chatBusy = chat.at(-1)?.status === "streaming";

  // Leaving the dashboard stops an answer that is still streaming.
  useEffect(() => () => chatAbort.current?.abort(), []);

  // Follow a streaming answer unless the reader has scrolled up to read something else.
  useEffect(() => {
    const panel = scrollRef.current;
    if (panel && chat.length && stickToBottom.current) panel.scrollTop = panel.scrollHeight;
  }, [chat, aiOpen]);

  // Opening puts the cursor in the question box; while AI is not configured the box is disabled, so the panel takes focus.
  useEffect(() => {
    if (!aiOpen) return;
    const input = inputRef.current;
    (input && !input.disabled ? input : panelRef.current)?.focus();
  }, [aiOpen]);

  function closeAi() {
    setAiOpen(false);
    fabRef.current?.focus();
  }

  async function sendChat(text) {
    const question = text.trim();
    if (!question || chatBusy || aiStatus !== "ready") return;
    const history = chatHistory([...chat, { role: "user", content: question }]);
    // Only the answer still being written changes; after "New chat" or a finished answer, late updates are ignored.
    const updateAnswer = (change) => setChat((current) => (current.at(-1)?.status === "streaming" ? [...current.slice(0, -1), change(current.at(-1))] : current));
    setChat((current) => [...current, { role: "user", content: question }, { role: "assistant", content: "", status: "streaming" }]);
    setChatInput("");
    stickToBottom.current = true;
    const controller = new AbortController();
    chatAbort.current = controller;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, messages: history, workspace }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        updateAnswer((answer) => applyChatEvent(answer, { type: "error", code: response.status === 503 ? "not_configured" : "unavailable" }));
        return;
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let rest = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = readNdjson(rest, value);
        rest = chunk.rest;
        for (const event of chunk.events) updateAnswer((answer) => applyChatEvent(answer, event));
      }
      // A stream that ends without "done" (dropped connection) still leaves a finished, readable answer.
      updateAnswer((answer) => applyChatEvent(answer, answer.content ? { type: "done" } : { type: "error", code: "connection" }));
    } catch (requestError) {
      if (requestError.name === "AbortError") {
        setChat((current) => {
          const answer = current.at(-1);
          if (answer?.status !== "streaming") return current;
          return answer.content ? [...current.slice(0, -1), applyChatEvent(answer, { type: "done" })] : current.slice(0, -1);
        });
      } else {
        updateAnswer((answer) => applyChatEvent(answer, { type: "error", code: "connection" }));
      }
    } finally {
      if (chatAbort.current === controller) chatAbort.current = null;
    }
  }

  function resetChat() {
    chatAbort.current?.abort();
    setChat([]);
  }

  async function loadDemo() {
    if (busy) return;
    if (imports.some((item) => item.isDemo) && !window.confirm(`${t("demoLoaded")} ${t("replaceDemoConfirm")}`)) return;
    setBusy(true);
    setError("");
    try {
      await save([...imports.filter((item) => !item.isDemo), ...createDemoImports()]);
      notify(t("demoLoaded"));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  function chartContent() {
    if (!monthlyData.length) return <EmptyState title={t("chartNoData")} description={t("chartImportHint")} action={<Link className="text-link" href="/import">{t("importFirst")}</Link>} />;
    const tooltip = <Tooltip cursor={{ stroke: "var(--text)", strokeOpacity: 0.5 }} content={<ChartTooltip formatValue={(entry) => entry.dataKey === "returns" ? entry.value : formatMoney(entry.value, language)} />} />;
    if (chartType === "pie") {
      const revenueMonths = monthlyData.filter((item) => item.revenue > 0);
      if (!revenueMonths.length) return <EmptyState title={t("chartNoData")} description={t("revenueUnavailable")} />;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={revenueMonths} dataKey="revenue" nameKey="month" innerRadius={66} outerRadius={110} paddingAngle={2} isAnimationActive={intro ? "auto" : false} animationBegin={150} animationDuration={700} animationEasing="ease-out">
              {revenueMonths.map((entry, index) => <Cell key={entry.month} fill={chartColors[index % chartColors.length]} />)}
            </Pie>
            {tooltip}
            <Legend iconType="circle" iconSize={8} />
          </PieChart>
        </ResponsiveContainer>
      );
    }
    const axes = (
      <>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} tickMargin={10} minTickGap={22} />
        <YAxis yAxisId="money" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={compactNumber.format} width={46} />
        <YAxis yAxisId="count" orientation="right" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={30} />
        {tooltip}
        <Legend iconType="circle" iconSize={8} />
      </>
    );
    if (chartType === "bar") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyData} margin={{ top: 10, right: 4, bottom: 0, left: 0 }}>
            {axes}
            <Bar dataKey="revenue" yAxisId="money" name={t("revenue")} fill="var(--chart-1)" radius={[4, 4, 0, 0]} isAnimationActive={intro ? "auto" : false} animationBegin={150} animationDuration={700} animationEasing="ease-out" />
            <Bar dataKey="refunds" yAxisId="money" name={t("refunds")} fill="var(--chart-2)" radius={[4, 4, 0, 0]} isAnimationActive={intro ? "auto" : false} animationBegin={150} animationDuration={700} animationEasing="ease-out" />
            <Bar dataKey="returns" yAxisId="count" name={t("returnsTotal")} fill="var(--chart-3)" radius={[4, 4, 0, 0]} isAnimationActive={intro ? "auto" : false} animationBegin={150} animationDuration={700} animationEasing="ease-out" />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={monthlyData} margin={{ top: 10, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--chart-1)", stopOpacity: 0.36 }} />
              <stop offset="100%" style={{ stopColor: "var(--chart-1)", stopOpacity: 0 }} />
            </linearGradient>
            <linearGradient id="refundFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--chart-2)", stopOpacity: 0.12 }} />
              <stop offset="100%" style={{ stopColor: "var(--chart-2)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {axes}
          <Area type="linear" dataKey="refunds" yAxisId="money" name={t("refunds")} stroke="var(--chart-2)" strokeWidth={1.5} strokeOpacity={0.55} fill="url(#refundFill)" dot={false} isAnimationActive={intro ? "auto" : false} animationBegin={150} animationDuration={700} animationEasing="ease-out" />
          <Area type="linear" dataKey="revenue" yAxisId="money" name={t("revenue")} stroke="var(--chart-1)" strokeWidth={2.25} fill="url(#revenueFill)" dot={{ r: 3, fill: "var(--chart-dot)", stroke: "var(--chart-1)", strokeWidth: 1.5 }} activeDot={{ r: 5, fill: "var(--chart-dot)", stroke: "var(--chart-1)", strokeWidth: 2 }} isAnimationActive={intro ? "auto" : false} animationBegin={150} animationDuration={700} animationEasing="ease-out" />
          <Line type="linear" dataKey="returns" yAxisId="count" name={t("returnsTotal")} stroke="var(--chart-3)" strokeWidth={1.25} strokeOpacity={0.55} strokeDasharray="4 4" dot={false} isAnimationActive={intro ? "auto" : false} animationBegin={150} animationDuration={700} animationEasing="ease-out" />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  const aiReady = aiStatus === "ready";

  return (
    <>
      <div className="page-header">
        <div><p className="page-date">{today}</p><h1>{t("welcomeBack")}</h1></div>
        <div className="page-actions">
          <Link href="/import" className="button button-secondary"><FileUp size={15} />{t("importData")}</Link>
          <Button variant="secondary" onClick={loadDemo} disabled={busy}><ArrowDownToLine size={15} />{busy ? t("loading") : t("loadDemo")}</Button>
        </div>
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      {!hasData ? (
        <Card><EmptyState title={t("emptyTitle")} description={t("emptyText")} action={
          <div className="page-actions"><Link href="/import" className="button button-primary"><FileUp size={15} />{t("importFirst")}</Link><Button variant="secondary" onClick={loadDemo}><ArrowDownToLine size={15} />{t("loadDemo")}</Button></div>
        } /></Card>
      ) : (
        <motion.div variants={stagger} initial={intro ? "hidden" : false} animate="show">
          <motion.div className="kpi-grid" variants={stagger}>
            {kpis.map(({ icon: Icon, ...kpi }) => {
              const up = kpi.change > 0;
              const tone = kpi.change === 0 ? "kpi-flat" : up === Boolean(kpi.upIsBad) ? "kpi-bad" : "";
              return (
                <motion.article className="card kpi-card" style={{ "--glow": kpi.glow }} variants={rise} key={kpi.id}>
                  <span className="kpi-icon"><Icon size={16} aria-hidden="true" /></span>
                  <span className="kpi-label" title={kpi.note}><span>{kpi.label}</span><Info size={13} aria-hidden="true" /></span>
                  <strong className="kpi-value">{kpi.value === null ? "—" : <CountUp value={kpi.value} from={intro ? 0 : kpi.value} kind={kpi.kind} language={language} />}</strong>
                  {kpi.change === null ? <span className="kpi-delta kpi-note">{kpi.note}</span> : (
                    <span className={`kpi-delta ${tone}`} title={t("vsPreviousMonth")}>
                      {kpi.change !== 0 && (up ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />)}
                      {up ? "+" : ""}{(kpi.change * 100).toFixed(1)}%<span className="sr-only">{t("vsPreviousMonth")}. {kpi.note}</span>
                    </span>
                  )}
                </motion.article>
              );
            })}
          </motion.div>
          <div className="dashboard-main">
            <motion.div variants={rise}>
              <Card className="dashboard-panel chart-panel">
                <div className="section-heading chart-heading">
                  <div><h2>{t("salesReturnsOverview")}</h2><p>{t("salesReturnsDescription")}</p></div>
                  <label className="chart-type-control"><span>{t("chartType")}</span><select value={chartType} onChange={(event) => setChartType(event.target.value)} aria-label={t("chartType")}>
                    <option value="line">{t("lineChart")}</option><option value="bar">{t("barChart")}</option><option value="pie">{t("pieChart")}</option>
                  </select></label>
                </div>
                <div className="dashboard-chart">{chartContent()}</div>
              </Card>
            </motion.div>
            <motion.div variants={rise}>
              <Card className="dashboard-panel">
                <div className="section-heading"><h2><ShoppingBag size={16} />{t("recentTransactions")}</h2><Link href="/auditor">{t("auditor")}<ChevronRight size={15} /></Link></div>
                {latestTransactions.length ? (
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead><tr><th>{t("fields.orderId")}</th><th>{t("date")}</th><th>{t("fields.amount")}</th><th>{t("fields.transactionType")}</th></tr></thead>
                      <tbody>
                        {latestTransactions.map((row, index) => {
                          const amount = row.amount ?? row.refund ?? row.fee;
                          const known = Number.isFinite(amount);
                          const down = known && amount < 0;
                          return (
                            <tr key={`${row.orderId}-${row.date}-${index}`}>
                              <td className="table-primary"><span className="order-cell"><span className="order-chip"><ReceiptText size={14} aria-hidden="true" /></span>{row.orderId || t("unavailable")}</span></td>
                              <td>{formatDate(row.date, language)}</td>
                              <td className={known ? (down ? "negative-value" : "positive-value") : ""}>{known ? `${down ? "" : "+"}${formatMoney(amount, language)}` : "—"}</td>
                              <td><span className={`trend-cell ${down ? "trend-down" : ""}`}>{known && (down ? <ArrowDownRight size={14} aria-hidden="true" /> : <ArrowUpRight size={14} aria-hidden="true" />)}{transactionTypes.includes(row.transactionType) ? t(`transactionTypes.${row.transactionType}`) : row.transactionType || t("payment")}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="panel-empty">{t("noTransactions")}</p>}
              </Card>
            </motion.div>
          </div>
          <motion.div className="dashboard-lower" variants={rise}>
            <Card className="dashboard-panel">
              <div className="section-heading"><h2><PackageSearch size={16} />{t("recentReturns")}</h2><Link href="/returns">{t("viewAll")}<ChevronRight size={15} /></Link></div>
              {recentReturns.length ? <div className="recent-return-list">{recentReturns.map((row, index) => (
                <Link href="/returns" className="recent-return-row" key={`${row._importId}-${row._rowIndex}`}>
                  <span className="return-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="recent-return-copy"><strong>{row.product || row.sku || row.orderId || t("unavailable")}</strong><small>{row.orderId || t("unavailable")}, {row.category}</small></span>
                  <time>{formatDate(row.date, language)}</time>
                </Link>
              ))}</div> : <EmptyState title={t("noReturns")} description={t("importReturnsHint")} action={<Link href="/import" className="text-link">{t("importData")}</Link>} />}
            </Card>
            <Card className="dashboard-panel">
              <div className="section-heading"><h2><AlertTriangle size={16} />{t("importantAlerts")}</h2></div>
              <div className="alert-list">
                <Link href="/auditor" className="alert-row">
                  <span className={audit.discrepancyCount ? "alert-mark alert-warning" : "alert-mark alert-good"}><AlertTriangle size={15} /></span>
                  <span><strong>{audit.hasUsableOrders && audit.hasUsablePayments ? `${audit.discrepancyCount} ${t("discrepancies").toLowerCase()}` : t("financialReportsNeeded")}</strong><small>{audit.hasUsableOrders && audit.hasUsablePayments ? t("paymentCheckHint") : t("financialReportsHint")}</small></span>
                  <ArrowRight size={15} />
                </Link>
                {!imports.some((item) => item.reportType === "products") && <Link href="/import" className="alert-row">
                  <span className="alert-mark alert-neutral"><Box size={15} /></span><span><strong>{t("inventoryReportMissing")}</strong><small>{t("inventoryImportHint")}</small></span><ArrowRight size={15} />
                </Link>}
              </div>
            </Card>
            <Card className="dashboard-panel">
              <div className="section-heading"><h2><FileClock size={16} />{t("recentActivity")}</h2><Link href="/history">{t("history")}<ChevronRight size={15} /></Link></div>
              <div className="recent-return-list">
                {recentImports.map((item) => (
                  <div className="recent-return-row" key={item.id}>
                    <span className="activity-dot" /><span className="recent-return-copy"><strong>{item.fileName}</strong><small>{translateReport(t, item.reportType)}</small></span><time>{formatDate(item.importedAt, language)}</time>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
      {hasData && (
        <>
          <AnimatePresence>
            {aiOpen && (
              <motion.section
                id="ai-panel"
                ref={panelRef}
                className="card ai-panel"
                role="dialog"
                aria-labelledby="ai-panel-title"
                tabIndex={-1}
                onKeyDown={(event) => { if (event.key === "Escape") closeAi(); }}
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.18, ease: easeOut }}
              >
                <div className="ai-head">
                  <span className={`ai-orb ${chatBusy ? "ai-orb-busy" : ""}`} aria-hidden="true" />
                  <div>
                    <h2 id="ai-panel-title">{t("aiInventoryTitle")}</h2>
                    <p><span className={`ai-status-dot ${aiReady ? "ai-status-ready" : ""}`} />{aiStatus === "checking" ? t("loading") : aiReady ? "Gemini 3.8 Flash" : t("aiNotConfigured")}</p>
                  </div>
                  {chat.length > 0 && <button type="button" className="icon-button ai-head-action" onClick={resetChat} aria-label={t("newChat")} title={t("newChat")}><MessageSquarePlus size={15} aria-hidden="true" /></button>}
                </div>
                <div
                  className="ai-scroll"
                  ref={scrollRef}
                  tabIndex={0}
                  role="region"
                  aria-labelledby="ai-panel-title"
                  onScroll={(event) => {
                    const panel = event.currentTarget;
                    stickToBottom.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 120;
                  }}
                >
                  {/* aria-busy holds the announcement until the whole answer has arrived. */}
                  <div className="ai-chat" role="log" aria-live="polite" aria-busy={chatBusy} aria-label={t("aiInventoryTitle")}>
                    {chat.map((message, index) => (
                      <motion.div
                        key={index}
                        className={`chat-msg ${message.role === "user" ? "chat-user" : "chat-assistant"} ${message.status === "error" ? "chat-error" : ""}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, ease: easeOut }}
                      >
                        <span className="sr-only">{message.role === "user" ? t("chatYou") : t("chatAssistant")}: </span>
                        {message.status === "error" ? t(`chatErrors.${message.errorCode}`)
                          : message.status === "streaming" && !message.content ? <span className="chat-typing" aria-label={t("chatWriting")}><i /><i /><i /></span>
                          : message.content}
                        {message.truncated && <small className="chat-note">{t("chatTruncated")}</small>}
                      </motion.div>
                    ))}
                  </div>
                </div>
                <div className="ai-foot">
                  <form className="ai-composer" onSubmit={(event) => { event.preventDefault(); sendChat(chatInput); }}>
                    <input
                      ref={inputRef}
                      type="text"
                      maxLength={4000}
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      placeholder={t("chatPlaceholder")}
                      aria-label={t("chatPlaceholder")}
                      disabled={!aiReady}
                    />
                    {chatBusy ? (
                      <button type="button" className="ai-send" onClick={() => chatAbort.current?.abort()} aria-label={t("chatStop")} title={t("chatStop")}>
                        <Square size={10} fill="currentColor" aria-hidden="true" />
                      </button>
                    ) : (
                      <button type="submit" className="ai-send" disabled={!aiReady || !chatInput.trim()} aria-label={t("chatSend")} title={t("chatSend")}>
                        <SendHorizontal size={13} aria-hidden="true" />
                      </button>
                    )}
                  </form>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
          <button ref={fabRef} type="button" className="ai-fab" aria-expanded={aiOpen} aria-controls={aiOpen ? "ai-panel" : undefined} onClick={() => setAiOpen((open) => !open)}>
            {aiOpen ? <span className="ai-fab-icon"><X size={15} aria-hidden="true" /></span> : <span className={`ai-orb ${chatBusy ? "ai-orb-busy" : ""}`} aria-hidden="true" />}
            {t("aiInventoryTitle")}
          </button>
        </>
      )}
    </>
  );
}

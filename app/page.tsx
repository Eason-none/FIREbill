"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { REVIEW_SYSTEM_PROMPT } from "@/lib/reviewPrompt";

const CATEGORY_LABELS = {
  生存刚需: "生存刚需",
  情绪补偿: "情绪补偿",
  社交认同: "社交认同",
  自我成长: "自我成长",
  克制与战利品: "克制与战利品"
} as const;

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as Category[];
const STORAGE_KEY_ENTRIES = "fire-assistant-entries-v1";
const GOLD_COLOR = "#F59E0B";
const MONTHLY_WORK_HOURS = 21.75 * 8;

type Category = keyof typeof CATEGORY_LABELS;

type ExpenseEntry = {
  id: string;
  description: string;
  amount: number;
  category: Category;
  createdAt: string;
  motiveTag?: string;
  attributeTag?: string;
};

type ChatMessage =
  | { id: string; role: "user" | "assistant"; kind: "text"; text: string }
  | { id: string; role: "assistant"; kind: "entries"; entries: ExpenseEntry[] };

type CategorySummary = Record<Category, number>;
type SpendCategory = Exclude<Category, "克制与战利品">;
type SpendSummary = Record<SpendCategory, number>;
type DashboardMode = "biweekly" | "eightWeek";
type TrendChartMode = "line" | "stackedBar";
type TrendPeriod = {
  label: string;
  start: string;
  end: string;
  summary: CategorySummary;
  unconsciousItems: { name: string; amount: number }[];
};
type EightWeekTrendPayload = {
  coverageDays: number;
  periods: TrendPeriod[];
  overallSummary: SpendSummary;
  trophyTotal: number;
  unconsciousTotal: number;
};
type ReviewDialogueMessage = { role: "user" | "assistant"; content: string };

const SPENDING_CATEGORY_ORDER: SpendCategory[] = ["生存刚需", "情绪补偿", "社交认同", "自我成长"];

const CATEGORY_COLORS: Record<Category, string> = {
  生存刚需: "#607f6f",
  情绪补偿: "#d17b7b",
  社交认同: "#a7c1b0",
  自我成长: "#7d9e8b",
  克制与战利品: GOLD_COLOR
};

type MotiveTag = { id: string; label: string };
type MotiveTagGroup = { title: string; tags: MotiveTag[] };
type AttributeOption = { id: string; label: string; hint: string; category: Category };

const MOTIVE_TAG_GROUPS: MotiveTagGroup[] = [
  {
    title: "补偿与发泄类",
    tags: [
      { id: "stress", label: "😩 压力山大" },
      { id: "tired", label: "🪫 疲惫/回血" },
      { id: "lonely", label: "😶‍🌫️ 孤独/无聊" },
      { id: "crash", label: "😡 情绪崩溃/纯发泄" }
    ]
  },
  {
    title: "愉悦与增益类",
    tags: [
      { id: "celebrate", label: "🎉 开心/庆祝" },
      { id: "hobby", label: "❤️ 为热爱发电" },
      { id: "self-upgrade", label: "✨ 悦己/变好" },
      { id: "curious", label: "💡 尝鲜/好奇" }
    ]
  },
  {
    title: "理性与常规类",
    tags: [
      { id: "routine", label: "🤖 无波无澜/纯刚需" },
      { id: "defensive", label: "🛡️ 防御/囤货" },
      { id: "social", label: "🤝 社交/人情" }
    ]
  }
];

const ALL_MOTIVE_TAGS = MOTIVE_TAG_GROUPS.flatMap((group) => group.tags);

const ATTRIBUTE_OPTIONS: AttributeOption[] = [
  {
    id: "survival",
    label: "生存刚需",
    hint: "基础刚需维持生活",
    category: "生存刚需"
  },
  {
    id: "emotional-compensation",
    label: "情绪补偿",
    hint: "买爽感、缓解压力/焦虑、深夜冲动",
    category: "情绪补偿"
  },
  {
    id: "social-identity",
    label: "社交认同",
    hint: "面子、为了合群、资本家制造的伪需求",
    category: "社交认同"
  },
  {
    id: "self-growth",
    label: "自我成长",
    hint: "对未来赚钱/健康有复利效应的真投资",
    category: "自我成长"
  }
];

const SAVING_TAGS = [
  { id: "resist", label: "🚫 忍住没买" },
  { id: "compare", label: "🧾 比价后放弃" },
  { id: "delay", label: "🛑 延迟购买" },
  { id: "replace", label: "🔁 低成本替代" }
] as const;

function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeCategory(raw: string): Category {
  switch (raw) {
    case "生存底线":
    case "生存刚需":
      return "生存刚需";
    case "情绪无意识消费":
    case "情绪补偿":
      return "情绪补偿";
    case "记忆与体验":
    case "社交认同":
      return "社交认同";
    case "效用与健康投资":
    case "自我成长":
      return "自我成长";
    case "克制与战利品":
      return "克制与战利品";
    default:
      return "社交认同";
  }
}

function formatMoney(value: number): string {
  return `¥${value.toFixed(value % 1 === 0 ? 0 : 1)}`;
}

function toWorkTime(amount: number, hourlyWage: number) {
  if (hourlyWage <= 0) {
    return { hours: 0, minutes: 0 };
  }
  const hours = amount / hourlyWage;
  const minutes = Math.round(hours * 60);
  return { hours, minutes };
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<"chat" | "dashboard" | "fire">("chat");
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>("biweekly");
  const [trendChartMode, setTrendChartMode] = useState<TrendChartMode>("line");
  const [monthlySalary, setMonthlySalary] = useState(9000);
  const [currentSavings, setCurrentSavings] = useState(40000);
  const [monthlyInvest, setMonthlyInvest] = useState(3000);
  const [retireMonthlyExpense, setRetireMonthlyExpense] = useState(3000);
  const [annualReturnRate, setAnnualReturnRate] = useState(1.5);
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [recordMode, setRecordMode] = useState<"expense" | "saving">("expense");
  const [tagAmount, setTagAmount] = useState("");
  const [tagNote, setTagNote] = useState("");
  const [selectedMotiveId, setSelectedMotiveId] = useState("");
  const [selectedAttributeId, setSelectedAttributeId] = useState("");
  const [selectedSavingTagId, setSelectedSavingTagId] = useState("");
  const [hasLoadedEntries, setHasLoadedEntries] = useState(false);
  const [reviewSummary, setReviewSummary] = useState<SpendSummary | null>(null);
  const [biweeklyReviewChat, setBiweeklyReviewChat] = useState<ReviewDialogueMessage[]>([]);
  const [biweeklyReviewDraft, setBiweeklyReviewDraft] = useState("");
  const [aiSystemPrompt, setAiSystemPrompt] = useState(REVIEW_SYSTEM_PROMPT);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [eightWeekReviewChat, setEightWeekReviewChat] = useState<ReviewDialogueMessage[]>([]);
  const [eightWeekReviewDraft, setEightWeekReviewDraft] = useState("");
  const [macroSystemPrompt, setMacroSystemPrompt] = useState("");
  const [macroReviewLoading, setMacroReviewLoading] = useState(false);
  const [macroReviewError, setMacroReviewError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m-hello",
      role: "assistant",
      kind: "text",
      text: "你好，我是 FIRE 助手。现在你可以直接点选标签完成记账。"
    }
  ]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_ENTRIES);
      if (!raw) {
        setEntries([]);
        setHasLoadedEntries(true);
        return;
      }
      const parsed = JSON.parse(raw) as ExpenseEntry[];
      if (Array.isArray(parsed)) {
        const migrated = parsed.map((entry) => ({
          ...entry,
          category: normalizeCategory(String(entry.category || ""))
        }));
        setEntries(migrated);
      } else {
        setEntries([]);
      }
    } catch {
      setEntries([]);
    } finally {
      setHasLoadedEntries(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedEntries) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(entries));
  }, [entries, hasLoadedEntries]);

  const categorySummary = useMemo(() => {
    const base: Record<Category, number> = {
      生存刚需: 0,
      情绪补偿: 0,
      社交认同: 0,
      自我成长: 0,
      克制与战利品: 0
    };
    entries.forEach((entry) => {
      base[entry.category] += entry.amount;
    });
    return base;
  }, [entries]);

  const liveSpendSummary = useMemo(
    () => ({
      生存刚需: categorySummary["生存刚需"],
      情绪补偿: categorySummary["情绪补偿"],
      社交认同: categorySummary["社交认同"],
      自我成长: categorySummary["自我成长"]
    }),
    [categorySummary]
  );

  const activeSummary = reviewSummary ?? liveSpendSummary;
  const unconsciousSpend = activeSummary["情绪补偿"];
  const realHourlyWage = monthlySalary > 0 ? monthlySalary / MONTHLY_WORK_HOURS : 0;
  const unconsciousWorkHours = realHourlyWage > 0 ? unconsciousSpend / realHourlyWage : 0;
  const warningThreshold = 120;

  const pieData = SPENDING_CATEGORY_ORDER.map((category) => ({
    name: category,
    value: Number(activeSummary[category].toFixed(2))
  }));

  const eightWeekTrend = useMemo((): EightWeekTrendPayload => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const periodMs = 14 * dayMs;
    const start = now - 56 * dayMs;

    const inRangeEntries = entries
      .filter((entry) => {
        const t = new Date(entry.createdAt).getTime();
        return t >= start && t <= now;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const periods: TrendPeriod[] = Array.from({ length: 4 }, (_, index) => {
      const periodStart = start + index * periodMs;
      const periodEnd = periodStart + periodMs;
      const summary: CategorySummary = {
        生存刚需: 0,
        情绪补偿: 0,
        社交认同: 0,
        自我成长: 0,
        克制与战利品: 0
      };
      const unconsciousMap = new Map<string, number>();

      inRangeEntries.forEach((entry) => {
        const t = new Date(entry.createdAt).getTime();
        const inPeriod = t >= periodStart && (index === 3 ? t <= now : t < periodEnd);
        if (!inPeriod) {
          return;
        }
        summary[entry.category] += entry.amount;
        if (entry.category === "情绪补偿") {
          unconsciousMap.set(entry.description, (unconsciousMap.get(entry.description) || 0) + entry.amount);
        }
      });

      const unconsciousItems = Array.from(unconsciousMap.entries())
        .map(([name, amount]) => ({ name, amount: Number(amount.toFixed(2)) }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      return {
        label: `周期${index + 1}`,
        start: new Date(periodStart).toISOString(),
        end: new Date(index === 3 ? now : periodEnd).toISOString(),
        summary,
        unconsciousItems
      };
    });

    const overallSummary: SpendSummary = {
      生存刚需: 0,
      情绪补偿: 0,
      社交认同: 0,
      自我成长: 0
    };
    let trophyTotal = 0;
    let unconsciousTotal = 0;

    periods.forEach((period) => {
      overallSummary["生存刚需"] += period.summary["生存刚需"];
      overallSummary["情绪补偿"] += period.summary["情绪补偿"];
      overallSummary["社交认同"] += period.summary["社交认同"];
      overallSummary["自我成长"] += period.summary["自我成长"];
      trophyTotal += period.summary["克制与战利品"];
      unconsciousTotal += period.summary["情绪补偿"];
    });

    const oldestEntryTime =
      inRangeEntries.length > 0 ? new Date(inRangeEntries[0].createdAt).getTime() : now;
    const coverageDays = Math.max(0, Math.min(56, Math.ceil((now - oldestEntryTime) / dayMs)));

    return {
      coverageDays,
      periods,
      overallSummary,
      trophyTotal: Number(trophyTotal.toFixed(2)),
      unconsciousTotal: Number(unconsciousTotal.toFixed(2))
    };
  }, [entries]);

  const eightWeekPieData = SPENDING_CATEGORY_ORDER.map((category) => ({
    name: category,
    value: Number(eightWeekTrend.overallSummary[category].toFixed(2))
  }));

  const biweeklyTrophyEffort = useMemo(() => {
    const now = Date.now();
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    return entries
      .filter((entry) => now - new Date(entry.createdAt).getTime() <= twoWeeksMs)
      .filter((entry) => entry.category === "克制与战利品")
      .reduce((sum, entry) => sum + entry.amount, 0);
  }, [entries]);

  const eightWeekTrendData = eightWeekTrend.periods.map((period) => ({
    period: period.label,
    unconscious: Number(period.summary["情绪补偿"].toFixed(2)),
    trophy: Number(period.summary["克制与战利品"].toFixed(2))
  }));

  const fireProjection = useMemo(() => {
    const target = (retireMonthlyExpense * 12) / 0.04;
    const monthlyRate = Math.min(Math.max(annualReturnRate, 0), 5) / 100 / 12;
    const monthlyContribution = Math.max(monthlyInvest, 0);
    const maxMonths = 1200;

    let baseAsset = Math.max(currentSavings, 0);
    let months = 0;

    const series = [
      {
        year: 0,
        baseAsset: Number(baseAsset.toFixed(2)),
        totalAsset: Number(baseAsset.toFixed(2))
      }
    ];

    while (months < maxMonths && baseAsset < target) {
      baseAsset = (baseAsset + monthlyContribution) * (1 + monthlyRate);
      months += 1;

      if (months % 12 === 0 || baseAsset >= target) {
        series.push({
          year: Number((months / 12).toFixed(1)),
          baseAsset: Number(baseAsset.toFixed(2)),
          totalAsset: Number(baseAsset.toFixed(2))
        });
      }
    }

    return {
      target,
      yearsToFire: Number((months / 12).toFixed(1)),
      finalAsset: baseAsset,
      chartData: series
    };
  }, [annualReturnRate, currentSavings, monthlyInvest, retireMonthlyExpense]);

  const currentReach = currentSavings;
  const fireProgress = fireProjection.target > 0 ? Math.min(100, (currentReach / fireProjection.target) * 100) : 0;
  const selectedMotive = ALL_MOTIVE_TAGS.find((tag) => tag.id === selectedMotiveId);
  const selectedAttribute = ATTRIBUTE_OPTIONS.find((option) => option.id === selectedAttributeId);
  const selectedSavingTag = SAVING_TAGS.find((tag) => tag.id === selectedSavingTagId);

  function pushTextMessage(role: "user" | "assistant", text: string) {
    setMessages((prev) => [...prev, { id: buildId("msg"), role, kind: "text", text }]);
  }

  function commitEntriesWithFeedback(newEntries: ExpenseEntry[], userMessage?: string) {
    if (userMessage) {
      pushTextMessage("user", userMessage);
    }

    setEntries((prev) => [...prev, ...newEntries]);
    setMessages((prev) => [...prev, { id: buildId("card"), role: "assistant", kind: "entries", entries: newEntries }]);

    const emotionalItems = newEntries.filter((entry) => entry.category === "情绪补偿");
    const trophyItems = newEntries.filter((entry) => entry.category === "克制与战利品");

    if (trophyItems.length > 0) {
      const trophySum = trophyItems.reduce((sum, item) => sum + item.amount, 0);
      pushTextMessage(
        "assistant",
        `🌟 太棒了！省下的 ${formatMoney(trophySum)} 是你赎回自由身的努力值，已记录在复盘里。`
      );
    }

    if (emotionalItems.length > 0) {
      emotionalItems.forEach((item) => {
        const work = toWorkTime(item.amount, realHourlyWage);
        pushTextMessage(
          "assistant",
          `这笔 ${item.amount} 元的消费，相当于你多工作了 ${work.hours.toFixed(2)} 小时（约 ${work.minutes} 分钟）。`
        );
      });
      return;
    }

    pushTextMessage("assistant", "记账成功，已同步到双周复盘面板。");
  }

  function updateEntryCategory(entryId: string, category: Category) {
    setEntries((prev) => prev.map((entry) => (entry.id === entryId ? { ...entry, category } : entry)));
  }

  function formatEntryTimestamp(iso: string) {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  }

  function buildBiWeeklySummary(): SpendSummary {
    const now = Date.now();
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    const base: SpendSummary = {
      生存刚需: 0,
      情绪补偿: 0,
      社交认同: 0,
      自我成长: 0
    };
    entries
      .filter((entry) => now - new Date(entry.createdAt).getTime() <= twoWeeksMs)
      .forEach((entry) => {
        if (entry.category === "克制与战利品") {
          return;
        }
        base[entry.category] += entry.amount;
      });

    setReviewSummary(base);
    return base;
  }

  async function generateBiWeeklyReview() {
    const summary = buildBiWeeklySummary();
    setReviewError("");
    setReviewLoading(true);

    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "biweekly",
          summary,
          monthlySalary
        })
      });

      const data = (await response.json()) as { report?: string; error?: string; systemPrompt?: string };
      if (!response.ok || !data.report) {
        throw new Error(data.error || "复盘接口返回异常");
      }

      setBiweeklyReviewChat([{ role: "assistant", content: data.report }]);
      setAiSystemPrompt(data.systemPrompt || REVIEW_SYSTEM_PROMPT);
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成失败，请稍后重试。";
      setReviewError(message);
    } finally {
      setReviewLoading(false);
    }
  }

  async function sendBiweeklyFollowUp(event: FormEvent) {
    event.preventDefault();
    const input = biweeklyReviewDraft.trim();
    if (!input || reviewLoading) {
      return;
    }
    const summary = reviewSummary ?? buildBiWeeklySummary();
    const conversation = biweeklyReviewChat;
    setBiweeklyReviewDraft("");
    setReviewError("");
    setReviewLoading(true);

    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "biweekly",
          summary,
          monthlySalary,
          conversation,
          followUp: input
        })
      });

      const data = (await response.json()) as { report?: string; error?: string; systemPrompt?: string };
      if (!response.ok || !data.report) {
        throw new Error(data.error || "追问接口返回异常");
      }
      setBiweeklyReviewChat((prev) => [...prev, { role: "user", content: input }, { role: "assistant", content: data.report! }]);
      setAiSystemPrompt(data.systemPrompt || REVIEW_SYSTEM_PROMPT);
    } catch (error) {
      const message = error instanceof Error ? error.message : "发送失败，请稍后重试。";
      setReviewError(message);
      setBiweeklyReviewDraft(input);
    } finally {
      setReviewLoading(false);
    }
  }

  async function generateEightWeekReview() {
    setMacroReviewError("");
    setMacroReviewLoading(true);

    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "eightWeek",
          summary: eightWeekTrend.overallSummary,
          trend: eightWeekTrend,
          monthlySalary
        })
      });

      const data = (await response.json()) as { report?: string; error?: string; systemPrompt?: string };
      if (!response.ok || !data.report) {
        throw new Error(data.error || "8周复盘接口返回异常");
      }
      setEightWeekReviewChat([{ role: "assistant", content: data.report }]);
      setMacroSystemPrompt(data.systemPrompt || "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成失败，请稍后重试。";
      setMacroReviewError(message);
    } finally {
      setMacroReviewLoading(false);
    }
  }

  async function sendEightWeekFollowUp(event: FormEvent) {
    event.preventDefault();
    const input = eightWeekReviewDraft.trim();
    if (!input || macroReviewLoading) {
      return;
    }

    const conversation = eightWeekReviewChat;
    setEightWeekReviewDraft("");
    setMacroReviewError("");
    setMacroReviewLoading(true);

    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "eightWeek",
          summary: eightWeekTrend.overallSummary,
          trend: eightWeekTrend,
          monthlySalary,
          conversation,
          followUp: input
        })
      });

      const data = (await response.json()) as { report?: string; error?: string; systemPrompt?: string };
      if (!response.ok || !data.report) {
        throw new Error(data.error || "8周追问接口返回异常");
      }
      setEightWeekReviewChat((prev) => [...prev, { role: "user", content: input }, { role: "assistant", content: data.report! }]);
      setMacroSystemPrompt(data.systemPrompt || "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "发送失败，请稍后重试。";
      setMacroReviewError(message);
      setEightWeekReviewDraft(input);
    } finally {
      setMacroReviewLoading(false);
    }
  }

  function handleTagSubmit(event: FormEvent) {
    event.preventDefault();
    if (recordMode === "expense" && !selectedMotive) {
      pushTextMessage("assistant", "请先选择第一轮动机标签。");
      return;
    }
    if (recordMode === "expense" && !selectedAttribute) {
      pushTextMessage("assistant", "请完成第二轮心理属性选择。");
      return;
    }
    if (recordMode === "saving" && !selectedSavingTag) {
      pushTextMessage("assistant", "请先选择一个省钱标签。");
      return;
    }

    const amount = Number(tagAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      pushTextMessage("assistant", "请输入有效金额。");
      return;
    }

    const timestamp = new Date().toISOString();
    const finalCategory = recordMode === "saving" ? "克制与战利品" : selectedAttribute!.category;
    const finalAttributeTag = recordMode === "saving" ? selectedSavingTag!.label : selectedAttribute!.label;
    const motiveLabel = recordMode === "saving" ? undefined : selectedMotive!.label;
    const description = tagNote.trim() || `${motiveLabel ? `${motiveLabel} · ` : ""}${finalAttributeTag}`;
    const taggedEntry: ExpenseEntry = {
      id: buildId("tag-entry"),
      description,
      amount,
      category: finalCategory,
      createdAt: timestamp,
      motiveTag: motiveLabel,
      attributeTag: finalAttributeTag
    };

    const userMessage =
      recordMode === "saving"
        ? `省钱记录：${finalAttributeTag} / ${formatMoney(amount)}`
        : `标签记账：${motiveLabel} / ${finalAttributeTag} / ${formatMoney(amount)}`;
    commitEntriesWithFeedback([taggedEntry], userMessage);
    setTagAmount("");
    setTagNote("");
    setSelectedMotiveId("");
    setSelectedAttributeId("");
    setSelectedSavingTagId("");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 text-sage-900 sm:px-6">
      <section className="mb-5 rounded-2xl border border-sage-200 bg-white/80 p-4 shadow-sm backdrop-blur">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">FIRE 助手</h1>
          <p className="text-sm text-sage-600">对话记账 + 双周复盘 + FIRE 目标计算（移动端优先）</p>
        </div>
      </section>

      <section className="mb-5 grid grid-cols-3 gap-2 rounded-xl bg-sage-100 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
            activeTab === "chat" ? "bg-white text-sage-800 shadow-sm" : "text-sage-600"
          }`}
        >
          对话式记账
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("dashboard")}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
            activeTab === "dashboard" ? "bg-white text-sage-800 shadow-sm" : "text-sage-600"
          }`}
        >
          双周复盘
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("fire")}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
            activeTab === "fire" ? "bg-white text-sage-800 shadow-sm" : "text-sage-600"
          }`}
        >
          FIRE 目标
        </button>
      </section>

      {activeTab === "chat" ? (
        <section className="flex min-h-[68vh] flex-col rounded-2xl border border-sage-200 bg-white">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message) => {
              if (message.kind === "entries") {
                return (
                  <div key={message.id} className="max-w-[90%] rounded-2xl border border-sage-200 bg-sage-50 p-3 text-sm">
                    <p className="mb-2 font-medium text-sage-800">已为你记录以下账目：</p>
                    <div className="space-y-2">
                      {message.entries.map((entry) => (
                        <article key={entry.id} className="rounded-xl border border-sage-200 bg-white p-3">
                          <div className="flex items-center justify-between">
                            <h3 className="font-medium">{entry.description}</h3>
                            <span className="text-sage-700">{formatMoney(entry.amount)}</span>
                          </div>
                          <p className="mt-1 text-xs text-sage-600">归类：{entry.category}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                );
              }

              const isUser = message.role === "user";
              return (
                <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[90%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                      isUser ? "bg-sage-600 text-white" : "border border-sage-200 bg-sage-50 text-sage-800"
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleTagSubmit} className="border-t border-sage-200 p-3">
            <h2 className="mb-2 text-sm font-medium text-sage-700">标签记账（两轮选择）</h2>
            <div className="space-y-3 rounded-xl border border-sage-200 bg-sage-50 p-3">
              <div className="grid w-full max-w-xs grid-cols-2 gap-2 rounded-xl bg-sage-100 p-1">
                <button
                  type="button"
                  onClick={() => setRecordMode("expense")}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                    recordMode === "expense" ? "bg-white text-sage-800 shadow-sm" : "text-sage-600"
                  }`}
                >
                  消费记账
                </button>
                <button
                  type="button"
                  onClick={() => setRecordMode("saving")}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                    recordMode === "saving" ? "bg-white text-sage-800 shadow-sm" : "text-sage-600"
                  }`}
                >
                  省钱记录
                </button>
              </div>

              {recordMode === "expense" && (
                <div>
                  <p className="mb-2 text-xs font-medium text-sage-700">第一轮：购买时的心情/动机</p>
                  <div className="space-y-2">
                    {MOTIVE_TAG_GROUPS.map((group) => (
                      <div key={group.title}>
                        <p className="mb-1 text-xs text-sage-500">{group.title}</p>
                        <div className="flex flex-wrap gap-2">
                          {group.tags.map((tag) => {
                            const active = selectedMotiveId === tag.id;
                            return (
                              <label
                                key={tag.id}
                                className={`cursor-pointer select-none rounded-full border px-3 py-1 text-xs transition ${
                                  active
                                    ? "border-sage-600 bg-sage-600 text-white"
                                    : "border-sage-300 bg-white text-sage-700 hover:border-sage-400"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="motiveTag"
                                  value={tag.id}
                                  checked={active}
                                  onChange={() => setSelectedMotiveId(tag.id)}
                                  className="sr-only"
                                />
                                {tag.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {recordMode === "expense" ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-sage-700">第二轮：购买东西的心理属性</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {ATTRIBUTE_OPTIONS.map((option) => {
                      const active = selectedAttributeId === option.id;
                      return (
                        <label
                          key={option.id}
                          className={`cursor-pointer select-none rounded-xl border px-3 py-2 text-left transition ${
                            active
                              ? "border-sage-600 bg-white text-sage-900"
                              : "border-sage-300 bg-white text-sage-700 hover:border-sage-400"
                          }`}
                        >
                          <input
                            type="radio"
                            name="attributeTag"
                            value={option.id}
                            checked={active}
                            onChange={() => setSelectedAttributeId(option.id)}
                            className="sr-only"
                          />
                          <p className="text-xs font-medium">{option.label}</p>
                          <p className="mt-1 text-[11px] text-sage-500">{option.hint}</p>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-xs font-medium text-sage-700">第二轮：省钱标签（单独记录克制努力）</p>
                  <div className="flex flex-wrap gap-2">
                    {SAVING_TAGS.map((tag) => {
                      const active = selectedSavingTagId === tag.id;
                      return (
                        <label
                          key={tag.id}
                          className={`cursor-pointer select-none rounded-full border px-3 py-1 text-xs transition ${
                            active
                              ? "border-amber-500 bg-amber-500 text-white"
                              : "border-amber-300 bg-white text-amber-700 hover:border-amber-400"
                          }`}
                        >
                          <input
                            type="radio"
                            name="savingTag"
                            value={tag.id}
                            checked={active}
                            onChange={() => setSelectedSavingTagId(tag.id)}
                            className="sr-only"
                          />
                          {tag.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-sage-200 bg-white px-3 py-2 text-xs text-sage-700">
                已选中：
                {recordMode === "expense" ? (
                  <>
                    <span className="ml-1 font-medium text-sage-800">
                      {selectedMotive ? selectedMotive.label : "（第一轮未选择）"}
                    </span>
                    {" / "}
                    <span className="font-medium text-sage-800">
                      {selectedAttribute ? selectedAttribute.label : "（第二轮未选择）"}
                    </span>
                  </>
                ) : (
                  <span className="ml-1 font-medium text-sage-800">
                    {selectedSavingTag ? `${selectedSavingTag.label}（克制与战利品）` : "（省钱标签未选择）"}
                  </span>
                )}
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={tagAmount}
                  onChange={(event) => setTagAmount(event.target.value)}
                  placeholder={recordMode === "saving" ? "本次克制金额（元）" : "金额（元）"}
                  className="rounded-xl border border-sage-300 bg-white px-3 py-2 text-sm outline-none ring-sage-300 transition focus:ring-2"
                />
                <input
                  type="text"
                  value={tagNote}
                  onChange={(event) => setTagNote(event.target.value)}
                  placeholder="备注（可选，不填将自动生成）"
                  className="md:col-span-2 rounded-xl border border-sage-300 bg-white px-3 py-2 text-sm outline-none ring-sage-300 transition focus:ring-2"
                />
              </div>
              <button
                type="submit"
                className="rounded-xl bg-sage-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-sage-800"
              >
                {recordMode === "expense" ? "标签记账" : "记录省钱努力"}
              </button>
            </div>
          </form>

          <div className="border-t border-sage-200 p-3">
            <h2 className="mb-2 text-sm font-medium text-sage-700">记账历史（可手动改分类）</h2>
            <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
              {[...entries]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((entry) => (
                  <article key={entry.id} className="rounded-xl border border-sage-200 bg-sage-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-sage-900">{entry.description}</p>
                        <p className="text-xs text-sage-600">{formatEntryTimestamp(entry.createdAt)}</p>
                      </div>
                      <span className="text-sm font-medium text-sage-800">{formatMoney(entry.amount)}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-sage-600">归类：</span>
                      <select
                        value={entry.category}
                        onChange={(event) => updateEntryCategory(entry.id, event.target.value as Category)}
                        className="rounded-lg border border-sage-300 bg-white px-2 py-1 text-xs text-sage-800 outline-none ring-sage-300 focus:ring-2"
                      >
                        {CATEGORY_ORDER.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </div>
                    {(entry.motiveTag || entry.attributeTag) && (
                      <p className="mt-2 text-[11px] text-sage-500">
                        标签：{entry.motiveTag || "—"} / {entry.attributeTag || "—"}
                      </p>
                    )}
                  </article>
                ))}
            </div>
          </div>
        </section>
      ) : activeTab === "dashboard" ? (
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-sage-100 p-1">
            <button
              type="button"
              onClick={() => setDashboardMode("biweekly")}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                dashboardMode === "biweekly" ? "bg-white text-sage-800 shadow-sm" : "text-sage-600"
              }`}
            >
              近14天双周复盘
            </button>
            <button
              type="button"
              onClick={() => setDashboardMode("eightWeek")}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                dashboardMode === "eightWeek" ? "bg-white text-sage-800 shadow-sm" : "text-sage-600"
              }`}
            >
              近8周深度趋势复盘
            </button>
          </div>

          <div className="rounded-2xl border border-sage-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-sage-600">
                  {dashboardMode === "biweekly" ? "时间负债（近 14 天）" : "8周趋势总览（56 天）"}
                </p>
                {dashboardMode === "biweekly" ? (
                  <>
                    <p className="text-3xl font-semibold text-sage-700">{unconsciousWorkHours.toFixed(2)} h</p>
                    <p className="mt-2 text-sm text-amber-700">
                      🌟 克制努力（近14天，不计入资产）：{formatMoney(biweeklyTrophyEffort)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-semibold text-sage-700">{formatMoney(eightWeekTrend.unconsciousTotal)}</p>
                    <p className="mt-2 text-sm text-amber-700">
                      🌟 8周克制努力（不计入资产）：{formatMoney(eightWeekTrend.trophyTotal)}
                    </p>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={dashboardMode === "biweekly" ? generateBiWeeklyReview : generateEightWeekReview}
                disabled={dashboardMode === "biweekly" ? reviewLoading : macroReviewLoading}
                className="rounded-xl bg-sage-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-sage-800"
              >
                {dashboardMode === "biweekly"
                  ? reviewLoading
                    ? "生成中..."
                    : "生成双周复盘"
                  : macroReviewLoading
                    ? "生成中..."
                    : "生成8周复盘报告"}
              </button>
            </div>
            {dashboardMode === "biweekly" ? (
              reviewSummary === null ? (
                <p className="mt-3 rounded-xl border border-sage-200 bg-sage-50 px-3 py-2 text-sm text-sage-700">
                  点击“生成双周复盘图表”后，将基于近 14 天账单计算时间负债、克制努力与分类图表。
                </p>
              ) : unconsciousSpend > warningThreshold ? (
                <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  ⚠️ 本周期情绪补偿消费 {formatMoney(unconsciousSpend)}，意味着你多上了 {unconsciousWorkHours.toFixed(2)} 小时的班。
                </p>
              ) : (
                <p className="mt-3 rounded-xl border border-sage-200 bg-sage-50 px-3 py-2 text-sm text-sage-700">
                  本周期情绪补偿消费 {formatMoney(unconsciousSpend)}，继续保持觉察节奏。
                </p>
              )
            ) : (
              <p className="mt-3 rounded-xl border border-sage-200 bg-sage-50 px-3 py-2 text-sm text-sage-700">
                {eightWeekTrend.coverageDays < 56
                  ? `数据积累中：当前仅覆盖约 ${eightWeekTrend.coverageDays} 天，满 56 天后趋势判断会更稳定。`
                  : "已覆盖完整 56 天趋势窗口，可用于深度模式诊断。"}
              </p>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-sage-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-medium text-sage-700">
                {dashboardMode === "biweekly" ? "四大分类占比（饼图）" : "过去56天四大分类总体占比（饼图）"}
              </h2>
              <div className="overflow-x-auto">
                <PieChart width={380} height={260}>
                  <Pie
                    data={dashboardMode === "biweekly" ? pieData : eightWeekPieData}
                    dataKey="value"
                    nameKey="name"
                    cx={140}
                    cy={120}
                    outerRadius={86}
                  >
                    {(dashboardMode === "biweekly" ? pieData : eightWeekPieData).map((item) => (
                      <Cell key={item.name} fill={CATEGORY_COLORS[item.name as Category]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatMoney(Number(value))} />
                  <Legend layout="vertical" align="right" verticalAlign="middle" />
                </PieChart>
              </div>
            </div>

            <div className="rounded-2xl border border-sage-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-medium text-sage-700">
                {dashboardMode === "biweekly" ? "四大分类金额（柱状图）" : "4个双周周期趋势图（情绪补偿 vs 克制努力）"}
              </h2>
              {dashboardMode === "eightWeek" && (
                <div className="mb-3 grid w-full max-w-xs grid-cols-2 gap-2 rounded-xl bg-sage-100 p-1">
                  <button
                    type="button"
                    onClick={() => setTrendChartMode("line")}
                    className={`rounded-lg px-2 py-1 text-xs font-medium transition ${
                      trendChartMode === "line" ? "bg-white text-sage-800 shadow-sm" : "text-sage-600"
                    }`}
                  >
                    LineChart
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrendChartMode("stackedBar")}
                    className={`rounded-lg px-2 py-1 text-xs font-medium transition ${
                      trendChartMode === "stackedBar" ? "bg-white text-sage-800 shadow-sm" : "text-sage-600"
                    }`}
                  >
                    Stacked BarChart
                  </button>
                </div>
              )}
              <div className="overflow-x-auto">
                {dashboardMode === "biweekly" ? (
                  <BarChart width={420} height={260} data={pieData}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number) => formatMoney(Number(value))} />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {pieData.map((item) => (
                        <Cell key={item.name} fill={CATEGORY_COLORS[item.name as Category]} />
                      ))}
                    </Bar>
                    <Legend />
                  </BarChart>
                ) : trendChartMode === "line" ? (
                  <LineChart width={460} height={260} data={eightWeekTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d6e2da" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatMoney(Number(value))} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="unconscious"
                      stroke={CATEGORY_COLORS["情绪补偿"]}
                      strokeWidth={3}
                      name="情绪补偿"
                    />
                    <Line
                      type="monotone"
                      dataKey="trophy"
                      stroke={CATEGORY_COLORS["克制与战利品"]}
                      strokeWidth={3}
                      name="克制与战利品"
                    />
                  </LineChart>
                ) : (
                  <BarChart width={460} height={260} data={eightWeekTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d6e2da" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatMoney(Number(value))} />
                    <Legend />
                    <Bar
                      dataKey="unconscious"
                      stackId="trend"
                      fill={CATEGORY_COLORS["情绪补偿"]}
                      name="情绪补偿"
                    />
                    <Bar
                      dataKey="trophy"
                      stackId="trend"
                      fill={CATEGORY_COLORS["克制与战利品"]}
                      name="克制与战利品"
                    />
                  </BarChart>
                )}
              </div>
            </div>
          </div>

          {dashboardMode === "eightWeek" && (
            <div className="rounded-2xl border border-sage-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-medium text-sage-700">8周高频情绪补偿明细（按周期）</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {eightWeekTrend.periods.map((period) => (
                  <div key={period.label} className="rounded-xl border border-sage-200 bg-sage-50 p-3">
                    <p className="text-sm font-medium text-sage-800">{period.label}</p>
                    {period.unconsciousItems.length === 0 ? (
                      <p className="mt-1 text-xs text-sage-500">无情绪补偿记录</p>
                    ) : (
                      <ul className="mt-1 space-y-1 text-xs text-sage-700">
                        {period.unconsciousItems.map((item) => (
                          <li key={`${period.label}-${item.name}`}>{item.name}：{formatMoney(item.amount)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-sage-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-medium text-sage-700">
              {dashboardMode === "biweekly" ? "AI 双周复盘点评" : "AI 8周趋势深度复盘"}
            </h2>
            {dashboardMode === "biweekly" ? (
              <>
                {reviewLoading && biweeklyReviewChat.length === 0 ? (
                  <p className="text-sm text-sage-600">AI 正在分析你的双周账单与时间负债...</p>
                ) : biweeklyReviewChat.length > 0 ? (
                  <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-sage-200 bg-sage-50 p-3">
                    {biweeklyReviewChat.map((msg, index) => (
                      <div key={`${msg.role}-${index}`} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[92%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm leading-6 ${
                            msg.role === "user"
                              ? "bg-sage-700 text-white"
                              : "border border-sage-200 bg-white text-sage-800"
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-sage-600">点击上方“生成双周复盘”后，AI 会输出个性化复盘报告。</p>
                )}
                {reviewError ? <p className="mt-2 text-sm text-red-600">复盘生成失败：{reviewError}</p> : null}
                <form onSubmit={sendBiweeklyFollowUp} className="mt-3 flex gap-2">
                  <input
                    value={biweeklyReviewDraft}
                    onChange={(event) => setBiweeklyReviewDraft(event.target.value)}
                    placeholder="继续追问：例如“为什么我总在晚上情绪补偿？”"
                    className="flex-1 rounded-xl border border-sage-300 bg-white px-3 py-2 text-sm outline-none ring-sage-300 transition focus:ring-2"
                  />
                  <button
                    type="submit"
                    disabled={reviewLoading || biweeklyReviewChat.length === 0}
                    className="rounded-xl bg-sage-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    发送
                  </button>
                </form>
              </>
            ) : (
              <>
                {macroReviewLoading && eightWeekReviewChat.length === 0 ? (
                  <p className="text-sm text-sage-600">AI 正在分析你的 8 周行为趋势...</p>
                ) : eightWeekReviewChat.length > 0 ? (
                  <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-sage-200 bg-sage-50 p-3">
                    {eightWeekReviewChat.map((msg, index) => (
                      <div key={`${msg.role}-${index}`} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[92%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm leading-6 ${
                            msg.role === "user"
                              ? "bg-sage-700 text-white"
                              : "border border-sage-200 bg-white text-sage-800"
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-sage-600">点击上方“生成8周复盘报告”后，AI 会输出趋势级复盘报告。</p>
                )}
                {macroReviewError ? <p className="mt-2 text-sm text-red-600">8周复盘生成失败：{macroReviewError}</p> : null}
                <form onSubmit={sendEightWeekFollowUp} className="mt-3 flex gap-2">
                  <input
                    value={eightWeekReviewDraft}
                    onChange={(event) => setEightWeekReviewDraft(event.target.value)}
                    placeholder="继续追问：例如“我最该先改哪一条系统？”"
                    className="flex-1 rounded-xl border border-sage-300 bg-white px-3 py-2 text-sm outline-none ring-sage-300 transition focus:ring-2"
                  />
                  <button
                    type="submit"
                    disabled={macroReviewLoading || eightWeekReviewChat.length === 0}
                    className="rounded-xl bg-sage-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    发送
                  </button>
                </form>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-sage-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-medium text-sage-700">当前调用的 AI System Prompt</h2>
            <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl bg-sage-50 p-3 text-xs leading-6 text-sage-700">
              {dashboardMode === "biweekly" ? aiSystemPrompt : macroSystemPrompt || "尚未调用8周复盘接口。"}
            </pre>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <div className="rounded-2xl border border-sage-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-medium text-sage-700">FIRE 参数设置</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-sage-700">真实月薪（元/月）</span>
                <input
                  type="number"
                  min={1}
                  value={monthlySalary}
                  onChange={(event) => setMonthlySalary(Number(event.target.value) || 0)}
                  className="rounded-lg border border-sage-300 bg-sage-50 px-3 py-1.5 outline-none ring-sage-300 transition focus:ring-2"
                />
                <span className="text-xs text-sage-500">自动换算时薪：{realHourlyWage.toFixed(2)} 元/小时</span>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-sage-700">当前已有存款总额</span>
                <input
                  type="number"
                  min={0}
                  value={currentSavings}
                  onChange={(event) => setCurrentSavings(Math.max(Number(event.target.value) || 0, 0))}
                  className="rounded-lg border border-sage-300 bg-sage-50 px-3 py-1.5 outline-none ring-sage-300 transition focus:ring-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-sage-700">计划每月定投/结余</span>
                <input
                  type="number"
                  min={0}
                  value={monthlyInvest}
                  onChange={(event) => setMonthlyInvest(Math.max(Number(event.target.value) || 0, 0))}
                  className="rounded-lg border border-sage-300 bg-sage-50 px-3 py-1.5 outline-none ring-sage-300 transition focus:ring-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-sage-700">退休后预期月支出</span>
                <input
                  type="number"
                  min={0}
                  value={retireMonthlyExpense}
                  onChange={(event) => setRetireMonthlyExpense(Math.max(Number(event.target.value) || 0, 0))}
                  className="rounded-lg border border-sage-300 bg-sage-50 px-3 py-1.5 outline-none ring-sage-300 transition focus:ring-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2 xl:col-span-2">
                <span className="text-sage-700">投资年化收益率（%）</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={annualReturnRate}
                  onChange={(event) => {
                    const value = Number(event.target.value) || 0;
                    setAnnualReturnRate(Math.min(Math.max(value, 0), 5));
                  }}
                  className="rounded-lg border border-sage-300 bg-sage-50 px-3 py-1.5 outline-none ring-sage-300 transition focus:ring-2"
                />
                <span className="text-xs text-sage-500">
                  建议以 2%~3% 的低风险稳健理财（如国债、货币基金、储蓄险）为测算基准。FIRE 的核心是安心，而非承担高收益伴随的高风险。
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-sage-200 bg-white p-4">
            <p className="text-sm text-sage-600">
              距离 FIRE 目标 <span className="font-semibold text-sage-800">{formatMoney(fireProjection.target)}</span>，
              按当前稳健收益预计还需{" "}
              <span className="font-semibold text-sage-800">{fireProjection.yearsToFire} 年</span>
            </p>
            <p className="mt-1 text-xs text-sage-500">
              当前资产仅按本金与定投复利测算：{formatMoney(currentReach)}（战利品用于记录克制努力，不计入资产）
            </p>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-sage-100">
              <div
                className="h-full rounded-full bg-sage-600 transition-all"
                style={{ width: `${Math.max(2, fireProgress)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-sage-600">目标进度：{fireProgress.toFixed(1)}%</p>
          </div>

          <div className="rounded-2xl border border-sage-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-medium text-sage-700">复利增长面积图</h2>
            <div className="overflow-x-auto">
              <AreaChart width={860} height={300} data={fireProjection.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d6e2da" />
                <XAxis dataKey="year" label={{ value: "年份", position: "insideBottom", offset: -4 }} />
                <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                <Tooltip formatter={(value: number) => formatMoney(Number(value))} />
                <Legend />
                <ReferenceLine
                  y={fireProjection.target}
                  label={{ value: "FIRE 自由线", fill: "#8b4a00", fontSize: 12 }}
                  stroke="#b45309"
                  strokeDasharray="6 3"
                />
                <Area
                  type="monotone"
                  dataKey="baseAsset"
                  stroke="#4d685b"
                  fill="#93ad9f"
                  name="本金+定投复利"
                />
              </AreaChart>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

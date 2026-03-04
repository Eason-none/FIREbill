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
const GOLD_COLOR = "#c4b590";
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
  realityTag?: string;
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
  生存刚需: "#a8a29e",
  情绪补偿: "#c4a0a0",
  社交认同: "#a0b0a0",
  自我成长: "#94a3b8",
  克制与战利品: GOLD_COLOR
};

type MotiveTag = { id: string; label: string };
type MotiveTagGroup = { title: string; tags: MotiveTag[] };
type AttributeOption = { id: string; label: string; hint: string; category: Category };
type RealityTag = { id: string; label: string };
type RealityTagGroup = { title: string; tags: RealityTag[] };

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
  { id: "survival", label: "生存刚需", hint: "基础刚需维持生活", category: "生存刚需" },
  { id: "emotional-compensation", label: "情绪补偿", hint: "买爽感、缓解压力/焦虑、深夜冲动", category: "情绪补偿" },
  { id: "social-identity", label: "社交认同", hint: "面子、为了合群、资本家制造的伪需求", category: "社交认同" },
  { id: "self-growth", label: "自我成长", hint: "对未来赚钱/健康有复利效应的真投资", category: "自我成长" }
];

const SAVING_TAGS = [
  { id: "resist", label: "🚫 忍住没买" },
  { id: "compare", label: "🧾 比价后放弃" },
  { id: "delay", label: "🛑 延迟购买" },
  { id: "replace", label: "🔁 低成本替代" }
] as const;

const REALITY_TAG_GROUPS: RealityTagGroup[] = [
  {
    title: "日常与居家",
    tags: [
      { id: "food-daily", label: "🍽️ 餐饮/日用/蔬果" },
      { id: "home-rent", label: "🏠 住房/居家" },
      { id: "transport-commute", label: "🚇 交通/通勤" },
      { id: "work-study", label: "💼 办公/学习" }
    ]
  },
  {
    title: "社交与家庭",
    tags: [
      { id: "social-gift", label: "🎁 礼金/礼物/人情社交" },
      { id: "family-child", label: "👨‍👩‍👧 亲友/孩子/宠物" },
      { id: "fashion-beauty", label: "👕 服饰/美容" }
    ]
  },
  {
    title: "体验与提升",
    tags: [
      { id: "travel-entertainment", label: "✈️ 旅行/娱乐" },
      { id: "sports-healthcare", label: "🏃 运动/医疗健康" },
      { id: "digital-hobby", label: "📱 数码/兴趣消费" },
      { id: "service-repair", label: "🛠️ 维修/服务杂项" }
    ]
  }
];

const ALL_REALITY_TAGS = REALITY_TAG_GROUPS.flatMap((group) => group.tags);

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
  const [selectedRealityId, setSelectedRealityId] = useState("");
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
  const [viewportWidth, setViewportWidth] = useState(390);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m-hello",
      role: "assistant",
      kind: "text",
      text: "选择标签开始记录。"
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

  useEffect(() => {
    const updateViewport = () => setViewportWidth(window.innerWidth);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

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
  const selectedReality = ALL_REALITY_TAGS.find((tag) => tag.id === selectedRealityId);
  const selectedSavingTag = SAVING_TAGS.find((tag) => tag.id === selectedSavingTagId);
  const chartWidth = Math.max(260, Math.min(400, viewportWidth - 56));
  const pieChartWidth = Math.max(280, Math.min(360, viewportWidth - 56));

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
        `省下 ${formatMoney(trophySum)}，已计入克制记录。`
      );
    }

    if (emotionalItems.length > 0) {
      emotionalItems.forEach((item) => {
        const work = toWorkTime(item.amount, realHourlyWage);
        pushTextMessage(
          "assistant",
          `${formatMoney(item.amount)} = ${work.hours.toFixed(2)}h 工时（${work.minutes} 分钟）`
        );
      });
      return;
    }

    pushTextMessage("assistant", "已记录。");
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
        body: JSON.stringify({ mode: "biweekly", summary, monthlySalary })
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
        body: JSON.stringify({ mode: "biweekly", summary, monthlySalary, conversation, followUp: input })
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
        body: JSON.stringify({ mode: "eightWeek", summary: eightWeekTrend.overallSummary, trend: eightWeekTrend, monthlySalary })
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
        body: JSON.stringify({ mode: "eightWeek", summary: eightWeekTrend.overallSummary, trend: eightWeekTrend, monthlySalary, conversation, followUp: input })
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
    if (recordMode === "expense" && !selectedReality) {
      pushTextMessage("assistant", "请补充现实层面类目。");
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
    const realityLabel = recordMode === "saving" ? undefined : selectedReality!.label;
    const description = tagNote.trim() || `${motiveLabel ? `${motiveLabel} · ` : ""}${finalAttributeTag}${realityLabel ? ` · ${realityLabel}` : ""}`;
    const taggedEntry: ExpenseEntry = {
      id: buildId("tag-entry"),
      description,
      amount,
      category: finalCategory,
      createdAt: timestamp,
      motiveTag: motiveLabel,
      attributeTag: finalAttributeTag,
      realityTag: realityLabel
    };

    const userMessage =
      recordMode === "saving"
        ? `省钱记录：${finalAttributeTag} / ${formatMoney(amount)}`
        : `标签记账：${motiveLabel} / ${finalAttributeTag} / ${realityLabel} / ${formatMoney(amount)}`;
    commitEntriesWithFeedback([taggedEntry], userMessage);
    setTagAmount("");
    setTagNote("");
    setSelectedMotiveId("");
    setSelectedAttributeId("");
    setSelectedRealityId("");
    setSelectedSavingTagId("");
  }

  const NAV_ITEMS = [
    { key: "chat" as const, label: "记录" },
    { key: "dashboard" as const, label: "复盘" },
    { key: "fire" as const, label: "目标" }
  ];

  return (
    <div className="mx-auto min-h-[100dvh] max-w-[430px] bg-stone-50 antialiased shadow-[0_0_0_1px_rgba(120,113,108,0.06)]">
      <header className="sticky top-0 z-20 border-b border-stone-200/60 bg-stone-50/95 backdrop-blur">
        <div className="mx-auto max-w-lg px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-stone-400">FIRE</p>
        </div>
      </header>

      <div className="mx-auto max-w-lg pb-20">
        {activeTab === "chat" ? (
          <div className="flex min-h-[calc(100dvh-116px)] flex-col bg-white">
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6">
              {messages.map((message) => {
                if (message.kind === "entries") {
                  return (
                    <div key={message.id} className="space-y-1">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-stone-400">已记录</p>
                      {message.entries.map((entry) => (
                        <div key={entry.id} className="flex items-baseline justify-between border-b border-stone-100 py-2">
                          <div>
                            <p className="text-sm text-stone-600">{entry.description}</p>
                            <p className="text-[11px] text-stone-400">{entry.category}</p>
                          </div>
                          <span className="ml-3 font-mono text-sm tabular-nums text-stone-700">{formatMoney(entry.amount)}</span>
                        </div>
                      ))}
                    </div>
                  );
                }

                const isUser = message.role === "user";
                return (
                  <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <p
                      className={`max-w-[85%] text-[13px] leading-relaxed ${
                        isUser
                          ? "rounded-2xl rounded-br-md bg-stone-800 px-4 py-2.5 text-stone-100"
                          : "text-stone-500"
                      }`}
                    >
                      {message.text}
                    </p>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleTagSubmit} className="border-t border-stone-100 bg-stone-50/50 px-5 pb-6 pt-5">
              <div className="mb-5 flex gap-4 text-[13px]">
                <button
                  type="button"
                  onClick={() => setRecordMode("expense")}
                  className={`border-b-2 pb-1 font-medium transition-colors ${
                    recordMode === "expense" ? "border-stone-700 text-stone-700" : "border-transparent text-stone-400"
                  }`}
                >
                  支出
                </button>
                <button
                  type="button"
                  onClick={() => setRecordMode("saving")}
                  className={`border-b-2 pb-1 font-medium transition-colors ${
                    recordMode === "saving" ? "border-stone-700 text-stone-700" : "border-transparent text-stone-400"
                  }`}
                >
                  克制
                </button>
              </div>

              {recordMode === "expense" && (
                <div className="mb-4">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-stone-400">心理动机</p>
                  <div className="space-y-2">
                    {MOTIVE_TAG_GROUPS.map((group) => (
                      <div key={group.title}>
                        <p className="mb-1.5 text-[11px] text-stone-400">{group.title}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.tags.map((tag) => {
                            const active = selectedMotiveId === tag.id;
                            return (
                              <label
                                key={tag.id}
                                className={`cursor-pointer select-none rounded-full border px-3 py-1 text-xs transition-all ${
                                  active
                                    ? "border-stone-600 bg-stone-700 text-white"
                                    : "border-stone-200 text-stone-500 hover:border-stone-300"
                                }`}
                              >
                                <input type="radio" name="motiveTag" value={tag.id} checked={active} onChange={() => setSelectedMotiveId(tag.id)} className="sr-only" />
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
                <div className="mb-4">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-stone-400">心理属性</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ATTRIBUTE_OPTIONS.map((option) => {
                      const active = selectedAttributeId === option.id;
                      return (
                        <label
                          key={option.id}
                          className={`cursor-pointer select-none rounded-lg border px-3 py-2 text-left transition-all ${
                            active
                              ? "border-stone-600 bg-white shadow-sm"
                              : "border-stone-200 hover:border-stone-300"
                          }`}
                        >
                          <input type="radio" name="attributeTag" value={option.id} checked={active} onChange={() => setSelectedAttributeId(option.id)} className="sr-only" />
                          <p className="text-xs font-medium text-stone-600">{option.label}</p>
                          <p className="text-[10px] text-stone-400">{option.hint}</p>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mb-4">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-stone-400">克制类型</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SAVING_TAGS.map((tag) => {
                      const active = selectedSavingTagId === tag.id;
                      return (
                        <label
                          key={tag.id}
                          className={`cursor-pointer select-none rounded-full border px-3 py-1 text-xs transition-all ${
                            active
                              ? "border-stone-600 bg-stone-700 text-white"
                              : "border-stone-200 text-stone-500 hover:border-stone-300"
                          }`}
                        >
                          <input type="radio" name="savingTag" value={tag.id} checked={active} onChange={() => setSelectedSavingTagId(tag.id)} className="sr-only" />
                          {tag.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {recordMode === "expense" && (
                <div className="mb-4">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-stone-400">实际类目</p>
                  <div className="space-y-2">
                    {REALITY_TAG_GROUPS.map((group) => (
                      <div key={group.title}>
                        <p className="mb-1.5 text-[11px] text-stone-400">{group.title}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.tags.map((tag) => {
                            const active = selectedRealityId === tag.id;
                            return (
                              <label
                                key={tag.id}
                                className={`cursor-pointer select-none rounded-full border px-3 py-1 text-xs transition-all ${
                                  active
                                    ? "border-stone-600 bg-stone-700 text-white"
                                    : "border-stone-200 text-stone-500 hover:border-stone-300"
                                }`}
                              >
                                <input type="radio" name="realityTag" value={tag.id} checked={active} onChange={() => setSelectedRealityId(tag.id)} className="sr-only" />
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

              <div className="mb-4 text-[11px] text-stone-400">
                {recordMode === "expense" ? (
                  <>
                    {selectedMotive ? selectedMotive.label : "—"}{" / "}
                    {selectedAttribute ? selectedAttribute.label : "—"}{" / "}
                    {selectedReality ? selectedReality.label : "—"}
                  </>
                ) : (
                  <>{selectedSavingTag ? selectedSavingTag.label : "—"}</>
                )}
              </div>

              <div className="flex items-end gap-2">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={tagAmount}
                  onChange={(event) => setTagAmount(event.target.value)}
                  placeholder={recordMode === "saving" ? "克制金额" : "金额"}
                  className="w-24 border-b border-stone-300 bg-transparent py-2 text-sm text-stone-700 outline-none placeholder:text-stone-300 focus:border-stone-500"
                />
                <input
                  type="text"
                  value={tagNote}
                  onChange={(event) => setTagNote(event.target.value)}
                  placeholder="备注"
                  className="flex-1 border-b border-stone-300 bg-transparent py-2 text-sm text-stone-700 outline-none placeholder:text-stone-300 focus:border-stone-500"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-stone-800 px-4 py-2 text-xs font-medium text-stone-100 transition hover:bg-stone-700"
                >
                  {recordMode === "expense" ? "记录" : "保存"}
                </button>
              </div>
            </form>

            <div className="border-t border-stone-100 bg-stone-50/30 px-5 py-5">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">历史</p>
              <div className="max-h-52 space-y-0 overflow-y-auto">
                {[...entries]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between border-b border-stone-100 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-stone-600">{entry.description}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-stone-400">
                          <span>{formatEntryTimestamp(entry.createdAt)}</span>
                          <select
                            value={entry.category}
                            onChange={(event) => updateEntryCategory(entry.id, event.target.value as Category)}
                            className="border-none bg-transparent text-[11px] text-stone-400 outline-none"
                          >
                            {CATEGORY_ORDER.map((category) => (
                              <option key={category} value={category}>{category}</option>
                            ))}
                          </select>
                        </div>
                        {(entry.motiveTag || entry.attributeTag || entry.realityTag) && (
                          <p className="mt-0.5 text-[10px] text-stone-300">
                            {entry.motiveTag || "—"} / {entry.attributeTag || "—"} / {entry.realityTag || "—"}
                          </p>
                        )}
                      </div>
                      <span className="ml-3 font-mono text-sm tabular-nums text-stone-600">{formatMoney(entry.amount)}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        ) : activeTab === "dashboard" ? (
          <div className="min-h-[calc(100dvh-116px)] px-5 py-8">
            <div className="mb-8 flex gap-4 text-[13px]">
              <button
                type="button"
                onClick={() => setDashboardMode("biweekly")}
                className={`border-b-2 pb-1 font-medium transition-colors ${
                  dashboardMode === "biweekly" ? "border-stone-700 text-stone-700" : "border-transparent text-stone-400"
                }`}
              >
                14 天
              </button>
              <button
                type="button"
                onClick={() => setDashboardMode("eightWeek")}
                className={`border-b-2 pb-1 font-medium transition-colors ${
                  dashboardMode === "eightWeek" ? "border-stone-700 text-stone-700" : "border-transparent text-stone-400"
                }`}
              >
                8 周
              </button>
            </div>

            <div className="mb-10">
              <p className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                {dashboardMode === "biweekly" ? "时间负债" : "情绪补偿总额"}
              </p>
              {dashboardMode === "biweekly" ? (
                <>
                  <p className="mt-1 font-mono text-4xl font-extralight tabular-nums tracking-tight text-stone-800">
                    {unconsciousWorkHours.toFixed(1)}<span className="ml-1 text-lg text-stone-400">h</span>
                  </p>
                  <p className="mt-3 text-xs text-stone-400">
                    克制努力 {formatMoney(biweeklyTrophyEffort)}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 font-mono text-4xl font-extralight tabular-nums tracking-tight text-stone-800">
                    {formatMoney(eightWeekTrend.unconsciousTotal)}
                  </p>
                  <p className="mt-3 text-xs text-stone-400">
                    克制努力 {formatMoney(eightWeekTrend.trophyTotal)}
                  </p>
                </>
              )}
              {dashboardMode === "biweekly" && reviewSummary !== null && unconsciousSpend > warningThreshold && (
                <p className="mt-3 text-xs text-stone-500">
                  本周期情绪补偿 {formatMoney(unconsciousSpend)}，等价 {unconsciousWorkHours.toFixed(1)}h 额外工时。
                </p>
              )}
              {dashboardMode === "eightWeek" && (
                <p className="mt-3 text-xs text-stone-400">
                  {eightWeekTrend.coverageDays < 56
                    ? `数据覆盖 ${eightWeekTrend.coverageDays} 天`
                    : "完整 56 天窗口"}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={dashboardMode === "biweekly" ? generateBiWeeklyReview : generateEightWeekReview}
              disabled={dashboardMode === "biweekly" ? reviewLoading : macroReviewLoading}
              className="mb-10 w-full rounded-lg border border-stone-200 py-2.5 text-xs font-medium text-stone-500 transition hover:border-stone-300 hover:text-stone-600 disabled:opacity-50"
            >
              {dashboardMode === "biweekly"
                ? reviewLoading ? "分析中..." : "生成复盘"
                : macroReviewLoading ? "分析中..." : "生成趋势报告"}
            </button>

            <div className="mb-10 space-y-8">
              <div>
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  {dashboardMode === "biweekly" ? "分类占比" : "56 天总体占比"}
                </p>
                <div className="overflow-x-auto rounded-xl bg-white p-4">
                  <PieChart width={pieChartWidth} height={220}>
                    <Pie
                      data={dashboardMode === "biweekly" ? pieData : eightWeekPieData}
                      dataKey="value"
                      nameKey="name"
                      cx={120}
                      cy={105}
                      outerRadius={80}
                      strokeWidth={1}
                      stroke="#fafaf9"
                    >
                      {(dashboardMode === "biweekly" ? pieData : eightWeekPieData).map((item) => (
                        <Cell key={item.name} fill={CATEGORY_COLORS[item.name as Category]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatMoney(Number(value))} />
                    <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </div>
              </div>

              <div>
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  {dashboardMode === "biweekly" ? "分类金额" : "周期趋势"}
                </p>
                {dashboardMode === "eightWeek" && (
                  <div className="mb-3 flex gap-3 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setTrendChartMode("line")}
                      className={`transition-colors ${trendChartMode === "line" ? "font-medium text-stone-600" : "text-stone-400"}`}
                    >
                      折线
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrendChartMode("stackedBar")}
                      className={`transition-colors ${trendChartMode === "stackedBar" ? "font-medium text-stone-600" : "text-stone-400"}`}
                    >
                      堆叠
                    </button>
                  </div>
                )}
                <div className="overflow-x-auto rounded-xl bg-white p-4">
                  {dashboardMode === "biweekly" ? (
                    <BarChart width={chartWidth} height={220} data={pieData}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value: number) => formatMoney(Number(value))} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {pieData.map((item) => (
                          <Cell key={item.name} fill={CATEGORY_COLORS[item.name as Category]} />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : trendChartMode === "line" ? (
                    <LineChart width={chartWidth} height={220} data={eightWeekTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                      <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value: number) => formatMoney(Number(value))} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="unconscious" stroke={CATEGORY_COLORS["情绪补偿"]} strokeWidth={2} dot={{ r: 3 }} name="情绪补偿" />
                      <Line type="monotone" dataKey="trophy" stroke={CATEGORY_COLORS["克制与战利品"]} strokeWidth={2} dot={{ r: 3 }} name="克制" />
                    </LineChart>
                  ) : (
                    <BarChart width={chartWidth} height={220} data={eightWeekTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                      <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value: number) => formatMoney(Number(value))} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="unconscious" stackId="trend" fill={CATEGORY_COLORS["情绪补偿"]} name="情绪补偿" />
                      <Bar dataKey="trophy" stackId="trend" fill={CATEGORY_COLORS["克制与战利品"]} name="克制" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  )}
                </div>
              </div>
            </div>

            {dashboardMode === "eightWeek" && (
              <div className="mb-10">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">高频情绪补偿</p>
                <div className="space-y-4">
                  {eightWeekTrend.periods.map((period) => (
                    <div key={period.label} className="border-l-2 border-stone-200 pl-4">
                      <p className="text-xs font-medium text-stone-600">{period.label}</p>
                      {period.unconsciousItems.length === 0 ? (
                        <p className="mt-1 text-[11px] text-stone-400">无记录</p>
                      ) : (
                        <div className="mt-1 space-y-0.5">
                          {period.unconsciousItems.map((item) => (
                            <p key={`${period.label}-${item.name}`} className="text-[11px] text-stone-500">
                              {item.name} <span className="font-mono tabular-nums">{formatMoney(item.amount)}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-10">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                {dashboardMode === "biweekly" ? "AI 复盘" : "AI 趋势分析"}
              </p>
              {dashboardMode === "biweekly" ? (
                <div className="space-y-3">
                  {reviewLoading && biweeklyReviewChat.length === 0 ? (
                    <p className="text-xs text-stone-400">正在分析...</p>
                  ) : biweeklyReviewChat.length > 0 ? (
                    <div className="max-h-96 space-y-4 overflow-y-auto">
                      {biweeklyReviewChat.map((msg, index) => (
                        <div key={`${msg.role}-${index}`} className={`${msg.role === "user" ? "text-right" : ""}`}>
                          <div
                            className={`inline-block max-w-[92%] text-[13px] leading-7 ${
                              msg.role === "user"
                                ? "rounded-2xl rounded-br-md bg-stone-800 px-4 py-2.5 text-stone-100"
                                : "whitespace-pre-line text-left text-stone-600"
                            }`}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400">生成复盘后，分析将在此显示。</p>
                  )}
                  {reviewError && <p className="text-xs text-stone-500">{reviewError}</p>}
                  <form onSubmit={sendBiweeklyFollowUp} className="flex items-end gap-2">
                    <input
                      value={biweeklyReviewDraft}
                      onChange={(event) => setBiweeklyReviewDraft(event.target.value)}
                      placeholder="追问..."
                      className="flex-1 border-b border-stone-200 bg-transparent py-2 text-sm outline-none placeholder:text-stone-300 focus:border-stone-400"
                    />
                    <button
                      type="submit"
                      disabled={reviewLoading || biweeklyReviewChat.length === 0}
                      className="pb-2 text-xs font-medium text-stone-500 disabled:opacity-40"
                    >
                      发送
                    </button>
                  </form>
                </div>
              ) : (
                <div className="space-y-3">
                  {macroReviewLoading && eightWeekReviewChat.length === 0 ? (
                    <p className="text-xs text-stone-400">正在分析趋势...</p>
                  ) : eightWeekReviewChat.length > 0 ? (
                    <div className="max-h-96 space-y-4 overflow-y-auto">
                      {eightWeekReviewChat.map((msg, index) => (
                        <div key={`${msg.role}-${index}`} className={`${msg.role === "user" ? "text-right" : ""}`}>
                          <div
                            className={`inline-block max-w-[92%] text-[13px] leading-7 ${
                              msg.role === "user"
                                ? "rounded-2xl rounded-br-md bg-stone-800 px-4 py-2.5 text-stone-100"
                                : "whitespace-pre-line text-left text-stone-600"
                            }`}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400">生成报告后，分析将在此显示。</p>
                  )}
                  {macroReviewError && <p className="text-xs text-stone-500">{macroReviewError}</p>}
                  <form onSubmit={sendEightWeekFollowUp} className="flex items-end gap-2">
                    <input
                      value={eightWeekReviewDraft}
                      onChange={(event) => setEightWeekReviewDraft(event.target.value)}
                      placeholder="追问..."
                      className="flex-1 border-b border-stone-200 bg-transparent py-2 text-sm outline-none placeholder:text-stone-300 focus:border-stone-400"
                    />
                    <button
                      type="submit"
                      disabled={macroReviewLoading || eightWeekReviewChat.length === 0}
                      className="pb-2 text-xs font-medium text-stone-500 disabled:opacity-40"
                    >
                      发送
                    </button>
                  </form>
                </div>
              )}
            </div>

            <details className="mb-6">
              <summary className="cursor-pointer text-[11px] text-stone-300 hover:text-stone-400">System Prompt</summary>
              <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-[10px] leading-5 text-stone-400">
                {dashboardMode === "biweekly" ? aiSystemPrompt : macroSystemPrompt || "尚未调用。"}
              </pre>
            </details>
          </div>
        ) : (
          <div className="min-h-[calc(100dvh-116px)] px-5 py-8">
            <div className="mb-10 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wider text-stone-400">距离财务自由</p>
              <p className="mt-3 font-mono text-5xl font-extralight tabular-nums tracking-tight text-stone-800">
                {fireProjection.yearsToFire}
              </p>
              <p className="mt-1 text-xs text-stone-400">年</p>
              <div className="mx-auto mt-8 max-w-xs">
                <div className="h-[3px] w-full overflow-hidden rounded-full bg-stone-200">
                  <div
                    className="h-full rounded-full bg-stone-400 transition-all duration-700"
                    style={{ width: `${Math.max(1, fireProgress)}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[10px] tabular-nums text-stone-400">
                  <span>{formatMoney(currentReach)}</span>
                  <span>{formatMoney(fireProjection.target)}</span>
                </div>
              </div>
            </div>

            <div className="mb-10">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">增长轨迹</p>
              <div className="overflow-x-auto rounded-xl bg-white p-4">
                <AreaChart width={chartWidth} height={240} data={fireProjection.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(value) => `${(value / 10000).toFixed(0)}万`} tick={{ fontSize: 10, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value: number) => formatMoney(Number(value))} />
                  <ReferenceLine
                    y={fireProjection.target}
                    stroke="#d6d3d1"
                    strokeDasharray="6 3"
                    label={{ value: "自由线", fill: "#a8a29e", fontSize: 10 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="baseAsset"
                    stroke="#a8a29e"
                    fill="#e7e5e4"
                    strokeWidth={1.5}
                    name="资产"
                  />
                </AreaChart>
              </div>
            </div>

            <div>
              <p className="mb-4 text-[11px] font-medium uppercase tracking-wider text-stone-400">参数</p>
              <div className="space-y-0">
                <div className="flex items-center justify-between border-b border-stone-100 py-3">
                  <span className="text-xs text-stone-500">月薪</span>
                  <div className="text-right">
                    <input
                      type="number"
                      min={1}
                      value={monthlySalary}
                      onChange={(event) => setMonthlySalary(Number(event.target.value) || 0)}
                      className="w-28 border-none bg-transparent text-right font-mono text-sm tabular-nums text-stone-700 outline-none"
                    />
                    <p className="text-[10px] tabular-nums text-stone-400">时薪 {realHourlyWage.toFixed(1)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-b border-stone-100 py-3">
                  <span className="text-xs text-stone-500">现有存款</span>
                  <input
                    type="number"
                    min={0}
                    value={currentSavings}
                    onChange={(event) => setCurrentSavings(Math.max(Number(event.target.value) || 0, 0))}
                    className="w-28 border-none bg-transparent text-right font-mono text-sm tabular-nums text-stone-700 outline-none"
                  />
                </div>
                <div className="flex items-center justify-between border-b border-stone-100 py-3">
                  <span className="text-xs text-stone-500">月定投</span>
                  <input
                    type="number"
                    min={0}
                    value={monthlyInvest}
                    onChange={(event) => setMonthlyInvest(Math.max(Number(event.target.value) || 0, 0))}
                    className="w-28 border-none bg-transparent text-right font-mono text-sm tabular-nums text-stone-700 outline-none"
                  />
                </div>
                <div className="flex items-center justify-between border-b border-stone-100 py-3">
                  <span className="text-xs text-stone-500">退休月支出</span>
                  <input
                    type="number"
                    min={0}
                    value={retireMonthlyExpense}
                    onChange={(event) => setRetireMonthlyExpense(Math.max(Number(event.target.value) || 0, 0))}
                    className="w-28 border-none bg-transparent text-right font-mono text-sm tabular-nums text-stone-700 outline-none"
                  />
                </div>
                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-xs text-stone-500">年化收益率</span>
                    <p className="text-[10px] text-stone-400">建议 2-3% 稳健为准</p>
                  </div>
                  <div className="flex items-baseline gap-0.5">
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
                      className="w-16 border-none bg-transparent text-right font-mono text-sm tabular-nums text-stone-700 outline-none"
                    />
                    <span className="text-xs text-stone-400">%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-[430px] -translate-x-1/2 border-t border-stone-200/80 bg-stone-50/98 backdrop-blur">
        <div className="mx-auto grid grid-cols-3">
          {NAV_ITEMS.map((tab) => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className="py-2.5">
              <div className={`mx-auto mb-1 h-0.5 w-6 rounded-full transition ${activeTab === tab.key ? "bg-stone-700" : "bg-transparent"}`} />
              <p className={`text-[12px] font-medium transition-colors ${activeTab === tab.key ? "text-stone-700" : "text-stone-400"}`}>
                {tab.label}
              </p>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

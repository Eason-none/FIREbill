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
const STORAGE_KEY_USER_ID = "fire-assistant-user-id-v1";
const STORAGE_KEY_REVIEW_REMINDER = "fire-assistant-review-reminder-v1";
const GOLD_COLOR = "#c4b590";
const MONTHLY_WORK_HOURS = 21.75 * 8;

type Category = keyof typeof CATEGORY_LABELS;

type ExpenseEntry = {
  id: string;
  description: string;
  note?: string;
  amount: number;
  category: Category;
  createdAt: string;
  motiveTag?: string;
  attributeTag?: string;
  realityTag?: string;
};

type ChatMessage =
  | { id: string; role: "user" | "assistant"; kind: "text"; text: string };

type CategorySummary = Record<Category, number>;
type SpendCategory = Exclude<Category, "克制与战利品">;
type SpendSummary = Record<SpendCategory, number>;
type DashboardMode = "biweekly" | "eightWeek";
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
const EXPENSE_GUIDE_TEXT =
  "记账示例（3步）\n1）先选「心理动机」：你当时为什么想花这笔钱。\n2）再选「心理属性」：这笔支出属于生存刚需 / 情绪补偿 / 社交认同 / 自我成长。\n3）最后选「实际类目」：它在现实中属于哪一类消费。\n例如：🪫 疲惫/回血 → 情绪补偿 → 餐饮/日用/蔬果 → 金额 28。\n若是省钱行为，请切到「克制」并记录本次克制金额。";
const SAVING_GUIDE_TEXT =
  "克制示例（2步）\n1）切换到「克制」后，先选一个克制标签（如：忍住没买 / 延迟购买）。\n2）填写本次克制金额，记录你这次没有花出去的钱。\n例如：🛑 延迟购买 → 本次克制金额 35。\n这笔金额会进入克制努力统计，但不会计入资产增长。";

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

function formatTooltipMoney(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const numeric = Number(raw ?? 0);
  return formatMoney(Number.isFinite(numeric) ? numeric : 0);
}

function toWorkTime(amount: number, hourlyWage: number) {
  if (hourlyWage <= 0) {
    return { hours: 0, minutes: 0 };
  }
  const hours = amount / hourlyWage;
  const minutes = Math.round(hours * 60);
  return { hours, minutes };
}

function buildClientUserId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `u-${crypto.randomUUID()}`;
  }
  return `u-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<"chat" | "dashboard" | "fire">("chat");
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>("biweekly");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [currentSavings, setCurrentSavings] = useState("");
  const [monthlyInvest, setMonthlyInvest] = useState("");
  const [retireMonthlyExpense, setRetireMonthlyExpense] = useState("");
  const [annualReturnRate, setAnnualReturnRate] = useState("");
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [recordMode, setRecordMode] = useState<"expense" | "saving">("expense");
  const [tagAmount, setTagAmount] = useState("");
  const [tagNote, setTagNote] = useState("");
  const [selectedMotiveId, setSelectedMotiveId] = useState("");
  const [selectedAttributeId, setSelectedAttributeId] = useState("");
  const [selectedRealityId, setSelectedRealityId] = useState("");
  const [selectedSavingTagId, setSelectedSavingTagId] = useState("");
  const [clientUserId, setClientUserId] = useState("");
  const [reviewReminderReadCycle, setReviewReminderReadCycle] = useState({
    biweekly: 0,
    eightWeek: 0
  });
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
      text: EXPENSE_GUIDE_TEXT
    }
  ]);

  useEffect(() => {
    const cached = window.localStorage.getItem(STORAGE_KEY_USER_ID);
    const nextUserId = cached || buildClientUserId();
    if (!cached) {
      window.localStorage.setItem(STORAGE_KEY_USER_ID, nextUserId);
    }
    setClientUserId(nextUserId);
  }, []);

  useEffect(() => {
    if (!clientUserId) {
      return;
    }
    try {
      const raw = window.localStorage.getItem(`${STORAGE_KEY_REVIEW_REMINDER}-${clientUserId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<{ biweekly: number; eightWeek: number }>;
        setReviewReminderReadCycle({
          biweekly: Number(parsed.biweekly || 0),
          eightWeek: Number(parsed.eightWeek || 0)
        });
      } else {
        setReviewReminderReadCycle({ biweekly: 0, eightWeek: 0 });
      }
    } catch {
      setReviewReminderReadCycle({ biweekly: 0, eightWeek: 0 });
    }
  }, [clientUserId]);

  useEffect(() => {
    if (!clientUserId) {
      return;
    }
    window.localStorage.setItem(
      `${STORAGE_KEY_REVIEW_REMINDER}-${clientUserId}`,
      JSON.stringify(reviewReminderReadCycle)
    );
  }, [clientUserId, reviewReminderReadCycle]);

  useEffect(() => {
    if (!clientUserId) {
      return;
    }
    const controller = new AbortController();
    async function loadEntries() {
      try {
        const response = await fetch("/api/entries", {
          headers: { "x-user-id": clientUserId },
          signal: controller.signal
        });
        const data = (await response.json()) as { entries?: ExpenseEntry[] };
        if (!response.ok || !Array.isArray(data.entries)) {
          return;
        }
        setEntries(data.entries);
      } catch {
        // keep current empty state on load failure
      }
    }
    void loadEntries();
    return () => controller.abort();
  }, [clientUserId]);

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

  const entrySpanDays = useMemo(() => {
    if (entries.length < 2) {
      return 0;
    }
    let minTime = Number.POSITIVE_INFINITY;
    let maxTime = Number.NEGATIVE_INFINITY;
    entries.forEach((entry) => {
      const t = new Date(entry.createdAt).getTime();
      if (!Number.isFinite(t)) {
        return;
      }
      minTime = Math.min(minTime, t);
      maxTime = Math.max(maxTime, t);
    });
    if (!Number.isFinite(minTime) || !Number.isFinite(maxTime) || maxTime < minTime) {
      return 0;
    }
    const dayMs = 24 * 60 * 60 * 1000;
    return Math.floor((maxTime - minTime) / dayMs);
  }, [entries]);

  const biweeklyCycle = Math.floor(entrySpanDays / 14);
  const eightWeekCycle = Math.floor(entrySpanDays / 56);
  const shouldPromptEightWeekReview = eightWeekCycle >= 1 && eightWeekCycle > reviewReminderReadCycle.eightWeek;
  const shouldPromptBiweeklyReview =
    !shouldPromptEightWeekReview &&
    biweeklyCycle >= 1 &&
    biweeklyCycle > reviewReminderReadCycle.biweekly;

  function markReviewReminderRead(type: "biweekly" | "eightWeek") {
    setReviewReminderReadCycle((prev) => {
      if (type === "eightWeek") {
        return {
          biweekly: Math.max(prev.biweekly, biweeklyCycle),
          eightWeek: Math.max(prev.eightWeek, eightWeekCycle)
        };
      }
      return {
        ...prev,
        biweekly: Math.max(prev.biweekly, biweeklyCycle)
      };
    });
  }

  const liveSpendSummary = useMemo(
    () => ({
      生存刚需: categorySummary["生存刚需"],
      情绪补偿: categorySummary["情绪补偿"],
      社交认同: categorySummary["社交认同"],
      自我成长: categorySummary["自我成长"]
    }),
    [categorySummary]
  );

  const monthlySalaryValue = Math.max(Number(monthlySalary) || 0, 0);
  const currentSavingsValue = Math.max(Number(currentSavings) || 0, 0);
  const monthlyInvestValue = Math.max(Number(monthlyInvest) || 0, 0);
  const retireMonthlyExpenseValue = Math.max(Number(retireMonthlyExpense) || 0, 0);
  const annualReturnRateValue = Math.min(Math.max(Number(annualReturnRate) || 0, 0), 5);

  const activeSummary = reviewSummary ?? liveSpendSummary;
  const unconsciousSpend = activeSummary["情绪补偿"];
  const realHourlyWage = monthlySalaryValue > 0 ? monthlySalaryValue / MONTHLY_WORK_HOURS : 0;
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
    unconscious: Number(period.summary["情绪补偿"].toFixed(2))
  }));

  const eightWeekTrophyStacked = useMemo(() => {
    const presetKeys = SAVING_TAGS.map((tag) => tag.label);
    const dynamicKeys = new Set<string>(presetKeys);
    const data = eightWeekTrend.periods.map((period) => {
      const periodStart = new Date(period.start).getTime();
      const periodEnd = new Date(period.end).getTime();
      const bucket: Record<string, number> = {};
      presetKeys.forEach((key) => {
        bucket[key] = 0;
      });

      entries.forEach((entry) => {
        if (entry.category !== "克制与战利品") {
          return;
        }
        const t = new Date(entry.createdAt).getTime();
        if (t < periodStart || t > periodEnd) {
          return;
        }
        const key = entry.attributeTag || "其他克制";
        dynamicKeys.add(key);
        bucket[key] = (bucket[key] || 0) + entry.amount;
      });

      return {
        period: period.label,
        ...bucket
      };
    });

    return {
      data,
      keys: Array.from(dynamicKeys)
    };
  }, [entries, eightWeekTrend.periods]);

  const fireProjection = useMemo(() => {
    const target = (retireMonthlyExpenseValue * 12) / 0.04;
    const monthlyRate = annualReturnRateValue / 100 / 12;
    const monthlyContribution = monthlyInvestValue;
    const maxMonths = 1200;

    let baseAsset = currentSavingsValue;
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
  }, [annualReturnRateValue, currentSavingsValue, monthlyInvestValue, retireMonthlyExpenseValue]);

  const currentReach = currentSavingsValue;
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
    if (!clientUserId) {
      return;
    }
    void fetch(`/api/entries/${entryId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": clientUserId
      },
      body: JSON.stringify({ category })
    });
  }

  function updateEntryNote(entryId: string, note: string) {
    setEntries((prev) => prev.map((entry) => (entry.id === entryId ? { ...entry, note } : entry)));
    if (!clientUserId) {
      return;
    }
    void fetch(`/api/entries/${entryId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": clientUserId
      },
      body: JSON.stringify({ note })
    });
  }

  function updateEntryAmount(entryId: string, amountText: string) {
    const parsed = Number(amountText);
    const nextAmount = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              amount: nextAmount
            }
          : entry
      )
    );
    if (!clientUserId) {
      return;
    }
    void fetch(`/api/entries/${entryId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": clientUserId
      },
      body: JSON.stringify({ amount: nextAmount })
    });
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
        body: JSON.stringify({ mode: "biweekly", summary, monthlySalary: monthlySalaryValue })
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
        body: JSON.stringify({ mode: "biweekly", summary, monthlySalary: monthlySalaryValue, conversation, followUp: input })
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
        body: JSON.stringify({ mode: "eightWeek", summary: eightWeekTrend.overallSummary, trend: eightWeekTrend, monthlySalary: monthlySalaryValue })
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
        body: JSON.stringify({ mode: "eightWeek", summary: eightWeekTrend.overallSummary, trend: eightWeekTrend, monthlySalary: monthlySalaryValue, conversation, followUp: input })
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

  async function handleTagSubmit(event: FormEvent) {
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
    if (!clientUserId) {
      pushTextMessage("assistant", "用户状态未初始化，请稍后再试。");
      return;
    }

    const timestamp = new Date().toISOString();
    const finalCategory = recordMode === "saving" ? "克制与战利品" : selectedAttribute!.category;
    const finalAttributeTag = recordMode === "saving" ? selectedSavingTag!.label : selectedAttribute!.label;
    const motiveLabel = recordMode === "saving" ? undefined : selectedMotive!.label;
    const realityLabel = recordMode === "saving" ? undefined : selectedReality!.label;
    const description = `${motiveLabel ? `${motiveLabel} · ` : ""}${finalAttributeTag}${realityLabel ? ` · ${realityLabel}` : ""}`;
    const taggedEntry: ExpenseEntry = {
      id: buildId("tag-entry"),
      description,
      note: tagNote.trim(),
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
    try {
      const response = await fetch("/api/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": clientUserId
        },
        body: JSON.stringify({
          description: taggedEntry.description,
          note: taggedEntry.note || "",
          amount: taggedEntry.amount,
          category: taggedEntry.category,
          createdAt: taggedEntry.createdAt,
          motiveTag: taggedEntry.motiveTag || "",
          attributeTag: taggedEntry.attributeTag || "",
          realityTag: taggedEntry.realityTag || ""
        })
      });
      const data = (await response.json()) as { entry?: ExpenseEntry; error?: string };
      if (!response.ok || !data.entry) {
        throw new Error(data.error || "创建记录失败");
      }
      commitEntriesWithFeedback([data.entry], userMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "云端保存失败";
      pushTextMessage("assistant", `保存失败：${message}`);
      return;
    }
    setTagAmount("");
    setTagNote("");
    setSelectedMotiveId("");
    setSelectedAttributeId("");
    setSelectedRealityId("");
    setSelectedSavingTagId("");
  }

  const NAV_ITEMS = [
    { key: "chat" as const, label: "记账" },
    { key: "dashboard" as const, label: "复盘" },
    { key: "fire" as const, label: "FIRE目标" }
  ];

  return (
    <div className="mx-auto min-h-[100dvh] max-w-[430px] bg-stone-50 antialiased shadow-[0_0_0_1px_rgba(120,113,108,0.06)]">
      <header className="sticky top-0 z-20 border-b border-stone-200/60 bg-stone-50/95 backdrop-blur">
        <div className="mx-auto max-w-lg px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-stone-400">FIRE</p>
        </div>
      </header>

      <nav className="border-b border-stone-200/60 bg-stone-50/95">
        <div className="mx-auto flex max-w-lg px-3">
          {NAV_ITEMS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-[12px] font-medium transition-colors ${
                activeTab === tab.key ? "text-stone-800" : "text-stone-400"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-lg pb-4">
        {activeTab === "chat" ? (
          <div className="flex min-h-[calc(100dvh-116px)] flex-col bg-white">
            {(shouldPromptBiweeklyReview || shouldPromptEightWeekReview) && (
              <div className="border-b border-stone-100 bg-stone-50/70 px-5 py-3">
                {shouldPromptEightWeekReview ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-stone-600">
                      你已累计约 {entrySpanDays} 天账单（第 {eightWeekCycle} 轮 8 周），建议进行深度复盘。
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          markReviewReminderRead("eightWeek");
                          setActiveTab("dashboard");
                          setDashboardMode("eightWeek");
                        }}
                        className="rounded-md border border-stone-300 px-2.5 py-1 text-[11px] text-stone-600"
                      >
                        去复盘
                      </button>
                      <button
                        type="button"
                        onClick={() => markReviewReminderRead("eightWeek")}
                        className="rounded-md border border-stone-200 px-2.5 py-1 text-[11px] text-stone-500"
                      >
                        已读
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-stone-600">
                      你已累计约 {entrySpanDays} 天账单（第 {biweeklyCycle} 轮双周），建议进行复盘。
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          markReviewReminderRead("biweekly");
                          setActiveTab("dashboard");
                          setDashboardMode("biweekly");
                        }}
                        className="rounded-md border border-stone-300 px-2.5 py-1 text-[11px] text-stone-600"
                      >
                        去复盘
                      </button>
                      <button
                        type="button"
                        onClick={() => markReviewReminderRead("biweekly")}
                        className="rounded-md border border-stone-200 px-2.5 py-1 text-[11px] text-stone-500"
                      >
                        已读
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6">
              {messages.map((message) => {
                const isUser = message.role === "user";
                const displayText =
                  message.id === "m-hello"
                    ? recordMode === "expense"
                      ? EXPENSE_GUIDE_TEXT
                      : SAVING_GUIDE_TEXT
                    : message.text;
                return (
                  <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <p
                      className={`max-w-[85%] whitespace-pre-line text-[13px] leading-relaxed ${
                        isUser
                          ? "rounded-2xl rounded-br-md bg-stone-800 px-4 py-2.5 text-stone-100"
                          : "text-stone-500"
                      }`}
                    >
                      {displayText}
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
                <div className="mb-4 rounded-lg border border-stone-200 bg-white px-3 py-2">
                  <p className="text-sm font-medium text-stone-600">步骤引导</p>
                  <p className="mt-1 text-sm text-stone-500">步骤1：先选心理动机 → 步骤2：再选心理属性 → 步骤3：最后选实际类目</p>
                </div>
              )}

              {recordMode === "expense" && (
                <div className="mb-4">
                  <p className="mb-2 text-sm font-medium uppercase tracking-wider text-stone-500">心理动机</p>
                  <div className="space-y-2">
                    {MOTIVE_TAG_GROUPS.map((group) => (
                      <div key={group.title}>
                        <p className="mb-1.5 text-xs text-stone-400">{group.title}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.tags.map((tag) => {
                            const active = selectedMotiveId === tag.id;
                            return (
                              <label
                                key={tag.id}
                                className={`cursor-pointer select-none rounded-full border px-3 py-1.5 text-sm transition-all ${
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
                  <p className="mb-2 text-sm font-medium uppercase tracking-wider text-stone-500">心理属性</p>
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
                          <p className="text-sm font-medium text-stone-600">{option.label}</p>
                          <p className="text-xs text-stone-400">{option.hint}</p>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mb-4">
                  <p className="mb-2 text-sm font-medium uppercase tracking-wider text-stone-500">克制类型</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SAVING_TAGS.map((tag) => {
                      const active = selectedSavingTagId === tag.id;
                      return (
                        <label
                          key={tag.id}
                          className={`cursor-pointer select-none rounded-full border px-3 py-1.5 text-sm transition-all ${
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
                  <p className="mb-2 text-sm font-medium uppercase tracking-wider text-stone-500">实际类目</p>
                  <div className="space-y-2">
                    {REALITY_TAG_GROUPS.map((group) => (
                      <div key={group.title}>
                        <p className="mb-1.5 text-xs text-stone-400">{group.title}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.tags.map((tag) => {
                            const active = selectedRealityId === tag.id;
                            return (
                              <label
                                key={tag.id}
                                className={`cursor-pointer select-none rounded-full border px-3 py-1.5 text-sm transition-all ${
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
                {entries.length === 0 ? (
                  <p className="py-2 text-xs text-stone-400">暂无记录。完成一笔记账后会显示在这里。</p>
                ) : (
                  [...entries]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between border-b border-stone-100 py-2.5">
                        <div className="min-w-0 flex-1">
                          <input
                            type="text"
                            value={entry.note ?? ""}
                            onChange={(event) => updateEntryNote(entry.id, event.target.value)}
                            placeholder="请为该记录添加备注"
                            className="w-full truncate border-none bg-transparent p-0 text-sm text-stone-600 outline-none placeholder:text-stone-300"
                          />
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-stone-400">
                            <span>{formatEntryTimestamp(entry.createdAt)}</span>
                            <select
                              value={entry.category}
                              onChange={(event) => updateEntryCategory(entry.id, event.target.value as Category)}
                              className="border-none bg-transparent text-[11px] text-stone-400 outline-none"
                            >
                              {CATEGORY_ORDER.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          </div>
                          {(entry.motiveTag || entry.attributeTag || entry.realityTag) && (
                            <p className="mt-0.5 text-[10px] text-stone-300">
                              {entry.motiveTag || "—"} / {entry.attributeTag || "—"} / {entry.realityTag || "—"}
                            </p>
                          )}
                        </div>
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={entry.amount}
                          onChange={(event) => updateEntryAmount(entry.id, event.target.value)}
                          className="ml-3 w-20 border-none bg-transparent p-0 text-right font-mono text-sm tabular-nums text-stone-600 outline-none"
                        />
                      </div>
                    ))
                )}
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
                  <p className="mt-2 text-[10px] text-stone-400">
                    时间负债 = 近14天情绪补偿金额 ÷ 真实时薪，表示你为这部分消费额外付出的工作时间。
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
                    <Tooltip formatter={(value) => formatTooltipMoney(value)} />
                    <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </div>
              </div>

              <div>
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  {dashboardMode === "biweekly" ? "分类金额" : "情绪补偿趋势（折线）"}
                </p>
                <div className="overflow-x-auto rounded-xl bg-white p-4">
                  {dashboardMode === "biweekly" ? (
                    <BarChart width={chartWidth} height={220} data={pieData}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => formatTooltipMoney(value)} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {pieData.map((item) => (
                          <Cell key={item.name} fill={CATEGORY_COLORS[item.name as Category]} />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : (
                    <LineChart width={chartWidth} height={220} data={eightWeekTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                      <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => formatTooltipMoney(value)} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="unconscious" stroke={CATEGORY_COLORS["情绪补偿"]} strokeWidth={2} dot={{ r: 3 }} name="情绪补偿" />
                    </LineChart>
                  )}
                </div>
              </div>

              {dashboardMode === "eightWeek" && (
                <div>
                  <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                    克制努力（堆叠柱状）
                  </p>
                  <div className="overflow-x-auto rounded-xl bg-white p-4">
                    <BarChart width={chartWidth} height={220} data={eightWeekTrophyStacked.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                      <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => formatTooltipMoney(value)} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      {eightWeekTrophyStacked.keys.map((key, index) => (
                        <Bar
                          key={key}
                          dataKey={key}
                          stackId="trophy"
                          fill={index % 2 === 0 ? "#b6aea2" : "#d0c7bb"}
                          name={key}
                        />
                      ))}
                    </BarChart>
                  </div>
                </div>
              )}
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
                  <Tooltip formatter={(value) => formatTooltipMoney(value)} />
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
              <p className="mb-4 text-[11px] font-medium uppercase tracking-wider text-stone-400">参数（可自行填写）</p>
              <div className="space-y-0">
                <div className="flex items-center justify-between border-b border-stone-100 py-3">
                  <span className="text-xs text-stone-500">月薪（元）</span>
                  <div className="text-right">
                    <input
                      type="number"
                      min={1}
                      value={monthlySalary}
                      onChange={(event) => setMonthlySalary(event.target.value)}
                      placeholder="在此处填写"
                      className="w-28 border-none bg-transparent text-right font-mono text-sm tabular-nums text-stone-700 outline-none"
                    />
                    <p className="text-[10px] tabular-nums text-stone-400">时薪 {realHourlyWage.toFixed(1)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-b border-stone-100 py-3">
                  <span className="text-xs text-stone-500">现有存款（元）</span>
                  <input
                    type="number"
                    min={0}
                    value={currentSavings}
                    onChange={(event) => setCurrentSavings(event.target.value)}
                    placeholder="在此处填写"
                    className="w-28 border-none bg-transparent text-right font-mono text-sm tabular-nums text-stone-700 outline-none"
                  />
                </div>
                <div className="flex items-center justify-between border-b border-stone-100 py-3">
                  <span className="text-xs text-stone-500">每月预攒钱（元）</span>
                  <input
                    type="number"
                    min={0}
                    value={monthlyInvest}
                    onChange={(event) => setMonthlyInvest(event.target.value)}
                    placeholder="在此处填写"
                    className="w-28 border-none bg-transparent text-right font-mono text-sm tabular-nums text-stone-700 outline-none"
                  />
                </div>
                <div className="flex items-center justify-between border-b border-stone-100 py-3">
                  <span className="text-xs text-stone-500">月生活成本（元）</span>
                  <input
                    type="number"
                    min={0}
                    value={retireMonthlyExpense}
                    onChange={(event) => setRetireMonthlyExpense(event.target.value)}
                    placeholder="在此处填写"
                    className="w-28 border-none bg-transparent text-right font-mono text-sm tabular-nums text-stone-700 outline-none"
                  />
                </div>
                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-xs text-stone-500">年化收益率（%）</span>
                    <p className="text-[10px] text-stone-400">建议 2-3% 稳健为准</p>
                  </div>
                  <div className="flex items-baseline gap-0.5">
                    <input
                      type="number"
                      min={0}
                      max={5}
                      step={0.1}
                      value={annualReturnRate}
                      onChange={(event) => setAnnualReturnRate(event.target.value)}
                      placeholder="在此处填写"
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
    </div>
  );
}

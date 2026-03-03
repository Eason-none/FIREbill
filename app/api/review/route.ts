import { NextResponse } from "next/server";
import OpenAI from "openai";
import { EIGHT_WEEK_REVIEW_SYSTEM_PROMPT, REVIEW_SYSTEM_PROMPT } from "@/lib/reviewPrompt";

type CategorySummary = {
  生存刚需: number;
  情绪补偿: number;
  社交认同: number;
  自我成长: number;
};

type ReviewRequestBody = {
  mode?: "biweekly" | "eightWeek";
  summary: CategorySummary;
  monthlySalary: number;
  conversation?: Array<{ role: "user" | "assistant"; content: string }>;
  followUp?: string;
  trend?: {
    coverageDays: number;
    periods: Array<{
      label: string;
      summary: {
        生存刚需: number;
        情绪补偿: number;
        社交认同: number;
        自我成长: number;
        克制与战利品: number;
      };
      unconsciousItems: Array<{ name: string; amount: number }>;
    }>;
    overallSummary: CategorySummary;
    trophyTotal: number;
    unconsciousTotal: number;
  };
};

function isValidConversation(conversation: unknown): conversation is Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(conversation)) {
    return false;
  }
  return conversation.every(
    (item) =>
      !!item &&
      typeof item === "object" &&
      (item as Record<string, unknown>).role !== undefined &&
      (item as Record<string, unknown>).content !== undefined &&
      ((item as Record<string, unknown>).role === "user" || (item as Record<string, unknown>).role === "assistant") &&
      typeof (item as Record<string, unknown>).content === "string"
  );
}

function isValidSummary(summary: unknown): summary is CategorySummary {
  if (!summary || typeof summary !== "object") {
    return false;
  }
  const s = summary as Record<string, unknown>;
  return (
    typeof s["生存刚需"] === "number" &&
    typeof s["情绪补偿"] === "number" &&
    typeof s["社交认同"] === "number" &&
    typeof s["自我成长"] === "number"
  );
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "DEEPSEEK_API_KEY 未配置，请先在环境变量中设置。" },
        { status: 500 }
      );
    }

    const body = (await request.json()) as Partial<ReviewRequestBody>;
    const mode = body.mode ?? "biweekly";
    if (!isValidSummary(body.summary) || typeof body.monthlySalary !== "number" || body.monthlySalary <= 0) {
      return NextResponse.json(
        { error: "请求体无效。需要 summary(四大分类金额) 和 monthlySalary(>0)。" },
        { status: 400 }
      );
    }

    const summary = body.summary;
    const total = summary["生存刚需"] + summary["情绪补偿"] + summary["社交认同"] + summary["自我成长"];

    const monthlyWorkHours = 21.75 * 8;
    const hourlyWage = body.monthlySalary / monthlyWorkHours;

    const biweeklyUserPrompt = `请基于以下双周记账数据生成复盘（金额单位：人民币）：
- 生存刚需：${summary["生存刚需"]}
- 情绪补偿：${summary["情绪补偿"]}
- 社交认同：${summary["社交认同"]}
- 自我成长：${summary["自我成长"]}
- 总支出：${total}
- 真实月薪：${body.monthlySalary} 元/月
- 换算时薪：${hourlyWage.toFixed(2)} 元/小时（按每月 21.75 天、每天 8 小时）

请严格按系统要求输出约 300 字中文复盘报告，分成三段。`;

    let systemPrompt = REVIEW_SYSTEM_PROMPT;
    let userPrompt = biweeklyUserPrompt;

    if (mode === "eightWeek") {
      if (!body.trend || !Array.isArray(body.trend.periods) || body.trend.periods.length !== 4) {
        return NextResponse.json({ error: "8周模式缺少 trend 数据或周期数量不正确（需4个周期）。" }, { status: 400 });
      }

      const periodLines = body.trend.periods
        .map((period) => {
          const highFreq =
            period.unconsciousItems.length === 0
              ? "无"
              : period.unconsciousItems.map((item) => `${item.name}(${item.amount})`).join("、");
          return `${period.label}：生存刚需${period.summary["生存刚需"]}，情绪补偿${period.summary["情绪补偿"]}，社交认同${period.summary["社交认同"]}，自我成长${period.summary["自我成长"]}，克制与战利品${period.summary["克制与战利品"]}；高频情绪补偿：${highFreq}`;
        })
        .join("\n");

      userPrompt = `请基于以下8周趋势数据生成深度复盘（金额单位：人民币）：
- 数据覆盖天数：${body.trend.coverageDays}
- 月薪：${body.monthlySalary} 元/月
- 换算时薪：${hourlyWage.toFixed(2)} 元/小时
- 8周总分类：生存刚需${body.trend.overallSummary["生存刚需"]}，情绪补偿${body.trend.overallSummary["情绪补偿"]}，社交认同${body.trend.overallSummary["社交认同"]}，自我成长${body.trend.overallSummary["自我成长"]}
- 8周情绪补偿总额：${body.trend.unconsciousTotal}
- 8周克制与战利品总额：${body.trend.trophyTotal}

四个双周周期明细：
${periodLines}`;
      systemPrompt = EIGHT_WEEK_REVIEW_SYSTEM_PROMPT;
    }

    const followUp = typeof body.followUp === "string" ? body.followUp.trim() : "";
    const conversation = body.conversation;
    if (conversation !== undefined && !isValidConversation(conversation)) {
      return NextResponse.json({ error: "conversation 格式无效。" }, { status: 400 });
    }

    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.deepseek.com/v1"
    });

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    if (Array.isArray(conversation) && conversation.length > 0) {
      conversation.forEach((item) => {
        messages.push({ role: item.role, content: item.content });
      });
    }
    if (followUp) {
      messages.push({ role: "user", content: followUp });
    }

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      temperature: 0.7,
      messages
    });

    const report = completion.choices[0]?.message?.content?.trim();
    if (!report) {
      return NextResponse.json({ error: "AI 未返回有效复盘内容，请稍后重试。" }, { status: 502 });
    }

    return NextResponse.json({ report, systemPrompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ error: `复盘生成失败：${message}` }, { status: 500 });
  }
}

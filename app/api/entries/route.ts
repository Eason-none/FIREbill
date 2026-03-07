import { NextRequest, NextResponse } from "next/server";
import { getCloudbaseDb } from "@/lib/cloudbaseServer";

type Category = "生存刚需" | "情绪补偿" | "社交认同" | "自我成长" | "克制与战利品";

type EntryDoc = {
  _id?: string;
  userId: string;
  description: string;
  note?: string;
  amount: number;
  category: Category;
  createdAt: string;
  motiveTag?: string;
  attributeTag?: string;
  realityTag?: string;
};

function getUserId(request: NextRequest): string | null {
  const userId = request.headers.get("x-user-id")?.trim();
  if (!userId || userId.length < 8) {
    return null;
  }
  return userId;
}

function toClientEntry(doc: EntryDoc) {
  return {
    id: doc._id || "",
    description: doc.description || "",
    note: doc.note || "",
    amount: Number(doc.amount || 0),
    category: doc.category,
    createdAt: doc.createdAt || new Date().toISOString(),
    motiveTag: doc.motiveTag || "",
    attributeTag: doc.attributeTag || "",
    realityTag: doc.realityTag || ""
  };
}

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "缺少用户标识 x-user-id。" }, { status: 400 });
  }

  try {
    const db = getCloudbaseDb();
    const result = await db
      .collection("entries")
      .where({ userId })
      .orderBy("createdAt", "desc")
      .limit(1000)
      .get();

    const docs = (result.data || []) as EntryDoc[];
    return NextResponse.json({ entries: docs.map(toClientEntry) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ error: `读取账单失败：${message}` }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "缺少用户标识 x-user-id。" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Partial<EntryDoc>;
    const amount = Number(body.amount);
    if (!body.description || !body.category || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "请求体缺少必要字段。" }, { status: 400 });
    }

    const createdAt = body.createdAt || new Date().toISOString();
    const entry: EntryDoc = {
      userId,
      description: String(body.description),
      note: String(body.note || ""),
      amount,
      category: body.category as Category,
      createdAt,
      motiveTag: String(body.motiveTag || ""),
      attributeTag: String(body.attributeTag || ""),
      realityTag: String(body.realityTag || "")
    };

    const db = getCloudbaseDb();
    const createResult = await db.collection("entries").add(entry);
    const id = String((createResult as { id?: string }).id || "");

    return NextResponse.json({
      entry: {
        ...entry,
        id
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ error: `创建账单失败：${message}` }, { status: 500 });
  }
}


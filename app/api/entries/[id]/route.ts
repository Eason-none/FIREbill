import { NextRequest, NextResponse } from "next/server";
import { getCloudbaseDb } from "@/lib/cloudbaseServer";

type Category = "生存刚需" | "情绪补偿" | "社交认同" | "自我成长" | "克制与战利品";

function getUserId(request: NextRequest): string | null {
  const userId = request.headers.get("x-user-id")?.trim();
  if (!userId || userId.length < 8) {
    return null;
  }
  return userId;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "缺少用户标识 x-user-id。" }, { status: 400 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "缺少记录 id。" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Partial<{
      category: Category;
      note: string;
      amount: number;
    }>;

    const updateData: Record<string, unknown> = {};
    if (body.category) {
      updateData.category = body.category;
    }
    if (typeof body.note === "string") {
      updateData.note = body.note;
    }
    if (typeof body.amount === "number" && Number.isFinite(body.amount) && body.amount >= 0) {
      updateData.amount = body.amount;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "没有可更新字段。" }, { status: 400 });
    }

    const db = getCloudbaseDb();
    const whereResult = await db.collection("entries").where({ _id: id, userId }).limit(1).get();
    if (!whereResult.data || whereResult.data.length === 0) {
      return NextResponse.json({ error: "记录不存在或无权限。" }, { status: 404 });
    }

    await db.collection("entries").doc(id).update(updateData);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ error: `更新失败：${message}` }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "缺少用户标识 x-user-id。" }, { status: 400 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "缺少记录 id。" }, { status: 400 });
  }

  try {
    const db = getCloudbaseDb();
    const whereResult = await db.collection("entries").where({ _id: id, userId }).limit(1).get();
    if (!whereResult.data || whereResult.data.length === 0) {
      return NextResponse.json({ error: "记录不存在或无权限。" }, { status: 404 });
    }

    await db.collection("entries").doc(id).remove();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ error: `删除失败：${message}` }, { status: 500 });
  }
}


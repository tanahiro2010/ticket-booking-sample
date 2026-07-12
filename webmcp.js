// ---------------------------------------------------------------
// WebMCP 命令型 API
// ---------------------------------------------------------------
// 各ツールを document.modelContext.registerTool() に直接渡しています。
// ハンズオンでは、ツール名・スキーマ・処理の対応をこのファイルだけで追えます。

async function registerImperativeTools() {
  if (!document.modelContext || typeof document.modelContext.registerTool !== "function") {
    console.warn("[webmcp] document.modelContext.registerTool が見つかりません。");
    return;
  }

  await Promise.allSettled([
    document.modelContext.registerTool({
      name: "seat_summary",
      description: "会場全体の席サマリー (合計/空席/予約済/使用禁止) を取得する。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const data = await getSeats();
        return {
          summary: data.summary,
          layout: data.layout,
          eventName: data.eventName,
          updatedAt: data.updatedAt,
        };
      },
    }),
    document.modelContext.registerTool({
      name: "seat_list",
      description:
        "全席の状態一覧を取得する。filter を指定すると空席のみ、予約済のみなど絞り込める。",
      inputSchema: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            enum: ["all", "available", "reserved", "disabled"],
            description: "取得する席の絞り込み条件。既定は all。",
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        const filter = (input && input.filter) || "all";
        const data = await getSeats();
        const seats =
          filter === "all" ? data.seats : data.seats.filter((seat) => seat.status === filter);
        return {
          count: seats.length,
          seats: seats.map((seat) => ({
            id: seat.id,
            row: seat.row,
            number: seat.number,
            status: seat.status,
          })),
        };
      },
    }),
    document.modelContext.registerTool({
      name: "my_reservation",
      description: "現在の参加者の予約状況を取得する。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        return { reservation: await getMyReservation() };
      },
    }),
    document.modelContext.registerTool({
      name: "cancel_reservation",
      description: "現在の参加者の予約を解除する。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false },
      execute: async () => {
        const seat = await cancelReservation();
        state.myReservation = null;
        await refreshSeats();
        return { ok: true, seat };
      },
    }),
    document.modelContext.registerTool({
      name: "set_participant_id",
      description:
        "参加者IDを設定する。未設定の場合、この後の予約系ツールを呼ぶ前に必要。",
      inputSchema: {
        type: "object",
        properties: {
          participantId: {
            type: "string",
            pattern: "^[A-Za-z0-9_-]+$",
            minLength: 1,
            maxLength: 64,
            description: "英数字/ハイフン/アンダースコアのみ、1-64 文字。",
          },
        },
        required: ["participantId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        saveParticipantId(input.participantId);
        renderIdentity();
        await refreshMyReservation();
        return { ok: true, participantId: input.participantId };
      },
    }),
  ]);
}

registerImperativeTools();

# 参加者用 席予約サイト (WebMCP 実装済み・完成品参照)

これはハンズオン参加者が最終的に到達する「WebMCP 実装済み」の完成イメージです。

- 参加者へ配布するのは `without-webmcp/` 側です。
- 参加者はハンズオン中に、この `with-webmcp/` に相当する状態を自力で作り上げます。
- 運営はデモや答え合わせに使ってください。

W3C Web Machine Learning CG の [WebMCP 仕様](https://webmachinelearning.github.io/webmcp/) に準拠しており、
[`webmcp-bridge-extension`](../../webmcp-bridge-extension) から検出・実行できます。

## 実装している 2 種類の API

WebMCP 仕様が定める 2 種類の API を **両方** 実装しています。

### 1. 命令型 (imperative) — `document.modelContext.registerTool()`

`webmcp.js` の中で 5 個のツールを `document.modelContext.registerTool()` で登録します。

```js
await document.modelContext.registerTool({
  name: "seat_summary",
  description: "会場全体の席サマリー ...",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
  execute: async () => ({ summary: ..., layout: ..., ... }),
});
```

| ツール名 | 概要 | readOnlyHint |
| --- | --- | --- |
| `seat_summary` | 席サマリー (空席/予約済/使用禁止/合計) | true |
| `seat_list` | 全席一覧 (`filter` で絞込可) | true |
| `my_reservation` | 自分の現在の予約 | true |
| `cancel_reservation` | 自分の予約を解除 | false (dangerous 扱い) |
| `set_participant_id` | 参加者IDを設定 | true |

`document.modelContext` はブラウザネイティブ実装があればそれを、なければ
`webmcp-bridge-extension` が `injected.ts` で polyfill を注入します。

### 2. 宣言型 (declarative) — `<form toolname tooldescription>`

`reserve_seat` ツールは、画面上に実在する標準の `<form>` で表現しています。
JavaScript の submit ハンドラは使わず、`action` と `method` で API を直接呼びます。

```html
<form
  action="http://localhost:8787/api/reservations"
  method="post"
  toolname="reserve_seat"
  tooldescription="指定した席を予約する。1参加者につき1席のみ。..."
>
  <label>
    席番号
    <input
      name="seatId"
      type="text"
      pattern="[A-J]-([1-9]|10)"
      required
      toolparamdescription="予約する席のID。形式は '<行>-<番号>'。..."
    />
  </label>
  <input type="hidden" name="source" value="webmcp" />
  <button type="submit">予約する</button>
</form>
```

- 属性の意味は WebMCP 仕様通りです。
  - `toolname` / `tooldescription` (必須) → ツール名/説明
  - `toolparamdescription` → 各フィールドの説明 (JSON Schema の `description`)
  - `required` / `pattern` → JSON Schema の必須/制約
- `action` はローカル開発用です。デプロイ時は API の URL に変更してください。

## `without-webmcp/` からの差分

3 か所だけです。

1. `webmcp.js` を新規追加 (`document.modelContext.registerTool` × 5)
2. `index.html` に以下を追加:
   - `4. 席番号を指定して予約` セクション (宣言型 `<form toolname="reserve_seat">`)
   - `<script src="./webmcp.js"></script>`
3. `style.css` の末尾に `.declarative-form` のスタイルを追加

`app.js` は一切書き換えていません (`getSeats` / `reserveSeat` / `cancelReservation` /
`saveParticipantId` / `state` などがグローバルスコープに公開されているので、
`webmcp.js` からそのまま参照できるためです)。

## セットアップ

`without-webmcp/` と同じ手順です。

```bash
python3 -m http.server 8000
```

API の URL を変更する場合は、`app.js` の `DEFAULT_CONFIG.apiBaseUrl` と
`index.html` の予約フォームの `action` を変更してください。

Chrome (Chrome for Testing 推奨) に `webmcp-bridge-extension` をインストールした
状態でこのページを開くと、右上に「WebMCPをインストール」ボタンが現れます。
`webmcp-bridge-mcp` から `webmcp_discover_tools` を叩けば、以下の 6 個が返ります。

- `seat_summary` (imperative)
- `seat_list` (imperative)
- `my_reservation` (imperative)
- `cancel_reservation` (imperative)
- `set_participant_id` (imperative)
- `reserve_seat` (**declarative**)

## 使い方の例 (Antigravity 経由)

- 「今の空席状況を教えて」→ `seat_summary`
- 「参加者IDを team-01 にして」→ `set_participant_id({ participantId: "team-01" })`
- 「A-5 の席を予約して」→ `reserve_seat({ seatId: "A-5" })` (**宣言型** = 実際のフォーム送信)
- 「予約をキャンセルして」→ `cancel_reservation`

参加者IDが未設定のまま予約系ツールを呼ぶとエラーになるので、`set_participant_id`
を先に呼ぶか、画面上の入力欄で先に設定してください。

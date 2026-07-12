// ---------------------------------------------------------------
// 参加者用 席予約サイト
// ---------------------------------------------------------------
// 初心者が読みやすいように、状態と処理を平置きしています。
// - state : 画面全体の状態
// - config: API のベース URL 等
// - 関数 : API 呼び出しと DOM 更新
// ---------------------------------------------------------------

const DEFAULT_CONFIG = {
  apiBaseUrl: "http://localhost:8787",
  showReservedBy: false,
};

const config = DEFAULT_CONFIG;

const state = {
  seats: [],
  layout: { rowLabels: [], seatsPerRow: 0 },
  summary: { total: 0, available: 0, reserved: 0, disabled: 0 },
  selectedSeatId: null,
  participantId: null,
  myReservation: null,
  eventName: "",
};

const dom = {
  eventName: document.getElementById("event-name"),
  apiStatus: document.getElementById("api-status"),
  apiStatusDot: document.getElementById("api-status-dot"),
  streamStatus: document.getElementById("stream-status"),
  streamStatusDot: document.getElementById("stream-status-dot"),

  identityForm: document.getElementById("identity-form"),
  identityInput: document.getElementById("participant-id-input"),
  identityCurrent: document.getElementById("identity-current"),
  identityCurrentValue: document.getElementById("identity-current-value"),
  identityClearButton: document.getElementById("identity-clear-button"),

  myReservationView: document.getElementById("my-reservation-view"),
  cancelButton: document.getElementById("cancel-button"),

  summaryTotal: document.getElementById("summary-total"),
  summaryAvailable: document.getElementById("summary-available"),
  summaryReserved: document.getElementById("summary-reserved"),
  summaryDisabled: document.getElementById("summary-disabled"),

  seatGrid: document.getElementById("seat-grid"),
  selectedInfo: document.getElementById("selected-info"),
  reserveButton: document.getElementById("reserve-button"),

  messageArea: document.getElementById("message-area"),
};

// ---------------------------------------------------------------
// API 呼び出し (DOM に依存しない純関数)
// ---------------------------------------------------------------

function buildUrl(path) {
  const base = config.apiBaseUrl.replace(/\/$/, "");
  return base + path;
}

async function apiFetch(path, options) {
  const headers = new Headers((options && options.headers) || {});
  headers.set("Accept", "application/json");
  if (options && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (state.participantId) {
    headers.set("X-Participant-ID", state.participantId);
  }
  const res = await fetch(buildUrl(path), {
    method: (options && options.method) || "GET",
    headers,
    body: options && options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (err) {
    throw new Error("Failed to parse API response");
  }
  if (!res.ok || (json && json.success === false)) {
    const error = new Error((json && json.error && json.error.message) || res.statusText);
    error.code = (json && json.error && json.error.code) || "HTTP_" + res.status;
    error.status = res.status;
    throw error;
  }
  return json.data;
}

async function getSeats() {
  const data = await apiFetch("/api/seats");
  return data;
}

async function getMyReservation() {
  const data = await apiFetch("/api/reservations/me");
  return data.reservation;
}

async function reserveSeat(seatId, source) {
  const data = await apiFetch("/api/reservations", {
    method: "POST",
    body: { seatId: seatId, source: source || "web" },
  });
  return data.reservation;
}

async function cancelReservation() {
  const data = await apiFetch("/api/reservations/me", { method: "DELETE" });
  return data.seat;
}

// ---------------------------------------------------------------
// 参加者ID
// ---------------------------------------------------------------

const PARTICIPANT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function loadParticipantId() {
  const stored = sessionStorage.getItem("participantId");
  if (stored && PARTICIPANT_ID_RE.test(stored)) {
    state.participantId = stored;
  } else {
    state.participantId = null;
  }
}

function saveParticipantId(id) {
  sessionStorage.setItem("participantId", id);
  state.participantId = id;
}

function clearParticipantId() {
  sessionStorage.removeItem("participantId");
  state.participantId = null;
  state.myReservation = null;
}

function renderIdentity() {
  if (state.participantId) {
    dom.identityCurrent.hidden = false;
    dom.identityCurrentValue.textContent = state.participantId;
    dom.identityInput.value = "";
  } else {
    dom.identityCurrent.hidden = true;
  }
}

// ---------------------------------------------------------------
// 描画
// ---------------------------------------------------------------

function renderSummary() {
  dom.summaryTotal.textContent = state.summary.total;
  dom.summaryAvailable.textContent = state.summary.available;
  dom.summaryReserved.textContent = state.summary.reserved;
  dom.summaryDisabled.textContent = state.summary.disabled;
}

function renderMyReservation() {
  if (state.myReservation && state.myReservation.seatId) {
    const seatId = state.myReservation.seatId;
    dom.myReservationView.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = "予約中の席: " + seatId;
    dom.myReservationView.appendChild(p);
    dom.cancelButton.hidden = false;
  } else {
    dom.myReservationView.innerHTML = "";
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = state.participantId
      ? "まだ予約していません。"
      : "参加者IDを入力してください。";
    dom.myReservationView.appendChild(p);
    dom.cancelButton.hidden = true;
  }
}

function renderSeats() {
  const grid = dom.seatGrid;
  grid.innerHTML = "";

  const byRow = {};
  for (const seat of state.seats) {
    if (!byRow[seat.row]) byRow[seat.row] = [];
    byRow[seat.row].push(seat);
  }

  const rowOrder = state.layout.rowLabels.length
    ? state.layout.rowLabels
    : Object.keys(byRow).sort();

  for (const rowLabel of rowOrder) {
    const rowEl = document.createElement("div");
    rowEl.className = "seat-row";
    rowEl.setAttribute("role", "row");

    const label = document.createElement("span");
    label.className = "seat-row-label";
    label.textContent = rowLabel;
    label.setAttribute("aria-hidden", "true");
    rowEl.appendChild(label);

    const seatsInRow = (byRow[rowLabel] || []).slice().sort((a, b) => a.number - b.number);
    for (const seat of seatsInRow) {
      rowEl.appendChild(createSeatElement(seat));
    }
    grid.appendChild(rowEl);
  }

  updateReserveButton();
}

function createSeatElement(seat) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "seat";
  button.textContent = seat.id;
  button.dataset.seatId = seat.id;
  button.setAttribute("role", "gridcell");

  const isMine =
    state.myReservation && state.myReservation.seatId === seat.id;

  let statusLabel = "空席";
  if (seat.status === "reserved") {
    button.classList.add(isMine ? "is-mine" : "is-reserved");
    statusLabel = isMine ? "あなたの予約" : "予約済み";
    button.disabled = !isMine;
  } else if (seat.status === "disabled") {
    button.classList.add("is-disabled");
    statusLabel = "使用禁止";
    button.disabled = true;
  } else {
    button.classList.add("is-available");
    button.disabled = false;
  }

  if (state.selectedSeatId === seat.id) {
    button.classList.add("is-selected");
    statusLabel = "選択中";
  }

  button.setAttribute("aria-label", seat.id + " " + statusLabel);

  button.addEventListener("click", function () {
    onSeatClick(seat);
  });
  return button;
}

function updateReserveButton() {
  if (!state.participantId) {
    dom.reserveButton.disabled = true;
    dom.selectedInfo.textContent = "先に参加者IDを入力してください";
    return;
  }
  if (state.myReservation && state.myReservation.seatId) {
    dom.reserveButton.disabled = true;
    dom.selectedInfo.textContent =
      "既に " + state.myReservation.seatId + " を予約中です";
    return;
  }
  if (!state.selectedSeatId) {
    dom.reserveButton.disabled = true;
    dom.selectedInfo.textContent = "席を選んでください";
    return;
  }
  dom.reserveButton.disabled = false;
  dom.selectedInfo.textContent = state.selectedSeatId + " を予約する";
}

// ---------------------------------------------------------------
// メッセージ表示
// ---------------------------------------------------------------

function showMessage(kind, text) {
  const el = document.createElement("div");
  el.className = "message is-" + kind;
  el.textContent = text;
  dom.messageArea.appendChild(el);
  setTimeout(function () {
    el.remove();
  }, 4500);
}

// ---------------------------------------------------------------
// 操作
// ---------------------------------------------------------------

function onSeatClick(seat) {
  if (!state.participantId) {
    showMessage("info", "参加者IDを入力してください");
    return;
  }
  if (state.myReservation && state.myReservation.seatId) {
    showMessage("info", "既に予約があります。先に解除してください。");
    return;
  }
  if (seat.status !== "available") {
    showMessage("info", seat.id + " は選択できません");
    return;
  }
  state.selectedSeatId = seat.id;
  renderSeats();
}

async function reserveSelectedSeat() {
  if (!state.selectedSeatId || !state.participantId) return;
  const seatId = state.selectedSeatId;
  const ok = window.confirm(seatId + " を予約しますか？");
  if (!ok) return;
  try {
    setApiStatus(true);
    const reservation = await reserveSeat(seatId, "web");
    state.myReservation = reservation;
    state.selectedSeatId = null;
    showMessage("success", seatId + " を予約しました");
    await refreshSeats();
  } catch (err) {
    handleApiError(err);
  }
}

async function cancelMyReservation() {
  if (!state.participantId) return;
  const seatId = state.myReservation && state.myReservation.seatId;
  const ok = window.confirm((seatId || "自分") + " の予約を解除しますか？");
  if (!ok) return;
  try {
    await cancelReservation();
    state.myReservation = null;
    showMessage("success", "予約を解除しました");
    await refreshSeats();
  } catch (err) {
    handleApiError(err);
  }
}

function handleApiError(err) {
  console.warn("API error:", err);
  const code = (err && err.code) || "ERROR";
  const message = (err && err.message) || "API 呼び出しに失敗しました";
  showMessage("error", "[" + code + "] " + message);
}

// ---------------------------------------------------------------
// データ取得 & リアルタイム更新
// ---------------------------------------------------------------

async function refreshSeats() {
  try {
    const data = await getSeats();
    state.seats = data.seats;
    state.summary = data.summary;
    state.layout = data.layout;
    state.eventName = data.eventName;
    if (data.eventName) {
      dom.eventName.textContent = data.eventName;
      document.title = data.eventName;
    }
    setApiStatus(true);
    renderSeats();
    renderSummary();
    renderMyReservation();
  } catch (err) {
    setApiStatus(false);
    handleApiError(err);
  }
}

async function refreshMyReservation() {
  if (!state.participantId) {
    state.myReservation = null;
    renderMyReservation();
    return;
  }
  try {
    const reservation = await getMyReservation();
    state.myReservation = reservation;
    renderMyReservation();
    renderSeats();
  } catch (err) {
    handleApiError(err);
  }
}

function setApiStatus(ok) {
  if (ok) {
    dom.apiStatus.textContent = "接続中";
    dom.apiStatusDot.className = "status-dot is-ok";
  } else {
    dom.apiStatus.textContent = "エラー";
    dom.apiStatusDot.className = "status-dot is-error";
  }
}

function setStreamStatus(status) {
  const dot = dom.streamStatusDot;
  if (status === "open") {
    dom.streamStatus.textContent = "接続中";
    dot.className = "status-dot is-ok";
  } else if (status === "closed") {
    dom.streamStatus.textContent = "切断";
    dot.className = "status-dot is-error";
  } else {
    dom.streamStatus.textContent = "接続中...";
    dot.className = "status-dot";
  }
}

let eventSource = null;

function connectRealtimeUpdates() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  setStreamStatus("connecting");
  const es = new EventSource(buildUrl("/api/events"));
  eventSource = es;

  es.addEventListener("connection.ready", function () {
    setStreamStatus("open");
  });

  es.addEventListener("seat.updated", function (ev) {
    try {
      const data = JSON.parse(ev.data);
      applySeatUpdate(data);
    } catch (err) {
      console.warn("failed to parse seat.updated", err);
    }
  });

  es.addEventListener("reservation.created", function () {
    // 差分は seat.updated で反映されるのでここでは何もしない
  });

  es.addEventListener("reservation.deleted", function () {
    // 同上
  });

  es.addEventListener("seats.reset", function () {
    refreshSeats();
    refreshMyReservation();
  });

  es.addEventListener("heartbeat", function () {
    // 何もしない (接続維持のため)
  });

  es.onerror = function () {
    setStreamStatus("closed");
    // ブラウザが自動再接続する。手動で再接続はしない。
  };
  es.onopen = function () {
    setStreamStatus("open");
  };
}

function applySeatUpdate(update) {
  const idx = state.seats.findIndex(function (s) {
    return s.id === update.seatId;
  });
  if (idx < 0) return;
  const prev = state.seats[idx];
  const next = Object.assign({}, prev, {
    status: update.status,
    reservedBy: update.reservedBy || null,
    reservationSource: update.source || null,
    reservedAt: update.reservedAt || prev.reservedAt,
    updatedAt: update.updatedAt || new Date().toISOString(),
  });
  if (update.status !== "reserved") {
    next.reservedBy = null;
    next.reservedAt = null;
    next.reservationSource = null;
  }
  state.seats[idx] = next;

  // サマリーを差分更新
  recomputeSummary();

  // 自分の予約状態を反映
  if (state.participantId && state.myReservation && state.myReservation.seatId === update.seatId) {
    if (update.status !== "reserved") {
      state.myReservation = null;
    }
  }

  renderSeats();
  renderSummary();
  renderMyReservation();
}

function recomputeSummary() {
  const s = { total: state.seats.length, available: 0, reserved: 0, disabled: 0 };
  for (const seat of state.seats) {
    if (seat.status === "available") s.available++;
    else if (seat.status === "reserved") s.reserved++;
    else if (seat.status === "disabled") s.disabled++;
  }
  state.summary = s;
}

// ---------------------------------------------------------------
// イベント登録
// ---------------------------------------------------------------

dom.identityForm.addEventListener("submit", function (ev) {
  ev.preventDefault();
  const raw = dom.identityInput.value.trim();
  if (!PARTICIPANT_ID_RE.test(raw)) {
    showMessage("error", "参加者IDが不正です (英数字/ハイフン/アンダースコアのみ)");
    return;
  }
  saveParticipantId(raw);
  renderIdentity();
  showMessage("success", raw + " として参加します");
  refreshMyReservation();
});

dom.identityClearButton.addEventListener("click", function () {
  clearParticipantId();
  renderIdentity();
  renderMyReservation();
  renderSeats();
  showMessage("info", "参加者IDをリセットしました");
});

dom.reserveButton.addEventListener("click", function () {
  reserveSelectedSeat();
});

dom.cancelButton.addEventListener("click", function () {
  cancelMyReservation();
});

// ---------------------------------------------------------------
// 起動
// ---------------------------------------------------------------

async function boot() {
  loadParticipantId();
  renderIdentity();
  renderMyReservation();
  await refreshSeats();
  await refreshMyReservation();
  connectRealtimeUpdates();
}

boot();

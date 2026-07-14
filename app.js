// 席予約画面で使う最小限の API と描画処理

const API_BASE_URL = "http://localhost:8787";

function participantId() {
  return document.querySelector("#participant-id").value.trim();
}

function seatIdInput() {
  return document.querySelector('input[name="seatId"]');
}

function selectSeat(seatId) {
  const input = seatIdInput();
  input.value = seatId;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  updateSelectedSeat();
}

function updateSelectedSeat() {
  const selectedSeatId = seatIdInput().value.trim();
  document.querySelectorAll(".seat-chip").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.seatId === selectedSeatId);
  });
}

function statusLabel(status) {
  return {
    available: "空席",
    reserved: "予約済",
    disabled: "使用禁止",
  }[status] || status;
}

function renderSeatMap(seats) {
  const seatMap = document.querySelector("#seat-map");
  const rows = new Map();

  for (const seat of seats) {
    if (!rows.has(seat.row)) {
      rows.set(seat.row, []);
    }
    rows.get(seat.row).push(seat);
  }

  seatMap.innerHTML = "";

  for (const rowName of [...rows.keys()].sort()) {
    const row = document.createElement("div");
    row.className = "seat-map-row";

    const label = document.createElement("span");
    label.className = "seat-map-row-label";
    label.textContent = rowName;
    row.append(label);

    const rowSeats = rows.get(rowName).sort((a, b) => a.number - b.number);
    for (const seat of rowSeats) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `seat-chip is-${seat.status}`;
      button.dataset.seatId = seat.id;
      button.textContent = seat.id;
      button.disabled = seat.status !== "available";
      button.setAttribute("aria-label", `${seat.id}: ${statusLabel(seat.status)}`);

      if (seat.status === "available") {
        button.addEventListener("click", () => selectSeat(seat.id));
      }

      row.append(button);
    }

    seatMap.append(row);
  }

  updateSelectedSeat();
}

async function apiFetch(path, options = {}) {
  const headers = { Accept: "application/json", ...options.headers };

  if (participantId()) {
    headers["X-Participant-ID"] = participantId();
  }
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(API_BASE_URL + path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await response.json();

  if (!response.ok || json.success === false) {
    throw new Error(json.error?.message || response.statusText);
  }

  return json.data;
}

async function getSeats() {
  return apiFetch("/api/seats");
}

async function getMyReservation() {
  return apiFetch("/api/reservations/me");
}

async function cancelReservation() {
  return apiFetch("/api/reservations/me", { method: "DELETE" });
}

async function render() {
  try {
    const data = await getSeats();
    document.querySelector("#event-name").textContent = data.eventName || "席予約";
    document.querySelector("#summary").textContent =
      `合計 ${data.summary.total} / 空席 ${data.summary.available} / ` +
      `予約済 ${data.summary.reserved} / 使用禁止 ${data.summary.disabled}`;
    renderSeatMap(data.seats);
    document.querySelector("#seat-list").innerHTML = data.seats
      .map((seat) => `<tr><td>${seat.id}</td><td>${seat.status}</td></tr>`)
      .join("");
    document.querySelector("#error").textContent = "";
  } catch (error) {
    document.querySelector("#error").textContent = error.message;
  }
}

async function renderMyReservation() {
  const output = document.querySelector("#my-reservation");
  const cancelButton = document.querySelector("#cancel-button");

  if (!participantId()) {
    output.textContent = "参加者IDを入力してください。";
    cancelButton.hidden = true;
    return;
  }

  try {
    const data = await getMyReservation();
    const reservation = data.reservation;
    output.textContent = reservation ? `予約中: ${reservation.seatId}` : "予約はありません。";
    cancelButton.hidden = !reservation;
  } catch (error) {
    output.textContent = error.message;
    cancelButton.hidden = true;
  }
}

document.querySelector("#participant-id").addEventListener("change", renderMyReservation);
seatIdInput().addEventListener("input", updateSelectedSeat);

document.querySelector("#cancel-button").addEventListener("click", async () => {
  try {
    await cancelReservation();
    await render();
    await renderMyReservation();
  } catch (error) {
    document.querySelector("#error").textContent = error.message;
  }
});

render();
renderMyReservation();

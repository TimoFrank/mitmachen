(function () {
  "use strict";
  const state = { date: new Date(), mode: "month", initialized: false };
  const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  let current = null;
  const text = (value) => value == null ? "" : String(value).trim();
  const escape = (value) => text(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const monthKey = (date) => dayKey(date).slice(0, 7);
  const localDate = (year, month, day = 1) => new Date(year, month, day, 12);
  const label = (date, options) => date.toLocaleDateString("de-DE", options);
  const countLabel = (count) => `${count} ${count === 1 ? "Termin" : "Termine"}`;
  const monthLabel = (date) => label(date, { month: "long", year: "numeric" });
  const fullDate = (date) => label(date, { day: "2-digit", month: "2-digit", year: "numeric" });
  const chevron = (direction) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${direction < 0 ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"}"></path></svg>`;

  function rowDate(row) {
    const raw = text(row.scheduledOn);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (match) {
      const date = localDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      return dayKey(date) === raw ? date : null;
    }
    if (!/^\d{4}-\d{2}-\d{2}T/.test(raw)) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : localDate(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function monday(date) {
    return localDate(date.getFullYear(), date.getMonth(), date.getDate() - (date.getDay() + 6) % 7);
  }

  function period() {
    const date = state.date;
    if (state.mode === "year") return { start: localDate(date.getFullYear(), 0), end: localDate(date.getFullYear(), 11, 31), title: String(date.getFullYear()) };
    if (state.mode === "week") {
      const start = monday(date);
      const end = localDate(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      return { start, end, title: `${fullDate(start)} bis ${fullDate(end)}` };
    }
    return { start: localDate(date.getFullYear(), date.getMonth()), end: localDate(date.getFullYear(), date.getMonth() + 1, 0), title: monthLabel(date) };
  }

  function inPeriod(row, range) {
    return row.date && row.date >= range.start && row.date <= range.end;
  }

  function lastOccupiedMonth() {
    const dated = current.rows.filter((row) => row.date);
    return dated.length ? new Date(dated[dated.length - 1].date) : null;
  }

  function selectDate(date, mode = state.mode, focus = "") {
    state.date = date;
    state.mode = mode;
    state.initialized = true;
    paint(focus);
  }

  function eventMarkup(row, compact = false) {
    const meaningfulContact = row.contactName && !/nicht hinterlegt|nicht zugeordnet/i.test(row.contactName);
    const title = meaningfulContact ? row.contactName : row.title || row.organizationName || "Hospitation";
    const organization = text(row.organizationName || row.title);
    const meta = [organization !== title ? organization : "", row.sector].filter(Boolean).join(" · ");
    const status = row.status || "Status offen";
    const aria = [row.date ? fullDate(row.date) : "Termin ohne Datum", title, meta, status].filter(Boolean).join(", ");
    const tone = /durchgeführt|dokumentiert/i.test(status) ? "done" : "open";
    return `<button type="button" class="hfc-event${compact ? " hfc-event--compact" : ""}" data-hfc-open="${escape(row.id)}" data-status="${tone}" aria-label="${escape(aria)}" title="${escape(aria)}">${compact && row.date ? `<time datetime="${dayKey(row.date)}">${label(row.date, { day: "2-digit", month: "2-digit" })}</time>` : ""}<span class="hfc-event-copy"><strong>${escape(title)}</strong>${!compact && meta ? `<span>${escape(meta)}</span>` : ""}${!compact ? `<small>${escape(status)}</small>` : ""}</span></button>`;
  }

  function headerMarkup(range, rows) {
    const yearMode = state.mode === "year";
    const picker = yearMode
      ? `<input type="number" inputmode="numeric" min="1900" max="2200" step="1" value="${state.date.getFullYear()}" data-hfc-year aria-label="Jahr auswählen">`
      : `<input type="month" min="1900-01" max="2200-12" value="${monthKey(state.date)}" data-hfc-month aria-label="Monat und Jahr auswählen">`;
    return `<div class="hfc-head"><div class="hfc-period"><label class="hfc-picker"><span class="hfc-sr-only">${yearMode ? "Jahr" : "Monat und Jahr"}</span>${picker}</label><div class="hfc-navigation" role="group" aria-label="Kalenderzeitraum wechseln"><button type="button" data-hfc-nav="-1" aria-label="Vorheriger Zeitraum" title="Vorheriger Zeitraum">${chevron(-1)}</button><button type="button" data-hfc-nav="today">Heute</button><button type="button" data-hfc-nav="1" aria-label="Nächster Zeitraum" title="Nächster Zeitraum">${chevron(1)}</button></div></div><div class="hfc-modes" role="group" aria-label="Kalenderzeitraum">${[["week", "Woche"], ["month", "Monat"], ["year", "Jahr"]].map(([mode, title]) => `<button type="button" data-hfc-mode="${mode}" aria-pressed="${state.mode === mode}">${title}</button>`).join("")}</div></div><p class="hfc-summary" aria-live="polite"><strong>${escape(range.title)}</strong><span>${countLabel(rows.length)}</span></p>`;
  }

  function gridMarkup(range, rows) {
    const start = state.mode === "week" ? range.start : monday(range.start);
    const last = state.mode === "week" ? range.end : localDate(range.end.getFullYear(), range.end.getMonth(), range.end.getDate() + (7 - range.end.getDay()) % 7);
    const days = [];
    const today = dayKey(new Date());
    for (let date = new Date(start); date <= last; date.setDate(date.getDate() + 1)) {
      const key = dayKey(date);
      const entries = rows.filter((row) => row.key === key);
      const outside = state.mode === "month" && date.getMonth() !== state.date.getMonth();
      const maximum = state.mode === "week" ? entries.length : 3;
      days.push(`<div class="hfc-day${outside ? " is-outside" : ""}${key === today ? " is-today" : ""}" aria-label="${escape(fullDate(date))}"><time class="hfc-day-number" datetime="${key}"${key === today ? ' aria-current="date"' : ""}>${date.getDate()}</time>${entries.slice(0, maximum).map((row) => eventMarkup(row)).join("")}${entries.length > maximum ? `<button type="button" class="hfc-more" data-hfc-week="${key}" aria-label="Alle ${entries.length} Termine am ${escape(fullDate(date))} in der Wochenansicht anzeigen">+${entries.length - maximum} weitere</button>` : ""}</div>`);
    }
    return `<div class="hfc-grid hfc-grid--${state.mode}" aria-label="${escape(range.title)}">${weekdays.map((day) => `<span class="hfc-weekday">${day}</span>`).join("")}${days.join("")}</div>`;
  }

  function agendaMarkup(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      if (!groups.has(row.key)) groups.set(row.key, { date: row.date, rows: [] });
      groups.get(row.key).rows.push(row);
    });
    return `<div class="hfc-agenda" aria-label="Terminagenda">${[...groups.values()].map((group) => `<section class="hfc-agenda-day"><h4>${escape(label(group.date, { weekday: "long", day: "2-digit", month: "long" }))}</h4>${group.rows.map((row) => eventMarkup(row)).join("")}</section>`).join("")}</div>`;
  }

  function yearMarkup(rows) {
    return `<div class="hfc-year" aria-label="Monate im Jahr ${state.date.getFullYear()}">${Array.from({ length: 12 }, (_, month) => {
      const date = localDate(state.date.getFullYear(), month);
      const entries = rows.filter((row) => row.date.getMonth() === month);
      return `<section class="hfc-year-month${entries.length ? " has-events" : ""}"><button type="button" class="hfc-year-title" data-hfc-jump="${monthKey(date)}" aria-label="${escape(monthLabel(date))} mit ${countLabel(entries.length)} öffnen"><strong>${escape(label(date, { month: "long" }))}</strong><span>${entries.length}</span></button><div class="hfc-year-events">${entries.slice(0, 3).map((row) => eventMarkup(row, true)).join("") || '<span class="hfc-year-empty">Keine Termine</span>'}${entries.length > 3 ? `<button type="button" class="hfc-more" data-hfc-jump="${monthKey(date)}">Alle ${entries.length} Termine</button>` : ""}</div></section>`;
    }).join("")}</div>`;
  }

  function paint(focus = "") {
    if (!current) return;
    const range = period();
    const rows = current.rows.filter((row) => inPeriod(row, range));
    const undated = current.rows.filter((row) => !row.date);
    const lastDate = lastOccupiedMonth();
    const empty = !rows.length ? `<p class="hfc-empty">Keine Termine in diesem Zeitraum.${lastDate ? ' <button type="button" data-hfc-latest>Letzten belegten Monat anzeigen</button>' : ""}</p>` : "";
    current.container.innerHTML = `<section class="hospitation-framework-calendar" data-hfc-view="${state.mode}" aria-label="Hospitationskalender">${headerMarkup(range, rows)}${empty}${state.mode === "year" ? yearMarkup(rows) : gridMarkup(range, rows) + agendaMarkup(rows)}${undated.length ? `<section class="hfc-undated"><h4>Termine ohne Datum <span>${undated.length}</span></h4><div>${undated.map((row) => eventMarkup(row)).join("")}</div></section>` : ""}</section>`;
    current.container.onclick = handleClick;
    current.container.onchange = handleChange;
    if (focus) current.container.querySelector(focus)?.focus({ preventScroll: true });
  }

  function handleClick(event) {
    const button = event.target.closest("button");
    if (!button || !current.container.contains(button)) return;
    const data = button.dataset;
    if (Object.prototype.hasOwnProperty.call(data, "hfcOpen")) {
      if (typeof current.openHospitation === "function") current.openHospitation(data.hfcOpen);
      return;
    }
    if (data.hfcMode) return selectDate(state.date, data.hfcMode, `[data-hfc-mode="${data.hfcMode}"]`);
    if (data.hfcNav) {
      const direction = Number(data.hfcNav);
      const date = data.hfcNav === "today" ? new Date() : state.mode === "year"
        ? localDate(state.date.getFullYear() + direction, state.date.getMonth())
        : state.mode === "week" ? localDate(state.date.getFullYear(), state.date.getMonth(), state.date.getDate() + direction * 7)
          : localDate(state.date.getFullYear(), state.date.getMonth() + direction);
      return selectDate(date, state.mode, `[data-hfc-nav="${data.hfcNav}"]`);
    }
    if (Object.prototype.hasOwnProperty.call(data, "hfcLatest")) return selectDate(lastOccupiedMonth() || new Date(), "month", "[data-hfc-month]");
    if (data.hfcJump) return selectDate(localDate(Number(data.hfcJump.slice(0, 4)), Number(data.hfcJump.slice(5, 7)) - 1), "month", "[data-hfc-month]");
    if (data.hfcWeek) return selectDate(localDate(Number(data.hfcWeek.slice(0, 4)), Number(data.hfcWeek.slice(5, 7)) - 1, Number(data.hfcWeek.slice(8, 10))), "week", '[data-hfc-mode="week"]');
  }

  function handleChange(event) {
    const control = event.target;
    if (control.matches("[data-hfc-month]") && /^\d{4}-\d{2}$/.test(control.value) && control.validity.valid) {
      selectDate(localDate(Number(control.value.slice(0, 4)), Number(control.value.slice(5, 7)) - 1), state.mode, "[data-hfc-month]");
    } else if (control.matches("[data-hfc-year]") && control.value && control.validity.valid) {
      selectDate(localDate(Number(control.value), state.date.getMonth()), "year", "[data-hfc-year]");
    }
  }

  function render(container, options = {}) {
    if (!container) return;
    const rows = (Array.isArray(options.rows) ? options.rows : []).filter((row) => row && text(row.id)).map((row) => {
      const date = rowDate(row);
      return { ...row, id: text(row.id), date, key: date ? dayKey(date) : "", contactName: text(row.contactName), title: text(row.title), organizationName: text(row.organizationName), status: text(row.status), sector: text(row.sector) };
    }).sort((left, right) => (left.date?.getTime() || Infinity) - (right.date?.getTime() || Infinity) || left.id.localeCompare(right.id));
    current = { container, rows, openHospitation: options.openHospitation };
    if (!state.initialized && rows.some((row) => row.date)) {
      const todayMonth = monthKey(new Date());
      if (!rows.some((row) => row.date && monthKey(row.date) === todayMonth)) state.date = lastOccupiedMonth();
      state.initialized = true;
    }
    paint();
  }

  window.HospitationFrameworkCalendar = Object.freeze({ render });
})();

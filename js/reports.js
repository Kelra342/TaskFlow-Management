/* TaskFlow Reports
   A period-based performance report built from TaskFlowStore.
   The dashboard shows what needs doing now; this page looks back over a
   chosen period and explains how things went. */

(function () {
    "use strict";

    const store = window.TaskFlowStore;

    if (!store) return;

    const $ = id => document.getElementById(id);

    const SVG_NS = "http://www.w3.org/2000/svg";
    const PRIORITIES = ["High", "Medium", "Low"];
    const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
    const MAX_LEDGER_ROWS = 200;
    const MAX_RANGE_DAYS = 3660; /* about 10 years */

    /* The report currently on screen (used by CSV export) */
    let current = null;

    /* ---------- small helpers ---------- */

    function el(tag, className, text) {
        const node = document.createElement(tag);

        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;

        return node;
    }

    function svgEl(tag, attrs, text) {
        const node = document.createElementNS(SVG_NS, tag);

        Object.keys(attrs || {}).forEach(key => {
            node.setAttribute(key, attrs[key]);
        });

        if (text !== undefined) node.textContent = text;

        return node;
    }

    function clear(node) {
        node.replaceChildren();
    }

    function pad(n) {
        return String(n).padStart(2, "0");
    }

    /* Local date as YYYY-MM-DD */
    function stamp(date) {
        return [
            date.getFullYear(),
            pad(date.getMonth() + 1),
            pad(date.getDate())
        ].join("-");
    }

    function isoStamp(iso) {
        if (!iso) return null;

        const d = new Date(iso);

        return isNaN(d) ? null : stamp(d);
    }

    function createdStamp(task) {
        return isoStamp(task.createdAt);
    }

    function completedStamp(task) {
        return task.status === "Completed"
            ? isoStamp(task.completedAt)
            : null;
    }

    function addDays(day, n) {
        const d = store.parseDay(day);

        d.setDate(d.getDate() + n);

        return stamp(d);
    }

    function diffDays(from, to) {
        return Math.round(
            (store.parseDay(to) - store.parseDay(from)) / 86400000
        );
    }

    function inRange(day, start, end) {
        return Boolean(day) && day >= start && day <= end;
    }

    function fmtDate(day) {
        return store.parseDay(day).toLocaleDateString(
            undefined,
            { month: "short", day: "numeric", year: "numeric" }
        );
    }

    function fmtShort(day) {
        return store.parseDay(day).toLocaleDateString(
            undefined,
            { month: "short", day: "numeric" }
        );
    }

    function plural(n, word) {
        return `${n} ${word}${n === 1 ? "" : "s"}`;
    }

    function percent(part, whole) {
        return whole ? Math.round(part / whole * 100) : 0;
    }

    function trim(value) {
        return String(Math.round(value * 10) / 10);
    }

    function dayName(weekday, style) {
        /* 7 Jan 2024 was a Sunday */
        return new Date(2024, 0, 7 + weekday).toLocaleDateString(
            undefined,
            { weekday: style || "long" }
        );
    }

    /* ---------- task outcomes ---------- */

    /* How a task turned out relative to its deadline */
    function outcome(task) {
        const done = completedStamp(task);

        if (task.status === "Completed") {
            if (!task.dueDate) return { kind: "done", days: 0 };
            if (!done) return { kind: "ontime", days: 0 };

            const late = diffDays(task.dueDate, done);

            return late > 0
                ? { kind: "late", days: late }
                : { kind: "ontime", days: 0 };
        }

        if (task.dueDate) {
            const over = diffDays(task.dueDate, store.today());

            if (over > 0) return { kind: "missed", days: over };
        }

        return { kind: "open", days: 0 };
    }

    function outcomeText(result) {
        switch (result.kind) {
            case "ontime": return "On time";
            case "late":   return "Late by " + plural(result.days, "day");
            case "missed": return "Missed by " + plural(result.days, "day");
            case "done":   return "Completed";
            default:       return "Open";
        }
    }

    function daysToFinish(task) {
        const created = createdStamp(task);
        const done = completedStamp(task);

        if (!created || !done) return null;

        return Math.max(0, diffDays(created, done));
    }

    /* ---------- report period ---------- */

    function earliestDay(tasks) {
        let min = null;

        tasks.forEach(task => {
            [
                createdStamp(task),
                task.dueDate || null,
                completedStamp(task)
            ].forEach(day => {
                if (day && (min === null || day < min)) min = day;
            });
        });

        return min || store.today();
    }

    function getRange(tasks) {
        const today = store.today();
        const preset = $("presetSelect").value;

        let start;
        let end = today;
        let error = null;

        if (preset === "7") {
            start = addDays(today, -6);

        } else if (preset === "30") {
            start = addDays(today, -29);

        } else if (preset === "month") {
            start = today.slice(0, 8) + "01";

        } else if (preset === "lastmonth") {
            const d = store.parseDay(today);

            start = stamp(new Date(d.getFullYear(), d.getMonth() - 1, 1, 12));
            end = stamp(new Date(d.getFullYear(), d.getMonth(), 0, 12));

        } else if (preset === "all") {
            start = earliestDay(tasks);

            if (start > end) start = end;

        } else {
            start = $("fromDate").value || addDays(today, -29);
            end = $("toDate").value || today;

            if (start > end) {
                error =
                    "The start date was after the end date, " +
                    "so the two dates were swapped.";

                [start, end] = [end, start];
            }
        }

        /* Keep the report to a sensible size */
        if (diffDays(start, end) + 1 > MAX_RANGE_DAYS) {
            start = addDays(end, -(MAX_RANGE_DAYS - 1));

            error =
                "Reports cover at most 10 years, so the start date was " +
                "moved to " + fmtDate(start) + ".";
        }

        return { preset, start, end, error };
    }

    /* ---------- analysis ---------- */

    function analyze(tasks, start, end) {
        const created = tasks.filter(
            task => inRange(createdStamp(task), start, end)
        );

        const completed = tasks.filter(
            task => inRange(completedStamp(task), start, end)
        );

        const due = tasks.filter(
            task => inRange(task.dueDate, start, end)
        );

        const count = { ontime: 0, late: 0, missed: 0, open: 0 };

        due.forEach(task => {
            count[outcome(task).kind]++;
        });

        const resolved = count.ontime + count.late + count.missed;

        const rate = resolved
            ? Math.round(count.ontime / resolved * 100)
            : null;

        const spans = completed
            .map(daysToFinish)
            .filter(value => value !== null);

        const avg = spans.length
            ? spans.reduce((a, b) => a + b, 0) / spans.length
            : null;

        return { created, completed, due, count, resolved, rate, avg };
    }

    function priorityStats(report) {
        return PRIORITIES.map(priority => {
            const group = report.due.filter(
                task => task.priority === priority
            );

            const count = { ontime: 0, late: 0, missed: 0, open: 0 };

            group.forEach(task => {
                count[outcome(task).kind]++;
            });

            const resolved = count.ontime + count.late + count.missed;

            return {
                priority,
                total: group.length,
                count,
                resolved,
                rate: resolved
                    ? Math.round(count.ontime / resolved * 100)
                    : null
            };
        });
    }

    /* ---------- summary ---------- */

    function delta(cur, prev, comparing, higherIsBetter, unit) {
        if (!comparing) {
            return { text: "No comparison for all time", cls: "" };
        }

        if (cur === null || prev === null) {
            return { text: "No data to compare", cls: "" };
        }

        const diff = Math.round((cur - prev) * 10) / 10;

        if (diff === 0) {
            return { text: "No change vs previous period", cls: "" };
        }

        const up = diff > 0;

        let cls = "";

        if (higherIsBetter !== null) {
            cls = up === higherIsBetter ? "good" : "bad";
        }

        return {
            text: `${up ? "▲" : "▼"} ${trim(Math.abs(diff))}${unit} ` +
                  "vs previous period",
            cls
        };
    }

    function setKpi(id, value, change) {
        $(id).textContent = value;

        const note = $(id + "Delta");

        note.textContent = change.text;
        note.className = "rp-delta" + (change.cls ? " " + change.cls : "");
    }

    function narrative(report, range) {
        const when = range.start === range.end
            ? "on " + fmtDate(range.start)
            : `between ${fmtDate(range.start)} and ${fmtDate(range.end)}`;

        if (!report.created.length &&
            !report.completed.length &&
            !report.due.length) {
            return `No task activity was recorded ${when}.`;
        }

        let text =
            `${when.charAt(0).toUpperCase()}${when.slice(1)}, you created ` +
            `${plural(report.created.length, "task")} and completed ` +
            `${plural(report.completed.length, "task")}.`;

        if (report.due.length) {
            const parts = [
                `${report.count.ontime} on time`,
                `${report.count.late} late`,
                `${report.count.missed} missed`
            ];

            if (report.count.open) {
                parts.push(`${report.count.open} still open`);
            }

            text +=
                ` ${plural(report.due.length, "task")} had a deadline ` +
                `in this period: ${parts.join(", ")}.`;
        } else {
            text += " No deadlines fell within this period.";
        }

        return text;
    }

    function renderSummary(report, previous, comparing, range) {
        const days = diffDays(range.start, range.end) + 1;

        $("rangeLabel").textContent =
            `${fmtDate(range.start)} – ${fmtDate(range.end)} • ` +
            plural(days, "day");

        $("generatedOn").textContent =
            "Generated " + new Date().toLocaleString();

        $("narrative").textContent = narrative(report, range);

        setKpi(
            "kpiCreated",
            report.created.length,
            delta(
                report.created.length,
                previous.created.length,
                comparing,
                null,
                ""
            )
        );

        setKpi(
            "kpiCompleted",
            report.completed.length,
            delta(
                report.completed.length,
                previous.completed.length,
                comparing,
                true,
                ""
            )
        );

        setKpi(
            "kpiRate",
            report.rate === null ? "—" : report.rate + "%",
            delta(report.rate, previous.rate, comparing, true, " pts")
        );

        setKpi(
            "kpiMissed",
            report.count.missed,
            delta(
                report.count.missed,
                previous.count.missed,
                comparing,
                false,
                ""
            )
        );

        setKpi(
            "kpiAvg",
            report.avg === null ? "—" : trim(report.avg),
            delta(report.avg, previous.avg, comparing, false, " days")
        );
    }

    /* ---------- workload vs delivery chart ---------- */

    function renderChart(tasks, range) {
        const box = $("burnChart");

        clear(box);

        const { start, end } = range;
        const days = diffDays(start, end) + 1;

        const dueByDay = new Array(days).fill(0);
        const doneByDay = new Array(days).fill(0);

        tasks.forEach(task => {
            if (inRange(task.dueDate, start, end)) {
                dueByDay[diffDays(start, task.dueDate)]++;
            }

            const done = completedStamp(task);

            if (inRange(done, start, end)) {
                doneByDay[diffDays(start, done)]++;
            }
        });

        /* Long periods are grouped so the chart stays readable */
        const step = Math.max(1, Math.ceil(days / 90));

        const points = [];

        let dueTotal = 0;
        let doneTotal = 0;

        for (let i = 0; i < days; i++) {
            dueTotal += dueByDay[i];
            doneTotal += doneByDay[i];

            if ((i + 1) % step === 0 || i === days - 1) {
                points.push({ index: i, due: dueTotal, done: doneTotal });
            }
        }

        $("legendDue").textContent =
            `Deadlines in period: ${dueTotal}`;

        $("legendDone").textContent =
            `Completed in period: ${doneTotal}`;

        const W = 720;
        const H = 260;
        const left = 40;
        const right = 16;
        const top = 14;
        const bottom = 30;
        const plotW = W - left - right;
        const plotH = H - top - bottom;

        const max = Math.max(1, dueTotal, doneTotal);

        const x = i => points.length === 1
            ? left + plotW / 2
            : left + i * plotW / (points.length - 1);

        const y = value => top + plotH - value / max * plotH;

        const svg = svgEl("svg", {
            viewBox: `0 0 ${W} ${H}`,
            class: "rp-svg",
            role: "img",
            "aria-label":
                `Running totals from ${fmtDate(start)} to ${fmtDate(end)}: ` +
                `${dueTotal} deadlines and ${doneTotal} tasks completed.`
        });

        /* horizontal grid and y labels */

        const ticks = max <= 4
            ? Array.from({ length: max + 1 }, (_, i) => i)
            : [0, Math.round(max / 2), max];

        [...new Set(ticks)].forEach(tick => {
            svg.append(
                svgEl("line", {
                    class: "grid",
                    x1: left,
                    x2: W - right,
                    y1: y(tick),
                    y2: y(tick)
                }),
                svgEl(
                    "text",
                    {
                        x: left - 8,
                        y: y(tick) + 4,
                        "text-anchor": "end"
                    },
                    String(tick)
                )
            );
        });

        /* x labels: first, middle, last */

        const labelAt = (i, anchor) => {
            const day = addDays(start, points[i].index);

            svg.append(
                svgEl(
                    "text",
                    { x: x(i), y: H - 8, "text-anchor": anchor },
                    fmtShort(day)
                )
            );
        };

        labelAt(0, points.length === 1 ? "middle" : "start");

        if (points.length > 2) {
            labelAt(Math.floor((points.length - 1) / 2), "middle");
        }

        if (points.length > 1) {
            labelAt(points.length - 1, "end");
        }

        /* lines */

        const line = (key, className) =>
            points.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");

        svg.append(
            svgEl("polyline", {
                class: "line-due",
                points: line("due")
            }),
            svgEl("polyline", {
                class: "line-done",
                points: line("done")
            })
        );

        if (points.length <= 31) {
            points.forEach((p, i) => {
                svg.append(
                    svgEl("circle", {
                        class: "pt-due",
                        cx: x(i),
                        cy: y(p.due),
                        r: 3
                    }),
                    svgEl("circle", {
                        class: "pt-done",
                        cx: x(i),
                        cy: y(p.done),
                        r: 3
                    })
                );
            });
        }

        box.append(svg);
    }

    /* ---------- priority table ---------- */

    function renderPriorities(stats) {
        const body = $("priorityRows");

        clear(body);

        stats.forEach(row => {
            const tr = el("tr");

            const name = el("td");

            name.append(
                el("span", "tag " + row.priority.toLowerCase(), row.priority)
            );

            tr.append(name);

            [row.total, row.count.ontime, row.count.late]
                .forEach(value => {
                    tr.append(el("td", "num", String(value)));
                });

            const missed = el("td", "num", String(row.count.missed));

            if (row.count.missed > 0) missed.classList.add("red");

            tr.append(missed);

            const rateCell = el("td");

            if (row.rate === null) {
                rateCell.textContent = "—";
            } else {
                const wrap = el("div", "rp-rate");
                const track = el("div", "progress-track");

                track.setAttribute("role", "progressbar");
                track.setAttribute("aria-valuemin", "0");
                track.setAttribute("aria-valuemax", "100");
                track.setAttribute("aria-valuenow", row.rate);
                track.setAttribute(
                    "aria-label",
                    row.priority + " priority on-time rate"
                );

                const fill = el("div");

                fill.style.width = row.rate + "%";
                track.append(fill);

                wrap.append(track, el("span", null, row.rate + "%"));
                rateCell.append(wrap);
            }

            tr.append(rateCell);
            body.append(tr);
        });
    }

    /* ---------- weekday bars and highlights ---------- */

    function weekdayCounts(report) {
        const byDay = [0, 0, 0, 0, 0, 0, 0];

        report.completed.forEach(task => {
            byDay[store.parseDay(completedStamp(task)).getDay()]++;
        });

        return byDay;
    }

    function renderWeekdays(byDay) {
        const box = $("weekdayBars");

        clear(box);

        const max = Math.max(...byDay);

        WEEK_ORDER.forEach(day => {
            const count = byDay[day];

            const row = el(
                "div",
                "rp-hrow" + (max > 0 && count === max ? " best" : "")
            );

            row.title = `${dayName(day)}: ${count} completed`;

            const track = el("div", "rp-htrack");
            const fill = el("div", "rp-hfill");

            fill.style.width = (max ? count / max * 100 : 0) + "%";
            track.append(fill);

            row.append(
                el("span", null, dayName(day, "short")),
                track,
                el("span", "count", String(count))
            );

            box.append(row);
        });

        if (max === 0) {
            box.append(
                el(
                    "div",
                    "empty",
                    "No tasks were completed in this period."
                )
            );
        }
    }

    function longestStreak(report, range) {
        const done = new Set(report.completed.map(completedStamp));
        const days = Math.min(4000, diffDays(range.start, range.end) + 1);

        let best = 0;
        let run = 0;

        for (let i = 0; i < days; i++) {
            if (done.has(addDays(range.start, i))) {
                run++;
                best = Math.max(best, run);
            } else {
                run = 0;
            }
        }

        return best;
    }

    function buildHighlights(report, previous, comparing, range, byDay, stats) {
        const notes = [];

        if (report.count.missed > 0) {
            notes.push({
                cls: "warn",
                icon: "⚠",
                text: `${plural(report.count.missed, "deadline")} ` +
                      "passed without the task being completed."
            });
        }

        if (comparing) {
            const diff = report.completed.length - previous.completed.length;

            if (diff > 0) {
                notes.push({
                    cls: "good",
                    icon: "✔",
                    text: `You completed ${plural(diff, "more task")} ` +
                          `than in the previous period ` +
                          `(${previous.completed.length} → ` +
                          `${report.completed.length}).`
                });
            } else if (diff < 0) {
                notes.push({
                    cls: "info",
                    icon: "•",
                    text: `You completed ${plural(Math.abs(diff), "fewer task")} ` +
                          `than in the previous period ` +
                          `(${previous.completed.length} → ` +
                          `${report.completed.length}).`
                });
            } else if (report.completed.length > 0) {
                notes.push({
                    cls: "info",
                    icon: "•",
                    text: "You completed the same number of tasks as in " +
                          "the previous period."
                });
            }
        }

        const best = Math.max(...byDay);

        if (best > 0) {
            const day = WEEK_ORDER.find(d => byDay[d] === best);

            notes.push({
                cls: "info",
                icon: "•",
                text: `${dayName(day)} was your most productive day ` +
                      `(${plural(best, "task")} completed).`
            });
        }

        const rated = stats.filter(row => row.rate !== null);

        if (rated.length) {
            const worst = rated.reduce(
                (a, b) => b.rate < a.rate ? b : a
            );

            if (worst.rate < 100) {
                notes.push({
                    cls: worst.rate < 50 ? "warn" : "info",
                    icon: worst.rate < 50 ? "⚠" : "•",
                    text: `${worst.priority} priority tasks had the lowest ` +
                          `on-time rate (${worst.rate}%).`
                });
            } else {
                notes.push({
                    cls: "good",
                    icon: "✔",
                    text: "Every task whose deadline passed was " +
                          "delivered on time."
                });
            }
        }

        const streak = longestStreak(report, range);

        if (streak >= 2) {
            notes.push({
                cls: "good",
                icon: "✔",
                text: `Your longest completion streak was ` +
                      `${plural(streak, "day")} in a row.`
            });
        }

        let slowest = null;

        report.completed.forEach(task => {
            const days = daysToFinish(task);

            if (days !== null && (slowest === null || days > slowest.days)) {
                slowest = { title: task.title, days };
            }
        });

        if (slowest && slowest.days >= 1) {
            notes.push({
                cls: "info",
                icon: "•",
                text: `"${slowest.title}" took the longest to finish ` +
                      `(${plural(slowest.days, "day")}).`
            });
        }

        return notes;
    }

    function renderHighlights(notes) {
        const box = $("highlights");

        clear(box);

        if (!notes.length) {
            box.append(
                el(
                    "div",
                    "empty",
                    "Not enough activity in this period to highlight anything yet."
                )
            );

            return;
        }

        notes.forEach(note => {
            const row = el("div", "rp-note " + note.cls);

            row.append(
                el("span", "icon", note.icon),
                el("span", null, note.text)
            );

            box.append(row);
        });
    }

    /* ---------- task record ---------- */

    function ledgerRows(tasks, range) {
        return tasks
            .filter(task =>
                inRange(task.dueDate, range.start, range.end) ||
                inRange(completedStamp(task), range.start, range.end)
            )
            .sort((a, b) => {
                const left = a.dueDate || completedStamp(a) || "9999";
                const right = b.dueDate || completedStamp(b) || "9999";

                return left.localeCompare(right) ||
                       a.title.localeCompare(b.title);
            });
    }

    function renderLedger(rows) {
        const body = $("ledgerRows");

        clear(body);

        $("ledgerCount").textContent = rows.length
            ? `${plural(rows.length, "task")} due or completed in this period`
            : "Tasks due or completed in this period";

        const note = $("ledgerNote");

        note.hidden = rows.length <= MAX_LEDGER_ROWS;

        if (rows.length > MAX_LEDGER_ROWS) {
            note.textContent =
                `Showing the first ${MAX_LEDGER_ROWS} of ${rows.length} ` +
                "tasks. Export the CSV to get every row.";
        }

        if (!rows.length) {
            const tr = el("tr");
            const cell = el(
                "td",
                null,
                "No tasks were due or completed in this period."
            );

            cell.colSpan = 6;
            tr.append(cell);
            body.append(tr);

            return;
        }

        rows.slice(0, MAX_LEDGER_ROWS).forEach(task => {
            const tr = el("tr");
            const result = outcome(task);
            const done = completedStamp(task);
            const days = daysToFinish(task);

            tr.append(el("td", "title-cell", task.title));

            const priority = el("td");

            priority.append(
                el("span", "tag " + task.priority.toLowerCase(), task.priority)
            );

            tr.append(priority);

            tr.append(el("td", null, task.dueDate ? fmtDate(task.dueDate) : "—"));
            tr.append(el("td", null, done ? fmtDate(done) : "—"));

            const status = el("td");

            status.append(
                el("span", "rp-pill " + result.kind, outcomeText(result))
            );

            tr.append(status);

            tr.append(
                el("td", "num", days === null ? "—" : String(days))
            );

            body.append(tr);
        });
    }

    /* ---------- main render ---------- */

    function render() {
        const tasks = store.all();
        const range = getRange(tasks);

        const days = diffDays(range.start, range.end) + 1;
        const comparing = range.preset !== "all";

        const prevEnd = addDays(range.start, -1);
        const prevStart = addDays(range.start, -days);

        const report = analyze(tasks, range.start, range.end);

        const previous = comparing
            ? analyze(tasks, prevStart, prevEnd)
            : analyze([], prevStart, prevEnd);

        $("compareNote").textContent = comparing
            ? `Compared with the previous ${plural(days, "day")} ` +
              `(${fmtShort(prevStart)} – ${fmtShort(prevEnd)}).`
            : "No comparison is shown for the all-time report.";

        const error = $("rangeError");

        error.hidden = !range.error;
        error.textContent = range.error || "";

        const byDay = weekdayCounts(report);
        const stats = priorityStats(report);
        const rows = ledgerRows(tasks, range);

        renderSummary(report, previous, comparing, range);
        renderChart(tasks, range);
        renderPriorities(stats);
        renderWeekdays(byDay);

        renderHighlights(
            buildHighlights(report, previous, comparing, range, byDay, stats)
        );

        renderLedger(rows);

        current = { range, rows };
    }

    /* ---------- CSV export ---------- */

    function csvCell(value) {
        let text = String(value === null || value === undefined ? "" : value);

        /* Stop spreadsheet apps from treating text as a formula */
        if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;

        return '"' + text.replace(/"/g, '""') + '"';
    }

    function exportCsv() {
        if (!current) return;

        const header = [
            "Title",
            "Description",
            "Priority",
            "Status",
            "Deadline",
            "Created",
            "Completed",
            "Result",
            "Days to finish"
        ];

        const rows = current.rows.map(task => {
            const days = daysToFinish(task);

            return [
                task.title,
                task.description,
                task.priority,
                task.status,
                task.dueDate,
                createdStamp(task) || "",
                completedStamp(task) || "",
                outcomeText(outcome(task)),
                days === null ? "" : days
            ];
        });

        const csv = [header, ...rows]
            .map(row => row.map(csvCell).join(","))
            .join("\r\n");

        const blob = new Blob(
            ["\uFEFF" + csv],
            { type: "text/csv;charset=utf-8" }
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download =
            `taskflow-report-${current.range.start}_to_${current.range.end}.csv`;

        document.body.append(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /* ---------- events ---------- */

    function syncCustomFields() {
        const custom = $("presetSelect").value === "custom";

        $("fromField").hidden = !custom;
        $("toField").hidden = !custom;
    }

    $("presetSelect").addEventListener("change", function () {
        /* Start the custom range from what was on screen */
        if (this.value === "custom" && current) {
            $("fromDate").value = current.range.start;
            $("toDate").value = current.range.end;
        }

        syncCustomFields();
        render();
    });

    $("fromDate").addEventListener("change", render);
    $("toDate").addEventListener("change", render);

    $("exportCsv").addEventListener("click", exportCsv);
    $("printReport").addEventListener("click", () => window.print());

    store.subscribe(render);

    syncCustomFields();
    render();

})();

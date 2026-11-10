
(function () {
    "use strict";

    const store = window.TaskFlowStore;
    const $ = id => document.getElementById(id);

    function el(tag, className, text) {
        const node = document.createElement(tag);

        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;

        return node;
    }

    function clear(element) {
        element.replaceChildren();
    }

    function empty(message) {
        return el("div", "empty", message);
    }

    function dateLabel(date) {
        if (!date) return "No deadline";

        return store.parseDay(date).toLocaleDateString(
            undefined,
            {
                month: "short",
                day: "numeric",
                year: "numeric"
            }
        );
    }

    function isActive(task) {
        return task.status !== "Completed";
    }

    function isOverdue(task) {
        const days = store.differenceDays(task.dueDate);

        return isActive(task) &&
               days !== null &&
               days < 0;
    }

    function isDueSoon(task) {
        const days = store.differenceDays(task.dueDate);

        return isActive(task) &&
               days !== null &&
               days >= 0 &&
               days <= 3;
    }

    function detailRow(task) {
        const row = el("div", "item");
        const main = el("div", "item-main");

        main.append(
            el("div", "item-title", task.title),
            el(
                "div",
                "item-meta",
                `${dateLabel(task.dueDate)} • ${task.status}`
            )
        );

        const priority = el(
            "span",
            "tag " + task.priority.toLowerCase(),
            task.priority
        );

        row.append(main, priority);

        return row;
    }

    /* LIVE DASHBOARD */

    function render() {
        const tasks = store.all();

        const total = tasks.length;

        const completed = tasks.filter(
            task => task.status === "Completed"
        ).length;

        const pending = total - completed;

        const overdueTasks = tasks.filter(isOverdue);

        const upcomingTasks = tasks
            .filter(isDueSoon)
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

        const percentage = total
            ? Math.round(completed / total * 100)
            : 0;

        $("todayLabel").textContent =
            new Date().toLocaleDateString(
                undefined,
                {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric"
                }
            );

        /* STATISTICS */

        $("totalTasks").textContent = total;
        $("pendingTasks").textContent = pending;
        $("completedTasks").textContent = completed;
        $("overdueTasks").textContent = overdueTasks.length;

        /* PROGRESS BAR */

        $("progressLabel").textContent = percentage + "%";

        $("progressFill").style.width = percentage + "%";

        $("progressTrack").setAttribute(
            "aria-valuenow",
            percentage
        );

        $("progressExplanation").textContent =
            `${completed} of ${total} tasks completed`;

        /* COMPLETION DONUT */

        $("donutPercent").textContent = percentage + "%";

        $("donutChart").style.background =
            `conic-gradient(
                #3b82f6 0% ${percentage}%,
                #444a54 ${percentage}% 100%
            )`;

        $("donutCompleted").textContent = completed;
        $("donutRemaining").textContent = pending;

        /* OVERDUE COUNTER */

        $("overdueBadge").textContent =
            overdueTasks.length + " overdue";

        /* UPCOMING DEADLINES */

        const upcomingList = $("upcomingList");
        clear(upcomingList);

        if (upcomingTasks.length === 0) {
            upcomingList.append(
                empty("No deadlines in the next 3 days.")
            );
        } else {
            upcomingTasks
                .slice(0, 5)
                .forEach(task => {
                    upcomingList.append(detailRow(task));
                });
        }

        /* OVERDUE ALERTS */

        const overdueList = $("overdueList");
        clear(overdueList);

        if (overdueTasks.length === 0) {
            overdueList.append(
                empty("No overdue tasks. Great job!")
            );
        } else {
            overdueTasks
                .sort((a, b) =>
                    a.dueDate.localeCompare(b.dueDate)
                )
                .slice(0, 5)
                .forEach(task => {
                    overdueList.append(detailRow(task));
                });
        }

        renderNotifications(overdueTasks, upcomingTasks);
        renderWeek(tasks);
        renderTasks(tasks);
    }

    /* NOTIFICATIONS */

    function renderNotifications(overdueTasks, upcomingTasks) {
        const count =
            overdueTasks.length + upcomingTasks.length;

        $("notificationCount").textContent = count;
        $("notificationCount").hidden = count === 0;

        const container = $("notificationItems");
        clear(container);

        if (count === 0) {
            container.append(
                empty("All clear! No urgent deadlines.")
            );
            return;
        }

        overdueTasks.forEach(task => {
            const row = el("div", "item");

            row.append(
                el("span", null, "⚠️ Overdue: " + task.title)
            );

            container.append(row);
        });

        upcomingTasks.forEach(task => {
            const row = el("div", "item");

            row.append(
                el(
                    "span",
                    null,
                    "🔔 Due " +
                    dateLabel(task.dueDate) +
                    ": " +
                    task.title
                )
            );

            container.append(row);
        });
    }

    /* WEEKLY ACTIVITY CHART */

    function renderWeek(tasks) {
        const chart = $("weeklyChart");
        clear(chart);

        const today = store.parseDay(store.today());

        const counts = {};

        tasks
            .filter(task =>
                task.status === "Completed" &&
                task.completedAt
            )
            .forEach(task => {
                const date = task.completedAt.slice(0, 10);

                counts[date] = (counts[date] || 0) + 1;
            });

        const max = Math.max(4, ...Object.values(counts));

        for (let offset = 6; offset >= 0; offset--) {
            const day = new Date(today);

            day.setDate(day.getDate() - offset);

            const stamp = [
                day.getFullYear(),
                String(day.getMonth() + 1).padStart(2, "0"),
                String(day.getDate()).padStart(2, "0")
            ].join("-");

            const count = tasks.filter(task =>
                task.status === "Completed" &&
                task.completedAt &&
                task.completedAt.slice(0, 10) === stamp
            ).length;

            const height = Math.max(
                3,
                Math.min(100, count / max * 100)
            );

            const column = el("div", "chart-col");

            column.title =
                `${stamp}: ${count} completed`;

            const number = el(
                "span",
                "chart-count",
                String(count)
            );

            const track = el("div", "chart-bar-track");
            const bar = el("div", "chart-bar");

            bar.style.height = height + "%";
            track.append(bar);

            const label = el(
                "span",
                "chart-label",
                day.toLocaleDateString(
                    undefined,
                    { weekday: "short" }
                )
            );

            column.append(number, track, label);
            chart.append(column);
        }
    }

    /* SEARCHABLE TASK LIST */

    function renderTasks(tasks) {
        const term = $("searchTasks")
            .value.toLowerCase().trim();

        const status = $("statusFilter").value;
        const priority = $("priorityFilter").value;

        const filtered = tasks.filter(task => {
            const matchesText =
                !term ||
                `${task.title} ${task.description}`
                    .toLowerCase()
                    .includes(term);

            const matchesStatus =
                status === "all" ||
                task.status === status;

            const matchesPriority =
                priority === "all" ||
                task.priority === priority;

            return matchesText &&
                   matchesStatus &&
                   matchesPriority;
        });

        const list = $("taskList");
        clear(list);

        if (filtered.length === 0) {
            list.append(
                empty("No tasks match your filters.")
            );
            return;
        }

        filtered
            .sort((a, b) =>
                (a.dueDate || "9999").localeCompare(
                    b.dueDate || "9999"
                )
            )
            .forEach(task => {
                const row = el("div", "item task-row");

                const label = el("label");

                const checkbox = el("input");
                checkbox.type = "checkbox";
                checkbox.checked =
                    task.status === "Completed";

                checkbox.setAttribute(
                    "aria-label",
                    "Mark " + task.title + " complete"
                );

                checkbox.addEventListener(
                    "change",
                    () => store.toggle(task.id)
                );

                const info = el("div", "item-main");

                const title = el(
                    "div",
                    "item-title" +
                    (task.status === "Completed"
                        ? " completed-title"
                        : ""),
                    task.title
                );

                const metadata = el(
                    "div",
                    "item-meta",
                    `${task.priority} priority • ` +
                    `${dateLabel(task.dueDate)} • ` +
                    task.status
                );

                info.append(title, metadata);
                label.append(checkbox, info);

                const actions = el(
                    "div",
                    "task-row-actions"
                );

                const edit = el(
                    "button",
                    "tiny-btn",
                    "Edit"
                );

                edit.type = "button";

                edit.addEventListener(
                    "click",
                    () => openEdit(task)
                );

                const del = el(
                    "button",
                    "tiny-btn",
                    "Delete"
                );

                del.type = "button";

                del.addEventListener("click", () => {
                    if (confirm(
                        'Delete "' + task.title + '"?'
                    )) {
                        store.remove(task.id);
                    }
                });

                actions.append(edit, del);
                row.append(label, actions);
                list.append(row);
            });
    }

    /* QUICK ADD AND EDIT MODAL */

    let editingId = null;

    const dialog = $("addTaskDialog");

    function openEdit(task) {
        editingId = task.id;

        $("dialogTitle").textContent = "Edit Task";
        $("quickTitle").value = task.title;
        $("quickDescription").value =
            task.description || "";
        $("quickPriority").value = task.priority;
        $("quickDue").value = task.dueDate || "";

        dialog.showModal();
    }

    function closeDialog() {
        dialog.close();
        editingId = null;
        $("quickTaskForm").reset();
    }

    $("openQuickAdd").addEventListener("click", () => {
        editingId = null;

        $("dialogTitle").textContent =
            "Quick Add Task";

        $("quickTaskForm").reset();
        dialog.showModal();
    });

    $("closeQuickAdd").addEventListener(
        "click",
        closeDialog
    );

    $("cancelQuickAdd").addEventListener(
        "click",
        closeDialog
    );

    dialog.addEventListener("close", () => {
        editingId = null;
    });

    $("quickTaskForm").addEventListener(
        "submit",
        function (event) {
            event.preventDefault();

            const data = {
                title: $("quickTitle").value,
                description: $("quickDescription").value,
                priority: $("quickPriority").value,
                dueDate: $("quickDue").value
            };

            try {
                if (editingId) {
                    store.update(editingId, data);
                } else {
                    store.add({
                        ...data,
                        status: "Pending"
                    });
                }

                closeDialog();

            } catch (error) {
                alert(error.message);
            }
        }
    );

    /* FILTER EVENTS */

    $("searchTasks").addEventListener(
        "input",
        render
    );

    $("statusFilter").addEventListener(
        "change",
        render
    );

    $("priorityFilter").addEventListener(
        "change",
        render
    );

    /* NOTIFICATION BUTTON EVENTS */

    $("notificationButton").addEventListener(
        "click",
        function () {
            const panel = $("notificationPanel");

            panel.hidden = !panel.hidden;

            $("notificationButton").setAttribute(
                "aria-expanded",
                String(!panel.hidden)
            );
        }
    );

    $("closeNotifications").addEventListener(
        "click",
        function () {
            $("notificationPanel").hidden = true;

            $("notificationButton").setAttribute(
                "aria-expanded",
                "false"
            );
        }
    );

    /* AUTO UPDATE WHEN TASKS CHANGE */

    store.subscribe(render);

    render();

})();

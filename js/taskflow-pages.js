
/* Connect Task Management and Add Task
   to TaskFlow localStorage */

(function () {
    "use strict";

    const store = window.TaskFlowStore;

    if (!store) return;

    const current = location.pathname
        .split("/")
        .pop()
        .toLowerCase();

    /* ADD TASK PAGE */

    if (current === "add-task.html") {

        const box = document.querySelector(".container");

        if (!box) return;

        const title = box.querySelector(
            'input[type="text"]'
        );

        const description = box.querySelector(
            "textarea"
        );

        const selects = box.querySelectorAll("select");

        const due = box.querySelector(
            'input[type="date"]'
        );

        const saveButton = Array.from(
            box.querySelectorAll("button")
        ).find(button =>
            /save task/i.test(button.textContent)
        );

        if (
            !title ||
            !description ||
            selects.length < 2 ||
            !due ||
            !saveButton
        ) return;

        saveButton.removeAttribute("onclick");

        saveButton.addEventListener("click", () => {
            try {
                store.add({
                    title: title.value,
                    description: description.value,
                    priority: selects[0].value,
                    dueDate: due.value,
                    status: selects[1].value
                });

                location.href = "tasks.html";

            } catch (error) {
                alert(error.message);
                title.focus();
            }
        });

        return;
    }

    /* TASK MANAGEMENT PAGE */

    if (current !== "tasks.html") return;

    const table = document.querySelector("table");

    if (!table) return;

    let tbody = table.querySelector("tbody");

    if (!tbody) {
        tbody = document.createElement("tbody");
        table.append(tbody);
    }

    function render() {

        /* Remove old task rows */

        const oldRows = [
            ...table.querySelectorAll("tr")
        ];

        oldRows.forEach((row, index) => {
            if (index > 0) row.remove();
        });

        tbody = table.querySelector("tbody");

        if (!tbody) {
            tbody = document.createElement("tbody");
            table.append(tbody);
        }

        const tasks = store.all().sort(
            (a, b) =>
                (a.dueDate || "9999").localeCompare(
                    b.dueDate || "9999"
                )
        );

        if (!tasks.length) {
            const row = tbody.insertRow();
            const cell = row.insertCell();

            cell.colSpan = 5;

            cell.textContent =
                "Wala pang tasks. Click Add Task para magsimula.";

            return;
        }

        tasks.forEach(task => {
            const tr = tbody.insertRow();

            const dueText = task.dueDate
                ? store.parseDay(task.dueDate)
                    .toLocaleDateString(
                        undefined,
                        {
                            month: "short",
                            day: "numeric",
                            year: "numeric"
                        }
                    )
                : "—";

            [
                task.title,
                task.priority,
                dueText,
                task.status
            ].forEach(text => {
                const cell = tr.insertCell();
                cell.textContent = text;
            });

            const actions = tr.insertCell();

            /* EDIT BUTTON */

            const edit = document.createElement("button");

            edit.textContent = "Edit";
            edit.className = "edit";
            edit.style.border = "none";
            edit.style.cursor = "pointer";

            edit.addEventListener("click", () => {

                const name = prompt(
                    "Edit task title:",
                    task.title
                );

                if (name === null) return;

                if (!name.trim()) {
                    return alert("Kailangan ng task title.");
                }

                const newPriority = prompt(
                    "Priority (High, Medium, Low):",
                    task.priority
                );

                if (newPriority === null) return;

                const normalizedPriority = [
                    "High",
                    "Medium",
                    "Low"
                ].find(priority =>
                    priority.toLowerCase() ===
                    newPriority.trim().toLowerCase()
                );

                if (!normalizedPriority) {
                    return alert(
                        "Choose High, Medium, or Low."
                    );
                }

                const newDue = prompt(
                    "Deadline (YYYY-MM-DD, blank for none):",
                    task.dueDate || ""
                );

                if (newDue === null) return;

                const newStatus = prompt(
                    "Status (Pending, In Progress, Completed):",
                    task.status
                );

                if (newStatus === null) return;

                const normalizedStatus = [
                    "Pending",
                    "In Progress",
                    "Completed"
                ].find(status =>
                    status.toLowerCase() ===
                    newStatus.trim().toLowerCase()
                );

                if (!normalizedStatus) {
                    return alert("Invalid status.");
                }

                try {
                    store.update(task.id, {
                        title: name,
                        priority: normalizedPriority,
                        dueDate: newDue.trim(),
                        status: normalizedStatus
                    });

                } catch (error) {
                    alert(error.message);
                }
            });

            /* DELETE BUTTON */

            const del = document.createElement("button");

            del.textContent = "Delete";
            del.className = "delete";
            del.style.border = "none";
            del.style.cursor = "pointer";

            del.addEventListener("click", () => {
                if (
                    confirm(
                        'Delete "' + task.title + '"?'
                    )
                ) {
                    store.remove(task.id);
                }
            });

            actions.append(edit, del);
        });
    }

    store.subscribe(render);

    render();

})();

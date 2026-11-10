
/* TaskFlow Task Storage - browser-only demo */

(function () {
    "use strict";

    const KEY = "taskflow.tasks.v1";

    function localDate(daysFromToday) {
        const d = new Date();
        d.setHours(12, 0, 0, 0);
        d.setDate(d.getDate() + daysFromToday);

        return [
            d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, "0"),
            String(d.getDate()).padStart(2, "0")
        ].join("-");
    }

    const sample = [
        {
            id: "sample-programming",
            title: "Programming Project",
            description: "Sample task",
            priority: "High",
            dueDate: localDate(2),
            status: "Pending",
            createdAt: new Date().toISOString(),
            completedAt: null
        },
        {
            id: "sample-database",
            title: "Database Assignment",
            description: "Sample completed task",
            priority: "Medium",
            dueDate: localDate(-2),
            status: "Completed",
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString()
        }
    ];

    function read() {
        try {
            const existing = localStorage.getItem(KEY);

            if (existing === null) {
                localStorage.setItem(KEY, JSON.stringify(sample));
                return sample.slice();
            }

            const parsed = JSON.parse(existing);
            return Array.isArray(parsed) ? parsed : [];

        } catch (error) {
            console.warn("Could not read tasks", error);
            return [];
        }
    }

    function save(tasks) {
        try {
            localStorage.setItem(KEY, JSON.stringify(tasks));
        } catch (error) {
            alert("Hindi ma-save ang tasks. Check browser storage.");
            throw error;
        }

        window.dispatchEvent(new Event("taskflow:changed"));
    }

    function clean(data) {
        const title = String(data.title || "").trim();

        if (!title) {
            throw new Error("Kailangan ng task title.");
        }

        const priority = ["High", "Medium", "Low"].includes(data.priority)
            ? data.priority
            : "Medium";

        const status = ["Pending", "In Progress", "Completed"].includes(data.status)
            ? data.status
            : "Pending";

        const dueDate = String(data.dueDate || "");

        if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
            throw new Error("Invalid deadline.");
        }

        return {
            title,
            description: String(data.description || "").trim(),
            priority,
            dueDate,
            status
        };
    }

    const api = {
        all: read,

        add(data) {
            const entry = clean(data);
            const now = new Date().toISOString();

            const task = {
                ...entry,
                id: crypto.randomUUID
                    ? crypto.randomUUID()
                    : "t-" + Date.now() + "-" +
                      Math.random().toString(36).slice(2),
                createdAt: now,
                completedAt: entry.status === "Completed"
                    ? now
                    : null
            };

            const tasks = read();
            tasks.push(task);
            save(tasks);

            return task;
        },

        update(id, data) {
            const tasks = read();
            const index = tasks.findIndex(t => t.id === id);

            if (index === -1) return false;

            const previous = tasks[index];
            const updated = clean({ ...previous, ...data });

            tasks[index] = {
                ...previous,
                ...updated,
                completedAt: updated.status === "Completed"
                    ? previous.completedAt || new Date().toISOString()
                    : null
            };

            save(tasks);
            return true;
        },

        remove(id) {
            const tasks = read();
            const filtered = tasks.filter(t => t.id !== id);

            if (filtered.length === tasks.length) return false;

            save(filtered);
            return true;
        },

        toggle(id) {
            const task = read().find(t => t.id === id);

            if (!task) return false;

            return api.update(id, {
                status: task.status === "Completed"
                    ? "Pending"
                    : "Completed"
            });
        },

        today: () => localDate(0),

        parseDay(value) {
            return value ? new Date(value + "T12:00:00") : null;
        },

        differenceDays(value) {
            if (!value) return null;

            const today = api.parseDay(localDate(0));
            const due = api.parseDay(value);

            return Math.round((due - today) / 86400000);
        },

        subscribe(callback) {
            window.addEventListener("taskflow:changed", callback);

            window.addEventListener("storage", function (event) {
                if (event.key === KEY) callback();
            });
        }
    };

    window.TaskFlowStore = api;
})();

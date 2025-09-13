import React, { useState, useEffect, useMemo } from "react";
// AI Financial Tool - Single-file React app (Tailwind + Recharts + Framer Motion)
// How to use:
// 1. Create a React project (Vite or CRA). Install dependencies:
//    npm install recharts framer-motion lucide-react
// 2. Add Tailwind CSS to the project (optional but recommended).
// 3. Copy this component into src/App.jsx and run the app.
// Notes: This is a frontend-first implementation with local processing.
// For production, replace `categorizeExpense` and `predictFutureSpending` with server-side AI models

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { motion } from "framer-motion";
import { PlusCircle, Bell } from "lucide-react";

// Simple keyword-based categorizer as a stand-in for an AI model
const CATEGORIES = [
  "Groceries",
  "Entertainment",
  "Transport",
  "Dining",
  "Utilities",
  "Health",
  "Shopping",
  "Income",
  "Other",
];

const KEYWORD_MAP = {
  Groceries: ["grocery", "supermarket", "market", "aldi", "walmart"],
  Entertainment: ["netflix", "movie", "concert", "spotify", "game"],
  Transport: ["uber", "lyft", "taxi", "bus", "train", "fuel", "gas"],
  Dining: ["restaurant", "cafe", "diner", "pizza", "coffee", "eat"],
  Utilities: ["electric", "water", "gas bill", "internet", "phone"],
  Health: ["pharmacy", "hospital", "doctor", "dentist", "clinic"],
  Shopping: ["amazon", "mall", "clothes", "shoe", "store", "shop"],
  Income: ["salary", "deposit", "payroll", "refund"],
};

function categorizeExpense({ description, amount }) {
  if (!description) return "Other";
  const text = description.toLowerCase();
  // If amount is positive (income-like), mark Income
  if (amount > 0) return "Income";
  for (const [cat, keywords] of Object.entries(KEYWORD_MAP)) {
    for (const kw of keywords) {
      if (text.includes(kw)) return cat;
    }
  }
  // fallback by heuristics
  if (Math.abs(amount) > 200) return "Shopping";
  return "Other";
}

// Simple linear regression predictor for next N months based on monthly totals
function linearRegressionPredict(monthlyTotals, monthsOut = 3) {
  // monthlyTotals: [{month: '2025-01', total: 123.45}, ...]
  const n = monthlyTotals.length;
  if (n === 0) return Array.from({ length: monthsOut }, (_, i) => ({ monthIndex: i, predicted: 0 }));
  const xs = monthlyTotals.map((_, i) => i);
  const ys = monthlyTotals.map((m) => m.total);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) * (xs[i] - xMean);
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  const predictions = [];
  for (let i = 0; i < monthsOut; i++) {
    const xi = n + i; // future index
    const pred = slope * xi + intercept;
    predictions.push({ monthIndex: xi, predicted: Math.max(0, pred) });
  }
  return predictions;
}

// Helper to format month key YYYY-MM
function monthKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  return `${y}-${m}`;
}

// Sample data generator
function generateSampleExpenses() {
  const categories = [
    "Groceries",
    "Dining",
    "Transport",
    "Utilities",
    "Entertainment",
    "Shopping",
  ];
  const now = new Date();
  const list = [];
  for (let i = 0; i < 120; i++) {
    const daysAgo = Math.floor(Math.random() * 365);
    const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const amt = -1 * (Math.random() * 200 + 5);
    const cat = categories[Math.floor(Math.random() * categories.length)];
    list.push({
      id: `${i}`,
      date: date.toISOString().slice(0, 10),
      description: `${cat} purchase #${i}`,
      amount: parseFloat(amt.toFixed(2)),
      category: cat,
    });
  }
  // Add income entries
  list.push({ id: "i1", date: now.toISOString().slice(0, 10), description: "Salary deposit", amount: 3000, category: "Income" });
  return list;
}

export default function App() {
  const [expenses, setExpenses] = useState(() => {
    try {
      const raw = localStorage.getItem("aft_expenses");
      return raw ? JSON.parse(raw) : generateSampleExpenses();
    } catch (e) {
      return generateSampleExpenses();
    }
  });
  const [budget, setBudget] = useState(() => Number(localStorage.getItem("aft_budget") || 2000));
  const [goals, setGoals] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("aft_goals") || "[]");
    } catch (e) {
      return [];
    }
  });
  const [newGoalName, setNewGoalName] = useState("");
  const [newGoalAmount, setNewGoalAmount] = useState(0);
  const [alertThresholdPercent, setAlertThresholdPercent] = useState(() => Number(localStorage.getItem("aft_alertPct") || 90));

  useEffect(() => {
    localStorage.setItem("aft_expenses", JSON.stringify(expenses));
  }, [expenses]);
  useEffect(() => {
    localStorage.setItem("aft_budget", String(budget));
  }, [budget]);
  useEffect(() => {
    localStorage.setItem("aft_goals", JSON.stringify(goals));
  }, [goals]);
  useEffect(() => {
    localStorage.setItem("aft_alertPct", String(alertThresholdPercent));
  }, [alertThresholdPercent]);

  // Auto-categorize any expense without category
  useEffect(() => {
    let changed = false;
    const updated = expenses.map((e) => {
      if (!e.category) {
        changed = true;
        return { ...e, category: categorizeExpense(e) };
      }
      return e;
    });
    if (changed) setExpenses(updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addExpense(exp) {
    setExpenses((s) => [{ ...exp, id: Date.now().toString() }, ...s]);
  }

  function importCSV(text) {
    // very tolerant CSV parser: date,description,amount
    const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
    const parsed = [];
    for (const r of rows) {
      const parts = r.split(",");
      if (parts.length < 3) continue;
      const date = parts[0].trim();
      const description = parts[1].trim();
      const amount = Number(parts[2].trim());
      parsed.push({ id: Date.now() + Math.random(), date, description, amount, category: categorizeExpense({ description, amount }) });
    }
    setExpenses((s) => [...parsed, ...s]);
  }

  const monthlyTotals = useMemo(() => {
    const map = {};
    for (const e of expenses) {
      const key = monthKey(e.date);
      map[key] = (map[key] || 0) + (Number(e.amount) || 0);
    }
    const arr = Object.entries(map)
      .map(([month, total]) => ({ month, total: Number(total.toFixed(2)) }))
      .sort((a, b) => a.month.localeCompare(b.month));
    return arr;
  }, [expenses]);

  const prediction = useMemo(() => linearRegressionPredict(monthlyTotals, 3), [monthlyTotals]);

  const categoryBreakdown = useMemo(() => {
    const map = {};
    for (const e of expenses) {
      map[e.category] = (map[e.category] || 0) + Number(e.amount || 0);
    }
    return Object.entries(map).map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }));
  }, [expenses]);

  // Budget alert: compare predicted monthly spend (sum of predicted) or most recent month
  const predictedNextMonth = prediction.length > 0 ? prediction[0].predicted : 0;
  const latestMonthTotal = monthlyTotals.length ? Math.abs(monthlyTotals[monthlyTotals.length - 1].total) : 0;
  const willBreachBudget = predictedNextMonth > budget * (alertThresholdPercent / 100);

  function addGoal() {
    if (!newGoalName || !newGoalAmount) return;
    const g = { id: Date.now().toString(), name: newGoalName, target: Number(newGoalAmount), createdAt: new Date().toISOString() };
    setGoals((s) => [g, ...s]);
    setNewGoalName("");
    setNewGoalAmount(0);
  }

  function progressForGoal(goal) {
    // naive: progress = sum of positive amounts (savings) toward goal
    // This is a placeholder — real integration would analyze labeled 'savings' or transfers
    const saved = expenses.filter((e) => e.amount > 0).reduce((a, b) => a + b.amount, 0);
    const pct = Math.min(100, Math.round((saved / goal.target) * 100));
    return { saved: Number(saved.toFixed(2)), pct };
  }

  // UI Colors for pie
  const COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff7f7f", "#a8d1ff", "#ffd4a3", "#cbd5e1", "#b2f7ef", "#f0a6ca"];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="max-w-6xl mx-auto flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">AI Financial Tool — Dashboard</h1>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">Monthly Budget</div>
          <input className="w-24 p-2 border rounded" type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
          <motion.button
            whileTap={{ scale: 0.96 }}
            className="p-2 rounded bg-blue-600 text-white flex items-center gap-2"
            onClick={() => {
              // quick add sample expense modal-like prompt
              const desc = prompt("Description (e.g. 'Grocery store')");
              const amt = parseFloat(prompt("Amount (negative for expense, positive for income)") || "0");
              if (desc && !isNaN(amt)) addExpense({ date: new Date().toISOString().slice(0, 10), description: desc, amount: amt, category: categorizeExpense({ description: desc, amount: amt }) });
            }}
          >
            <PlusCircle size={18} /> Add
          </motion.button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-12 gap-6">
        <section className="col-span-8 bg-white p-4 rounded shadow">
          <h2 className="font-medium mb-2">Spending (monthly + prediction)</h2>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={[...monthlyTotals.map((m, i) => ({ name: m.month, total: Math.abs(m.total) })), ...prediction.map((p, i) => ({ name: `P+${i + 1}`, total: p.predicted }))]}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke="#8884d8" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="p-4 border rounded">
              <h3 className="font-semibold text-sm">Recent Expenses</h3>
              <ul className="mt-2 max-h-40 overflow-auto text-sm">
                {expenses.slice(0, 10).map((e) => (
                  <li key={e.id} className="flex justify-between py-1 border-b last:border-b-0">
                    <div>
                      <div className="font-medium">{e.description}</div>
                      <div className="text-xs text-gray-500">{e.date} • {e.category}</div>
                    </div>
                    <div className={`ml-4 ${e.amount < 0 ? "text-red-600" : "text-green-600"}`}>{e.amount.toFixed(2)}</div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 border rounded">
              <h3 className="font-semibold text-sm">Category Breakdown</h3>
              <div style={{ width: "100%", height: 160 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={categoryBreakdown.filter(c => Math.abs(c.value) > 0.01)} dataKey="value" nameKey="name" outerRadius={60} fill="#8884d8">
                      {categoryBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        <aside className="col-span-4 space-y-4">
          <div className="bg-white p-4 rounded shadow">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Budget Alerts <Bell size={16} /></h3>
            </div>
            <p className="text-sm mt-2">Predicted next-month spend: <strong>{predictedNextMonth.toFixed(2)}</strong></p>
            <p className="text-sm">Latest month actual spend: <strong>{latestMonthTotal.toFixed(2)}</strong></p>
            <div className="mt-2">
              <label className="text-xs">Alert threshold (% of budget)</label>
              <input type="number" value={alertThresholdPercent} onChange={(e) => setAlertThresholdPercent(Number(e.target.value))} className="w-full p-2 border rounded mt-1" />
            </div>
            {willBreachBudget ? (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-red-700">
                Warning: predicted spending exceeds {alertThresholdPercent}% of your budget. Consider reducing variable expenses or adjusting budget.
              </div>
            ) : (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded text-green-700">You are within the alert threshold.</div>
            )}
          </div>

          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-medium">Goals & Savings</h3>
            <div className="mt-2 text-sm">
              <input placeholder="Goal name" value={newGoalName} onChange={(e) => setNewGoalName(e.target.value)} className="w-full p-2 border rounded mb-2" />
              <input placeholder="Target amount" type="number" value={newGoalAmount} onChange={(e) => setNewGoalAmount(Number(e.target.value))} className="w-full p-2 border rounded mb-2" />
              <button onClick={addGoal} className="w-full p-2 bg-blue-600 text-white rounded">Create Goal</button>
            </div>

            <div className="mt-3 space-y-2">
              {goals.length === 0 && <div className="text-sm text-gray-500">No goals yet.</div>}
              {goals.map((g) => {
                const p = progressForGoal(g);
                return (
                  <div key={g.id} className="p-2 border rounded">
                    <div className="flex justify-between items-center">
                      <div className="font-medium">{g.name}</div>
                      <div className="text-sm">{p.pct}%</div>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded mt-2">
                      <div className="h-2 bg-blue-500 rounded" style={{ width: `${p.pct}%` }} />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Saved: {p.saved.toFixed(2)} / {g.target}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-medium">Import / Tools</h3>
            <div className="mt-2">
              <label className="text-xs">Paste CSV rows: date,description,amount</label>
              <textarea id="csv-input" className="w-full p-2 border rounded mt-1" rows={4} />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    const t = (document.getElementById("csv-input") || {}).value || "";
                    importCSV(t);
                    (document.getElementById("csv-input") || {}).value = "";
                  }}
                  className="p-2 bg-gray-800 text-white rounded text-sm"
                >Import CSV</button>
                <button
                  onClick={() => {
                    setExpenses(generateSampleExpenses());
                  }}
                  className="p-2 bg-gray-200 rounded text-sm"
                >Generate Sample</button>
                <button
                  onClick={() => {
                    localStorage.clear();
                    window.location.reload();
                  }}
                  className="p-2 bg-red-100 text-red-700 rounded text-sm"
                >Reset</button>
              </div>
            </div>
          </div>

        </aside>

        <section className="col-span-12 mt-4 bg-white p-4 rounded shadow">
          <h3 className="font-medium mb-2">Implementation notes (developer)</h3>
          <ul className="text-sm list-disc ml-5">
            <li>Automated categorization currently uses keyword heuristics; replace with a small classification model (server-side) or call OpenAI/your model to categorize text.
            </li>
            <li>Predictive spending uses linear regression on monthly totals — swap in ARIMA or a learned time-series model for better accuracy.
            </li>
            <li>Budget alerts run client-side. For production, implement server-side scheduled checks and push notifications (web push / email) with secure authentication.
            </li>
            <li>Persist data securely on server or encrypted cloud DB; localStorage is only for demo and testing.
            </li>
            <li>To add user sign-in, integrate OAuth or your auth provider and store per-user data on the backend.
            </li>
          </ul>
        </section>
      </main>

      <footer className="max-w-6xl mx-auto mt-6 text-xs text-gray-500">Built with a friendly JS stack — replace heuristics with real AI endpoints for production.</footer>
    </div>
  );
}

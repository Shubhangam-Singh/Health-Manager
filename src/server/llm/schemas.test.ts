import { test } from "node:test";
import assert from "node:assert/strict";
import { parseModelJson, preVisitSummarySchema } from "./schemas.ts";

const good = {
  urgency: "HIGH", chiefComplaint: "Chest tightness on exertion",
  summary: "Patient reports three days of chest tightness when climbing stairs.",
  suggestedQuestions: ["Does it radiate?", "Any breathlessness?", "Family history?"],
};

test("accepts a clean JSON object", () => {
  const r = parseModelJson(JSON.stringify(good), preVisitSummarySchema);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.data.urgency, "HIGH");
});

test("strips ```json fences the model was told not to add", () => {
  const r = parseModelJson("```json\n" + JSON.stringify(good) + "\n```", preVisitSummarySchema);
  assert.equal(r.ok, true);
});

test("strips bare ``` fences", () => {
  const r = parseModelJson("```\n" + JSON.stringify(good) + "\n```", preVisitSummarySchema);
  assert.equal(r.ok, true);
});

test("survives chatty prose around the object", () => {
  const r = parseModelJson(
    `Sure! Here is the summary you asked for:\n${JSON.stringify(good)}\nLet me know if you need more.`,
    preVisitSummarySchema);
  assert.equal(r.ok, true);
});

test("rejects lowercase urgency instead of silently accepting it", () => {
  const r = parseModelJson(JSON.stringify({ ...good, urgency: "high" }), preVisitSummarySchema);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.error : "", /schema mismatch/);
});

test("rejects an invented urgency level", () => {
  const r = parseModelJson(JSON.stringify({ ...good, urgency: "CRITICAL" }), preVisitSummarySchema);
  assert.equal(r.ok, false);
});

test("rejects a missing field", () => {
  const { chiefComplaint, ...missing } = good;
  assert.equal(parseModelJson(JSON.stringify(missing), preVisitSummarySchema).ok, false);
});

test("rejects truncated JSON", () => {
  const r = parseModelJson(JSON.stringify(good).slice(0, 60), preVisitSummarySchema);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.error : "", /invalid JSON/);
});

test("rejects an apology instead of JSON", () => {
  const r = parseModelJson("I'm sorry, I cannot help with medical questions.", preVisitSummarySchema);
  assert.equal(r.ok, false);
});

test("rejects an empty questions array", () => {
  const r = parseModelJson(JSON.stringify({ ...good, suggestedQuestions: [] }), preVisitSummarySchema);
  assert.equal(r.ok, false);
});

test("tolerates 4 questions when told to give 3", () => {
  const r = parseModelJson(
    JSON.stringify({ ...good, suggestedQuestions: [...good.suggestedQuestions, "One more?"] }),
    preVisitSummarySchema);
  assert.equal(r.ok, true); // rejecting a good summary over an off-by-one serves nobody
});

test("ignores extra keys the model invented", () => {
  const r = parseModelJson(JSON.stringify({ ...good, diagnosis: "angina", confidence: 0.9 }), preVisitSummarySchema);
  assert.equal(r.ok, true);
  assert.equal(r.ok && "diagnosis" in r.data, false); // stripped, not passed through
});

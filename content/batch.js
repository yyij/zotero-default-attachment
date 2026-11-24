"use strict";

const model = window.arguments[0];
document.documentElement.lang = model.language;
const localize = (element, id, args) => document.l10n.setAttributes(element, "dac-" + id, args);
const get = id => document.getElementById(id);
const form = get("rule");
const statusLine = get("status");
const apply = get("apply");
const table = get("rows");
let rows = [];

for (const name of ["source", "mode", "keyword"]) {
  if (model.rule?.[name]) get(name).value = model.rule[name];
}

function updateSummary() {
  const changeCount = rows.filter(row => row.choice && row.choice !== row.before).length;
  const conflicts = rows.filter(row => !row.protected && row.candidates.length > 1 && !row.choice).length;
  localize(statusLine, "summary", { count: model.count, changes: changeCount, conflicts });
  apply.disabled = !changeCount;
}

function invalidate() {
  rows = [];
  table.replaceChildren();
  apply.disabled = true;
  localize(statusLine, "initial", { count: model.count });
}

function render() {
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const tr = document.createElement("tr");
    const title = document.createElement("td");
    title.textContent = row.title;
    const current = document.createElement("td");
    if (row.current) current.textContent = row.current;
    else localize(current, row.before ? "invalid" : "none");
    tr.append(title, current);
    const cell = document.createElement("td");
    if (!row.candidates.length) localize(cell, "no-match");
    else if (row.protected) localize(cell, "protected");
    else {
      const select = document.createElement("select");
      localize(select, "choice", { title: row.title });
      const skip = new Option("", "");
      localize(skip, row.candidates.length > 1 ? "multiple" : "skip");
      select.add(skip);
      for (const candidate of row.candidates) {
        select.add(new Option(candidate.label, candidate.key));
      }
      row.choice = row.candidates.length === 1 ? row.candidates[0].key : "";
      select.value = row.choice;
      select.addEventListener("change", () => {
        row.choice = select.value;
        updateSummary();
      });
      cell.append(select);
    }
    tr.append(cell);
    fragment.append(tr);
  }
  table.replaceChildren(fragment);
  updateSummary();
}

form.addEventListener("input", invalidate);
form.addEventListener("submit", event => {
  event.preventDefault();
  const keyword = get("keyword").value.trim();
  if (!keyword) {
    localize(statusLine, "keyword-required");
    return;
  }
  try {
    rows = model.preview({
      keyword, source: get("source").value, mode: get("mode").value,
      overwrite: get("overwrite").checked
    });
    render();
  }
  catch (error) {
    console.error(error);
    invalidate();
    localize(statusLine, "preview-error");
  }
});

apply.addEventListener("click", () => {
  try {
    const { count, stale } = model.apply(rows);
    invalidate();
    if (stale) localize(statusLine, "updated-stale", { count, stale });
    else localize(statusLine, "updated", { count });
  }
  catch (error) {
    console.error(error);
    localize(statusLine, "apply-error");
  }
});
get("close").addEventListener("click", () => window.close());
invalidate();

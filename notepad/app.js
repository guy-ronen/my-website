const STORAGE_KEY = "notepad-web-v1";
const state = {
  notebooks: load(),
  notebookId: null,
  pageId: null,
  dialogMode: "notebook",
  tool: "pen",
  drawing: [],
  activeStroke: null
};

const $ = (id) => document.getElementById(id);
const canvas = $("drawingCanvas");
const context = canvas.getContext("2d");

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}
function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch (error) { console.error("Unable to load notes", error); return []; }
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.notebooks)); }
function currentNotebook() { return state.notebooks.find((item) => item.id === state.notebookId); }
function currentPage() { return currentNotebook()?.pages.find((item) => item.id === state.pageId); }
function show(screen) {
  ["notebooksScreen", "pagesScreen", "editorScreen"].forEach((id) => $(id).classList.toggle("hidden", id !== screen));
  $("backButton").classList.toggle("hidden", screen === "notebooksScreen");
  $("addButton").classList.toggle("hidden", screen === "editorScreen");
}
function renderNotebooks() {
  show("notebooksScreen");
  $("screenTitle").textContent = "המחברות שלי";
  const list = $("notebooksList");
  list.innerHTML = "";
  $("emptyNotebooks").classList.toggle("hidden", state.notebooks.length > 0);
  state.notebooks.forEach((notebook) => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<button class="card-open"><div class="card-title">📚 ${escapeHTML(notebook.title)}</div><div class="card-meta">${notebook.pages.length} דפים</div></button><button class="delete-button" aria-label="מחיקה">✕</button>`;
    card.querySelector(".card-open").onclick = () => openNotebook(notebook.id);
    card.querySelector(".delete-button").onclick = () => {
      state.notebooks = state.notebooks.filter((item) => item.id !== notebook.id);
      save(); renderNotebooks();
    };
    list.append(card);
  });
}
function renderPages() {
  show("pagesScreen");
  $("screenTitle").textContent = currentNotebook()?.title || "מחברת";
  const pages = currentNotebook()?.pages || [];
  $("pagesList").innerHTML = "";
  $("emptyPages").classList.toggle("hidden", pages.length > 0);
  pages.forEach((page, index) => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<button class="card-open"><div class="card-title">📄 ${escapeHTML(page.title || `דף ${index + 1}`)}</div><div class="card-meta">דף ${index + 1}</div></button><button class="delete-button" aria-label="מחיקה">✕</button>`;
    card.querySelector(".card-open").onclick = () => openPage(page.id);
    card.querySelector(".delete-button").onclick = () => {
      const notebook = currentNotebook();
      notebook.pages = notebook.pages.filter((item) => item.id !== page.id);
      save(); renderPages();
    };
    $("pagesList").append(card);
  });
}
function openNotebook(id) { state.notebookId = id; renderPages(); }
function openPage(id) {
  state.pageId = id;
  state.drawing = currentPage()?.drawing || [];
  $("screenTitle").textContent = currentPage()?.title || "דף";
  show("editorScreen");
  requestAnimationFrame(resizeCanvas);
}
function addItem() {
  state.dialogMode = state.notebookId ? "page" : "notebook";
  $("dialogTitle").textContent = state.dialogMode === "page" ? "דף חדש" : "מחברת חדשה";
  $("itemName").placeholder = state.dialogMode === "page" ? "שם הדף" : "שם המחברת";
  $("itemName").value = "";
  $("dialog").classList.remove("hidden");
  setTimeout(() => $("itemName").focus(), 0);
}
function resizeCanvas() {
  if ($("editorScreen").classList.contains("hidden")) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.lineCap = "round"; context.lineJoin = "round";
  redraw();
}
function redraw() {
  const rect = canvas.getBoundingClientRect();
  context.clearRect(0, 0, rect.width, rect.height);
  state.drawing.forEach((stroke) => drawStroke(stroke));
}
function drawStroke(stroke) {
  if (stroke.points.length < 1) return;
  context.save();
  context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.beginPath();
  context.moveTo(stroke.points[0].x, stroke.points[0].y);
  stroke.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  if (stroke.points.length === 1) context.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y + 0.1);
  context.stroke(); context.restore();
}
function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top, pressure: event.pressure || 0.5 };
}
function beginStroke(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  const point = pointFromEvent(event);
  state.activeStroke = { tool: state.tool, color: $("colorPicker").value, width: Number($("widthPicker").value) * (0.65 + point.pressure), points: [point] };
  state.drawing.push(state.activeStroke);
  drawStroke(state.activeStroke);
}
function continueStroke(event) {
  if (!state.activeStroke) return;
  state.activeStroke.points.push(pointFromEvent(event));
  redraw();
}
function endStroke() {
  if (!state.activeStroke) return;
  const page = currentPage();
  if (page) { page.drawing = state.drawing; save(); }
  state.activeStroke = null;
}
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]); }

$("addButton").onclick = addItem;
$("backButton").onclick = () => state.pageId ? (state.pageId = null, renderPages()) : (state.notebookId = null, renderNotebooks());
$("cancelDialog").onclick = () => $("dialog").classList.add("hidden");
$("newItemForm").onsubmit = (event) => {
  event.preventDefault();
  const title = $("itemName").value.trim();
  if (!title) return;
  if (state.dialogMode === "notebook") state.notebooks.unshift({ id: uid(), title, pages: [] });
  else currentNotebook().pages.push({ id: uid(), title, drawing: [] });
  save(); $("dialog").classList.add("hidden");
  state.dialogMode === "notebook" ? renderNotebooks() : renderPages();
};
document.querySelectorAll("[data-tool]").forEach((button) => button.onclick = () => {
  state.tool = button.dataset.tool;
  document.querySelectorAll("[data-tool]").forEach((item) => item.classList.toggle("active", item === button));
});
$("clearButton").onclick = () => { state.drawing = []; redraw(); const page = currentPage(); if (page) { page.drawing = []; save(); } };
canvas.addEventListener("pointerdown", beginStroke);
canvas.addEventListener("pointermove", continueStroke);
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);
window.addEventListener("resize", resizeCanvas);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(console.error);
renderNotebooks();

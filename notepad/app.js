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
window.notePadState = state;

const $ = (id) => document.getElementById(id);
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
state.save = save;
state.currentPage = currentPage;
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
  $("paperWrap").dataset.paper = currentPage()?.paper || "blank";
  $("paperWrap").classList.toggle("imported-pdf", Boolean(currentPage()?.pdfData));
  renderImportedPDF();
  show("editorScreen");
  requestAnimationFrame(() => window.notePadCanvas?.resize());
}
function addItem() {
  state.dialogMode = state.notebookId ? "page" : "notebook";
  $("dialogTitle").textContent = state.dialogMode === "page" ? "דף חדש" : "מחברת חדשה";
  $("itemName").placeholder = state.dialogMode === "page" ? "שם הדף" : "שם המחברת";
  $("pageTypeField").classList.toggle("hidden", state.dialogMode !== "page");
  $("pageType").value = "blank";
  $("itemName").value = "";
  $("dialog").classList.remove("hidden");
  setTimeout(() => $("itemName").focus(), 0);
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
  else currentNotebook().pages.push({ id: uid(), title, paper: $("pageType").value, drawing: [] });
  save(); $("dialog").classList.add("hidden");
  state.dialogMode === "notebook" ? renderNotebooks() : renderPages();
};
$("toolToggle").onclick = () => {
  state.tool = state.tool === "pen" ? "eraser" : "pen";
  $("toolToggle").textContent = state.tool === "pen" ? "עט" : "מחק";
  $("toolToggle").classList.toggle("active", state.tool === "pen");
  $("toolToggle").classList.toggle("eraser-active", state.tool === "eraser");
};
$("exportButton")?.addEventListener("click", () => window.print());
$("importButton")?.addEventListener("click", () => $("pdfImporter").click());
$("pdfImporter").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file || file.type !== "application/pdf") return;
  const reader = new FileReader();
  reader.onload = () => {
    const page = currentPage();
    if (!page) return;
    page.pdfData = reader.result;
    page.paper = "blank";
    save();
    renderImportedPDF();
  };
  reader.readAsDataURL(file);
  event.target.value = "";
});
function renderImportedPDF() {
  const existing = $("paperWrap").querySelector(".pdf-preview");
  if (existing) existing.remove();
  const pdfData = currentPage()?.pdfData;
  if (!pdfData) return;
  const preview = document.createElement("iframe");
  preview.className = "pdf-preview";
  preview.title = "תצוגה מקדימה של PDF";
  preview.src = pdfData;
  $("paperWrap").prepend(preview);
}
$("clearButton").onclick = () => {
  state.drawing = [];
  window.notePadCanvas?.redraw();
  const page = currentPage();
  if (page) { page.drawing = []; save(); }
};
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(console.error);
renderNotebooks();

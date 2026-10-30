(() => {
  const canvas = document.getElementById("drawingCanvas");
  const context = canvas.getContext("2d");
  const state = window.notePadState;
  const ERASER_BUTTON = 2;
  const ERASER_RADIUS = 18;
  const SNAP_DELAY = 500;
  let snapTimer = null;
  let activePointerId = null;
  const eraserPointers = new Set();
  const undoStack = [];
  const redoStack = [];

  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, pressure: event.pressure || 0.5 };
  };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const status = (event, erasing = false) => {
    const output = document.getElementById("inputStatus");
    if (output) output.textContent = `קלט: ${event.pointerType || "לא ידוע"}${erasing ? " · מחיקה" : ""}`;
  };
  const physicalEraser = (event) => {
    if (event.pointerType === "eraser") return true;
    if (event.pointerType === "pen" && (event.buttons & ERASER_BUTTON)) eraserPointers.add(event.pointerId);
    return eraserPointers.has(event.pointerId);
  };
  const save = () => {
    const page = state.currentPage();
    if (page) { page.drawing = state.drawing; state.save(); }
  };
  const snapshot = () => JSON.parse(JSON.stringify(state.drawing));
  const drawStroke = (stroke) => {
    if (!stroke.points || !stroke.points.length) return;
    context.save();
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.width;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    if (stroke.points.length === 1) context.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y + 0.1);
    for (let i = 1; i < stroke.points.length - 1; i += 1) {
      const a = stroke.points[i];
      const b = stroke.points[i + 1];
      context.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    if (stroke.points.length > 1) {
      const last = stroke.points[stroke.points.length - 1];
      context.lineTo(last.x, last.y);
    }
    context.stroke();
    context.restore();
  };
  const redraw = () => {
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    state.drawing.forEach(drawStroke);
  };
  const resize = () => {
    if (document.getElementById("editorScreen").classList.contains("hidden")) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    redraw();
  };
  const segmentDistance = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    if (!length) return distance(p, a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
    return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
  };
  const eraseAt = (p) => {
    const before = state.drawing.length;
    state.drawing = state.drawing.filter((stroke) => {
      for (let i = 1; i < stroke.points.length; i += 1) {
        if (segmentDistance(p, stroke.points[i - 1], stroke.points[i]) <= ERASER_RADIUS + stroke.width / 2) return false;
      }
      return stroke.points.length !== 1 || distance(p, stroke.points[0]) > ERASER_RADIUS;
    });
    if (state.drawing.length !== before) { redraw(); save(); }
  };
  const bounds = (points) => ({
    minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)), maxY: Math.max(...points.map((p) => p.y))
  });
  const pathLength = (points) => points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
  const recognize = (points) => {
    if (points.length < 2) return null;
    const box = bounds(points), width = box.maxX - box.minX, height = box.maxY - box.minY;
    const diagonal = Math.hypot(width, height), length = pathLength(points);
    if (diagonal < 20 || length < 35) return null;
    const closed = distance(points[0], points[points.length - 1]) <= Math.max(28, diagonal * 0.24);
    if (!closed && distance(points[0], points[points.length - 1]) / length > 0.72) return { type: "line", points: [points[0], points[points.length - 1]] };
    if (!closed) return null;
    const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
    const radii = points.map((p) => distance(p, center));
    const average = radii.reduce((a, b) => a + b, 0) / radii.length;
    const deviation = radii.reduce((a, r) => a + Math.abs(r - average), 0) / radii.length;
    const edgeError = points.reduce((sum, p) => sum + Math.min(Math.abs(p.x - box.minX), Math.abs(p.x - box.maxX), Math.abs(p.y - box.minY), Math.abs(p.y - box.maxY)), 0) / points.length;
    if (edgeError < Math.max(18, diagonal * 0.13) && width > 25 && height > 25) {
      return { type: "rectangle", points: [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }, { x: box.minX, y: box.minY }] };
    }
    if (width > 25 && height > 25 && deviation / Math.max(average, 1) < 0.28 && Math.abs(width - height) / Math.max(width, height) < 0.5) {
      const circle = [];
      for (let i = 0; i <= 48; i += 1) { const angle = Math.PI * 2 * i / 48; circle.push({ x: center.x + width / 2 * Math.cos(angle), y: center.y + height / 2 * Math.sin(angle) }); }
      return { type: "circle", points: circle };
    }
    const triangle = [{ x: center.x, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }, { x: center.x, y: box.minY }];
    const simplified = [points[0], points[Math.floor(points.length / 3)], points[Math.floor(points.length * 2 / 3)], points[points.length - 1]];
    const error = simplified.reduce((sum, p, i) => sum + distance(p, triangle[i]), 0) / 4;
    return error < Math.max(32, diagonal * 0.3) ? { type: "triangle", points: triangle } : null;
  };
  const snap = () => {
    const stroke = state.activeStroke;
    if (!stroke || stroke.snapped || stroke.tool !== "pen") return;
    const shape = recognize(stroke.points);
    if (!shape) return;
    undoStack.push(snapshot());
    redoStack.length = 0;
    stroke.points = shape.points;
    stroke.shape = shape.type;
    stroke.snapped = true;
    redraw();
    save();
  };
  const scheduleSnap = () => { clearTimeout(snapTimer); snapTimer = setTimeout(snap, SNAP_DELAY); };

  function begin(event) {
    if (event.pointerType !== "pen" && event.pointerType !== "eraser") return;
    event.preventDefault();
    activePointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    const erasing = physicalEraser(event) || state.tool === "eraser";
    status(event, erasing);
    if (erasing) { eraseAt(point(event)); state.activeStroke = null; return; }
    const p = point(event);
    const width = Number(document.getElementById("widthPicker").value) * (0.55 + Math.min(1, Math.max(0.1, p.pressure)) * 0.9);
    state.activeStroke = { tool: "pen", color: document.getElementById("colorPicker").value, width, points: [p] };
    state.drawing.push(state.activeStroke);
    redraw();
    scheduleSnap();
  }
  function move(event) {
    if (event.pointerType !== "pen" && event.pointerType !== "eraser") return;
    event.preventDefault();
    const erasing = physicalEraser(event) || state.tool === "eraser";
    status(event, erasing);
    if (erasing) { clearTimeout(snapTimer); state.activeStroke = null; eraseAt(point(event)); return; }
    if (!state.activeStroke || event.pointerId !== activePointerId) return;
    const p = point(event);
    const previous = state.activeStroke.points[state.activeStroke.points.length - 1];
    state.activeStroke.points.push(p);
    redraw();
    if (distance(previous, p) >= 4) scheduleSnap();
  }
  function end(event) {
    if (event.pointerType !== "pen" && event.pointerType !== "eraser") return;
    clearTimeout(snapTimer);
    event.preventDefault();
    if (state.activeStroke) save();
    state.activeStroke = null;
    eraserPointers.delete(event.pointerId);
    activePointerId = null;
    status(event);
  }
  canvas.addEventListener("pointerdown", begin, { passive: false });
  canvas.addEventListener("pointermove", move, { passive: false });
  canvas.addEventListener("pointerup", end, { passive: false });
  canvas.addEventListener("pointercancel", end, { passive: false });
  window.addEventListener("resize", resize);
  window.notePadCanvas = { resize, redraw, undo() { if (!undoStack.length) return; redoStack.push(snapshot()); state.drawing = undoStack.pop(); save(); redraw(); }, redo() { if (!redoStack.length) return; undoStack.push(snapshot()); state.drawing = redoStack.pop(); save(); redraw(); } };
})();

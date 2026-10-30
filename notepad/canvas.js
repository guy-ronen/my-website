(() => {
  const canvas = document.getElementById("drawingCanvas");
  const context = canvas.getContext("2d");
  const state = window.notePadState;
  const SNAP_DELAY = 500;
  let snapTimer = null;

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      pressure: event.pressure || 0.5
    };
  }

  function drawStroke(stroke) {
    if (!stroke.points.length) return;
    context.save();
    context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.width;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    stroke.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    if (stroke.points.length === 1) {
      context.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y + 0.1);
    }
    context.stroke();
    context.restore();
  }

  function redraw() {
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    state.drawing.forEach(drawStroke);
  }

  function resize() {
    if (document.getElementById("editorScreen").classList.contains("hidden")) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    redraw();
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function bounds(points) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys)
    };
  }

  function recognizeShape(points) {
    if (points.length < 4) return null;
    const box = bounds(points);
    const width = box.maxX - box.minX;
    const height = box.maxY - box.minY;
    const diagonal = Math.hypot(width, height);
    if (diagonal < 18) return null;

    const start = points[0];
    const end = points[points.length - 1];
    const closed = distance(start, end) <= Math.max(24, diagonal * 0.2);
    const directDistance = distance(start, end);
    const pathLength = points.slice(1).reduce((total, point, index) => {
      return total + distance(points[index], point);
    }, 0);

    if (!closed && directDistance / Math.max(pathLength, 1) > 0.86) {
      return {
        type: "line",
        points: [start, end]
      };
    }

    if (closed && width > 24 && height > 24) {
      const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
      const radii = points.map((point) => distance(point, center));
      const averageRadius = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
      const deviation = radii.reduce((sum, radius) => sum + Math.abs(radius - averageRadius), 0) / radii.length;

      if (deviation / Math.max(averageRadius, 1) < 0.22) {
        const circle = [];
        for (let index = 0; index <= 40; index += 1) {
          const angle = (Math.PI * 2 * index) / 40;
          circle.push({
            x: center.x + (width / 2) * Math.cos(angle),
            y: center.y + (height / 2) * Math.sin(angle)
          });
        }
        return { type: "circle", points: circle };
      }

      return {
        type: "rectangle",
        points: [
          { x: box.minX, y: box.minY },
          { x: box.maxX, y: box.minY },
          { x: box.maxX, y: box.maxY },
          { x: box.minX, y: box.maxY },
          { x: box.minX, y: box.minY }
        ]
      };
    }
    return null;
  }

  function snapActiveStroke() {
    const stroke = state.activeStroke;
    if (!stroke || stroke.tool === "eraser" || stroke.snapped) return;
    const shape = recognizeShape(stroke.points);
    if (!shape) return;
    stroke.points = shape.points;
    stroke.shape = shape.type;
    stroke.snapped = true;
    state.drawing[state.drawing.length - 1] = stroke;
    redraw();
  }

  function scheduleSnap() {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(snapActiveStroke, SNAP_DELAY);
  }

  function beginStroke(event) {
    if (event.pointerType !== "pen") return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    const physicalEraser = Boolean(event.buttons & 2);
    state.activeStroke = {
      tool: physicalEraser || state.tool === "eraser" ? "eraser" : "pen",
      color: document.getElementById("colorPicker").value,
      width: Number(document.getElementById("widthPicker").value) * (0.65 + point.pressure),
      points: [point]
    };
    state.drawing.push(state.activeStroke);
    redraw();
  }

  function continueStroke(event) {
    if (event.pointerType !== "pen" || !state.activeStroke) return;
    event.preventDefault();
    if (state.activeStroke.snapped) return;
    const point = pointFromEvent(event);
    if (event.buttons & 2) state.activeStroke.tool = "eraser";
    state.activeStroke.points.push(point);
    redraw();
    scheduleSnap();
  }

  function finishStroke(event) {
    if (event.pointerType !== "pen") return;
    clearTimeout(snapTimer);
    event.preventDefault();
    if (state.activeStroke) {
      const page = state.currentPage();
      if (page) {
        page.drawing = state.drawing;
        state.save();
      }
    }
    state.activeStroke = null;
  }

  canvas.addEventListener("pointerdown", beginStroke, { passive: false });
  canvas.addEventListener("pointermove", continueStroke, { passive: false });
  canvas.addEventListener("pointerup", finishStroke, { passive: false });
  canvas.addEventListener("pointercancel", finishStroke, { passive: false });
  window.addEventListener("resize", resize);
  window.notePadCanvas = { resize, redraw };
})();

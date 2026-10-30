(() => {
  const canvas = document.getElementById("drawingCanvas");
  const context = canvas.getContext("2d");
  const state = window.notePadState;
  const ERASER_BUTTON = 2;
  const ERASER_RADIUS = 18;
  const SNAP_DELAY = 500;
  const SNAP_MOVEMENT_THRESHOLD = 4;
  let snapTimer = null;
  const eraserPointerIds = new Set();
  const undoStack = [];
  const redoStack = [];

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      pressure: event.pressure || 0.5
    };
  }

  function isPhysicalEraser(event) {
    if (event.pointerType === "eraser") return true;
    if (event.pointerType === "pen" && (event.buttons & ERASER_BUTTON)) {
      eraserPointerIds.add(event.pointerId);
      return true;
    }
    return eraserPointerIds.has(event.pointerId);
  }

  function updateInputStatus(event) {
    const status = document.getElementById("inputStatus");
    if (!status) return;
    status.textContent = `קלט: ${event.pointerType || "לא ידוע"}${isPhysicalEraser(event) ? " · מחיקה" : ""}`;
  }

  function strokeWidth(point) {
    const selectedWidth = Number(document.getElementById("widthPicker").value);
    const pressure = Math.min(1, Math.max(0.1, point.pressure));
    return selectedWidth * (0.55 + pressure * 0.9);
  }

  function drawStroke(stroke) {
    if (!stroke.points?.length) return;
    context.save();
    context.globalCompositeOperation = "source-over";
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.width;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();

    if (stroke.points.length === 1) {
      const point = stroke.points[0];
      context.moveTo(point.x, point.y);
      context.lineTo(point.x + 0.1, point.y + 0.1);
    } else {
      context.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let index = 1; index < stroke.points.length - 1; index += 1) {
        const current = stroke.points[index];
        const next = stroke.points[index + 1];
        const midpoint = {
          x: (current.x + next.x) / 2,
          y: (current.y + next.y) / 2
        };
        context.quadraticCurveTo(current.x, current.y, midpoint.x, midpoint.y);
      }
      const last = stroke.points[stroke.points.length - 1];
      context.lineTo(last.x, last.y);
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

  function distanceToSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
    const projection = Math.max(0, Math.min(1, (
      (point.x - start.x) * dx + (point.y - start.y) * dy
    ) / lengthSquared));
    const closest = {
      x: start.x + projection * dx,
      y: start.y + projection * dy
    };
    return Math.hypot(point.x - closest.x, point.y - closest.y);
  }

  function strokeIntersectsPoint(stroke, point) {
    const points = stroke.points || [];
    for (let index = 1; index < points.length; index += 1) {
      const radius = ERASER_RADIUS + (stroke.width || 1) / 2;
      if (distanceToSegment(point, points[index - 1], points[index]) <= radius) return true;
    }
    return points.length === 1 && distanceToSegment(point, points[0], points[0]) <= ERASER_RADIUS;
  }

  function eraseAt(point) {
    const originalLength = state.drawing.length;
    state.drawing = state.drawing.filter((stroke) => !strokeIntersectsPoint(stroke, point));
    if (state.drawing.length === originalLength) return;
    redraw();
    const page = state.currentPage();
    if (page) {
      page.drawing = state.drawing;
      state.save();
    }
  }

  function distance(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function pathLength(points) {
      return points.slice(1).reduce((total, point, index) => (
        total + distance(points[index], point)
      ), 0);
    }

    function getBounds(points) {
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys)
      };
    }

    function simplify(points, targetCount) {
      if (points.length <= targetCount) return points.slice();
      const step = (points.length - 1) / (targetCount - 1);
      return Array.from({ length: targetCount }, (_, index) => (
        points[Math.round(index * step)]
      ));
    }

    function isClosed(points, diagonal) {
      return distance(points[0], points[points.length - 1]) <= Math.max(24, diagonal * 0.2);
    }

    function recognizeShape(points) {
      if (points.length < 2) return null;
      const bounds = getBounds(points);
      const width = bounds.maxX - bounds.minX;
      const height = bounds.maxY - bounds.minY;
      const diagonal = Math.hypot(width, height);
      const totalLength = pathLength(points);
      if (diagonal < 20 || totalLength < 35) return null;

      const closed = isClosed(points, diagonal);
      const directDistance = distance(points[0], points[points.length - 1]);
      if (!closed && directDistance / Math.max(totalLength, 1) > 0.82) {
        return {
          type: "line",
          points: [points[0], points[points.length - 1]]
        };
      }
      if (!closed) return null;

      const center = {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2
      };
      const rectangle = [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
        { x: bounds.minX, y: bounds.maxY },
        { x: bounds.minX, y: bounds.minY }
      ];
      const triangle = [
        { x: center.x, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
        { x: bounds.minX, y: bounds.maxY },
        { x: center.x, y: bounds.minY }
      ];

      function pathError(path) {
        return points.reduce((sum, point) => {
          let nearest = Infinity;
          for (let index = 1; index < path.length; index += 1) {
            nearest = Math.min(
              nearest,
              distanceToSegment(point, path[index - 1], path[index])
            );
          }
          return sum + nearest;
        }, 0) / points.length;
      }

      const rectangleError = pathError(rectangle);
      const rectangleCornersCovered = rectangle.slice(0, 4).every((corner) => (
        points.some((point) => distance(point, corner) <= diagonal * 0.22)
      ));
      const triangleError = pathError(triangle);
      const radii = points.map((point) => distance(point, center));
      const averageRadius = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
      const circleError = radii.reduce(
        (sum, radius) => sum + Math.abs(radius - averageRadius),
        0
      ) / radii.length;
      const normalizedErrors = [
        {
          type: "rectangle",
          error: rectangleCornersCovered ? rectangleError / diagonal : Infinity
        },
        { type: "triangle", error: triangleError / diagonal },
        { type: "circle", error: circleError / Math.max(averageRadius, 1) }
      ].sort((a, b) => a.error - b.error);
      const best = normalizedErrors[0];
      if (best.error > 0.12) return null;
      if (best.type === "rectangle") {
        return { type: "rectangle", points: rectangle };
      }
      if (best.type === "triangle") {
        return { type: "triangle", points: triangle };
      }

      const circle = [];
      for (let index = 0; index <= 48; index += 1) {
        const angle = (Math.PI * 2 * index) / 48;
        circle.push({
          x: center.x + (width / 2) * Math.cos(angle),
          y: center.y + (height / 2) * Math.sin(angle)
        });
      }
      return { type: "circle", points: circle };
    }

    function saveDrawing() {
      const page = state.currentPage();
      if (page) {
        page.drawing = state.drawing;
        state.save();
      }
    }

    function snapshotDrawing() {
      return JSON.parse(JSON.stringify(state.drawing));
    }

    function applySnap() {
      const stroke = state.activeStroke;
      if (!stroke || stroke.tool !== "pen" || stroke.snapped) return;
      const shape = recognizeShape(stroke.points);
      if (!shape) return;
      undoStack.push(snapshotDrawing());
      redoStack.length = 0;
      stroke.points = shape.points;
      stroke.shape = shape.type;
      stroke.snapped = true;
      redraw();
      saveDrawing();
    }

    function scheduleSnap() {
      clearTimeout(snapTimer);
      snapTimer = setTimeout(applySnap, SNAP_DELAY);
    }

    function movedEnoughForSnap(previousPoint, point) {
      return distance(previousPoint, point) >= SNAP_MOVEMENT_THRESHOLD;
    }

  function beginStroke(event) {
    if (event.pointerType !== "pen" && event.pointerType !== "eraser") return;
    event.preventDefault();
    updateInputStatus(event);
    canvas.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);

    if (isPhysicalEraser(event) || state.tool === "eraser") {
      eraseAt(point);
      state.activeStroke = null;
      return;
    }

    state.activeStroke = {
      tool: "pen",
      color: document.getElementById("colorPicker").value,
      width: strokeWidth(point),
      points: [point]
    };
    state.drawing.push(state.activeStroke);
    redraw();
    scheduleSnap();
  }

  function continueStroke(event) {
    if (event.pointerType !== "pen" && event.pointerType !== "eraser") return;
    event.preventDefault();
    updateInputStatus(event);
    const point = pointFromEvent(event);

    if (isPhysicalEraser(event) || state.tool === "eraser") {
      clearTimeout(snapTimer);
      state.activeStroke = null;
      eraseAt(point);
      return;
    }

    if (!state.activeStroke) return;
    const previousPoint = state.activeStroke.points[state.activeStroke.points.length - 1];
    state.activeStroke.points.push(point);
    redraw();
    if (movedEnoughForSnap(previousPoint, point)) scheduleSnap();
  }

  function finishStroke(event) {
    if (event.pointerType !== "pen" && event.pointerType !== "eraser") return;
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
    eraserPointerIds.delete(event.pointerId);
    updateInputStatus(event);
  }

  canvas.addEventListener("pointerdown", beginStroke, { passive: false });
  canvas.addEventListener("pointermove", continueStroke, { passive: false });
  canvas.addEventListener("pointerup", finishStroke, { passive: false });
  canvas.addEventListener("pointercancel", finishStroke, { passive: false });
  window.addEventListener("resize", resize);
  window.notePadCanvas = {
    resize,
    redraw,
    undo() {
      if (!undoStack.length) return;
      redoStack.push(snapshotDrawing());
      state.drawing = undoStack.pop();
      saveDrawing();
      redraw();
    },
    redo() {
      if (!redoStack.length) return;
      undoStack.push(snapshotDrawing());
      state.drawing = redoStack.pop();
      saveDrawing();
      redraw();
    }
  };
})();

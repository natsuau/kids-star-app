const canvas = document.getElementById("starCanvas");
const ctx = canvas.getContext("2d");

const pages = {
  menu: document.getElementById("menuPage"),
  mode: document.getElementById("modePage"),
  practice: document.getElementById("practicePage")
};

const selectedStarTitle = document.getElementById("selectedStarTitle");
const practiceTitle = document.getElementById("practiceTitle");
const instruction = document.getElementById("instruction");
const modeLabel = document.getElementById("modeLabel");
const replayButton = document.getElementById("replayButton");
const resetButton = document.getElementById("resetButton");
const celebration = document.getElementById("clearCelebration");

const STAR_CONFIG = {
  5: { label: "5 Pointed Star", strokes: [[0, 2, 4, 1, 3, 0]] },
  6: { label: "6 Pointed Star", strokes: [[0, 2, 4, 0], [1, 3, 5, 1]] },
  7: { label: "7 Pointed Star", strokes: [[0, 3, 6, 2, 5, 1, 4, 0]] },
  8: { label: "8 Pointed Star", strokes: [[0, 3, 6, 1, 4, 7, 2, 5, 0]] },
  10: { label: "10 Pointed Star", strokes: [[0, 3, 6, 9, 2, 5, 8, 1, 4, 7, 0]] }
};

const MODE_TEXT = {
  watch: {
    label: "書き方を見る",
    instruction: "くろい せんが うごくよ。じゅんばんを よく みてね。"
  },
  trace: {
    label: "なぞって書く",
    instruction: "ひかる てんから、うごく くろい せんを ゆびで おいかけよう。"
  },
  try: {
    label: "自分で書く",
    instruction: "うすい えんと てんを つかって、じぶんで ほしを かこう。"
  }
};

const STORAGE_KEY = "kids-star-app-cleared-v1";
const CENTER = { x: 300, y: 300 };
const RADIUS = 218;
const DOT_RADIUS = 12;
const HIT_RADIUS = 30;

let currentStar = 5;
let currentMode = "watch";
let points = [];
let committedEdges = new Set();
let drawing = null;
let currentDot = null;
let guidedStrokeIndex = 0;
let guidedSegmentIndex = 0;
let animationFrame = null;
let animationStartedAt = 0;
let watchAnimation = null;
let completed = false;

function showPage(name) {
  Object.entries(pages).forEach(([key, page]) => {
    page.hidden = key !== name;
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function readClearedStars() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return new Set(Array.isArray(stored) ? stored.map(String) : []);
  } catch (_error) {
    return new Set();
  }
}

function saveClearedStar(star) {
  const cleared = readClearedStars();
  cleared.add(String(star));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...cleared]));
  } catch (_error) {
    // The app still works when browser storage is unavailable.
  }
  updateClearBadges();
}

function updateClearBadges() {
  const cleared = readClearedStars();
  document.querySelectorAll("[data-clear-for]").forEach((badge) => {
    badge.hidden = !cleared.has(badge.dataset.clearFor);
  });
}

function selectStar(star) {
  currentStar = Number(star);
  selectedStarTitle.textContent = STAR_CONFIG[currentStar].label;
  showPage("mode");
}

function startMode(mode) {
  currentMode = mode;
  practiceTitle.textContent = STAR_CONFIG[currentStar].label;
  modeLabel.textContent = MODE_TEXT[mode].label;
  instruction.textContent = MODE_TEXT[mode].instruction;
  replayButton.hidden = mode !== "watch";
  resetButton.hidden = mode === "watch";
  showPage("practice");
  resetPractice();
}

function buildPoints(count) {
  return Array.from({ length: count }, (_value, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    return {
      x: CENTER.x + Math.cos(angle) * RADIUS,
      y: CENTER.y + Math.sin(angle) * RADIUS
    };
  });
}

function edgeKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function allEdges() {
  return STAR_CONFIG[currentStar].strokes.flatMap((stroke) =>
    stroke.slice(0, -1).map((from, index) => [from, stroke[index + 1]])
  );
}

function validUnusedNeighbors(dot) {
  const neighbors = [];
  allEdges().forEach(([a, b]) => {
    if (committedEdges.has(edgeKey(a, b))) return;
    if (a === dot) neighbors.push(b);
    if (b === dot) neighbors.push(a);
  });
  return neighbors;
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height
  };
}

function nearestDot(position, candidates = points.map((_point, index) => index)) {
  let result = null;
  let bestDistance = HIT_RADIUS;
  candidates.forEach((index) => {
    const point = points[index];
    const distance = Math.hypot(position.x - point.x, position.y - point.y);
    if (distance <= bestDistance) {
      bestDistance = distance;
      result = index;
    }
  });
  return result;
}

function guidedSegment() {
  const strokes = STAR_CONFIG[currentStar].strokes;
  const stroke = strokes[guidedStrokeIndex];
  if (!stroke) return null;
  if (guidedSegmentIndex >= stroke.length - 1) return null;
  return {
    from: stroke[guidedSegmentIndex],
    to: stroke[guidedSegmentIndex + 1]
  };
}

function resetPractice() {
  cancelAnimationFrame(animationFrame);
  animationFrame = null;
  committedEdges = new Set();
  drawing = null;
  currentDot = null;
  guidedStrokeIndex = 0;
  guidedSegmentIndex = 0;
  watchAnimation = null;
  completed = false;
  celebration.hidden = true;
  points = buildPoints(currentStar);

  if (currentMode === "watch") {
    startWatchAnimation();
  } else {
    render();
    if (currentMode === "trace") startGuideAnimation();
  }
}

function startWatchAnimation() {
  watchAnimation = { stroke: 0, segment: 0, progress: 0 };
  animationStartedAt = performance.now();
  const tick = (now) => {
    const segmentDuration = 650;
    const elapsed = now - animationStartedAt;
    watchAnimation.progress = Math.max(0, Math.min(elapsed / segmentDuration, 1));
    render();

    if (watchAnimation.progress >= 1) {
      const stroke = STAR_CONFIG[currentStar].strokes[watchAnimation.stroke];
      committedEdges.add(edgeKey(stroke[watchAnimation.segment], stroke[watchAnimation.segment + 1]));
      watchAnimation.segment += 1;
      watchAnimation.progress = 0;
      animationStartedAt = now;

      if (watchAnimation.segment >= stroke.length - 1) {
        watchAnimation.stroke += 1;
        watchAnimation.segment = 0;
        animationStartedAt = now + 280;
      }

      if (watchAnimation.stroke >= STAR_CONFIG[currentStar].strokes.length) {
        watchAnimation = null;
        render();
        instruction.textContent = "さいごまで かけたね。もういちど みることも できるよ。";
        return;
      }
    }
    animationFrame = requestAnimationFrame(tick);
  };
  animationFrame = requestAnimationFrame(tick);
}

function startGuideAnimation() {
  cancelAnimationFrame(animationFrame);
  animationStartedAt = performance.now();
  const tick = (now) => {
    if (currentMode !== "trace" || completed) return;
    const elapsed = (now - animationStartedAt) % 1300;
    const progress = Math.min(elapsed / 900, 1);
    render(progress);
    animationFrame = requestAnimationFrame(tick);
  };
  animationFrame = requestAnimationFrame(tick);
}

function drawCircleGuide() {
  ctx.save();
  ctx.beginPath();
  ctx.arc(CENTER.x, CENTER.y, RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(81, 139, 158, 0.2)";
  ctx.lineWidth = 4;
  ctx.setLineDash([8, 11]);
  ctx.stroke();
  ctx.restore();
}

function drawCommittedEdges(color = "#4ca9d2") {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 11;
  ctx.strokeStyle = color;
  ctx.shadowColor = "rgba(61, 160, 203, 0.28)";
  ctx.shadowBlur = 8;
  allEdges().forEach(([a, b]) => {
    if (!committedEdges.has(edgeKey(a, b))) return;
    ctx.beginPath();
    ctx.moveTo(points[a].x, points[a].y);
    ctx.lineTo(points[b].x, points[b].y);
    ctx.stroke();
  });
  ctx.restore();
}

function drawDots(activeDots = []) {
  points.forEach((point, index) => {
    const active = activeDots.includes(index);
    ctx.save();
    ctx.beginPath();
    ctx.arc(point.x, point.y, active ? DOT_RADIUS + 5 : DOT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = active ? "#ffcc3f" : "#ffffff";
    ctx.strokeStyle = active ? "#e99b22" : "#5bb4c9";
    ctx.lineWidth = active ? 5 : 4;
    if (active) {
      ctx.shadowColor = "rgba(255, 187, 48, 0.7)";
      ctx.shadowBlur = 16;
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
}

function drawMovingGuide(progress) {
  const segment = guidedSegment();
  if (!segment) return;
  const from = points[segment.from];
  const to = points[segment.to];
  const x = from.x + (to.x - from.x) * progress;
  const y = from.y + (to.y - from.y) * progress;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(x, y);
  ctx.strokeStyle = "#1f2b32";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fillStyle = "#1f2b32";
  ctx.fill();
  ctx.restore();
}

function drawWatchProgress() {
  if (!watchAnimation) return;
  const stroke = STAR_CONFIG[currentStar].strokes[watchAnimation.stroke];
  if (!stroke) return;
  const from = points[stroke[watchAnimation.segment]];
  const to = points[stroke[watchAnimation.segment + 1]];
  const x = from.x + (to.x - from.x) * watchAnimation.progress;
  const y = from.y + (to.y - from.y) * watchAnimation.progress;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(x, y);
  ctx.strokeStyle = "#1f2b32";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

function drawLiveInk() {
  if (!drawing) return;
  const start = points[drawing.from];
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  drawing.path.forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.strokeStyle = "#ec78ad";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

function render(guideProgress = 0) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!completed) drawCircleGuide();
  drawCommittedEdges(currentMode === "watch" ? "#27343b" : "#4ca9d2");

  if (!completed) {
    if (currentMode === "watch") drawWatchProgress();
    if (currentMode === "trace") drawMovingGuide(guideProgress);
    drawLiveInk();

    let activeDots = [];
    if (currentMode === "trace") {
      const segment = guidedSegment();
      if (segment) activeDots = [segment.from, segment.to];
    } else if (currentMode === "try" && currentDot !== null) {
      activeDots = [currentDot, ...validUnusedNeighbors(currentDot)];
    }
    drawDots(activeDots);
  }
}

function beginDrawing(event) {
  if (currentMode === "watch" || completed) return;
  const position = canvasPoint(event);
  let start = null;

  if (currentMode === "trace") {
    const segment = guidedSegment();
    if (!segment) return;
    start = nearestDot(position, [segment.from]);
  } else {
    const candidates = currentDot === null ? points.map((_point, index) => index) : [currentDot];
    start = nearestDot(position, candidates);
    if (start !== null && validUnusedNeighbors(start).length === 0) start = null;
  }

  if (start === null) {
    instruction.textContent = currentMode === "trace"
      ? "ひかっている はじめの てんから かいてね。"
      : "てんの うえから かきはじめてね。";
    return;
  }

  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  drawing = { from: start, path: [position], pointerId: event.pointerId };
  if (currentMode === "try" && currentDot === null) currentDot = start;
  render();
}

function continueDrawing(event) {
  if (!drawing || drawing.pointerId !== event.pointerId) return;
  event.preventDefault();
  const position = canvasPoint(event);
  drawing.path.push(position);

  const targets = currentMode === "trace"
    ? [guidedSegment().to]
    : validUnusedNeighbors(drawing.from);
  const reached = nearestDot(position, targets);

  if (reached !== null) {
    finishSegment(drawing.from, reached);
    drawing = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    return;
  }
  render();
}

function endDrawing(event) {
  if (!drawing || drawing.pointerId !== event.pointerId) return;
  const position = canvasPoint(event);
  const segment = currentMode === "trace" ? guidedSegment() : null;
  const targets = currentMode === "trace"
    ? (segment ? [segment.to] : [])
    : validUnusedNeighbors(drawing.from);
  const reached = nearestDot(position, targets);

  if (reached !== null) {
    const from = drawing.from;
    drawing = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    finishSegment(from, reached);
    return;
  }

  drawing = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  instruction.textContent = "つぎの てんまで、ゆびを はなさずに すすんでね。";
  render();
}

function finishSegment(from, to) {
  committedEdges.add(edgeKey(from, to));
  currentDot = to;

  if (currentMode === "trace") advanceGuidedSegment();

  if (committedEdges.size >= allEdges().length) {
    finishStar();
    return;
  }

  if (currentMode === "try" && validUnusedNeighbors(currentDot).length === 0) {
    currentDot = null;
    instruction.textContent = currentStar === 6
      ? "もうひとつの さんかくも かいてみよう。"
      : MODE_TEXT.try.instruction;
  } else {
    instruction.textContent = currentMode === "trace"
      ? MODE_TEXT.trace.instruction
      : "そのまま つぎの てんへ つないでね。";
  }
  render();
}

function advanceGuidedSegment() {
  const strokes = STAR_CONFIG[currentStar].strokes;
  guidedSegmentIndex += 1;
  if (guidedSegmentIndex >= strokes[guidedStrokeIndex].length - 1) {
    guidedStrokeIndex += 1;
    guidedSegmentIndex = 0;
    if (guidedStrokeIndex < strokes.length) {
      instruction.textContent = "つぎの ひかる てんから、もういちど かいてね。";
    }
  }
  animationStartedAt = performance.now();
}

function finishStar() {
  completed = true;
  cancelAnimationFrame(animationFrame);
  animationFrame = null;
  saveClearedStar(currentStar);
  instruction.textContent = "できた！じぶんで ほしを かけたね。";
  render();
  celebration.hidden = false;
  window.setTimeout(() => {
    celebration.hidden = true;
  }, 1800);
}

document.querySelectorAll("[data-star]").forEach((button) => {
  button.addEventListener("click", () => selectStar(button.dataset.star));
});

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => startMode(button.dataset.mode));
});

document.getElementById("modeBackButton").addEventListener("click", () => {
  showPage("menu");
  updateClearBadges();
});

document.getElementById("practiceBackButton").addEventListener("click", () => {
  cancelAnimationFrame(animationFrame);
  animationFrame = null;
  showPage("mode");
});

replayButton.addEventListener("click", resetPractice);
resetButton.addEventListener("click", resetPractice);

canvas.addEventListener("pointerdown", beginDrawing);
canvas.addEventListener("pointermove", continueDrawing);
canvas.addEventListener("pointerup", endDrawing);
canvas.addEventListener("pointercancel", endDrawing);

updateClearBadges();

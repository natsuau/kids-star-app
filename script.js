const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const canvas = $("#starCanvas");
const ctx = canvas.getContext("2d");
const freeCanvas = $("#freeCanvas");
const freeCtx = freeCanvas.getContext("2d");

const pages = {
  menu: $("#menuPage"),
  mode: $("#modePage"),
  practice: $("#practicePage"),
  draw: $("#drawPage"),
  gallery: $("#galleryPage")
};

const ui = {
  title: $("#selectedStarTitle"),
  practiceTitle: $("#practiceTitle"),
  instruction: $("#instruction"),
  modeLabel: $("#modeLabel"),
  celebration: $("#clearCelebration"),
  replay: $("#replayButton"),
  undo: $("#undoButton"),
  reset: $("#resetButton"),
  speed: $("#speedControls"),
  secret: $("#secretStarButton"),
  drawInstruction: $("#drawInstruction"),
  drawUndo: $("#drawUndoButton"),
  drawClear: $("#drawClearButton"),
  drawSave: $("#drawSaveButton"),
  galleryButton: $("#galleryButton"),
  galleryGrid: $("#galleryGrid"),
  galleryStatus: $("#galleryStatus"),
  replaceDialog: $("#replaceDialog"),
  replaceGrid: $("#replaceGrid"),
  viewerDialog: $("#viewerDialog"),
  viewerImage: $("#viewerImage")
};

const STARS = {
  5: { step: 2, label: "5芒星" },
  7: { step: 3, label: "7芒星" },
  8: { step: 3, label: "8芒星" },
  10: { step: 3, label: "10芒星" },
  12: { step: 5, label: "12芒星" },
  16: { step: 7, label: "ひみつの16芒星" }
};
const MODES = {
  watch: ["書き方を見る", "くろい せんが うごくよ。じゅんばんを よく みてね。"],
  trace: ["なぞって書く", "うすい おてほんの せんを、ひかる てんから なぞろう。"],
  try: ["自分で一筆書き", "どの てんからでも いいよ。どちら向きでも かけるよ！"]
};
const CLEAR_STORE = "kids-star-app-cleared-v2";
const ART_STORE = "kids-star-app-artworks-v1";
const CENTER = { x: 300, y: 300 };
const RADIUS = 218;
const DOT_RADIUS = 16;
const START_RADIUS = 43;
const SNAP_RADIUS = 24;

let star = 5;
let mode = "watch";
let points = [];
let sequence = [];
let candidateSequences = [];
let edges = [];
let liveStroke = null;
let edgeIndex = 0;
let animationFrame = null;
let speed = "normal";
let complete = false;

let freeStrokes = [];
let freeStroke = null;
let pendingArtwork = null;

function showPage(name) {
  Object.entries(pages).forEach(([key, value]) => { value.hidden = key !== name; });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}

function clearedStars() {
  return new Set(readJson(CLEAR_STORE, []).map(String));
}

function saveClear() {
  const saved = clearedStars();
  saved.add(String(star));
  localStorage.setItem(CLEAR_STORE, JSON.stringify([...saved]));
  refreshProgress();
}

function refreshProgress() {
  const saved = clearedStars();
  $$('[data-clear-for]').forEach(badge => { badge.hidden = !saved.has(badge.dataset.clearFor); });
  const unlocked = saved.has("12");
  ui.secret.disabled = !unlocked;
  ui.secret.classList.toggle("locked", !unlocked);
  ui.secret.querySelector(".lock-mark").textContent = unlocked ? "✨" : "🔒";
  drawPreviews();
}

function makeSequence(count, start = 0, direction = 1) {
  const result = [start];
  const step = STARS[count].step * direction;
  let current = start;
  for (let i = 0; i < count; i += 1) {
    current = (current + step + count) % count;
    result.push(current);
  }
  return result;
}

function makePoints(count, radius = RADIUS, center = CENTER) {
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

function drawPreviews() {
  $$(".star-preview").forEach(preview => {
    const count = Number(preview.dataset.preview);
    const previewPoints = makePoints(count, 58, { x: 75, y: 75 });
    const order = makeSequence(count);
    const previewCtx = preview.getContext("2d");
    const locked = count === 16 && !clearedStars().has("12");
    previewCtx.clearRect(0, 0, 150, 150);
    previewCtx.beginPath();
    previewCtx.moveTo(previewPoints[order[0]].x, previewPoints[order[0]].y);
    order.slice(1).forEach(index => previewCtx.lineTo(previewPoints[index].x, previewPoints[index].y));
    previewCtx.strokeStyle = locked ? "#8e8e8e" : "#f0ad20";
    previewCtx.lineWidth = 6;
    previewCtx.lineJoin = previewCtx.lineCap = "round";
    previewCtx.stroke();
  });
}

function selectStar(count) {
  if (count === 16 && ui.secret.disabled) return;
  star = count;
  ui.title.textContent = STARS[count].label;
  showPage("mode");
}

function startMode(nextMode) {
  mode = nextMode;
  ui.practiceTitle.textContent = STARS[star].label;
  ui.modeLabel.textContent = MODES[nextMode][0];
  ui.instruction.textContent = MODES[nextMode][1];
  ui.speed.hidden = nextMode !== "watch";
  ui.replay.hidden = nextMode !== "watch";
  ui.undo.hidden = nextMode === "watch";
  ui.reset.hidden = nextMode === "watch";
  showPage("practice");
  restartPractice();
}

function restartPractice() {
  cancelAnimationFrame(animationFrame);
  edges = [];
  liveStroke = null;
  edgeIndex = 0;
  complete = false;
  candidateSequences = [];
  ui.celebration.hidden = true;
  points = makePoints(star);
  sequence = makeSequence(star);
  renderStar();
  if (mode === "watch") animateGuide();
}

function animateGuide() {
  edges = [];
  let segment = 0;
  let startedAt = performance.now();
  const tick = now => {
    const duration = speed === "slow" ? 900 : 480;
    const progress = Math.min((now - startedAt) / duration, 1);
    renderStar({ segment, progress });
    if (progress === 1) {
      edges.push([sequence[segment], sequence[segment + 1]]);
      segment += 1;
      startedAt = now;
      if (segment >= sequence.length - 1) {
        renderStar();
        ui.instruction.textContent = "さいごまで みられたね！";
        return;
      }
    }
    animationFrame = requestAnimationFrame(tick);
  };
  animationFrame = requestAnimationFrame(tick);
}

function canvasPoint(event, targetCanvas = canvas) {
  const rect = targetCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * targetCanvas.width / rect.width,
    y: (event.clientY - rect.top) * targetCanvas.height / rect.height
  };
}

function nearest(point, indexes, radius) {
  let result = null;
  let best = radius;
  indexes.forEach(index => {
    const distance = Math.hypot(point.x - points[index].x, point.y - points[index].y);
    if (distance <= best) { best = distance; result = index; }
  });
  return result;
}

function drawGuideShape() {
  if (mode !== "trace") return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[sequence[0]].x, points[sequence[0]].y);
  sequence.slice(1).forEach(index => ctx.lineTo(points[index].x, points[index].y));
  ctx.strokeStyle = "rgba(38,52,59,.26)";
  ctx.lineWidth = 8;
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

function drawEdges() {
  ctx.save();
  ctx.strokeStyle = "#4ca9d2";
  ctx.lineWidth = 11;
  ctx.lineCap = ctx.lineJoin = "round";
  edges.forEach(([from, to]) => {
    ctx.beginPath();
    ctx.moveTo(points[from].x, points[from].y);
    ctx.lineTo(points[to].x, points[to].y);
    ctx.stroke();
  });
  ctx.restore();
}

function renderStar(animation = null) {
  ctx.clearRect(0, 0, 600, 600);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 600, 600);
  ctx.save();
  ctx.beginPath();
  ctx.arc(300, 300, RADIUS, 0, Math.PI * 2);
  ctx.setLineDash([8, 11]);
  ctx.strokeStyle = "rgba(81,139,158,.2)";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
  drawGuideShape();
  drawEdges();

  if (animation) {
    const from = points[sequence[animation.segment]];
    const to = points[sequence[animation.segment + 1]];
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(from.x + (to.x - from.x) * animation.progress, from.y + (to.y - from.y) * animation.progress);
    ctx.strokeStyle = "#26343b";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  if (liveStroke) {
    ctx.beginPath();
    ctx.moveTo(points[liveStroke.from].x, points[liveStroke.from].y);
    liveStroke.path.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = "#ec78ad";
    ctx.lineWidth = 9;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.stroke();
  }

  if (!complete) {
    const active = mode === "trace" ? [sequence[edgeIndex], sequence[edgeIndex + 1]] : [];
    points.forEach((point, index) => {
      const on = active.includes(index);
      ctx.beginPath();
      ctx.arc(point.x, point.y, on ? DOT_RADIUS + 5 : DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = on ? "#ffcc3f" : "#fff";
      ctx.strokeStyle = on ? "#e99b22" : "#5bb4c9";
      ctx.lineWidth = on ? 5 : 4;
      ctx.fill();
      ctx.stroke();
    });
  }
}

function startStarStroke(event) {
  if (mode === "watch" || complete) return;
  const position = canvasPoint(event);
  let start = null;

  if (mode === "trace") {
    start = nearest(position, [sequence[edgeIndex]], START_RADIUS);
  } else if (edgeIndex === 0) {
    start = nearest(position, points.map((_, index) => index), START_RADIUS);
    if (start !== null) {
      candidateSequences = [makeSequence(star, start, 1), makeSequence(star, start, -1)];
      sequence = candidateSequences[0];
    }
  } else {
    start = nearest(position, [sequence[edgeIndex]], START_RADIUS);
  }

  if (start === null) {
    ui.instruction.textContent = mode === "try" ? "すきな てんの まんなかから はじめてね。" : "ひかっている てんから はじめてね。";
    return;
  }
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  liveStroke = { from: start, path: [points[start]], pointer: event.pointerId };
  renderStar();
}

function nextTargets() {
  if (mode !== "try" || edgeIndex > 0 || candidateSequences.length < 2) return [sequence[edgeIndex + 1]];
  return [...new Set(candidateSequences.map(candidate => candidate[1]))];
}

function moveStarStroke(event) {
  if (!liveStroke || liveStroke.pointer !== event.pointerId) return;
  event.preventDefault();
  const position = canvasPoint(event);
  liveStroke.path.push(position);
  const targets = nextTargets();
  const reached = nearest(position, targets, SNAP_RADIUS);
  if (reached === null) {
    renderStar();
    return;
  }

  if (mode === "try" && edgeIndex === 0 && candidateSequences.length === 2) {
    sequence = candidateSequences.find(candidate => candidate[1] === reached) || candidateSequences[0];
    candidateSequences = [sequence];
  }
  edges.push([sequence[edgeIndex], reached]);
  edgeIndex += 1;
  liveStroke.from = reached;
  liveStroke.path = [points[reached]];
  if (edgeIndex === sequence.length - 1) finishStar();
  else renderStar();
}

function endStarStroke(event) {
  if (!liveStroke || liveStroke.pointer !== event.pointerId) return;
  liveStroke = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (edgeIndex < sequence.length - 1) {
    if (mode === "try") {
      ui.instruction.textContent = "ゆびを はなさず、さいごまで かいてみよう！";
      edges = [];
      edgeIndex = 0;
      candidateSequences = [];
      sequence = makeSequence(star);
    } else {
      ui.instruction.textContent = "せんは のこっているよ。ひかる てんから つづけよう。";
    }
  }
  renderStar();
}

function finishStar() {
  const pointer = liveStroke?.pointer;
  liveStroke = null;
  if (pointer !== undefined && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  complete = true;
  renderStar();
  if (mode === "try") {
    saveClear();
    ui.celebration.hidden = false;
    ui.instruction.textContent = "すきな てんから きれいに かけたね！";
  } else {
    ui.instruction.textContent = "なぞった せんが きれいに のこったね！";
  }
}

function artworks() {
  const list = readJson(ART_STORE, []);
  return Array.isArray(list) ? list.filter(item => typeof item === "string").slice(0, 3) : [];
}

function saveArtworks(list) {
  try {
    localStorage.setItem(ART_STORE, JSON.stringify(list.slice(0, 3)));
    updateArtworkCount();
    renderGallery();
    return true;
  } catch {
    ui.drawInstruction.textContent = "ほぞんできなかったよ。ブラウザの空きようりょうを たしかめてね。";
    return false;
  }
}

function updateArtworkCount() {
  ui.galleryButton.textContent = `🖼️ さくひん ${artworks().length}/3`;
}

function drawFreeStroke(targetCtx, stroke) {
  if (!stroke.length) return;
  targetCtx.save();
  targetCtx.strokeStyle = targetCtx.fillStyle = "#ec78ad";
  targetCtx.lineWidth = 10;
  targetCtx.lineCap = targetCtx.lineJoin = "round";
  if (stroke.length === 1) {
    targetCtx.beginPath();
    targetCtx.arc(stroke[0].x, stroke[0].y, 5, 0, Math.PI * 2);
    targetCtx.fill();
  } else {
    targetCtx.beginPath();
    targetCtx.moveTo(stroke[0].x, stroke[0].y);
    stroke.slice(1).forEach(point => targetCtx.lineTo(point.x, point.y));
    targetCtx.stroke();
  }
  targetCtx.restore();
}

function renderFree(targetCtx = freeCtx) {
  targetCtx.clearRect(0, 0, 600, 600);
  targetCtx.fillStyle = "#fff";
  targetCtx.fillRect(0, 0, 600, 600);
  freeStrokes.forEach(stroke => drawFreeStroke(targetCtx, stroke));
  if (freeStroke) drawFreeStroke(targetCtx, freeStroke.points);
  ui.drawUndo.disabled = !freeStrokes.length;
  ui.drawClear.disabled = !freeStrokes.length && !freeStroke;
  ui.drawSave.disabled = !freeStrokes.length;
}

function startFreeStroke(event) {
  event.preventDefault();
  freeCanvas.setPointerCapture(event.pointerId);
  freeStroke = { pointer: event.pointerId, points: [canvasPoint(event, freeCanvas)] };
  renderFree();
}
function moveFreeStroke(event) {
  if (!freeStroke || freeStroke.pointer !== event.pointerId) return;
  event.preventDefault();
  freeStroke.points.push(canvasPoint(event, freeCanvas));
  renderFree();
}
function endFreeStroke(event) {
  if (!freeStroke || freeStroke.pointer !== event.pointerId) return;
  freeStrokes.push(freeStroke.points);
  freeStroke = null;
  if (freeCanvas.hasPointerCapture(event.pointerId)) freeCanvas.releasePointerCapture(event.pointerId);
  ui.drawInstruction.textContent = "いいね！ つづけて かいても、ほぞんしても いいよ。";
  renderFree();
}

function exportArtwork() {
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = exportCanvas.height = 600;
  renderFree(exportCanvas.getContext("2d"));
  try {
    const image = exportCanvas.toDataURL("image/webp", 0.86);
    if (image.startsWith("data:image/webp")) return image;
  } catch {}
  return exportCanvas.toDataURL("image/png");
}

function saveArtwork() {
  if (!freeStrokes.length) return;
  const image = exportArtwork();
  const list = artworks();
  if (list.length < 3) {
    list.push(image);
    if (saveArtworks(list)) ui.drawInstruction.textContent = `さくひんを ほぞんしたよ！ ${list.length}/3`;
  } else {
    pendingArtwork = image;
    renderReplaceChoices();
    openDialog(ui.replaceDialog);
  }
}

function renderReplaceChoices() {
  ui.replaceGrid.replaceChildren();
  artworks().forEach((image, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "replace-choice";
    button.dataset.replaceIndex = String(index);
    const img = document.createElement("img");
    img.src = image;
    img.alt = `保存した作品 ${index + 1}`;
    const label = document.createElement("span");
    label.textContent = `${index + 1}まいめと いれかえる`;
    button.append(img, label);
    ui.replaceGrid.append(button);
  });
}

function renderGallery() {
  const list = artworks();
  ui.galleryGrid.replaceChildren();
  ui.galleryStatus.textContent = list.length ? `${list.length}まいの さくひんが あるよ。` : "まだ さくひんが ないよ。";
  for (let index = 0; index < 3; index += 1) {
    const card = document.createElement("article");
    card.className = "gallery-card";
    card.innerHTML = `<h3>${index + 1}まいめ</h3>`;
    if (list[index]) {
      const view = document.createElement("button");
      view.type = "button";
      view.className = "artwork-view";
      view.dataset.viewIndex = String(index);
      const img = document.createElement("img");
      img.src = list[index];
      img.alt = `保存した作品 ${index + 1}`;
      view.append(img);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-artwork";
      remove.dataset.deleteIndex = String(index);
      remove.textContent = "このさくひんを けす";
      card.append(view, remove);
    } else {
      const empty = document.createElement("div");
      empty.className = "empty-artwork";
      empty.innerHTML = '<span aria-hidden="true">☆</span><p>ここに ほぞんできるよ</p>';
      card.append(empty);
    }
    ui.galleryGrid.append(card);
  }
}

canvas.addEventListener("pointerdown", startStarStroke);
canvas.addEventListener("pointermove", moveStarStroke);
canvas.addEventListener("pointerup", endStarStroke);
canvas.addEventListener("pointercancel", endStarStroke);
freeCanvas.addEventListener("pointerdown", startFreeStroke);
freeCanvas.addEventListener("pointermove", moveFreeStroke);
freeCanvas.addEventListener("pointerup", endFreeStroke);
freeCanvas.addEventListener("pointercancel", endFreeStroke);

ui.undo.addEventListener("click", () => {
  if (!edges.length) return;
  edges.pop();
  edgeIndex = Math.max(0, edgeIndex - 1);
  complete = false;
  ui.celebration.hidden = true;
  renderStar();
});
ui.reset.addEventListener("click", restartPractice);
ui.replay.addEventListener("click", restartPractice);
$$('[data-speed]').forEach(button => button.addEventListener("click", () => {
  speed = button.dataset.speed;
  $$('[data-speed]').forEach(item => item.classList.toggle("selected", item === button));
  restartPractice();
}));
$$('[data-star]').forEach(button => button.addEventListener("click", () => selectStar(Number(button.dataset.star))));
$$('[data-mode]').forEach(button => button.addEventListener("click", () => startMode(button.dataset.mode)));

$("#modeBackButton").addEventListener("click", () => showPage("menu"));
$("#practiceBackButton").addEventListener("click", () => { cancelAnimationFrame(animationFrame); showPage("mode"); });
$("#freeDrawButton").addEventListener("click", () => { showPage("draw"); renderFree(); updateArtworkCount(); });
$("#drawBackButton").addEventListener("click", () => showPage("menu"));
$("#galleryBackButton").addEventListener("click", () => showPage("draw"));
$("#mathButton").addEventListener("click", () => openDialog($("#mathDialog")));
$$("[data-close-dialog]").forEach(button => button.addEventListener("click", () => closeDialog(document.getElementById(button.dataset.closeDialog))));
$$("dialog").forEach(dialog => dialog.addEventListener("click", event => { if (event.target === dialog) closeDialog(dialog); }));

ui.drawUndo.addEventListener("click", () => { freeStrokes.pop(); renderFree(); });
ui.drawClear.addEventListener("click", () => {
  if (window.confirm("ぜんぶ けしても いい？")) { freeStrokes = []; freeStroke = null; renderFree(); }
});
ui.drawSave.addEventListener("click", saveArtwork);
ui.galleryButton.addEventListener("click", () => { renderGallery(); showPage("gallery"); });
ui.replaceDialog.addEventListener("close", () => { pendingArtwork = null; });
ui.replaceGrid.addEventListener("click", event => {
  const button = event.target.closest("[data-replace-index]");
  if (!button || !pendingArtwork) return;
  const list = artworks();
  list[Number(button.dataset.replaceIndex)] = pendingArtwork;
  saveArtworks(list);
  pendingArtwork = null;
  closeDialog(ui.replaceDialog);
});
ui.galleryGrid.addEventListener("click", event => {
  const view = event.target.closest("[data-view-index]");
  if (view) {
    ui.viewerImage.src = artworks()[Number(view.dataset.viewIndex)];
    openDialog(ui.viewerDialog);
    return;
  }
  const remove = event.target.closest("[data-delete-index]");
  if (remove && window.confirm("この さくひんを けしても いい？")) {
    const list = artworks();
    list.splice(Number(remove.dataset.deleteIndex), 1);
    saveArtworks(list);
  }
});

refreshProgress();
renderStar();
renderFree();
renderGallery();
updateArtworkCount();

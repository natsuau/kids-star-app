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

const title = $("#selectedStarTitle");
const practiceTitle = $("#practiceTitle");
const instruction = $("#instruction");
const modeLabel = $("#modeLabel");
const celebration = $("#clearCelebration");
const replay = $("#replayButton");
const undo = $("#undoButton");
const reset = $("#resetButton");
const speedControls = $("#speedControls");
const secret = $("#secretStarButton");
const drawInstruction = $("#drawInstruction");
const drawUndoButton = $("#drawUndoButton");
const drawClearButton = $("#drawClearButton");
const drawSaveButton = $("#drawSaveButton");
const galleryButton = $("#galleryButton");
const galleryGrid = $("#galleryGrid");
const galleryStatus = $("#galleryStatus");
const replaceDialog = $("#replaceDialog");
const replaceGrid = $("#replaceGrid");
const viewerDialog = $("#viewerDialog");
const viewerImage = $("#viewerImage");

const CFG = { 5: { step: 2 }, 7: { step: 3 }, 8: { step: 3 }, 10: { step: 3 }, 12: { step: 5 }, 16: { step: 7 } };
const LABEL = { 5: "5芒星", 7: "7芒星", 8: "8芒星", 10: "10芒星", 12: "12芒星", 16: "ひみつの16芒星" };
const CLEAR_STORE = "kids-star-app-cleared-v2";
const ART_STORE = "kids-star-app-artworks-v1";
const C = { x: 300, y: 300 };
const R = 218;
const DOT = 16;
const HIT = 43;

let star = 5;
let mode = "watch";
let pts = [];
let sequence = [];
let edges = [];
let wrongEdges = [];
let drawing = null;
let index = 0;
let raf = null;
let speed = "normal";
let complete = false;
let startDot = null;

let freeStrokes = [];
let freeDrawing = null;
let pendingArtwork = null;

const modes = {
  watch: ["書き方を見る", "くろい せんが うごくよ。じゅんばんを よく みてね。"],
  trace: ["なぞって書く", "うすい おてほんの せんを、ひかる てんから なぞろう。"],
  try: ["自分で一筆書き", "どの てんからでも いいよ。ゆびを はなさず さいごまで！"]
};

function page(name) {
  Object.entries(pages).forEach(([key, value]) => {
    value.hidden = key !== name;
  });
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

function cleared() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLEAR_STORE) || "[]").map(String));
  } catch {
    return new Set();
  }
}

function saveClear() {
  const saved = cleared();
  saved.add(String(star));
  localStorage.setItem(CLEAR_STORE, JSON.stringify([...saved]));
  refreshProgress();
}

function refreshProgress() {
  const saved = cleared();
  $$('[data-clear-for]').forEach(badge => {
    badge.hidden = !saved.has(badge.dataset.clearFor);
  });
  const open = saved.has("12");
  secret.disabled = !open;
  secret.classList.toggle("locked", !open);
  secret.querySelector(".lock-mark").textContent = open ? "✨" : "🔒";
  drawPreviews();
}

function makeSequence(n, start = 0) {
  const result = [start];
  const step = CFG[n].step;
  let point = start;
  for (let i = 0; i < n; i += 1) {
    point = (point + step) % n;
    result.push(point);
  }
  return result;
}

function makePoints(n, radius = R, center = C) {
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / n;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    };
  });
}

function drawPreviews() {
  $$(".star-preview").forEach(preview => {
    const n = Number(preview.dataset.preview);
    const points = makePoints(n, 58, { x: 75, y: 75 });
    const previewSequence = makeSequence(n);
    const previewCtx = preview.getContext("2d");
    const locked = n === 16 && !cleared().has("12");
    previewCtx.clearRect(0, 0, 150, 150);
    previewCtx.beginPath();
    previewCtx.moveTo(points[previewSequence[0]].x, points[previewSequence[0]].y);
    previewSequence.slice(1).forEach(i => previewCtx.lineTo(points[i].x, points[i].y));
    previewCtx.strokeStyle = locked ? "#8e8e8e" : "#f0ad20";
    previewCtx.lineWidth = 6;
    previewCtx.lineJoin = "round";
    previewCtx.lineCap = "round";
    previewCtx.stroke();
  });
}

function selectStar(n) {
  if (n === 16 && secret.disabled) return;
  star = n;
  title.textContent = LABEL[n];
  page("mode");
}

function startMode(nextMode) {
  mode = nextMode;
  practiceTitle.textContent = LABEL[star];
  modeLabel.textContent = modes[nextMode][0];
  instruction.textContent = modes[nextMode][1];
  speedControls.hidden = nextMode !== "watch";
  replay.hidden = nextMode !== "watch";
  undo.hidden = nextMode === "watch";
  reset.hidden = nextMode === "watch";
  page("practice");
  restart();
}

function restart() {
  cancelAnimationFrame(raf);
  edges = [];
  wrongEdges = [];
  drawing = null;
  index = 0;
  startDot = null;
  complete = false;
  celebration.hidden = true;
  pts = makePoints(star);
  sequence = makeSequence(star);
  render();
  if (mode === "watch") animateGuide();
}

function animateGuide() {
  cancelAnimationFrame(raf);
  edges = [];
  let segment = 0;
  let startedAt = performance.now();

  const tick = now => {
    const duration = speed === "slow" ? 900 : 480;
    const progress = Math.min((now - startedAt) / duration, 1);
    render({ segment, progress });
    if (progress === 1) {
      edges.push([sequence[segment], sequence[segment + 1]]);
      segment += 1;
      startedAt = now;
      if (segment >= sequence.length - 1) {
        render();
        instruction.textContent = "さいごまで みられたね！";
        return;
      }
    }
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
}

function pos(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * 600 / rect.width,
    y: (event.clientY - rect.top) * 600 / rect.height
  };
}

function near(point, candidates) {
  let hit = null;
  let best = HIT;
  candidates.forEach(i => {
    const distance = Math.hypot(point.x - pts[i].x, point.y - pts[i].y);
    if (distance <= best) {
      best = distance;
      hit = i;
    }
  });
  return hit;
}

function drawGuideShape() {
  if (mode !== "trace") return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[sequence[0]].x, pts[sequence[0]].y);
  sequence.slice(1).forEach(i => ctx.lineTo(pts[i].x, pts[i].y));
  ctx.strokeStyle = "rgba(38,52,59,.26)";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

function drawEdges(list, color, width) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  list.forEach(([from, to]) => {
    ctx.beginPath();
    ctx.moveTo(pts[from].x, pts[from].y);
    ctx.lineTo(pts[to].x, pts[to].y);
    ctx.stroke();
  });
  ctx.restore();
}

function render(animation = null) {
  ctx.clearRect(0, 0, 600, 600);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 600, 600);

  ctx.save();
  ctx.beginPath();
  ctx.arc(300, 300, R, 0, Math.PI * 2);
  ctx.setLineDash([8, 11]);
  ctx.strokeStyle = "rgba(81,139,158,.2)";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();

  drawGuideShape();
  drawEdges(edges, "#4ca9d2", 11);
  drawEdges(wrongEdges, "#e86d6d", 9);

  if (animation) {
    const from = pts[sequence[animation.segment]];
    const to = pts[sequence[animation.segment + 1]];
    const x = from.x + (to.x - from.x) * animation.progress;
    const y = from.y + (to.y - from.y) * animation.progress;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#26343b";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  if (drawing) {
    ctx.beginPath();
    ctx.moveTo(pts[drawing.from].x, pts[drawing.from].y);
    drawing.path.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = "#ec78ad";
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  if (!complete) {
    const active = mode === "trace" ? [sequence[index], sequence[index + 1]].filter(Number.isInteger) : [];
    pts.forEach((point, i) => {
      const on = active.includes(i);
      ctx.beginPath();
      ctx.arc(point.x, point.y, on ? DOT + 5 : DOT, 0, Math.PI * 2);
      ctx.fillStyle = on ? "#ffcc3f" : "#fff";
      ctx.strokeStyle = on ? "#e99b22" : "#5bb4c9";
      ctx.lineWidth = on ? 5 : 4;
      if (on) {
        ctx.shadowColor = "rgba(255,187,48,.7)";
        ctx.shadowBlur = 16;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
  }
}

function down(event) {
  if (mode === "watch" || complete) return;
  const point = pos(event);
  let hit = null;

  if (mode === "trace") {
    const needed = sequence[index];
    hit = near(point, [needed]);
    if (hit === null) {
      instruction.textContent = index ? "ひかっている てんから つづけてね。" : "ひかっている さいしょの てんから はじめてね。";
      return;
    }
  } else if (index === 0) {
    hit = near(point, pts.map((_, i) => i));
    if (hit === null) {
      instruction.textContent = "すきな てんの うえから はじめてね。";
      return;
    }
    startDot = hit;
    sequence = makeSequence(star, startDot);
  } else {
    hit = near(point, [sequence[index]]);
    if (hit === null) {
      instruction.textContent = "いまの てんから つづけてね。";
      return;
    }
  }

  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  drawing = { from: hit, path: [pts[hit]], pointer: event.pointerId, lastWrong: null };
  render();
}

function move(event) {
  if (!drawing || drawing.pointer !== event.pointerId) return;
  event.preventDefault();
  const point = pos(event);
  drawing.path.push(point);
  const target = sequence[index + 1];

  if (Number.isInteger(target) && near(point, [target]) !== null) {
    edges.push([sequence[index], target]);
    index += 1;
    drawing.from = target;
    drawing.path = [pts[target]];
    drawing.lastWrong = null;
    if (index === sequence.length - 1) {
      finish(mode === "try");
      return;
    }
    render();
    return;
  }

  const others = pts.map((_, i) => i).filter(i => i !== drawing.from && i !== target);
  const bad = near(point, others);
  if (bad !== null && drawing.lastWrong !== bad) {
    wrongEdges.push([drawing.from, bad]);
    drawing.lastWrong = bad;
    instruction.textContent = "その せんだけ あかくしたよ。『ひとつもどる』で けせるよ。";
  }
  render();
}

function up(event) {
  if (!drawing || drawing.pointer !== event.pointerId) return;
  drawing = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (index < sequence.length - 1) {
    if (mode === "try") {
      instruction.textContent = "ゆびを はなさず、さいごまで かいてみよう！";
      edges = [];
      wrongEdges = [];
      index = 0;
      startDot = null;
      sequence = makeSequence(star);
    } else {
      instruction.textContent = "せんは のこっているよ。ひかる てんから つづけよう。";
    }
  }
  render();
}

function finish(self) {
  const pointerId = drawing ? drawing.pointer : null;
  drawing = null;
  if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  complete = true;
  render();
  if (mode === "try" && self && wrongEdges.length === 0) {
    saveClear();
    celebration.hidden = false;
    instruction.textContent = "じぶんの ちからで できたね！";
  } else {
    instruction.textContent = "なぞった せんが きれいに のこったね！";
  }
}

function artworkList() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ART_STORE) || "[]");
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string").slice(0, 3) : [];
  } catch {
    return [];
  }
}

function storeArtworks(list) {
  try {
    localStorage.setItem(ART_STORE, JSON.stringify(list.slice(0, 3)));
    updateArtworkCount();
    renderGallery();
    return true;
  } catch {
    drawInstruction.textContent = "ほぞんできなかったよ。ブラウザの空きようりょうを たしかめてね。";
    return false;
  }
}

function updateArtworkCount() {
  const count = artworkList().length;
  galleryButton.textContent = `🖼️ さくひん ${count}/3`;
}

function freePos(event) {
  const rect = freeCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * 600 / rect.width,
    y: (event.clientY - rect.top) * 600 / rect.height
  };
}

function drawStroke(targetCtx, points) {
  if (!points.length) return;
  targetCtx.save();
  targetCtx.strokeStyle = "#ec78ad";
  targetCtx.fillStyle = "#ec78ad";
  targetCtx.lineWidth = 10;
  targetCtx.lineCap = "round";
  targetCtx.lineJoin = "round";
  if (points.length === 1) {
    targetCtx.beginPath();
    targetCtx.arc(points[0].x, points[0].y, 5, 0, Math.PI * 2);
    targetCtx.fill();
  } else {
    targetCtx.beginPath();
    targetCtx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(point => targetCtx.lineTo(point.x, point.y));
    targetCtx.stroke();
  }
  targetCtx.restore();
}

function renderFree(targetCtx = freeCtx) {
  targetCtx.clearRect(0, 0, 600, 600);
  targetCtx.fillStyle = "#fff";
  targetCtx.fillRect(0, 0, 600, 600);
  freeStrokes.forEach(stroke => drawStroke(targetCtx, stroke));
  if (freeDrawing) drawStroke(targetCtx, freeDrawing.points);
  const hasDrawing = freeStrokes.length > 0 || Boolean(freeDrawing);
  drawUndoButton.disabled = !freeStrokes.length;
  drawClearButton.disabled = !hasDrawing;
  drawSaveButton.disabled = !freeStrokes.length;
}

function freeDown(event) {
  event.preventDefault();
  freeCanvas.setPointerCapture(event.pointerId);
  freeDrawing = { pointer: event.pointerId, points: [freePos(event)] };
  renderFree();
}

function freeMove(event) {
  if (!freeDrawing || freeDrawing.pointer !== event.pointerId) return;
  event.preventDefault();
  freeDrawing.points.push(freePos(event));
  renderFree();
}

function freeUp(event) {
  if (!freeDrawing || freeDrawing.pointer !== event.pointerId) return;
  const stroke = freeDrawing.points;
  freeDrawing = null;
  freeStrokes.push(stroke);
  if (freeCanvas.hasPointerCapture(event.pointerId)) freeCanvas.releasePointerCapture(event.pointerId);
  drawInstruction.textContent = "いいね！ つづけて かいても、ほぞんしても いいよ。";
  renderFree();
}

function exportArtwork() {
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = 600;
  exportCanvas.height = 600;
  const exportCtx = exportCanvas.getContext("2d");
  renderFree(exportCtx);
  try {
    const webp = exportCanvas.toDataURL("image/webp", 0.86);
    if (webp.startsWith("data:image/webp")) return webp;
  } catch {
    // PNG fallback below.
  }
  return exportCanvas.toDataURL("image/png");
}

function renderReplaceChoices() {
  replaceGrid.replaceChildren();
  artworkList().forEach((image, index) => {
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
    replaceGrid.append(button);
  });
}

function saveArtwork() {
  if (!freeStrokes.length) {
    drawInstruction.textContent = "まずは なにか かいてみよう。";
    return;
  }
  const image = exportArtwork();
  const artworks = artworkList();
  if (artworks.length < 3) {
    artworks.push(image);
    if (storeArtworks(artworks)) drawInstruction.textContent = `さくひんを ほぞんしたよ！ ${artworks.length}/3`;
    return;
  }
  pendingArtwork = image;
  renderReplaceChoices();
  openDialog(replaceDialog);
}

function openDrawingPage() {
  page("draw");
  drawInstruction.textContent = freeStrokes.length ? "つづきから かけるよ。" : "ゆびで すきなものを かいてね。";
  renderFree();
  updateArtworkCount();
}

function renderGallery() {
  const artworks = artworkList();
  galleryGrid.replaceChildren();
  galleryStatus.textContent = artworks.length ? `${artworks.length}まいの さくひんが あるよ。タップして大きく見せよう。` : "まだ さくひんが ないよ。おえかきして ほぞんしてね。";

  for (let index = 0; index < 3; index += 1) {
    const card = document.createElement("article");
    card.className = "gallery-card";
    const heading = document.createElement("h3");
    heading.textContent = `${index + 1}まいめ`;
    card.append(heading);

    if (artworks[index]) {
      const viewButton = document.createElement("button");
      viewButton.type = "button";
      viewButton.className = "artwork-view";
      viewButton.dataset.viewIndex = String(index);
      const img = document.createElement("img");
      img.src = artworks[index];
      img.alt = `保存した作品 ${index + 1}`;
      viewButton.append(img);
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-artwork";
      deleteButton.dataset.deleteIndex = String(index);
      deleteButton.textContent = "このさくひんを けす";
      card.append(viewButton, deleteButton);
    } else {
      const empty = document.createElement("div");
      empty.className = "empty-artwork";
      empty.innerHTML = "<span aria-hidden=\"true\">☆</span><p>ここに ほぞんできるよ</p>";
      card.append(empty);
    }
    galleryGrid.append(card);
  }
}

function deleteArtwork(index) {
  const artworks = artworkList();
  if (!artworks[index]) return;
  if (!window.confirm("この さくひんを けしても いい？")) return;
  artworks.splice(index, 1);
  storeArtworks(artworks);
}

canvas.addEventListener("pointerdown", down);
canvas.addEventListener("pointermove", move);
canvas.addEventListener("pointerup", up);
canvas.addEventListener("pointercancel", up);

freeCanvas.addEventListener("pointerdown", freeDown);
freeCanvas.addEventListener("pointermove", freeMove);
freeCanvas.addEventListener("pointerup", freeUp);
freeCanvas.addEventListener("pointercancel", freeUp);

undo.addEventListener("click", () => {
  if (wrongEdges.length) {
    wrongEdges.pop();
    instruction.textContent = "まちがえた せんを ひとつ けしたよ。";
  } else if (edges.length) {
    edges.pop();
    index = Math.max(0, index - 1);
    complete = false;
    celebration.hidden = true;
  }
  render();
});
reset.addEventListener("click", restart);
replay.addEventListener("click", restart);

$$('[data-speed]').forEach(button => button.addEventListener("click", () => {
  speed = button.dataset.speed;
  $$('[data-speed]').forEach(item => item.classList.toggle("selected", item === button));
  restart();
}));

$$('[data-star]').forEach(button => button.addEventListener("click", () => selectStar(Number(button.dataset.star))));
$$('[data-mode]').forEach(button => button.addEventListener("click", () => startMode(button.dataset.mode)));

$("#modeBackButton").addEventListener("click", () => page("menu"));
$("#practiceBackButton").addEventListener("click", () => {
  cancelAnimationFrame(raf);
  page("mode");
});
$("#freeDrawButton").addEventListener("click", openDrawingPage);
$("#drawBackButton").addEventListener("click", () => page("menu"));
$("#galleryBackButton").addEventListener("click", openDrawingPage);
$("#benefitButton").addEventListener("click", () => openDialog($("#benefitDialog")));

$$("[data-close-dialog]").forEach(button => button.addEventListener("click", () => {
  closeDialog(document.getElementById(button.dataset.closeDialog));
}));

$$("dialog").forEach(dialog => dialog.addEventListener("click", event => {
  if (event.target === dialog) closeDialog(dialog);
}));

replaceDialog.addEventListener("close", () => {
  pendingArtwork = null;
});

replaceGrid.addEventListener("click", event => {
  const button = event.target.closest("[data-replace-index]");
  if (!button || !pendingArtwork) return;
  const artworks = artworkList();
  const replaceIndex = Number(button.dataset.replaceIndex);
  artworks[replaceIndex] = pendingArtwork;
  if (storeArtworks(artworks)) drawInstruction.textContent = `${replaceIndex + 1}まいめと いれかえたよ！`;
  pendingArtwork = null;
  closeDialog(replaceDialog);
});

drawUndoButton.addEventListener("click", () => {
  freeStrokes.pop();
  drawInstruction.textContent = freeStrokes.length ? "ひとつ もどしたよ。" : "しろい かみに もどったよ。";
  renderFree();
});

drawClearButton.addEventListener("click", () => {
  if (!freeStrokes.length && !freeDrawing) return;
  if (!window.confirm("ぜんぶ けしても いい？")) return;
  freeStrokes = [];
  freeDrawing = null;
  drawInstruction.textContent = "ぜんぶ けしたよ。もういちど かいてみよう。";
  renderFree();
});

drawSaveButton.addEventListener("click", saveArtwork);
galleryButton.addEventListener("click", () => {
  renderGallery();
  page("gallery");
});

galleryGrid.addEventListener("click", event => {
  const viewButton = event.target.closest("[data-view-index]");
  if (viewButton) {
    const image = artworkList()[Number(viewButton.dataset.viewIndex)];
    if (image) {
      viewerImage.src = image;
      openDialog(viewerDialog);
    }
    return;
  }
  const deleteButton = event.target.closest("[data-delete-index]");
  if (deleteButton) deleteArtwork(Number(deleteButton.dataset.deleteIndex));
});

refreshProgress();
render();
renderFree();
renderGallery();
updateArtworkCount();

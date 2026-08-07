function keepTryProgressAfterLift(event) {
  if (mode !== "try" || !liveStroke || liveStroke.pointer !== event.pointerId) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  liveStroke = null;

  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }

  if (edgeIndex < sequence.length - 1) {
    ui.instruction.textContent = edges.length
      ? "ここまでの せんは のこっているよ。いまの てんから つづけよう！"
      : "すきな てんから もういちど はじめてね。";
  }

  renderStar();
}

canvas.addEventListener("pointerup", keepTryProgressAfterLift, true);
canvas.addEventListener("pointercancel", keepTryProgressAfterLift, true);

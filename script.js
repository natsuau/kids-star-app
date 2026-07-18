const canvas = document.getElementById("starCanvas");
const ctx = canvas.getContext("2d");

let currentStar = 5;

// メニューから星を選択
function openStar(points) {

    currentStar = Number(points);

    document.getElementById("menu").style.display = "none";
    document.getElementById("starPage").style.display = "block";

    document.getElementById("starTitle").textContent =
        `⭐ ${points} Pointed Star`;

    clearCanvas();
}

// メニューへ戻る
function backMenu() {

    document.getElementById("starPage").style.display = "none";
    document.getElementById("menu").style.display = "block";

    clearCanvas();

}

// Startボタン
document.getElementById("startButton").addEventListener("click", () => {

    drawStar(currentStar);

});

// キャンバスを消す
function clearCanvas() {

    ctx.clearRect(0, 0, canvas.width, canvas.height);

}

// 星を描く
function drawStar(points) {

    clearCanvas();

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const radius = 180;

    let step = 2;

    switch(points){

        case 5:
            step = 2;
            break;

        case 7:
            step = 3;
            break;

        case 8:
            step = 3;
            break;

        case 10:
            step = 3;
            break;

    }

    ctx.beginPath();

    for(let i = 0; i <= points; i++){

        const index = (i * step) % points;

        const angle =
            (-90 + index * 360 / points) * Math.PI / 180;

        const x =
            centerX + radius * Math.cos(angle);

        const y =
            centerY + radius * Math.sin(angle);

        if(i === 0){

            ctx.moveTo(x, y);

        }else{

            ctx.lineTo(x, y);

        }

    }

    ctx.closePath();

    ctx.lineWidth = 5;

    ctx.strokeStyle = "#FFD700";

    ctx.shadowColor = "#FFD700";

    ctx.shadowBlur = 15;

    ctx.stroke();

    ctx.shadowBlur = 0;

}

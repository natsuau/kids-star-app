# kids-star-app
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Magic Star v2</title>
<style>
body{font-family:Arial,sans-serif;background:#eef7ff;text-align:center;margin:0;padding:20px}
h1{color:#234}
button{padding:12px 24px;font-size:18px;border:none;border-radius:10px;background:#3b82f6;color:#fff;cursor:pointer}
canvas{display:block;margin:20px auto;background:#fff;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,.15)}
#msg{font-size:24px;font-weight:bold;color:#d18a00;height:32px}
</style>
</head>
<body>
<h1>⭐ Magic Star ⭐</h1>
<button onclick="animateStar()">スタート</button>
<canvas id="c" width="400" height="400"></canvas>
<div id="msg"></div>
<script>
const cvs=document.getElementById('c');
const ctx=cvs.getContext('2d');
const cx=200, cy=200, r=150;
const pts=[];
for(let i=0;i<5;i++){
  const a=(-90+i*72)*Math.PI/180;
  pts.push([cx+r*Math.cos(a), cy+r*Math.sin(a)]);
}
const order=[0,2,4,1,3,0];

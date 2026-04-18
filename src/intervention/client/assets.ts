export const CLIENT_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1a1a1a;color:#e0e0e0;font-family:system-ui,sans-serif;height:100vh;display:flex;flex-direction:column;overflow:hidden}
#toolbar{display:flex;align-items:center;gap:12px;padding:8px 16px;background:#2a2a2a;border-bottom:1px solid #3a3a3a;min-height:48px;flex-shrink:0}
#status{font-weight:600}
#expiry,#latency{font-size:.875rem;color:#aaa;margin-left:auto}
#latency{margin-left:0}
button{padding:6px 16px;border:none;border-radius:4px;font-size:.875rem;cursor:pointer;font-weight:600}
#done-btn{background:#22c55e;color:#fff}
#done-btn:hover{background:#16a34a}
#done-btn:disabled{background:#166534;cursor:not-allowed}
#cancel-btn{background:#3a3a3a;color:#e0e0e0}
#cancel-btn:hover{background:#4a4a4a}
#cancel-btn:disabled{opacity:.5;cursor:not-allowed}
#canvas-container{flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#111}
#stream-canvas{display:block;max-width:100%;max-height:100%;object-fit:contain;cursor:default;outline:none}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#555;color:#fff;padding:8px 20px;border-radius:4px;font-size:.875rem;z-index:99;opacity:1;transition:opacity .3s}
.toast.hidden{opacity:0;pointer-events:none}
`;

export const CLIENT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Browser Session — Intervention Required</title>
  <link rel="stylesheet" href="/client.css">
</head>
<body>
  <div id="toolbar">
    <span id="status">Connecting...</span>
    <span id="latency"></span>
    <span id="expiry"></span>
    <button id="done-btn">Done</button>
    <button id="cancel-btn">Cancel</button>
  </div>
  <div id="canvas-container">
    <canvas id="stream-canvas" tabindex="0"></canvas>
  </div>
  <div id="toast" class="toast hidden"></div>
  <script src="/client.js"></script>
</body>
</html>`;

export const CLIENT_JS = `(function(){
  var canvas=document.getElementById('stream-canvas');
  var ctx=canvas.getContext('2d');
  var statusEl=document.getElementById('status');
  var latencyEl=document.getElementById('latency');
  var doneBtn=document.getElementById('done-btn');
  var cancelBtn=document.getElementById('cancel-btn');
  var toastEl=document.getElementById('toast');

  var token=new URLSearchParams(window.location.search).get('t');
  var proto=window.location.protocol==='https:'?'wss':'ws';
  var wsUrl=proto+'://'+window.location.host+'/ws/'+token;

  var ws;
  var canvasRect={left:0,top:0,width:1,height:1};
  var pingTime=0;
  var moveTimer=null;
  var pendingMove=null;
  var toastTimer=null;

  function send(msg){if(ws&&ws.readyState===1)ws.send(JSON.stringify(msg));}
  function updateRect(){canvasRect=canvas.getBoundingClientRect();}
  function norm(cx,cy){return{x:Math.max(0,Math.min(1,(cx-canvasRect.left)/canvasRect.width)),y:Math.max(0,Math.min(1,(cy-canvasRect.top)/canvasRect.height))};}
  function mods(e){return(e.altKey?1:0)|(e.ctrlKey?2:0)|(e.metaKey?4:0)|(e.shiftKey?8:0);}
  function showToast(msg){
    toastEl.textContent=msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(function(){toastEl.classList.add('hidden');},3000);
  }
  function b64ToBytes(b64){var bin=atob(b64);var buf=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)buf[i]=bin.charCodeAt(i);return buf;}

  canvas.addEventListener('mousedown',function(e){var n=norm(e.clientX,e.clientY);send({type:'mousedown',x:n.x,y:n.y,button:e.button,modifiers:mods(e),timestamp:e.timeStamp});canvas.focus();e.preventDefault();});
  canvas.addEventListener('mouseup',function(e){var n=norm(e.clientX,e.clientY);send({type:'mouseup',x:n.x,y:n.y,button:e.button,modifiers:mods(e),timestamp:e.timeStamp});e.preventDefault();});
  canvas.addEventListener('mousemove',function(e){
    pendingMove={x:(e.clientX-canvasRect.left)/canvasRect.width,y:(e.clientY-canvasRect.top)/canvasRect.height,button:e.button,modifiers:mods(e),timestamp:e.timeStamp};
    if(!moveTimer){moveTimer=setTimeout(function(){if(pendingMove){var n=pendingMove;pendingMove=null;send({type:'mousemove',x:Math.max(0,Math.min(1,n.x)),y:Math.max(0,Math.min(1,n.y)),button:n.button,modifiers:n.modifiers,timestamp:n.timestamp});}moveTimer=null;},16);}
  });
  canvas.addEventListener('wheel',function(e){var n=norm(e.clientX,e.clientY);send({type:'wheel',x:n.x,y:n.y,deltaX:e.deltaX,deltaY:e.deltaY});e.preventDefault();},{passive:false});
  canvas.addEventListener('keydown',function(e){send({type:'keydown',key:e.key,code:e.code,modifiers:mods(e),timestamp:e.timeStamp});e.preventDefault();});
  canvas.addEventListener('keyup',function(e){send({type:'keyup',key:e.key,code:e.code,modifiers:mods(e),timestamp:e.timeStamp});e.preventDefault();});

  doneBtn.addEventListener('click',function(){send({type:'done'});doneBtn.disabled=true;});
  cancelBtn.addEventListener('click',function(){send({type:'cancel'});cancelBtn.disabled=true;});
  window.addEventListener('resize',updateRect);

  function connect(){
    ws=new WebSocket(wsUrl);
    ws.onopen=function(){statusEl.textContent='Connecting...';};
    ws.onclose=function(e){
      statusEl.style.color='#ef4444';
      statusEl.textContent=e.code===1008?'Session expired (link already used)':'Disconnected';
      doneBtn.disabled=true;cancelBtn.disabled=true;
    };
    ws.onerror=function(){statusEl.textContent='Connection error';statusEl.style.color='#ef4444';};
    ws.onmessage=function(e){
      var msg=JSON.parse(e.data);
      if(msg.type==='frame'){
        createImageBitmap(new Blob([b64ToBytes(msg.data)],{type:'image/jpeg'})).then(function(bmp){
          canvas.width=msg.frameWidth;canvas.height=msg.frameHeight;
          ctx.drawImage(bmp,0,0);bmp.close();updateRect();
        });
      }else if(msg.type==='ready'){
        statusEl.textContent='Connected';statusEl.style.color='#22c55e';
        setInterval(function(){pingTime=Date.now();send({type:'ping'});},5000);
      }else if(msg.type==='pong'){
        if(pingTime)latencyEl.textContent=(Date.now()-pingTime)+'ms';
      }else if(msg.type==='toast'){
        showToast(msg.message);
      }else if(msg.type==='aborted'){
        statusEl.textContent='Session ended'+(msg.reason?' ('+msg.reason+')':'');
        statusEl.style.color='#f59e0b';
        doneBtn.disabled=true;cancelBtn.disabled=true;
      }
    };
  }
  connect();
})();`;

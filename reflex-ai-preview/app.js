const $ = s => document.querySelector(s);

const home = $('#home');
const cameraScreen = $('#cameraScreen');
const resultScreen = $('#resultScreen');
const video = $('#video');
const analysisCanvas = $('#analysisCanvas');
const captureCanvas = $('#captureCanvas');
const developCanvas = $('#developCanvas');
const coachTitle = $('#coachTitle');
const coachSub = $('#coachSub');
const coachDot = $('#coachDot');
const shutter = $('#shutter');
const readyText = $('#readyText');
const levelBar = $('#level span');
const exposure = $('#exposure');
const exposureLabel = $('#exposureLabel');
const cameraError = $('#cameraError');
const cameraErrorText = $('#cameraErrorText');
const resultImg = $('#resultImg');
const processing = $('#processing');

let stream = null;
let track = null;
let imageCapture = null;
let roll = 0;
let stability = 1;
let brightness = 0.5;
let skyBrightness = 0.5;
let sceneReady = false;
let originalURL = null;
let developedURL = null;
let exposureSupported = false;
let lensIndex = 0;
let cameras = [];

function show(screen){
  [home,cameraScreen,resultScreen].forEach(x=>x.classList.remove('active'));
  screen.classList.add('active');
}

async function startCamera(){
  cameraError.classList.add('hidden');
  try{
    if(stream) stopCamera();
    stream = await navigator.mediaDevices.getUserMedia({
      audio:false,
      video:{facingMode:{ideal:'environment'},width:{ideal:3840},height:{ideal:2160},frameRate:{ideal:30,max:60}}
    });
    video.srcObject = stream;
    await video.play();
    track = stream.getVideoTracks()[0];
    if('ImageCapture' in window){
      try{ imageCapture = new ImageCapture(track); }catch(e){ imageCapture=null; }
    }
    configureCapabilities();
    enumerateCameras();
    startAnalysis();
  }catch(err){
    console.error(err);
    cameraErrorText.textContent = err && err.name === 'NotAllowedError'
      ? 'Consenti Fotocamera in Safari → Impostazioni sito web e poi riprova.'
      : 'Non riesco ad aprire la fotocamera. Assicurati di usare HTTPS su Safari.';
    cameraError.classList.remove('hidden');
  }
}

function stopCamera(){
  if(stream) stream.getTracks().forEach(t=>t.stop());
  stream=null; track=null; imageCapture=null;
}

async function configureCapabilities(){
  if(!track?.getCapabilities) return;
  const caps = track.getCapabilities();
  const settings = track.getSettings?.() || {};
  if(caps.exposureCompensation){
    exposureSupported = true;
    const min = caps.exposureCompensation.min ?? -1;
    const max = caps.exposureCompensation.max ?? 1;
    exposure.min = min;
    exposure.max = max;
    exposure.step = caps.exposureCompensation.step || .1;
    const target = Math.max(min, Math.min(max, -0.35));
    exposure.value = target;
    exposureLabel.textContent = `EV ${Number(target).toFixed(2)}`;
    try{ await track.applyConstraints({advanced:[{exposureCompensation:Number(target)}]}); }catch(e){}
  }
  if(caps.zoom){
    const z = settings.zoom || caps.zoom.min || 1;
    $('#lensBtn').textContent = `${Number(z).toFixed(z % 1 ? 1 : 0)}×`;
  }
}

async function enumerateCameras(){
  try{
    const devices = await navigator.mediaDevices.enumerateDevices();
    cameras = devices.filter(d=>d.kind==='videoinput');
  }catch(e){}
}

function startAnalysis(){
  const ctx = analysisCanvas.getContext('2d',{willReadFrequently:true});
  let last = performance.now();
  let prevLum = null;
  function tick(){
    if(!stream || !video.videoWidth){ requestAnimationFrame(tick); return; }
    const now=performance.now();
    if(now-last>450){
      last=now;
      try{
        ctx.drawImage(video,0,0,analysisCanvas.width,analysisCanvas.height);
        const {data,width,height}=ctx.getImageData(0,0,analysisCanvas.width,analysisCanvas.height);
        let total=0, top=0, n=0, ntop=0;
        for(let y=0;y<height;y+=4){
          for(let x=0;x<width;x+=4){
            const i=(y*width+x)*4;
            const lum=(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)/255;
            total+=lum;n++;
            if(y<height*.38){top+=lum;ntop++;}
          }
        }
        brightness=total/n;
        skyBrightness=top/ntop;
        if(prevLum!==null) stability = Math.min(1, Math.abs(brightness-prevLum)*12 + stability*.5);
        prevLum=brightness;
        updateCoach();
      }catch(e){}
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function updateCoach(){
  const levelOk = Math.abs(roll) < 2.2;
  const stableOk = stability < .18;
  let title='Composizione pronta';
  let sub='Mantieni questa inquadratura';
  let state='ready';

  if(!levelOk){
    title='Orizzonte da raddrizzare';
    sub=roll>0?'Ruota leggermente a sinistra':'Ruota leggermente a destra';
    state='warn';
  }else if(!stableOk){
    title='Rimani fermo';
    sub='Blocca i gomiti e aspetta un istante';
    state='warn';
  }else if(skyBrightness > .82){
    title='Luci troppo forti';
    sub='Abbassa leggermente l’esposizione';
    state='warn';
  }else if(brightness < .12){
    title='Scena molto scura';
    sub='Tieni fermo il telefono e non alzare troppo EV';
    state='warn';
  }else if(skyBrightness > brightness*1.8 && brightness < .32){
    title='Proteggi il cielo';
    sub='Tieni EV leggermente negativo';
    state='good';
  }

  sceneReady = state !== 'warn';
  coachTitle.textContent=title;
  coachSub.textContent=sub;
  coachDot.style.background = sceneReady ? '#39e87d' : '#ffbf3f';
  coachDot.style.boxShadow = sceneReady ? '0 0 16px rgba(57,232,125,.65)' : '0 0 16px rgba(255,191,63,.6)';
  shutter.classList.toggle('ready',sceneReady);
  readyText.textContent=sceneReady?'SCATTA ORA':'Segui il suggerimento';
}

async function requestSensors(){
  let ok=true;
  try{
    if(typeof DeviceOrientationEvent!=='undefined' && typeof DeviceOrientationEvent.requestPermission==='function'){
      ok = (await DeviceOrientationEvent.requestPermission())==='granted';
    }
  }catch(e){ok=false}
  try{
    if(typeof DeviceMotionEvent!=='undefined' && typeof DeviceMotionEvent.requestPermission==='function'){
      ok = ((await DeviceMotionEvent.requestPermission())==='granted') && ok;
    }
  }catch(e){}
  bindSensors();
  $('#motionBtn').textContent=ok?'LIVE':'LIVELLA';
}

function bindSensors(){
  window.addEventListener('deviceorientation',e=>{
    roll = Math.max(-12,Math.min(12,e.gamma || 0));
    levelBar.style.transform=`rotate(${-roll}deg)`;
    levelBar.style.background=Math.abs(roll)<2.2?'#39e87d':'#fff';
    updateCoach();
  },{passive:true});
  window.addEventListener('devicemotion',e=>{
    const a=e.accelerationIncludingGravity;
    if(!a)return;
    const mag=Math.sqrt((a.x||0)**2+(a.y||0)**2+(a.z||0)**2);
    stability = Math.abs(mag-9.81)/5;
  },{passive:true});
}

exposure.addEventListener('input',async e=>{
  const v=Number(e.target.value);
  exposureLabel.textContent=`EV ${v>=0?'+':''}${v.toFixed(2)}`;
  if(exposureSupported && track){
    try{await track.applyConstraints({advanced:[{exposureCompensation:v}]});}catch(e){}
  }
});

async function capturePhoto(){
  shutter.disabled=true;
  if(navigator.vibrate) navigator.vibrate(25);
  try{
    let blob=null;
    if(imageCapture?.takePhoto){
      try{ blob=await imageCapture.takePhoto(); }catch(e){ console.warn('takePhoto fallback',e); }
    }
    if(!blob){
      const w=video.videoWidth,h=video.videoHeight;
      captureCanvas.width=w;captureCanvas.height=h;
      const ctx=captureCanvas.getContext('2d');
      ctx.drawImage(video,0,0,w,h);
      blob=await new Promise(r=>captureCanvas.toBlob(r,'image/jpeg',0.96));
    }
    originalURL=URL.createObjectURL(blob);
    resultImg.src=originalURL;
    show(resultScreen);
    processing.classList.remove('hidden');
    await developPhoto(blob);
  }catch(e){
    console.error(e);
    alert('Scatto non riuscito. Riprova.');
  }finally{ shutter.disabled=false; }
}

async function developPhoto(blob){
  const bmp = await createImageBitmap(blob);
  const maxSide=4096;
  const scale=Math.min(1,maxSide/Math.max(bmp.width,bmp.height));
  const w=Math.round(bmp.width*scale),h=Math.round(bmp.height*scale);
  developCanvas.width=w;developCanvas.height=h;
  const ctx=developCanvas.getContext('2d',{willReadFrequently:true});
  ctx.filter='contrast(1.06) saturate(1.10) brightness(0.99)';
  ctx.drawImage(bmp,0,0,w,h);
  ctx.filter='none';

  const img=ctx.getImageData(0,0,w,h);
  const d=img.data;
  for(let i=0;i<d.length;i+=4){
    let r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255;
    const lum=.2126*r+.7152*g+.0722*b;
    const hi=Math.max(0,(lum-.62)/.38);
    const hiCompress=1-.12*hi;
    const sh=Math.max(0,(.42-lum)/.42);
    const lift=.035*sh*(1-Math.max(0,(.08-lum)/.08));
    r=r*hiCompress+lift;
    g=g*hiCompress+lift;
    b=b*hiCompress+lift;
    r*=1.025; g*=1.008; b*=0.985;
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    const sat=mx>0?(mx-mn)/mx:0;
    const vib=.075*(1-sat);
    const gray=(r+g+b)/3;
    r=r+(r-gray)*vib; g=g+(g-gray)*vib; b=b+(b-gray)*vib;
    d[i]=Math.max(0,Math.min(255,Math.round(r*255)));
    d[i+1]=Math.max(0,Math.min(255,Math.round(g*255)));
    d[i+2]=Math.max(0,Math.min(255,Math.round(b*255)));
  }
  ctx.putImageData(img,0,0);

  try{
    const blur=document.createElement('canvas');
    blur.width=w;blur.height=h;
    const bctx=blur.getContext('2d');
    bctx.filter='blur(0.65px)';
    bctx.drawImage(developCanvas,0,0);
    bctx.filter='none';
    const sharp=ctx.getImageData(0,0,w,h);
    const soft=bctx.getImageData(0,0,w,h);
    const sd=sharp.data, bd=soft.data;
    const amount=.16;
    for(let i=0;i<sd.length;i+=4){
      sd[i]=Math.max(0,Math.min(255,sd[i]+amount*(sd[i]-bd[i])));
      sd[i+1]=Math.max(0,Math.min(255,sd[i+1]+amount*(sd[i+1]-bd[i+1])));
      sd[i+2]=Math.max(0,Math.min(255,sd[i+2]+amount*(sd[i+2]-bd[i+2])));
    }
    ctx.putImageData(sharp,0,0);
  }catch(e){}

  developedURL=await new Promise(resolve=>developCanvas.toBlob(b=>resolve(URL.createObjectURL(b)),'image/jpeg',0.96));
  resultImg.src=developedURL;
  processing.classList.add('hidden');
}

async function saveDeveloped(){
  if(!developedURL)return;
  const blob=await (await fetch(developedURL)).blob();
  const file=new File([blob],`ReflexAI-Tramonto-${Date.now()}.jpg`,{type:'image/jpeg'});
  if(navigator.share && navigator.canShare?.({files:[file]})){
    try{await navigator.share({files:[file],title:'Reflex AI'});return}catch(e){}
  }
  const a=document.createElement('a');
  a.href=developedURL;a.download=file.name;document.body.appendChild(a);a.click();a.remove();
}

async function switchLens(){
  if(cameras.length<2)return;
  lensIndex=(lensIndex+1)%cameras.length;
  try{
    if(stream) stopCamera();
    stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{deviceId:{exact:cameras[lensIndex].deviceId},width:{ideal:3840},height:{ideal:2160}}});
    video.srcObject=stream;await video.play();
    track=stream.getVideoTracks()[0];
    imageCapture='ImageCapture' in window?new ImageCapture(track):null;
    $('#lensBtn').textContent=`CAM ${lensIndex+1}`;
    configureCapabilities();
  }catch(e){startCamera()}
}

$('#startBtn').addEventListener('click',async()=>{show(cameraScreen);await startCamera()});
$('#closeBtn').addEventListener('click',()=>{stopCamera();show(home)});
$('#retryBtn').addEventListener('click',startCamera);
$('#motionBtn').addEventListener('click',requestSensors);
$('#shutter').addEventListener('click',capturePhoto);
$('#lensBtn').addEventListener('click',switchLens);
$('#retakeBtn').addEventListener('click',()=>{show(cameraScreen);if(!stream)startCamera()});
$('#retakeTop').addEventListener('click',()=>{show(cameraScreen);if(!stream)startCamera()});
$('#saveBtn').addEventListener('click',saveDeveloped);
$('#shareBtn').addEventListener('click',saveDeveloped);
$('#originalBtn').addEventListener('click',()=>{
  if(originalURL)resultImg.src=originalURL;
  $('#originalBtn').classList.add('active');$('#developedBtn').classList.remove('active');
});
$('#developedBtn').addEventListener('click',()=>{
  if(developedURL)resultImg.src=developedURL;
  $('#developedBtn').classList.add('active');$('#originalBtn').classList.remove('active');
});
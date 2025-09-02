// GlowTrack complete SPA app.js
const storage = {
  get(k,fallback){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):fallback }catch(e){return fallback} },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)) }catch(e){} }
};
function todayKey(d=new Date()){ return d.toISOString().slice(0,10) }
function formatHM(secs){ const m=Math.floor(secs/60); const s=secs%60; return m+ ':' + (s<10?'0':'')+s }
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}

// initial state
let state = storage.get('glowtrack_state', { profile:{age:38}, phase:null, logs:{weight:[], steps:[], minutes:[], miles:[], workouts:[]} });

function $(id){return document.getElementById(id)}

// phase generator
function generatePhase(length, activity, goal){
  const start = new Date();
  const days = length==='c25'?60: Number(length);
  const phase = { id:'phase-'+Date.now(), length:days, startDate:start.toISOString().slice(0,10), endDate:new Date(start.getTime()+(days-1)*24*60*60*1000).toISOString().slice(0,10), activity, goal };
  const actMod = activity==='sedentary'?0.6: activity==='light'?0.8: activity==='moderate'?1.0:1.15;
  phase.days = Array.from({length:days}, (_,i)=>{
    const isRest = (i%7===2) || (i%7===6);
    const dayType = isRest? 'rest' : (i%6===0? 'long' : (i%3===0? 'interval':'steady'));
    const baseMin = Math.round(clamp(15 + (i/(days-1))*50 * actMod, 10, 90));
    let blocks=[];
    if(dayType==='interval'){
      const sets = Math.min(12, 3 + Math.floor(i/Math.max(1,Math.floor(days/10))));
      for(let s=0;s<sets;s++){ blocks.push({label:'Brisk', secs:Math.round(60*1.5)}); blocks.push({label:'Power', secs:Math.round(60*0.75)}); }
    } else if(dayType==='long'){
      blocks.push({label:'Long Brisk', secs:60* (baseMin)});
    } else if(dayType==='steady'){
      blocks.push({label:'Brisk Steady', secs:60*(baseMin)});
    }
    const pilates = dayType==='rest'? [] : ['Ankle alphabet (1x each direction)', 'Heel raises x12', 'Glute bridges x12'];
    return { index:i+1, date:new Date(start.getTime()+i*24*60*60*1000).toISOString().slice(0,10), dayType, minutes:baseMin, blocks, pilates, isRest };
  });
  return phase;
}

// render helpers
function renderAll(){ renderPhaseLabel(); renderMetrics(); renderCalendar(); renderTodayWorkout(); renderCharts(); renderLogs(); storage.set('glowtrack_state', state); }
function renderPhaseLabel(){ const p = state.phase; $('phaseLabel').textContent = p ? `${p.length||p.length} day phase • start ${p.startDate}` : 'No active phase' }
function latestWeight(){ const w = state.logs.weight.slice(-1)[0]; return w? w.value : null; }

function renderMetrics(){
  const today = todayKey();
  const stepsToday = state.logs.steps.filter(s=>s.date===today).reduce((a,b)=>a+Number(b.steps||0),0);
  const minsToday = state.logs.minutes.filter(s=>s.date===today).reduce((a,b)=>a+Number(b.mins||0),0);
  const milesWeek = state.logs.miles.slice(-7).reduce((a,b)=>a+Number(b.miles||0),0);
  $('metricSteps').querySelector('.big').textContent = stepsToday;
  $('metricMinutes').querySelector('.big').textContent = minsToday;
  const lw = latestWeight(); $('metricWeight').querySelector('.big').textContent = lw? lw : '—';
  $('metricMiles').querySelector('.big').textContent = milesWeek.toFixed(2);
}

function renderCalendar(){
  const grid = $('calendarGrid'); grid.innerHTML='';
  if(!state.phase){ grid.innerHTML = '<div class="small">No active phase</div>'; return; }
  const days = state.phase.days;
  days.forEach(d=>{
    const el = document.createElement('div'); el.className='calendar-day';
    const w = state.logs.workouts.find(x=>x.date===d.date);
    if(d.isRest){ el.style.background='#efe6ff'; el.textContent='R'; }
    else if(w && w.completed && w.hitGoal){ el.style.background='#dcfce7'; el.textContent='✓'; }
    else if(w && w.completed){ el.style.background='#fef3c7'; el.textContent='•'; }
    else{ el.style.background='#fff'; el.textContent=''; }
    grid.appendChild(el);
  });
}

function renderTodayWorkout(){
  const area = $('todayWorkoutInfo'); const timerUI = $('timerUI');
  if(!state.phase){ area.textContent='No phase — create one to see daily workouts.'; timerUI.style.display='none'; return; }
  const today = todayKey();
  const dayEntry = state.phase.days.find(dd=>dd.date===today) || state.phase.days[0];
  area.innerHTML = `<strong>Day ${dayEntry.index} — ${dayEntry.dayType} • ${dayEntry.minutes} min</strong><div class="small">Date: ${dayEntry.date}</div>`;
  const pilatesList = document.getElementById('pilatesList'); pilatesList.innerHTML='';
  dayEntry.pilates.forEach(p=>{ const li=document.createElement('div'); li.textContent=p; pilatesList.appendChild(li); });
  window.currentBlocks = dayEntry.blocks.map(b=>({...b})); window.currentBlockIndex=0;
  if(window.currentBlocks.length>0){ timerUI.style.display='block'; $('timerLabel').textContent = window.currentBlocks[0].label; $('timerDisplay').textContent = formatHM(Math.ceil(window.currentBlocks[0].secs)); }
  else{ timerUI.style.display='none'; }
}

// timer with cues
let timerInterval=null, timerRemaining=0, timerRunning=false;
function playBeep(){ try{ const ctx = new (window.AudioContext||window.webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.type='sine'; o.frequency.value=880; o.connect(g); g.connect(ctx.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12); setTimeout(()=>o.stop(),150); }catch(e){console.log('beep',e)} }
function speak(text){ try{ if('speechSynthesis' in window){ const u = new SpeechSynthesisUtterance(text); speechSynthesis.cancel(); speechSynthesis.speak(u); } }catch(e){console.log('tts',e)} }

function startTimer(){
  if(timerRunning) return; if(!window.currentBlocks || window.currentBlocks.length===0) return;
  timerRunning=true; const block = window.currentBlocks[window.currentBlockIndex]; timerRemaining = Math.ceil(block.secs);
  $('timerLabel').textContent = block.label; $('timerDisplay').textContent = formatHM(timerRemaining); playBeep(); speak(block.label);
  timerInterval = setInterval(()=>{
    timerRemaining--; if(timerRemaining<=0){
      playBeep(); window.currentBlockIndex++;
      if(window.currentBlockIndex>=window.currentBlocks.length){ clearInterval(timerInterval); timerRunning=false; $('timerDisplay').textContent='0:00'; speak('Workout complete'); markWorkoutCompleted(true); return; }
      const nb = window.currentBlocks[window.currentBlockIndex]; timerRemaining = Math.ceil(nb.secs); $('timerLabel').textContent = nb.label; speak(nb.label);
    }
    $('timerDisplay').textContent = formatHM(timerRemaining);
  },1000);
}
function pauseTimer(){ if(timerInterval) clearInterval(timerInterval); timerRunning=false; }
function resetTimer(){ pauseTimer(); if(window.currentBlocks && window.currentBlocks.length>0){ window.currentBlockIndex=0; const b=window.currentBlocks[0]; $('timerLabel').textContent=b.label; $('timerDisplay').textContent=formatHM(Math.ceil(b.secs)); } }

// quick log & mark complete
function markWorkoutCompleted(hitGoal=false){
  const date = todayKey();
  state.logs.workouts.push({date, completed:true, hitGoal:!!hitGoal});
  storage.set('glowtrack_state', state); renderAll();
}

function initUI(){
  $('startPhaseBtn').addEventListener('click', ()=>{
    const length = $('phaseLength').value; const activity = $('activityLevel').value; const goal = $('primaryGoal').value;
    state.phase = generatePhase(length, activity, goal); storage.set('glowtrack_state', state); renderAll(); alert('Phase created. Rest days: Wed & Sun.');
  });
  $('clearDataBtn').addEventListener('click', ()=>{ if(confirm('Clear all data?')){ localStorage.clear(); location.reload(); }});
  $('logQuickBtn').addEventListener('click', ()=>{
    const steps = Number($('quickSteps').value)||0; const mins = Number($('quickMinutes').value)||0; const weight = Number($('quickWeight').value)||0; const date = todayKey();
    if(steps) state.logs.steps.push({date, steps}); if(mins) state.logs.minutes.push({date, mins}); if(weight) state.logs.weight.push({date, value:weight});
    $('quickSteps').value=''; $('quickMinutes').value=''; $('quickWeight').value=''; storage.set('glowtrack_state', state); renderAll();
  });
  $('markWorkoutBtn').addEventListener('click', ()=>markWorkoutCompleted(false));
  $('timerStart').addEventListener('click', ()=>startTimer()); $('timerPause').addEventListener('click', ()=>pauseTimer()); $('timerReset').addEventListener('click', ()=>resetTimer());
  // register service worker
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('service-worker.js').catch(()=>{}); }
}

// charts
let weightChart=null, stepsChart=null;
function renderCharts(){
  const wData = state.logs.weight.map(w=>({x:w.date,y:w.value}));
  const sData = state.logs.steps.map(s=>({x:s.date,y:s.steps}));
  const wCtx = document.getElementById('weightChart').getContext('2d'); const sCtx = document.getElementById('stepsChart').getContext('2d');
  if(weightChart) weightChart.destroy(); if(stepsChart) stepsChart.destroy();
  weightChart = new Chart(wCtx,{type:'line',data:{datasets:[{label:'Weight (lb)',data:wData,borderColor:'#14b8a6',fill:false}]},options:{parsing:{xAxisKey:'x',yAxisKey:'y'},scales:{x:{type:'time',time:{unit:'day'}},y:{beginAtZero:false}}}});
  stepsChart = new Chart(sCtx,{type:'bar',data:{datasets:[{label:'Steps',data:sData,backgroundColor:'#60a5fa'}]},options:{parsing:{xAxisKey:'x',yAxisKey:'y'},scales:{x:{type:'time',time:{unit:'day'}},y:{beginAtZero:true}}}});
}

function renderLogs(){
  const out = $('rawLogs'); out.innerHTML='';
  ['weight','steps','minutes','miles','workouts'].forEach(k=>{
    const list = state.logs[k]||[]; if(list.length===0) return;
    const h = document.createElement('h4'); h.textContent = k.toUpperCase(); out.appendChild(h);
    list.slice().reverse().forEach(item=>{ const d = document.createElement('div'); d.className='raw-log'; d.textContent = JSON.stringify(item); out.appendChild(d); });
  });
}

// main render
function renderAll(){ renderPhaseLabel(); renderMetrics(); renderCalendar(); renderTodayWorkout(); renderCharts(); renderLogs(); storage.set('glowtrack_state', state); }

// startup
initUI(); renderAll();

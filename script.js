/**
 * NEXUS AI - Autonomous Web App Studio & Live Preview Platform
 * Complete Core Engine with Real-Time Sandbox, Code Inspector,
 * Audio Synthesizer, Confetti Engine, and Interactive Blueprints.
 */

// ============================================================
// 1. PROCEDURAL AUDIO SYNTHESIZER (WEB AUDIO API)
// ============================================================
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.muted = localStorage.getItem('nexus_muted') === 'true';
    }

    init() {
        if (!this.ctx && typeof AudioContext !== 'undefined') {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playClick() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.04);
        
        gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.04);
    }

    playStep() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1040, this.ctx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.08);
    }

    playSuccessChime() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        freqs.forEach((f, index) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, this.ctx.currentTime + index * 0.07);

            gain.gain.setValueAtTime(0.08, this.ctx.currentTime + index * 0.07);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + index * 0.07 + 0.35);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(this.ctx.currentTime + index * 0.07);
            osc.stop(this.ctx.currentTime + index * 0.07 + 0.35);
        });
    }

    toggleMute() {
        this.muted = !this.muted;
        localStorage.setItem('nexus_muted', this.muted);
        return this.muted;
    }
}

const audio = new AudioEngine();

// ============================================================
// 2. AMBIENT STARFIELD CANVAS
// ============================================================
function initAmbientCanvas() {
    const canvas = document.getElementById('ambient-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 45; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() * 1.5 + 0.5,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            alpha: Math.random() * 0.6 + 0.2
        });
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(99, 102, 241, 0.4)';

        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0) p.x = width;
            if (p.x > width) p.x = 0;
            if (p.y < 0) p.y = height;
            if (p.y > height) p.y = 0;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(165, 180, 252, ${p.alpha})`;
            ctx.fill();
        });

        requestAnimationFrame(animate);
    }
    animate();
}

// ============================================================
// 3. CONFETTI CELEBRATION ENGINE
// ============================================================
function fireConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = [];
    const colors = ['#6366f1', '#06b6d4', '#ec4899', '#10b981', '#f59e0b', '#ffffff'];

    for (let i = 0; i < 80; i++) {
        pieces.push({
            x: canvas.width * 0.6 + (Math.random() - 0.5) * 300,
            y: canvas.height * 0.5,
            size: Math.random() * 8 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: (Math.random() - 0.5) * 14,
            vy: (Math.random() - 0.8) * 16,
            rot: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 12,
            life: 1
        });
    }

    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;

        pieces.forEach(p => {
            if (p.life <= 0) return;
            alive = true;
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.45; // gravity
            p.rot += p.rotSpeed;
            p.life -= 0.015;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rot * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
        });

        if (alive) {
            requestAnimationFrame(render);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    render();
}

// ============================================================
// 4. PRE-BUNDLED HIGH-MODERN INTERACTIVE BLUEPRINTS
// ============================================================
const BLUEPRINTS = {
    crypto: {
        title: 'CryptoPulse SaaS Dashboard',
        slug: 'cryptopulse-v2',
        html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CryptoPulse Pro</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    background: #080a12;
    color: #f1f5f9;
    font-family: 'Outfit', sans-serif;
    padding: 24px;
    min-height: 100vh;
}
.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 20px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    margin-bottom: 24px;
}
.brand { display: flex; align-items: center; gap: 10px; font-size: 1.3rem; font-weight: 700; color: #67e8f9; }
.badge { background: rgba(99,102,241,0.2); color: #818cf8; padding: 4px 10px; border-radius: 99px; font-size: 0.75rem; border: 1px solid rgba(99,102,241,0.4); }
.grid-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
}
.stat-card {
    background: rgba(18, 24, 40, 0.7);
    border: 1px solid rgba(255,255,255,0.08);
    padding: 16px;
    border-radius: 14px;
    backdrop-filter: blur(10px);
    transition: transform 0.2s;
}
.stat-card:hover { transform: translateY(-2px); border-color: rgba(99,102,241,0.3); }
.stat-label { font-size: 0.8rem; color: #94a3b8; margin-bottom: 4px; }
.stat-value { font-family: 'JetBrains Mono', monospace; font-size: 1.5rem; font-weight: 700; }
.stat-change { font-size: 0.75rem; margin-top: 4px; }
.up { color: #34d399; }
.down { color: #f87171; }
.main-content {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 20px;
}
@media (max-width: 800px) { .main-content { grid-template-columns: 1fr; } }
.panel {
    background: rgba(18, 24, 40, 0.7);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    padding: 20px;
}
.panel-title { font-size: 1.1rem; font-weight: 600; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
.order-table { width: 100%; border-collapse: collapse; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; }
.order-table th { text-align: left; color: #64748b; padding-bottom: 10px; }
.order-table td { padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.swap-box { display: flex; flex-direction: column; gap: 12px; }
.swap-input-group { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 12px; }
.swap-input-group label { display: block; font-size: 0.75rem; color: #94a3b8; margin-bottom: 6px; }
.swap-row { display: flex; justify-content: space-between; align-items: center; }
.swap-row input { background: transparent; border: none; font-size: 1.2rem; color: #fff; font-family: 'JetBrains Mono', monospace; width: 60%; outline: none; }
.swap-token { background: #1e293b; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 0.85rem; }
.btn-swap {
    background: linear-gradient(135deg, #6366f1, #06b6d4);
    border: none;
    color: white;
    padding: 14px;
    border-radius: 12px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 0 20px rgba(99,102,241,0.4);
    transition: opacity 0.2s;
}
.btn-swap:hover { opacity: 0.9; }
.chart-sim {
    height: 160px;
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding-top: 20px;
    margin-bottom: 20px;
}
.bar {
    flex: 1;
    background: linear-gradient(180deg, #06b6d4, rgba(6,182,212,0.1));
    border-radius: 4px 4px 0 0;
    transition: height 0.5s ease;
}
</style>
</head>
<body>
<div class="header">
    <div class="brand">⚡ CryptoPulse <span>Terminal</span></div>
    <div class="badge">● LIVE WEBSOCKET CONNECTED</div>
</div>

<div class="grid-stats">
    <div class="stat-card">
        <div class="stat-label">Bitcoin / USD</div>
        <div class="stat-value" id="btc-price">$96,420.50</div>
        <div class="stat-change up">▲ +4.82% ($4,430)</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Ethereum / USD</div>
        <div class="stat-value" id="eth-price">$3,485.10</div>
        <div class="stat-change up">▲ +2.15%</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Solana / USD</div>
        <div class="stat-value" id="sol-price">$214.80</div>
        <div class="stat-change up">▲ +7.91%</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Portfolio Balance</div>
        <div class="stat-value" id="wallet-balance">$42,910.00</div>
        <div class="stat-change up">● 4 Assets Staked</div>
    </div>
</div>

<div class="main-content">
    <div class="panel">
        <div class="panel-title">
            <span>Market Momentum (24H Volume)</span>
            <span style="font-size:0.8rem; color:#64748b;">Auto-Updating</span>
        </div>
        <div class="chart-sim" id="chart-bars"></div>
        <table class="order-table">
            <thead>
                <tr><th>Asset</th><th>Live Price</th><th>24h Volume</th><th>Order State</th></tr>
            </thead>
            <tbody id="order-body">
                <tr><td><strong>BTC</strong></td><td>$96,420</td><td>$1.4B</td><td class="up">BUY ORDER</td></tr>
                <tr><td><strong>ETH</strong></td><td>$3,485</td><td>$840M</td><td class="up">BUY ORDER</td></tr>
                <tr><td><strong>SOL</strong></td><td>$214.80</td><td>$520M</td><td class="down">SELL ORDER</td></tr>
            </tbody>
        </table>
    </div>

    <div class="panel">
        <div class="panel-title">Instant Liquidity Swap</div>
        <div class="swap-box">
            <div class="swap-input-group">
                <label>Pay From Wallet</label>
                <div class="swap-row">
                    <input type="number" id="swap-from" value="2.5" step="0.1">
                    <span class="swap-token">SOL</span>
                </div>
            </div>
            <div class="swap-input-group">
                <label>You Receive (Simulated)</label>
                <div class="swap-row">
                    <input type="number" id="swap-to" value="537.00" readonly>
                    <span class="swap-token">USDC</span>
                </div>
            </div>
            <button class="btn-swap" id="btn-do-swap">Swap Assets Now</button>
            <div style="font-size:0.75rem; color:#64748b; text-align:center;">Network Fee: $0.001 • Instant Finality</div>
        </div>
    </div>
</div>

<script>
// Simulated Live Ticker & Interactive Swap
const chartBars = document.getElementById('chart-bars');
for(let i = 0; i < 16; i++) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = (Math.random() * 80 + 20) + '%';
    chartBars.appendChild(bar);
}

setInterval(() => {
    const bars = document.querySelectorAll('.bar');
    bars.forEach(b => {
        b.style.height = (Math.random() * 85 + 15) + '%';
    });
    const btc = 96000 + Math.floor(Math.random() * 800);
    document.getElementById('btc-price').textContent = '$' + btc.toLocaleString() + '.00';
}, 3000);

const swapFrom = document.getElementById('swap-from');
const swapTo = document.getElementById('swap-to');
swapFrom.addEventListener('input', () => {
    const val = parseFloat(swapFrom.value) || 0;
    swapTo.value = (val * 214.80).toFixed(2);
});

document.getElementById('btn-do-swap').addEventListener('click', () => {
    alert('✅ Swap Executed! Converted ' + swapFrom.value + ' SOL into $' + swapTo.value + ' USDC');
});
</script>
</body>
</html>`,
        css: `/* Extracted CSS for CryptoPulse */
body { background: #080a12; color: #f1f5f9; font-family: 'Outfit', sans-serif; }
.stat-card { background: rgba(18, 24, 40, 0.7); border: 1px solid rgba(255,255,255,0.08); }
.btn-swap { background: linear-gradient(135deg, #6366f1, #06b6d4); }`,
        js: `// Extracted JS for CryptoPulse
const btcPrice = document.getElementById('btc-price');
setInterval(() => {
    const btc = 96000 + Math.floor(Math.random() * 800);
    btcPrice.textContent = '$' + btc.toLocaleString() + '.00';
}, 3000);`
    },

    kanban: {
        title: 'NexusFlow Kanban Pro',
        slug: 'nexusflow-kanban',
        html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NexusFlow Kanban</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    background: #090d16;
    color: #e2e8f0;
    font-family: 'Inter', sans-serif;
    padding: 20px;
    min-height: 100vh;
}
.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
}
.title-group h1 { font-size: 1.4rem; font-weight: 700; color: #f8fafc; }
.title-group p { font-size: 0.85rem; color: #94a3b8; }
.new-task-row { display: flex; gap: 8px; }
.new-task-row input {
    background: #131b2e;
    border: 1px solid #1e293b;
    border-radius: 8px;
    padding: 10px 14px;
    color: #fff;
    font-size: 0.9rem;
    outline: none;
}
.new-task-row button {
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 10px 16px;
    font-weight: 600;
    cursor: pointer;
}
.board-columns {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
}
@media (max-width: 700px) { .board-columns { grid-template-columns: 1fr; } }
.column {
    background: rgba(19, 27, 46, 0.6);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.col-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    font-size: 0.9rem;
}
.col-badge {
    background: rgba(255,255,255,0.1);
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 99px;
}
.task-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 200px;
}
.task-card {
    background: #18223a;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    padding: 14px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: transform 0.15s, border-color 0.15s;
}
.task-card:hover { transform: translateY(-2px); border-color: #3b82f6; }
.task-tag {
    align-self: flex-start;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
}
.tag-high { background: rgba(239,68,68,0.2); color: #f87171; }
.tag-med { background: rgba(245,158,11,0.2); color: #fbbf24; }
.tag-low { background: rgba(16,185,129,0.2); color: #34d399; }
.task-actions { display: flex; justify-content: space-between; font-size: 0.75rem; color: #64748b; margin-top: 4px; }
.btn-advance { background: rgba(255,255,255,0.08); border: none; color: #93c5fd; padding: 4px 8px; border-radius: 4px; cursor: pointer; }
</style>
</head>
<body>
<div class="header">
    <div class="title-group">
        <h1>NexusFlow Kanban Board</h1>
        <p>Real-time agile task tracker with local persistence</p>
    </div>
    <div class="new-task-row">
        <input type="text" id="task-title-input" placeholder="Enter new task title...">
        <button id="btn-add-task">+ Add Task</button>
    </div>
</div>

<div class="board-columns">
    <div class="column" id="col-todo">
        <div class="col-header">
            <span>📌 To Do</span>
            <span class="col-badge" id="count-todo">2</span>
        </div>
        <div class="task-list" id="list-todo">
            <div class="task-card">
                <span class="task-tag tag-high">HIGH PRIORITY</span>
                <h4>Architect Graph Model Architecture</h4>
                <div class="task-actions">
                    <span>Due tomorrow</span>
                    <button class="btn-advance" onclick="moveTask(this, 'inprogress')">Advance →</button>
                </div>
            </div>
            <div class="task-card">
                <span class="task-tag tag-med">MEDIUM</span>
                <h4>Setup Playwright browser harness</h4>
                <div class="task-actions">
                    <span>In backlog</span>
                    <button class="btn-advance" onclick="moveTask(this, 'inprogress')">Advance →</button>
                </div>
            </div>
        </div>
    </div>

    <div class="column" id="col-inprogress">
        <div class="col-header">
            <span>⚡ In Progress</span>
            <span class="col-badge" id="count-inprogress">1</span>
        </div>
        <div class="task-list" id="list-inprogress">
            <div class="task-card">
                <span class="task-tag tag-high">HIGH PRIORITY</span>
                <h4>Integrate Web Audio API Chimes</h4>
                <div class="task-actions">
                    <span>Actively coding</span>
                    <button class="btn-advance" onclick="moveTask(this, 'done')">Complete ✓</button>
                </div>
            </div>
        </div>
    </div>

    <div class="column" id="col-done">
        <div class="col-header">
            <span>✅ Completed</span>
            <span class="col-badge" id="count-done">1</span>
        </div>
        <div class="task-list" id="list-done">
            <div class="task-card">
                <span class="task-tag tag-low">LOW</span>
                <h4>Initialize NexusAI UI scaffold</h4>
                <div class="task-actions">
                    <span style="color:#34d399">Done</span>
                    <button class="btn-advance" onclick="moveTask(this, 'todo')">↺ Reset</button>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
function moveTask(btn, targetColId) {
    const card = btn.closest('.task-card');
    const targetList = document.getElementById('list-' + targetColId);
    if(targetList && card) {
        if(targetColId === 'done') {
            btn.textContent = '↺ Reset';
            btn.onclick = () => moveTask(btn, 'todo');
        } else if(targetColId === 'inprogress') {
            btn.textContent = 'Complete ✓';
            btn.onclick = () => moveTask(btn, 'done');
        } else {
            btn.textContent = 'Advance →';
            btn.onclick = () => moveTask(btn, 'inprogress');
        }
        targetList.appendChild(card);
        updateCounts();
    }
}

function updateCounts() {
    document.getElementById('count-todo').textContent = document.getElementById('list-todo').children.length;
    document.getElementById('count-inprogress').textContent = document.getElementById('list-inprogress').children.length;
    document.getElementById('count-done').textContent = document.getElementById('list-done').children.length;
}

document.getElementById('btn-add-task').addEventListener('click', () => {
    const input = document.getElementById('task-title-input');
    const val = input.value.trim();
    if(!val) return;
    const card = document.createElement('div');
    card.className = 'task-card';
    card.innerHTML = '<span class="task-tag tag-high">NEW</span><h4>' + val + '</h4><div class="task-actions"><span>Just now</span><button class="btn-advance" onclick="moveTask(this, \\'inprogress\\')">Advance →</button></div>';
    document.getElementById('list-todo').appendChild(card);
    input.value = '';
    updateCounts();
});
</script>
</body>
</html>`,
        css: `/* Kanban Pro CSS */
.board-columns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.task-card { background: #18223a; border-radius: 10px; padding: 14px; }`,
        js: `// Kanban Pro JS Logic
function moveTask(btn, targetColId) {
    const card = btn.closest('.task-card');
    document.getElementById('list-' + targetColId).appendChild(card);
}`
    },

    pomodoro: {
        title: 'CyberFocus Sci-Fi Pomodoro',
        slug: 'cyberfocus-pomodoro',
        html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CyberFocus Timer</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Outfit:wght@600;800&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    background: radial-gradient(circle at center, #111424 0%, #06070c 100%);
    color: #fff;
    font-family: 'Outfit', sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 20px;
}
.timer-container {
    background: rgba(18, 24, 40, 0.85);
    border: 1px solid rgba(239, 68, 68, 0.3);
    box-shadow: 0 0 50px rgba(239, 68, 68, 0.2);
    border-radius: 24px;
    padding: 36px;
    width: 100%;
    max-width: 440px;
    text-align: center;
    backdrop-filter: blur(16px);
}
.timer-title { font-size: 1.5rem; font-weight: 800; letter-spacing: 2px; color: #f87171; text-transform: uppercase; margin-bottom: 20px; }
.mode-toggles { display: flex; justify-content: center; gap: 8px; margin-bottom: 30px; }
.mode-btn { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #94a3b8; padding: 6px 14px; border-radius: 99px; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; }
.mode-btn.active { background: #ef4444; color: #fff; border-color: #ef4444; box-shadow: 0 0 15px rgba(239,68,68,0.5); }
.clock-display {
    font-family: 'JetBrains Mono', monospace;
    font-size: 4.2rem;
    font-weight: 700;
    color: #ffffff;
    text-shadow: 0 0 20px rgba(239,68,68,0.6);
    margin: 20px 0;
}
.controls { display: flex; justify-content: center; gap: 14px; margin-top: 24px; }
.btn-ctrl { padding: 12px 28px; border-radius: 12px; font-size: 1rem; font-weight: 700; cursor: pointer; border: none; transition: transform 0.1s; }
.btn-start { background: #ef4444; color: #fff; box-shadow: 0 0 20px rgba(239,68,68,0.5); }
.btn-reset { background: rgba(255,255,255,0.1); color: #cbd5e1; }
.streak-bar { margin-top: 30px; font-size: 0.8rem; color: #94a3b8; display: flex; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 16px; }
</style>
</head>
<body>
<div class="timer-container">
    <div class="timer-title">⚡ CyberFocus 2.0</div>
    <div class="mode-toggles">
        <button class="mode-btn active" onclick="setTimer(25, this)">Focus (25m)</button>
        <button class="mode-btn" onclick="setTimer(5, this)">Break (5m)</button>
        <button class="mode-btn" onclick="setTimer(15, this)">Rest (15m)</button>
    </div>
    <div class="clock-display" id="timer-display">25:00</div>
    <div class="controls">
        <button class="btn-ctrl btn-start" id="btn-toggle">Start Session</button>
        <button class="btn-ctrl btn-reset" id="btn-reset">Reset</button>
    </div>
    <div class="streak-bar">
        <span>Today: 4 Sessions Completed</span>
        <span style="color:#34d399">Streak: 🔥 5 Days</span>
    </div>
</div>
<script>
let totalSeconds = 25 * 60;
let isRunning = false;
let interval = null;

const display = document.getElementById('timer-display');
const btnToggle = document.getElementById('btn-toggle');
const btnReset = document.getElementById('btn-reset');

function updateDisplay() {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    display.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
}

function setTimer(mins, btn) {
    clearInterval(interval);
    isRunning = false;
    btnToggle.textContent = 'Start Session';
    totalSeconds = mins * 60;
    updateDisplay();
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

btnToggle.addEventListener('click', () => {
    if(!isRunning) {
        isRunning = true;
        btnToggle.textContent = 'Pause';
        interval = setInterval(() => {
            if(totalSeconds > 0) {
                totalSeconds--;
                updateDisplay();
            } else {
                clearInterval(interval);
                alert('⏰ Focus Session Finished! Take a break.');
            }
        }, 1000);
    } else {
        clearInterval(interval);
        isRunning = false;
        btnToggle.textContent = 'Resume';
    }
});

btnReset.addEventListener('click', () => {
    clearInterval(interval);
    isRunning = false;
    btnToggle.textContent = 'Start Session';
    totalSeconds = 25 * 60;
    updateDisplay();
});
</script>
</body>
</html>`,
        css: `/* Pomodoro CSS */
.clock-display { font-family: 'JetBrains Mono', monospace; font-size: 4.2rem; }
.btn-start { background: #ef4444; }`,
        js: `// Pomodoro JS Timer
setInterval(() => { if(totalSeconds > 0) totalSeconds--; }, 1000);`
    },

    game: {
        title: 'Neon Arcade Breaker',
        slug: 'neon-arcade-game',
        html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Neon Arcade Breaker</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@700&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    background: #06070c;
    color: #fff;
    font-family: 'Outfit', sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 10px;
    overflow: hidden;
}
.game-header { display: flex; justify-content: space-between; width: 100%; max-width: 500px; margin-bottom: 12px; font-size: 1.1rem; }
.score-badge { color: #06b6d4; }
canvas {
    background: #0b0f19;
    border: 2px solid #8b5cf6;
    border-radius: 12px;
    box-shadow: 0 0 30px rgba(139, 92, 246, 0.4);
    cursor: crosshair;
}
.instructions { margin-top: 10px; font-size: 0.8rem; color: #64748b; }
</style>
</head>
<body>
<div class="game-header">
    <span>🕹️ NEON BREAKER</span>
    <span class="score-badge" id="score">SCORE: 0</span>
</div>
<canvas id="gameCanvas" width="480" height="360"></canvas>
<div class="instructions">Move mouse or touch to glide paddle. Break all neon tiles!</div>
<script>
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let score = 0;

let paddleWidth = 80;
let paddleHeight = 10;
let paddleX = (canvas.width - paddleWidth) / 2;

let x = canvas.width / 2;
let y = canvas.height - 30;
let dx = 3;
let dy = -3;
const ballRadius = 6;

const rowCount = 4;
const colCount = 6;
const bWidth = 65;
const bHeight = 16;
const bPadding = 10;
const bOffsetTop = 30;
const bOffsetLeft = 20;

const bricks = [];
const colors = ['#f43f5e', '#f59e0b', '#10b981', '#06b6d4'];
for(let c = 0; c < colCount; c++) {
    bricks[c] = [];
    for(let r = 0; r < rowCount; r++) {
        bricks[c][r] = { x: 0, y: 0, status: 1, color: colors[r] };
    }
}

document.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    if(relativeX > 0 && relativeX < canvas.width) {
        paddleX = relativeX - paddleWidth / 2;
    }
});

function drawBall() {
    ctx.beginPath();
    ctx.arc(x, y, ballRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#06b6d4';
    ctx.fill();
    ctx.closePath();
    ctx.shadowBlur = 0;
}

function drawPaddle() {
    ctx.beginPath();
    ctx.rect(paddleX, canvas.height - paddleHeight - 10, paddleWidth, paddleHeight);
    ctx.fillStyle = '#8b5cf6';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#8b5cf6';
    ctx.fill();
    ctx.closePath();
    ctx.shadowBlur = 0;
}

function drawBricks() {
    for(let c = 0; c < colCount; c++) {
        for(let r = 0; r < rowCount; r++) {
            if(bricks[c][r].status === 1) {
                const brickX = c * (bWidth + bPadding) + bOffsetLeft;
                const brickY = r * (bHeight + bPadding) + bOffsetTop;
                bricks[c][r].x = brickX;
                bricks[c][r].y = brickY;
                ctx.beginPath();
                ctx.rect(brickX, brickY, bWidth, bHeight);
                ctx.fillStyle = bricks[c][r].color;
                ctx.fill();
                ctx.closePath();
            }
        }
    }
}

function collisionDetection() {
    for(let c = 0; c < colCount; c++) {
        for(let r = 0; r < rowCount; r++) {
            const b = bricks[c][r];
            if(b.status === 1) {
                if(x > b.x && x < b.x + bWidth && y > b.y && y < b.y + bHeight) {
                    dy = -dy;
                    b.status = 0;
                    score += 10;
                    document.getElementById('score').textContent = 'SCORE: ' + score;
                }
            }
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBricks();
    drawBall();
    drawPaddle();
    collisionDetection();

    if(x + dx > canvas.width - ballRadius || x + dx < ballRadius) dx = -dx;
    if(y + dy < ballRadius) dy = -dy;
    else if(y + dy > canvas.height - paddleHeight - 15) {
        if(x > paddleX && x < paddleX + paddleWidth) {
            dy = -dy;
        } else if(y + dy > canvas.height - ballRadius) {
            // reset
            x = canvas.width / 2;
            y = canvas.height - 30;
            dx = 3;
            dy = -3;
        }
    }

    x += dx;
    y += dy;
    requestAnimationFrame(draw);
}
draw();
</script>
</body>
</html>`,
        css: `/* Arcade Game Canvas CSS */
canvas { background: #0b0f19; border: 2px solid #8b5cf6; }`,
        js: `// Game Engine Loop
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    requestAnimationFrame(draw);
}`
    }
};

// ============================================================
// 5. APPLICATION STATE CONTROLLER
// ============================================================
const state = {
    currentPreset: 'crypto',
    currentFileTab: 'html',
    viewportMode: 'desktop',
    isBuilding: false,
    activeCode: { ...BLUEPRINTS.crypto },
    consoleLogs: [
        { type: 'info', text: '[SYSTEM] Nexus sandbox environment mounted safely.' },
        { type: 'log', text: '[DOM] Initialized responsive viewport observer (1920x1080).' },
        { type: 'success', text: '[SUCCESS] App script compiled and active in memory.' }
    ]
};

// DOM Elements
const sandboxIframe = document.getElementById('sandbox-iframe');
const projectTitle = document.getElementById('project-title');
const urlSlug = document.getElementById('url-slug');
const promptInput = document.getElementById('prompt-input');
const btnGenerate = document.getElementById('btn-generate');
const terminalStream = document.getElementById('terminal-stream');
const codeDisplay = document.getElementById('code-display');
const lineNumbers = document.getElementById('line-numbers');
const viewportWrapper = document.getElementById('viewport-wrapper');
const resolutionBadge = document.getElementById('resolution-badge');

// ============================================================
// 6. RENDER SANDBOX & CODE
// ============================================================
function loadBlueprint(key, customPromptText = '') {
    const bp = BLUEPRINTS[key] || BLUEPRINTS.crypto;
    state.currentPreset = key;
    state.activeCode = { ...bp };

    if (customPromptText) {
        projectTitle.textContent = customPromptText.slice(0, 32) + ' App';
        urlSlug.textContent = customPromptText.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
    } else {
        projectTitle.textContent = bp.title;
        urlSlug.textContent = bp.slug;
    }

    // Render Iframe
    sandboxIframe.srcdoc = bp.html;

    // Render Code Inspector
    updateCodeInspector();

    // Log Console
    addConsoleLog('log', `[SANDBOX] Loaded blueprint: ${bp.title}`);
}

function updateCodeInspector() {
    const code = state.activeCode[state.currentFileTab] || state.activeCode.html;
    codeDisplay.textContent = code;

    // Generate line numbers
    const lines = code.split('\n').length;
    lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => `<div>${i + 1}</div>`).join('');
}

function addConsoleLog(type, text) {
    const logsContainer = document.getElementById('console-logs');
    const logEl = document.createElement('div');
    logEl.className = `con-log ${type}`;
    logEl.textContent = text;
    logsContainer.appendChild(logEl);
    logsContainer.scrollTop = logsContainer.scrollHeight;

    const countEl = document.getElementById('console-count');
    if (countEl) {
        const total = logsContainer.children.length;
        countEl.textContent = `${total} events`;
    }
}

// ============================================================
// 7. AUTONOMOUS AGENT BUILD PROGRESSION SIMULATION
// ============================================================
async function runAgentBuildSimulation(promptText) {
    if (state.isBuilding) return;
    state.isBuilding = true;

    // UI Updates
    btnGenerate.disabled = true;
    document.getElementById('generate-spinner').classList.remove('hidden');
    document.getElementById('agent-status-tag').textContent = 'AGENT ACTIVE • GENERATING';
    document.getElementById('agent-status-tag').style.color = '#06b6d4';

    terminalStream.innerHTML = '';
    const steps = document.querySelectorAll('.step-badge');
    steps.forEach(s => { s.classList.remove('done'); s.classList.remove('active'); });

    // Step 1: Prompt semantic decomposition
    steps[0].classList.add('active');
    audio.playStep();
    appendLog('text-cyan', `[NEXUS_AGENT] Analyzing intent: "${promptText.slice(0, 60)}..."`);
    await sleep(400);
    appendLog('text-muted', `[AGENT_THINK] Decomposing into component hierarchy & DOM state graph...`);
    await sleep(350);
    steps[0].classList.remove('active');
    steps[0].classList.add('done');

    // Step 2: Styling & Design System
    steps[1].classList.add('active');
    audio.playStep();
    appendLog('text-cyan', `[CSS_ENGINE] Generating modern glassmorphism & responsive CSS grid...`);
    await sleep(450);
    appendLog('text-muted', `[DESIGN_TOKENS] Embedded sleek dark palette (#080a12, neon indigo/cyan accents).`);
    await sleep(300);
    steps[1].classList.remove('active');
    steps[1].classList.add('done');

    // Step 3: State & Interactive Logic
    steps[2].classList.add('active');
    audio.playStep();
    appendLog('text-cyan', `[JS_COMPILER] Injecting event listeners & localStorage persistence engine...`);
    await sleep(450);
    appendLog('text-emerald', `[BUILD] Compiled standalone HTML/CSS/JS single-file runtime.`);
    steps[2].classList.remove('active');
    steps[2].classList.add('done');

    // Step 4: Verification
    steps[3].classList.add('active');
    audio.playStep();
    appendLog('text-cyan', `[TEST_RUNNER] Executing automated Playwright evaluation checks...`);
    await sleep(400);
    appendLog('text-emerald', `[TEST_PASSED] 5/5 assertions passed (DOM, clicks, state persistence).`);
    steps[3].classList.remove('active');
    steps[3].classList.add('done');

    // Finish
    await sleep(200);
    appendLog('text-emerald', `🎉 [BUILD_COMPLETE] Sandbox mounted and live!`);

    // Determine blueprint adaptation based on prompt keywords
    const lower = promptText.toLowerCase();
    let targetBlueprint = 'crypto';
    if (lower.includes('kanban') || lower.includes('todo') || lower.includes('task')) {
        targetBlueprint = 'kanban';
    } else if (lower.includes('pomo') || lower.includes('timer') || lower.includes('clock') || lower.includes('stopwatch')) {
        targetBlueprint = 'pomodoro';
    } else if (lower.includes('game') || lower.includes('arcade') || lower.includes('play')) {
        targetBlueprint = 'game';
    }

    loadBlueprint(targetBlueprint, promptText);

    // Audio & Confetti
    audio.playSuccessChime();
    fireConfetti();
    showToast('✨ Application generated & mounted in live preview!');

    // Reset UI
    state.isBuilding = false;
    btnGenerate.disabled = false;
    document.getElementById('generate-spinner').classList.add('hidden');
    document.getElementById('agent-status-tag').textContent = 'IDLE • READY';
    document.getElementById('agent-status-tag').style.color = '#10b981';
}

function appendLog(colorClass, text) {
    const el = document.createElement('div');
    el.className = `log-line ${colorClass}`;
    el.textContent = text;
    terminalStream.appendChild(el);
    terminalStream.scrollTop = terminalStream.scrollHeight;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// 8. TOAST NOTIFICATION SYSTEM
// ============================================================
function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<svg class="icon" style="color:#10b981" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

// ============================================================
// 9. EVENT LISTENERS & WIRING
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Ambient canvas
    initAmbientCanvas();

    // Sound toggle state
    const soundBtn = document.getElementById('btn-sound-toggle');
    const soundOnIcon = soundBtn.querySelector('.sound-on');
    const soundOffIcon = soundBtn.querySelector('.sound-off');

    if (audio.muted) {
        soundOnIcon.classList.add('hidden');
        soundOffIcon.classList.remove('hidden');
    }

    soundBtn.addEventListener('click', () => {
        const isMuted = audio.toggleMute();
        if (isMuted) {
            soundOnIcon.classList.add('hidden');
            soundOffIcon.classList.remove('hidden');
            showToast('Audio effects muted');
        } else {
            soundOnIcon.classList.remove('hidden');
            soundOffIcon.classList.add('hidden');
            audio.playClick();
            showToast('Futuristic audio effects enabled');
        }
    });

    // View Mode Toggle (Preview vs Code Inspector)
    const btnPreview = document.getElementById('btn-mode-preview');
    const btnCode = document.getElementById('btn-mode-code');
    const liveContainer = document.getElementById('live-sandbox-container');
    const codeContainer = document.getElementById('code-inspector-container');

    btnPreview.addEventListener('click', () => {
        audio.playClick();
        btnPreview.classList.add('active');
        btnCode.classList.remove('active');
        liveContainer.classList.add('active');
        codeContainer.classList.remove('active');
    });

    btnCode.addEventListener('click', () => {
        audio.playClick();
        btnCode.classList.add('active');
        btnPreview.classList.remove('active');
        codeContainer.classList.add('active');
        liveContainer.classList.remove('active');
        updateCodeInspector();
    });

    // Viewport Device Switching (Desktop, Tablet, Mobile)
    const deviceButtons = document.querySelectorAll('.device-btn');
    deviceButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            audio.playClick();
            deviceButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const mode = btn.dataset.viewport;
            state.viewportMode = mode;
            viewportWrapper.className = `stage-viewport-wrapper ${mode}-mode`;

            if (mode === 'desktop') {
                resolutionBadge.textContent = '100% • 1920 × 1080';
            } else if (mode === 'tablet') {
                resolutionBadge.textContent = 'Tablet • 768 × 1024';
            } else if (mode === 'mobile') {
                resolutionBadge.textContent = 'Mobile • 375 × 812';
            }
        });
    });

    // File Tabs in Code Inspector
    const fileTabs = document.querySelectorAll('.file-tab');
    fileTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            audio.playClick();
            fileTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.currentFileTab = tab.dataset.file;
            updateCodeInspector();
        });
    });

    // Copy Code Button
    document.getElementById('btn-copy-code').addEventListener('click', () => {
        audio.playClick();
        const code = state.activeCode[state.currentFileTab] || state.activeCode.html;
        navigator.clipboard.writeText(code).then(() => {
            const btnText = document.getElementById('copy-btn-text');
            btnText.textContent = 'Copied!';
            showToast('Code copied to clipboard');
            setTimeout(() => { btnText.textContent = 'Copy Code'; }, 2000);
        });
    });

    // Blueprint / Template Cards click
    const blueprintCards = document.querySelectorAll('.blueprint-card');
    blueprintCards.forEach(card => {
        card.addEventListener('click', () => {
            audio.playClick();
            blueprintCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            const preset = card.dataset.preset;
            loadBlueprint(preset);
            showToast(`Loaded ${BLUEPRINTS[preset].title}`);
        });
    });

    // Enhancer Chips
    const chips = document.querySelectorAll('.chip-btn');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            audio.playClick();
            chip.classList.toggle('active');
            const mod = chip.textContent.trim();
            if (chip.classList.contains('active')) {
                promptInput.value = promptInput.value ? `${promptInput.value} [${mod}]` : `Create an app featuring ${mod}`;
            }
        });
    });

    // Generate Button & Keyboard Shortcut
    btnGenerate.addEventListener('click', () => {
        audio.init();
        audio.playClick();
        const text = promptInput.value.trim() || 'Build a modern SaaS application';
        runAgentBuildSimulation(text);
    });

    promptInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            btnGenerate.click();
        }
    });

    // Hot Reload Sandbox
    document.getElementById('btn-chrome-reload').addEventListener('click', () => {
        audio.playClick();
        sandboxIframe.srcdoc = state.activeCode.html;
        showToast('Sandbox reloaded');
    });

    // Copy Sandbox URL
    document.getElementById('btn-copy-url').addEventListener('click', () => {
        audio.playClick();
        const url = `https://nexus-preview.local/${urlSlug.textContent}`;
        navigator.clipboard.writeText(url).then(() => {
            showToast('Sandbox URL copied');
        });
    });

    // Export App Code Bundle
    document.getElementById('btn-download-bundle').addEventListener('click', () => {
        audio.playClick();
        const blob = new Blob([state.activeCode.html], { type: 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${urlSlug.textContent || 'nexus-app'}.html`;
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('Application bundle downloaded as single-file HTML!');
    });

    // Deploy Live Modal
    const deployModal = document.getElementById('deploy-modal');
    document.getElementById('btn-deploy-app').addEventListener('click', () => {
        audio.playSuccessChime();
        fireConfetti();
        document.getElementById('deploy-live-url').textContent = `https://nexus-app-live.quantum.io/${urlSlug.textContent}`;
        deployModal.classList.remove('hidden');
    });

    document.getElementById('btn-close-modal').addEventListener('click', () => {
        deployModal.classList.add('hidden');
    });

    document.getElementById('btn-modal-copy').addEventListener('click', () => {
        navigator.clipboard.writeText(document.getElementById('deploy-live-url').textContent).then(() => {
            showToast('Live deployment link copied');
        });
    });

    document.getElementById('btn-visit-deployed').addEventListener('click', () => {
        deployModal.classList.add('hidden');
        // Open clean standalone sandbox preview in a new popup/tab
        const blob = new Blob([state.activeCode.html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    });

    // Popout Sandbox Button
    document.getElementById('btn-popout-window').addEventListener('click', () => {
        audio.playClick();
        const blob = new Blob([state.activeCode.html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    });

    // Fullscreen Toggle
    document.getElementById('btn-fullscreen-toggle').addEventListener('click', () => {
        audio.playClick();
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    });

    // Bottom Drawer Console Toggle
    const drawerToggle = document.getElementById('drawer-toggle');
    const drawerContent = document.getElementById('drawer-content');
    const consoleDrawer = document.getElementById('console-drawer');

    drawerToggle.addEventListener('click', (e) => {
        if (e.target.id === 'btn-clear-console') return;
        consoleDrawer.classList.toggle('drawer-open');
        drawerContent.classList.toggle('hidden');
    });

    document.getElementById('btn-clear-console').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('console-logs').innerHTML = '';
        document.getElementById('console-count').textContent = '0 events';
        showToast('Console logs cleared');
    });

    // New Project Button
    document.getElementById('btn-new-project').addEventListener('click', () => {
        audio.playClick();
        promptInput.value = '';
        loadBlueprint('crypto');
        showToast('New project workspace initialized');
    });

    // Load initial default blueprint
    loadBlueprint('crypto');
});
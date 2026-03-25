/**
 * PLANİGO - Confetti Animations
 */

/**
 * CSS particle burst (uses #confetti-overlay element).
 */
export function showConfetti() {
    const overlay = document.getElementById('confetti-overlay');
    if (!overlay) return;

    overlay.classList.remove('hidden');

    const burst = overlay.querySelector('.confetti-burst');
    if (burst) {
        burst.innerHTML = '';
        const colors = ['#9CAF88', '#A3C14A', '#FF8C42', '#A855F7', '#3B82F6', '#F43F5E', '#FBBF24'];
        for (let i = 0; i < 50; i++) {
            const particle = document.createElement('div');
            particle.className = 'confetti-particle';
            particle.style.setProperty('--x', `${(Math.random() - 0.5) * 400}px`);
            particle.style.setProperty('--y', `${-Math.random() * 500 - 100}px`);
            particle.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
            particle.style.setProperty('--delay', `${Math.random() * 0.3}s`);
            particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            burst.appendChild(particle);
        }
    }

    setTimeout(() => overlay.classList.add('hidden'), 2500);
}

/**
 * Canvas-based confetti rain (uses #confetti-canvas element).
 */
export function launchConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = Array.from({ length: 120 }, () => ({
        x:     Math.random() * canvas.width,
        y:     -20 - Math.random() * 100,
        w:     8 + Math.random() * 8,
        h:     5 + Math.random() * 5,
        color: ['#A3C14A', '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'][Math.floor(Math.random() * 7)],
        vx:    (Math.random() - 0.5) * 4,
        vy:    2 + Math.random() * 4,
        rot:   Math.random() * Math.PI * 2,
        vr:    (Math.random() - 0.5) * 0.2,
        alive: true
    }));

    let frame = 0;
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let anyAlive = false;
        for (const p of pieces) {
            if (!p.alive) continue;
            p.x  += p.vx;
            p.y  += p.vy;
            p.vy += 0.07;
            p.rot += p.vr;
            if (p.y > canvas.height + 20) { p.alive = false; continue; }
            anyAlive = true;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        }
        frame++;
        if (anyAlive && frame < 200) {
            requestAnimationFrame(draw);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.style.display = 'none';
        }
    }
    draw();
}

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { AudioEngine } from './audio.js';
import { createChunk, cleanupChunks, spawnExit, checkCollisions, fragments, activeChunks, CHUNK_SIZE, RENDER_DISTANCE } from './world.js';
import { createStalker, updateStalker } from './enemy.js';

// ================= INITIALIZATION =================
const scene = new THREE.Scene();

const fogColor = 0x0a0a0a; 
scene.background = new THREE.Color(fogColor);
scene.fog = new THREE.FogExp2(fogColor, 0.09);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 60);
const renderer = new THREE.WebGLRenderer({ antialias: true }); 
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const player = new THREE.Group();
scene.add(player);
player.add(camera);
camera.position.y = 1.7;

// --- ÉCLAIRAGE TAMISÉ ---
const flashlight = new THREE.SpotLight(0xffffee, 2.5, 35, Math.PI / 5, 0.4);
flashlight.position.set(0.2, -0.2, 0);
flashlight.target.position.set(0, 0, -5);
camera.add(flashlight);
camera.add(flashlight.target);

const hemiLight = new THREE.HemisphereLight( 0x222233, 0x050505, 0.35 );
scene.add( hemiLight );
scene.add(new THREE.AmbientLight(0x404040, 0.2));

const guideGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);
const guideLine = new THREE.Line(guideGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }));
guideLine.frustumCulled = false; guideLine.visible = false;
scene.add(guideLine);

// --- GENERATION DU MONDE INITIAL (Pour pouvoir spawn le monstre sans mur) ---
for (let x = -RENDER_DISTANCE; x <= RENDER_DISTANCE; x++) {
    for (let z = -RENDER_DISTANCE; z <= RENDER_DISTANCE; z++) {
        createChunk(x, z, scene, false, 0);
    }
}

// --- SPAWN SÉCURISÉ DU STALKER ---
let stalker = null;

function spawnStalkerSafe() {
    let validPosition = false;
    let attempts = 0;
    const pos = new THREE.Vector3();

    while (!validPosition && attempts < 50) {
        attempts++;
        // Spawn à distance (15-25m) dans n'importe quelle direction
        const angle = Math.random() * Math.PI * 2;
        const dist = 15 + Math.random() * 10;
        
        pos.set(
            player.position.x + Math.cos(angle) * dist,
            0,
            player.position.z + Math.sin(angle) * dist
        );

        // On vérifie qu'il n'y a pas de mur à cet endroit (avec marge de 1.0)
        if (!checkCollisions(pos, 1.0)) {
            validPosition = true;
        }
    }

    // Fallback: Si on ne trouve rien, on le met loin sur l'axe X (zone souvent vide dans les algos)
    if (!validPosition) {
        pos.set(player.position.x + 20, 0, player.position.z);
    }

    return createStalker(scene, pos);
}

stalker = spawnStalkerSafe();

// ================= GAME STATE =================
let fragmentsCollected = 0;
let gameOver = false;
let exitSpawned = false;
// MODIFIÉ : 90 secondes (1m30) pour s'enfuir
let timeLeft = 90.00;
const EXIT_POS = new THREE.Vector3(0, 0, 0);

// ================= CONTROLS =================
const keys = {};
let yaw = 0, pitch = 0;
let stamina = 100, canSprint = true;

window.onkeydown = e => keys[e.key.toLowerCase()] = true;
window.onkeyup = e => keys[e.key.toLowerCase()] = false;

document.body.onclick = () => {
    if(gameOver) return;
    document.body.requestPointerLock();
    AudioEngine.init();
    document.getElementById("ui").style.opacity = 0;
};

window.onmousemove = e => {
    if (document.pointerLockElement && !gameOver) {
        yaw -= e.movementX * 0.002;
        pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.002));
        camera.rotation.x = pitch;
        player.rotation.y = yaw;
    }
};

function triggerEnd(win) {
    if(gameOver) return;
    gameOver = true;
    document.exitPointerLock();
    
    // SCREAMER si on perd
    if (!win) {
        AudioEngine.playScreamer();
    } else {
        AudioEngine.stopAll();
    }
    
    const screen = document.getElementById("end-screen");
    screen.style.display = "flex";
    screen.className = win ? "win-screen" : "lose-screen";
    
    const title = document.getElementById("end-title");
    const sub = document.getElementById("end-sub");
    
    if (win) {
        title.innerText = "SUBJECT RELEASED";
        sub.innerText = "VITAL SIGNS STABLE. MEMORY WIPED.";
    } else {
        title.innerText = "CONSUMED";
        sub.innerText = "BIOLOGICAL MATERIAL RECYCLED.";
    }
}

// ================= LOOP =================
const clock = new THREE.Clock();
const prevPlayerPos = new THREE.Vector3();
let bobTimer = 0, stepPlayed = false;

function animate() {
    if (gameOver) return;
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    const time = clock.getElapsedTime();

    flashlight.intensity = 2.5 + Math.sin(time * 15) * 0.1;

    updateStalker(stalker, player, dt, time, camera, triggerEnd);

    fragments.forEach(frag => {
        if(frag.userData.core) {
            frag.userData.core.rotation.y = time * 2;
            frag.userData.cage.rotation.x = -time;
            frag.position.y = 1.2 + Math.sin(time * 3) * 0.2; 
        }
    });

    if (exitSpawned) {
        timeLeft -= dt;
        document.getElementById("timer").innerText = timeLeft.toFixed(2);
        
        // MODIFIÉ : Ajustement du panic overlay pour 90s
        const panicFactor = Math.max(0, (90 - timeLeft) / 90);
        document.getElementById("panic-overlay").style.opacity = panicFactor * 0.5;
        
        if(timeLeft < 20) {
            const shake = Math.random() * (panicFactor * 5);
            document.getElementById("timer-container").style.transform = `translateX(calc(-50% + ${shake}px)) translateY(${shake}px)`;
        }
        
        if (timeLeft <= 0) { timeLeft = 0; triggerEnd(false); }
    }

    prevPlayerPos.copy(player.position);
    
    if (!keys.shift) canSprint = true;
    let sprint = keys.shift && canSprint && stamina > 0;
    if (stamina <= 0) { sprint = false; canSprint = false; }
    
    // MODIFIÉ : Vitesse augmentée (10 pour sprint, 5.5 marche)
    const speed = sprint ? 10.0 : 5.5;
    
    // MODIFIÉ : Régénération Stamina 3.5x plus rapide (35) et consommation réduite (-18)
    stamina += sprint ? -18 * dt : 35 * dt; 
    stamina = Math.max(0, Math.min(100, stamina));
    
    document.getElementById("stamina-fill").style.width = stamina + "%";
    document.getElementById("stamina-fill").style.backgroundColor = canSprint ? "#c55" : "#300";

    const dir = new THREE.Vector3(
        (keys.a || keys.q ? -1 : 0) + (keys.d ? 1 : 0), 0,
        (keys.w || keys.z ? -1 : 0) + (keys.s ? 1 : 0)
    ).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

    if (dir.lengthSq() > 0) {
        // Bobbing ajusté pour la nouvelle vitesse
        bobTimer += dt * (sprint ? 16 : 10);
        camera.position.y = 1.7 + Math.sin(bobTimer) * (sprint ? 0.12 : 0.06);
        if (Math.sin(bobTimer) < -0.8 && !stepPlayed) {
            AudioEngine.playFootstep();
            stepPlayed = true;
        }
        if (Math.sin(bobTimer) > 0) stepPlayed = false;
    } else {
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.7, dt * 5);
    }

    player.position.x += dir.x * speed * dt;
    if(checkCollisions(player.position, 0.5)) player.position.x = prevPlayerPos.x;
    player.position.z += dir.z * speed * dt;
    if(checkCollisions(player.position, 0.5)) player.position.z = prevPlayerPos.z;

    for (let i = fragments.length - 1; i >= 0; i--) {
        if (player.position.distanceTo(fragments[i].position) < 1.5) {
            AudioEngine.collect();
            fragments[i].parent.remove(fragments[i]);
            fragments.splice(i, 1);
            fragmentsCollected++;
            document.getElementById("count").innerText = fragmentsCollected;

            if (fragmentsCollected === 5 && !exitSpawned) {
                exitSpawned = true;
                spawnExit(scene, EXIT_POS, AudioEngine);
                guideLine.visible = true;
                document.getElementById("hud").style.display = "none";
                document.getElementById("timer-container").style.display = "block";
            }
        }
    }

    if (guideLine.visible) {
        const pos = guideLine.geometry.attributes.position.array;
        pos[0] = player.position.x; pos[1] = 0.5; pos[2] = player.position.z;
        pos[3] = EXIT_POS.x; pos[4] = 0.5; pos[5] = EXIT_POS.z;
        guideLine.geometry.attributes.position.needsUpdate = true;
        if (player.position.distanceTo(EXIT_POS) < 2) triggerEnd(true);
    }

    const px = Math.floor(player.position.x / CHUNK_SIZE);
    const pz = Math.floor(player.position.z / CHUNK_SIZE);
    
    for (let x = -RENDER_DISTANCE; x <= RENDER_DISTANCE; x++) {
        for (let z = -RENDER_DISTANCE; z <= RENDER_DISTANCE; z++) {
            const k = `${px + x},${pz + z}`;
            if (!activeChunks.has(k)) createChunk(px + x, pz + z, scene, exitSpawned, fragmentsCollected);
        }
    }
    cleanupChunks(px, pz, scene);
    
    renderer.render(scene, camera);
}

animate();
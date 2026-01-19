import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

/* ================= TEXTURE GENERATION (REALISTIC CONCRETE) ================= */
function generateRealisticTexture(type) {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');

    const baseColor = type === 'wall' ? '#9a9a9a' : '#5a5a5a'; 
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 200000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const val = Math.random();
        ctx.fillStyle = val > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
        ctx.fillRect(x, y, 1, 1);
    }

    for (let i = 0; i < 50; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = Math.random() * 100 + 50;
        const grd = ctx.createRadialGradient(x, y, 1, x, y, r);
        grd.addColorStop(0, "rgba(60, 50, 40, 0.15)"); 
        grd.addColorStop(1, "rgba(60, 50, 40, 0)");
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    for(let i=0; i<20; i++) {
        ctx.beginPath();
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random()-0.5)*200, y + (Math.random()-0.5)*200);
        ctx.stroke();
    }

    for(let i=0; i<5; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = Math.random() * 20 + 5;
        const grd = ctx.createRadialGradient(x, y, 1, x, y, r);
        grd.addColorStop(0, "rgba(100, 0, 0, 0.4)"); 
        grd.addColorStop(1, "transparent");
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2); 
    return texture;
}

const wallTex = generateRealisticTexture('wall');
const floorTex = generateRealisticTexture('floor');

export const matWall = new THREE.MeshStandardMaterial({ 
    map: wallTex, color: 0xffffff, roughness: 0.8, metalness: 0.1
});

export const matFloor = new THREE.MeshStandardMaterial({ 
    map: floorTex, color: 0xffffff, roughness: 0.4, metalness: 0.2
});

/* ================= CHUNKS ================= */
export const colliders = [];
export const fragments = [];
export const activeChunks = new Map();
export const CHUNK_SIZE = 10;
export const RENDER_DISTANCE = 3;

function createFragmentMesh() {
    const group = new THREE.Group();
    const coreGeo = new THREE.OctahedronGeometry(0.2, 0);
    const coreMat = new THREE.MeshStandardMaterial({ 
        color: 0x00ffff, emissive: 0x0088aa, emissiveIntensity: 2,
        roughness: 0.1, metalness: 0.8
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);
    
    const cageGeo = new THREE.IcosahedronGeometry(0.4, 0);
    const cageMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.3 });
    const cage = new THREE.Mesh(cageGeo, cageMat);
    group.add(cage);
    
    const light = new THREE.PointLight(0x00ffff, 1, 6);
    group.add(light);
    
    group.userData.isFragment = true;
    group.userData.core = core; group.userData.cage = cage;
    return group;
}

export function createChunk(cx, cz, scene, exitSpawned, fragmentsCollected) {
    const group = new THREE.Group();
    const x = cx * CHUNK_SIZE;
    const z = cz * CHUNK_SIZE;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE), matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, 0, z);
    group.add(floor);

    group.userData.chunkColliders = [];
    
    const wallCount = Math.floor(Math.random() * 5) + 3;
    for (let i = 0; i < wallCount; i++) {
        if (cx === 0 && cz === 0 && Math.abs(x) < 3 && Math.abs(z) < 3) continue;

        const w = Math.random() > 0.5 ? Math.random() * 4 + 2 : 1;
        const d = w === 1 ? Math.random() * 4 + 2 : 1;
        const h = 5;

        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matWall);
        wall.position.set(x + (Math.random() - 0.5) * CHUNK_SIZE, h / 2, z + (Math.random() - 0.5) * CHUNK_SIZE);
        group.add(wall);
        
        colliders.push(wall);
        group.userData.chunkColliders.push(wall);
    }

    if (!exitSpawned && Math.random() > 0.85 && fragmentsCollected < 5) {
        if (cx !== 0 || cz !== 0) {
            const fragment = createFragmentMesh();
            fragment.position.set(x, 1.2, z);
            group.add(fragment);
            fragments.push(fragment);
        }
    }
    scene.add(group);
    activeChunks.set(`${cx},${cz}`, group);
}

export function cleanupChunks(px, pz, scene) {
    for (const [key, group] of activeChunks) {
        const [cx, cz] = key.split(',').map(Number);
        if (Math.abs(cx - px) > RENDER_DISTANCE || Math.abs(cz - pz) > RENDER_DISTANCE) {
            if (group.userData.chunkColliders) {
                group.userData.chunkColliders.forEach(wall => {
                    const index = colliders.indexOf(wall);
                    if (index > -1) colliders.splice(index, 1);
                });
            }
            group.children.forEach(child => {
                 if(child.userData.isFragment) {
                     const fIndex = fragments.indexOf(child);
                     if(fIndex > -1) fragments.splice(fIndex, 1);
                 }
            });
            scene.remove(group);
            activeChunks.delete(key);
        }
    }
}

export function spawnExit(scene, pos, AudioEngine) {
    AudioEngine.triggerAlarm();
    const doorGroup = new THREE.Group();
    doorGroup.position.copy(pos);

    const frameGeo = new THREE.BoxGeometry(3, 5, 0.5);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.y = 2.5;
    doorGroup.add(frame);

    const portalGeo = new THREE.PlaneGeometry(2.5, 4.5);
    const portalMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const portal = new THREE.Mesh(portalGeo, portalMat);
    portal.position.set(0, 2.5, 0.3);
    doorGroup.add(portal);

    const light = new THREE.PointLight(0xffffff, 5, 20);
    light.position.set(0, 2.5, 2);
    doorGroup.add(light);

    scene.add(doorGroup);
}

const tempBox = new THREE.Box3();
const entityBox = new THREE.Box3();

// MODIFIÉ : Ajout du paramètre 'radius' (defaut 0.5 pour le joueur)
// Le monstre utilise 0.25 pour ne pas cogner les murs
export function checkCollisions(entityPos, radius = 0.5) {
    entityBox.setFromCenterAndSize(entityPos.clone().setY(1), new THREE.Vector3(radius, 2, radius));
    for (const wall of colliders) {
        if (wall.position.distanceToSquared(entityPos) < 25) { 
            tempBox.setFromObject(wall);
            if (entityBox.intersectsBox(tempBox)) return true;
        }
    }
    return false;
}
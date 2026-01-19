import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { checkCollisions } from './world.js';
import { AudioEngine } from './audio.js';

// Accepte maintenant spawnPos
export function createStalker(scene, spawnPos) {
    const group = new THREE.Group();

    // MATERIAU: Viscères déchiquetés
    const matFlesh = new THREE.MeshStandardMaterial({
        color: 0x4a0000,      
        emissive: 0x220000,
        roughness: 0.0,       // Humide
        metalness: 0.4,
    });
    const matBone = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 });

    // CORPS
    const bodyGeo = new THREE.TorusKnotGeometry(0.5, 0.2, 100, 16);
    const body = new THREE.Mesh(bodyGeo, matFlesh);
    body.position.y = 1.5;
    body.scale.set(1, 1.5, 1); 
    group.add(body);
    group.userData.body = body;

    // TÊTE
    const headGroup = new THREE.Group();
    headGroup.position.y = 2.4;
    
    const skullGeo = new THREE.IcosahedronGeometry(0.35, 1);
    const skull = new THREE.Mesh(skullGeo, matBone);
    
    const posAttribute = skullGeo.attributes.position;
    for ( let i = 0; i < posAttribute.count; i ++ ) {
        const x = posAttribute.getX(i);
        const y = posAttribute.getY(i);
        const z = posAttribute.getZ(i);
        posAttribute.setXYZ(i, x*0.8, y*(1+Math.random()*0.5), z + (Math.random()-0.5)*0.1);
    }
    skullGeo.computeVertexNormals();
    headGroup.add(skull);

    // YEUX
    const eyeLight = new THREE.PointLight(0xff0000, 2, 5);
    eyeLight.position.z = 0.5;
    headGroup.add(eyeLight);

    group.add(headGroup);
    group.userData.head = headGroup;

    // MOUCHES
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(30);
    for(let i=0; i<30; i++) pPos[i] = (Math.random()-0.5)*2;
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({color: 0x000000, size: 0.05});
    const flies = new THREE.Points(pGeo, pMat);
    group.add(flies);
    group.userData.flies = flies;

    // POSITIONNEMENT SÉCURISÉ
    group.position.copy(spawnPos); 
    scene.add(group);
    
    group.userData.timeAlive = 0;
    group.userData.stuckTimer = 0; // Pour détecter s'il est coincé
    
    return group;
}

const prevPos = new THREE.Vector3();

export function updateStalker(stalker, player, dt, time, camera, triggerEndCallback) {
    if(!stalker) return;
    stalker.userData.timeAlive += dt;
    const ta = stalker.userData.timeAlive;

    // --- 1. Détection & Audio ---
    const toPlayer = new THREE.Vector3().subVectors(player.position, stalker.position);
    const distance = toPlayer.length();
    toPlayer.y = 0; toPlayer.normalize();

    let stressFactor = 1 - (distance / 20);
    if(stressFactor < 0) stressFactor = 0;
    AudioEngine.updateStress(stressFactor);

    // --- 2. Animation ---
    const breath = 1 + Math.sin(ta * 4) * 0.05;
    stalker.userData.body.scale.set(breath, breath * 1.5, breath);
    
    stalker.userData.head.rotation.y = Math.sin(ta) * 0.5;
    stalker.userData.head.rotation.z = Math.cos(ta * 0.5) * 0.2;

    stalker.userData.flies.rotation.y += dt;
    stalker.userData.flies.rotation.x += dt * 0.5;

    // --- 3. Déplacement Agressif & Fluide ---
    // Vitesse de base très élevée
    let speed = 6.0; 
    
    // Si on le regarde, il tremble mais ne ralentit presque plus (AGRESSIF)
    const playerDir = new THREE.Vector3();
    camera.getWorldDirection(playerDir);
    const dot = playerDir.dot(toPlayer.clone().negate());
    
    if (dot > 0.7) {
        // speed = 5.5; // Très léger ralentissement seulement
        stalker.children[0].position.x = (Math.random()-0.5)*0.15; // Tremble plus fort
    } else {
        stalker.children[0].position.x = 0;
    }

    if (distance > 1.2) {
        // Rotation fluide
        const targetRot = Math.atan2(toPlayer.x, toPlayer.z);
        let rotDiff = targetRot - stalker.rotation.y;
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        stalker.rotation.y += rotDiff * dt * 8; // Tourne plus vite

        prevPos.copy(stalker.position);

        // --- GLISSEMENT AMÉLIORÉ ---
        const moveX = toPlayer.x * speed * dt;
        const moveZ = toPlayer.z * speed * dt;
        
        // Rayon de collision REDUIT pour le monstre (0.25) vs joueur (0.5)
        // Cela lui permet de raser les murs sans s'arrêter
        const enemyRadius = 0.25;

        // 1. Essai X
        stalker.position.x += moveX;
        if (checkCollisions(stalker.position, enemyRadius)) {
            stalker.position.x = prevPos.x; // Bloqué en X
        }

        // 2. Essai Z (Indépendant de X, permet le glissement)
        stalker.position.z += moveZ;
        if (checkCollisions(stalker.position, enemyRadius)) {
            stalker.position.z = prevPos.z; // Bloqué en Z
        }

        // --- SYSTEME ANTI-STUCK ---
        // Si le monstre n'a presque pas bougé alors qu'il est loin
        const distMoved = stalker.position.distanceToSquared(prevPos);
        if (distMoved < 0.0001) {
            stalker.userData.stuckTimer += dt;
            if (stalker.userData.stuckTimer > 1.0) {
                // S'il est coincé 1 sec, on le "nudge" vers le joueur (téléportation triche)
                // pour le sortir du coin
                const jump = toPlayer.clone().multiplyScalar(0.5);
                stalker.position.add(jump);
                stalker.userData.stuckTimer = 0;
            }
        } else {
            stalker.userData.stuckTimer = 0;
        }
        
    } else {
        triggerEndCallback(false);
    }
}
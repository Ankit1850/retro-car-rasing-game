const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const speedDisplay = document.getElementById('speedDisplay');

const width = canvas.width;
const height = canvas.height;

// Game State
let speed = 0;
const maxSpeed = 300;
const accel = maxSpeed / 50;
const decel = maxSpeed / 50;
const braking = maxSpeed / 20;
const offRoadDecel = maxSpeed / 10;
const maxOffRoadSpeed = maxSpeed / 4;

let cameraDepth = 0.84;
let playerX = 0;
let playerZ = 0;
const segmentLength = 200;
let trackLength = 0;
const roadWidth = 2000;

// Input handling
const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

window.addEventListener('keydown', e => { if (keys.hasOwnProperty(e.code)) keys[e.code] = true; });
window.addEventListener('keyup', e => { if (keys.hasOwnProperty(e.code)) keys[e.code] = false; });

// Track Data
let segments = [];

const COLORS = {
    LIGHT: { road: '#6B6B6B', grass: '#10AA10', rumble: '#555555', lane: '#CCCCCC' },
    DARK:  { road: '#656565', grass: '#009A00', rumble: '#BB0000', lane: '#656565' }
};

function resetRoad() {
    segments = [];
    const numSegments = 1600;
    
    // Generate segments
    for (let n = 0; n < numSegments; n++) {
        let curve = 0;
        let y = 0;
        
        // Add some curves
        if (n > 100 && n < 300) curve = 0.5;
        if (n > 400 && n < 600) curve = -0.7;
        if (n > 700 && n < 900) curve = 0.8;
        if (n > 1100 && n < 1300) curve = -0.6;
        
        // Add some hills
        if (n > 200 && n < 400) y = Math.sin((n - 200) / 30.0) * 1500;
        if (n > 700 && n < 900) y = Math.sin((n - 700) / 20.0) * 2000;
        
        segments.push({
            index: n,
            p1: { world: { x: 0, y: y, z: n * segmentLength }, camera: {}, screen: {} },
            p2: { world: { x: 0, y: y, z: (n + 1) * segmentLength }, camera: {}, screen: {} },
            color: Math.floor(n / 3) % 2 ? COLORS.DARK : COLORS.LIGHT,
            curve: curve
        });
    }
    
    // Fix p2.y to connect smoothly to next segment's p1.y
    for (let n = 0; n < numSegments; n++) {
        if (n < numSegments - 1) {
            segments[n].p2.world.y = segments[n+1].p1.world.y;
        }
    }
    
    trackLength = segments.length * segmentLength;
}

// Project 3D coordinate to 2D screen coordinate
function project(p, cameraX, cameraY, cameraZ, cameraDepth, width, height, roadWidth) {
    p.camera.x = p.world.x - cameraX;
    p.camera.y = p.world.y - cameraY;
    p.camera.z = p.world.z - cameraZ;
    
    // Prevent division by zero
    if (p.camera.z === 0) p.camera.z = 1;
    
    p.screen.scale = cameraDepth / p.camera.z;
    p.screen.x = Math.round((width / 2) + (p.screen.scale * p.camera.x * width / 2));
    p.screen.y = Math.round((height / 2) - (p.screen.scale * p.camera.y * height / 2));
    p.screen.w = Math.round(p.screen.scale * roadWidth * width / 2);
}

function drawPolygon(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
}

function render() {
    // Clear screen
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, width, height);

    // Find the current base segment
    let baseSegment = segments[Math.floor(playerZ / segmentLength) % segments.length];
    let basePercent = (playerZ % segmentLength) / segmentLength;
    let playerY = baseSegment.p1.world.y + (baseSegment.p2.world.y - baseSegment.p1.world.y) * basePercent;
    
    let maxY = height; // Track highest Y to avoid drawing segments hidden behind hills
    let x = 0;
    let dx = 0;
    
    // Draw segments from back to front
    for (let n = 0; n < 300; n++) {
        let segment = segments[(baseSegment.index + n) % segments.length];
        segment.looped = segment.index < baseSegment.index;
        
        // Accumulate curves
        x += dx;
        dx += segment.curve;

        project(segment.p1, (playerX * roadWidth) - x, playerY + 1000, playerZ - (segment.looped ? trackLength : 0), cameraDepth, width, height, roadWidth);
        project(segment.p2, (playerX * roadWidth) - x - dx, playerY + 1000, playerZ - (segment.looped ? trackLength : 0), cameraDepth, width, height, roadWidth);
        
        // Culling: ignore segments behind camera or hidden behind hills
        if (segment.p1.camera.z <= cameraDepth || segment.p2.screen.y >= maxY) {
            continue;
        }
        
        maxY = segment.p1.screen.y;

        // Draw Grass
        ctx.fillStyle = segment.color.grass;
        ctx.fillRect(0, segment.p2.screen.y, width, segment.p1.screen.y - segment.p2.screen.y);
        
        // Draw Rumble Strip
        drawPolygon(ctx, 
            segment.p1.screen.x - segment.p1.screen.w * 1.2, segment.p1.screen.y,
            segment.p1.screen.x + segment.p1.screen.w * 1.2, segment.p1.screen.y,
            segment.p2.screen.x + segment.p2.screen.w * 1.2, segment.p2.screen.y,
            segment.p2.screen.x - segment.p2.screen.w * 1.2, segment.p2.screen.y,
            segment.color.rumble
        );
        
        // Draw Road
        drawPolygon(ctx, 
            segment.p1.screen.x - segment.p1.screen.w, segment.p1.screen.y,
            segment.p1.screen.x + segment.p1.screen.w, segment.p1.screen.y,
            segment.p2.screen.x + segment.p2.screen.w, segment.p2.screen.y,
            segment.p2.screen.x - segment.p2.screen.w, segment.p2.screen.y,
            segment.color.road
        );
        
        // Draw Lane Line
        if (segment.color.lane) {
            drawPolygon(ctx, 
                segment.p1.screen.x - segment.p1.screen.w * 0.05, segment.p1.screen.y,
                segment.p1.screen.x + segment.p1.screen.w * 0.05, segment.p1.screen.y,
                segment.p2.screen.x + segment.p2.screen.w * 0.05, segment.p2.screen.y,
                segment.p2.screen.x - segment.p2.screen.w * 0.05, segment.p2.screen.y,
                segment.color.lane
            );
        }
    }
    
    // Draw Player Car
    drawCar(baseSegment.curve);
}

function drawCar(curve) {
    // Draw a pixel-art style car using primitives
    const carWidth = 140;
    const carHeight = 60;
    const carX = (width / 2) - (carWidth / 2);
    // Add bounce to car based on speed and road
    const bounce = (speed > 0) ? Math.random() * 2 - 1 : 0;
    const carY = height - 100 + bounce;
    
    // Tires
    ctx.fillStyle = '#000000';
    ctx.fillRect(carX - 10, carY + 20, 25, 40); // Left tire
    ctx.fillRect(carX + carWidth - 15, carY + 20, 25, 40); // Right tire
    
    // Body (Red)
    ctx.fillStyle = '#D32F2F';
    ctx.fillRect(carX, carY, carWidth, carHeight);
    
    // Spoiler
    ctx.fillStyle = '#111';
    ctx.fillRect(carX - 5, carY - 10, carWidth + 10, 10);
    ctx.fillRect(carX + 10, carY, 5, 10);
    ctx.fillRect(carX + carWidth - 15, carY, 5, 10);
    
    // Windshield (Cyan)
    ctx.fillStyle = '#4FC3F7';
    ctx.beginPath();
    ctx.moveTo(carX + 20, carY + 10);
    ctx.lineTo(carX + carWidth - 20, carY + 10);
    ctx.lineTo(carX + carWidth - 30, carY - 15);
    ctx.lineTo(carX + 30, carY - 15);
    ctx.fill();

    // Tail lights
    ctx.fillStyle = '#FFEB3B'; // Brake lights yellow normally, red if braking
    if (keys.ArrowDown) ctx.fillStyle = '#FF0000';
    ctx.fillRect(carX + 10, carY + 20, 20, 15);
    ctx.fillRect(carX + carWidth - 30, carY + 20, 20, 15);
}

function update() {
    // Handle Input
    if (keys.ArrowUp) {
        speed += accel;
    } else if (keys.ArrowDown) {
        speed -= braking;
    } else {
        speed -= decel;
    }
    
    // Cap Speed
    speed = Math.max(0, Math.min(speed, maxSpeed));
    
    // Handle Off-road
    if ((playerX < -1 || playerX > 1) && speed > maxOffRoadSpeed) {
        speed -= offRoadDecel;
    }
    
    // Steering
    if (keys.ArrowLeft) {
        playerX -= 0.03 * (speed / maxSpeed);
    } else if (keys.ArrowRight) {
        playerX += 0.03 * (speed / maxSpeed);
    }
    
    // Centrifugal force on curves (pushes car outward)
    let baseSegment = segments[Math.floor(playerZ / segmentLength) % segments.length];
    playerX -= 0.015 * (speed / maxSpeed) * baseSegment.curve;
    
    // Boundary collision
    playerX = Math.max(-2, Math.min(playerX, 2));

    // Move forward
    playerZ += speed;
    
    // Loop track
    if (playerZ >= trackLength) {
        playerZ -= trackLength;
    }
    
    // Update UI (Convert generic speed units to km/h roughly)
    speedDisplay.innerText = Math.round((speed / maxSpeed) * 280); 

    // Render loop
    render();
    requestAnimationFrame(update);
}

// Initialize
resetRoad();
update();

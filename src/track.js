// ici la description de la piste
// image, géométrie du circuit, positions de départ, longueur, niveau de zoom etc
// en particulier le calcul de la sortie de route
export const TRACK = 0, LAWN = 1, WALL = 2

let sprites
export const tracks = [
    {
        id: 'star5',
        image: 'SuperMarioKartMapStarCup5.png',
        width: 1024, // taille de la piste en pixels
        height: 1024,
        top: 76, // position de la piste en pixels dans l'image
        left: 0,
        pxPerM: 8, // échelle de la carte: 8 pixels / m
        rollingResistance: [0.6, 3] // valeurs pour TRACK et LAWN
    },
    {
        id: 'mushroom2',
        image: 'SuperMarioKartMapMushroomCup2.png',
        width: 1024, // taille de la piste en pixels
        height: 1024,
        top: 76, // position de la piste en pixels dans l'image
        left: 0,
        pxPerM: 8, // échelle de la carte: 8 pixels / m
        rollingResistance: [0.6, 3] // valeurs pour TRACK et LAWN
    },
    {
        id: 'flower5',
        image: 'SuperMarioKartMapFlowerCup5.png',
        width: 1024, // taille de la piste en pixels
        height: 1024,
        top: 76, // position de la piste en pixels dans l'image
        left: 0,
        pxPerM: 8, // échelle de la carte: 8 pixels / m
        rollingResistance: [0.6, 3] // valeurs pour TRACK et LAWN
    }
]

async function loadImage (url, { skipTop = 0, canvas = document.createElement('canvas') } = {}) {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
            const w = canvas.width = img.width
            const h = canvas.height = img.height - skipTop
            const context = canvas.getContext('2d')
            context.drawImage(img, 0, skipTop, w, h, 0, 0, w, h);
            resolve(canvas)
        }
        img.onerror = reject
        img.src = url
    })
}

// un peu dommage, on garde 32 bits / pixel
function toChroma (pixels) {
    for (let i = 0; i < pixels.length; i += 4) {
        const max = Math.max(pixels[i], pixels[i+1], pixels[i+2])
        const min = Math.min(pixels[i], pixels[i+1], pixels[i+2])
        const chroma = max - min
        pixels[i] = pixels[i+1] = pixels[i+2] = chroma
    }
}

async function prepareSprites () {
    const canvas = await loadImage('src/assets/mario-sprites.png')
    const context2d = canvas.getContext('2d')
    const imageData = context2d.getImageData(0, 0, canvas.width, canvas.height)
    toChroma(imageData.data)
    context2d.putImageData(imageData, 0, 0)
    return { w: canvas.width, h: canvas.height, pixels: imageData.data }
}

// Mario : donne le pixel du milieu du devant de la ligne (elle fait 80 * 8 pixels)
function locateStartLine (pixels, W /* bytes */) {
    const imax = 1024 * W
    // y= [628-76 (star), 584-76 (mushroom), 501-76=425 (flower)]
    let i = 400 * W, width // on démarre à la ligne 500, c'est le plus haut de toutes les pistes
    while (!width && i < imax) {
        // cherche un pattern de damier
        while (i < imax && !(pixels[i] === 0 && pixels[i + 4] === 0 && pixels[i + 8] > 200 && pixels[i + 12] > 200)) i += 4
        let j = i + 16
        while (j < imax && pixels[j] === pixels[j - 16] && pixels[j + 4] === pixels[j - 12]) j += 8
        if (j - i > 300) width = (j - i) / 4
        else i += 4
    }
    return { x: (i%W)/4 + width/2 + 1, y: Math.floor(i/W), width }
}

// Prolonge la startLine sur les côtés jusqu'aux murs (en bleu à ce stade)
// pour éviter que les voitures gagnent un tour en contournant par la pelouse.
function extendStartLine (pixels, w, startLine) {
    const pos0 = (startLine.y * w + startLine.x) * 4
    let pos = pos0, xmin = startLine.x + 1, xmax = startLine.x - 1
    while (pixels[pos + 2] < 255) pos -= 4, xmin--
    pos = pos0
    while (pixels[pos + 2] < 255) pos += 4, xmax++
    startLine.left = xmin
    startLine.right = xmax
}

// Mario : donne les 8 positions de départ, dans l'ordre. Pixel du milieu du devant de la ligne (elle fait 24 ou 32 * 2)
function locateStartingPositions (pixels, W, startLine) {
    let i = (startLine.y + 10) * W + startLine.x * 4 // la ligne de départ fait déjà 10 de haut
    const dx = 16 * 4 // 16 pixels à gauche ou à droite
    const pos = []
    for (let z = 0; z < 200; z++) {
        let x
        // on scanne 2 colonnes sous la ligne de départ, sur le canal vert
        if (pixels[i - dx + 1] > 0xd0 || pixels[i - dx + 1] < 0x30) x = startLine.x - 16
        else if (pixels[i + dx + 1] > 0xd0 || pixels[i + dx + 1] < 0x30) x = startLine.x + 16
        if (x) {
            pos.push({ x, y: startLine.y + z + 10, width: 24 })
            i += W * 10
            z += 9
        } else i += W
    }
    return pos
}

function isSprite (pixels, x, y, w, sx, sy, sSize = 8) {
    const src = (y * w + x) * 4, srcLine = w * 4
    const spriteSrc = (sy * 32 + sx) * 4, spriteLine = 32 * 4
    for (let dy = 0; dy < sSize; dy++) {
        for (let dx = 0; dx < sSize; dx++) {
            const trackPixel = pixels[src + dy * srcLine + dx * 4]
            const spritePixel = sprites.pixels[spriteSrc + dy * spriteLine + dx * 4]
            if (trackPixel !== spritePixel) return false
        }
    }
    return true
}

function isWall (pixels, x, y, w) {
    return isSprite(pixels, x, y, w, 0, 0) ||
        isSprite(pixels, x, y, w, 8, 0) ||
        isSprite(pixels, x, y, w, 16, 0) ||
        isSprite(pixels, x, y, w, 24, 0)
}

const isItemBox = (pixels, x, y, w) => isSprite(pixels, x, y, w, 0, 8, 16)
const isCoin = (pixels, x, y, w) => isSprite(pixels, x, y, w, 16, 8)

function blueWalls (pixels, w, h) {
    for (let y = 0; y < h; y += 8)
        for (let x = 0; x < w; x += 8) {
            let size, blue
            if (isWall(pixels, x, y, w)) size = 8, blue = true
            else if (isItemBox(pixels, x, y, w)) size = 16
            else if (isCoin(pixels, x, y, w)) size = 16
            if (size) {
                const src = (y * w + x) * 4, srcLine = w * 4
                for (let dy = 0; dy < size; dy++)
                    for (let dx = 0; dx < size; dx++) {
                        const addr = src + dy * srcLine + dx * 4
                        pixels[addr] = pixels[addr + 1] = 0
                        pixels[addr + 2] = blue ? 255 : 0
                    }
            }
        }
}

function followTrackPath (pixels, w, startLine) {
    const dist = new Uint32Array(pixels.length / 4)
    const prev = new Uint32Array(pixels.length / 4)
    dist.fill(0xffffffff) // Infinity, genre
    const pos0 = startLine.y * w + startLine.x - startLine.width / 2 - 1
    const pos0Right = pos0 + startLine.width
    const queue = [] // fera environ 500 de taille max
    for (let x = 0; x < startLine.width; x++) {
        dist[pos0 + x] = 0 // l'avant de la ligne de départ
        dist[pos0 - w + x] = 1 // pour empêcher de partir vers le bas
        prev[pos0 - w + x] = pos0 + x
        pixels[(pos0 + x) * 4] = 255 // en rouge pour voir quand on toggle le canvas
        queue.push(pos0 - w + x)
    }

    // algo de remplissage de la piste qui est en bleu=0, à partir de la ligne de départ
    let d, endDist = Infinity, endPos
    while (queue.length) {
        const pos = queue.shift()
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
                // 1px en H/V, 1.414px en diagonale
                d = dist[pos] + (dx && dy ? 1414 : 1000)
                const p = pos + dy * w + dx
                if (pixels[p * 4 + 2] === 0 && d < dist[p]) {
                    dist[p] = d
                    prev[p] = pos
                    queue.push(p)
                }
                const justBelowStartLine = pos0 <= p && p < pos0Right
                const goingUp = dy === -1
                if (justBelowStartLine && goingUp && d < endDist) {
                    endDist = d
                    endPos = p
                    prev[p] = pos
                }
            }
    }

    // colorie le chemin ± le plus court en vert
    let pos = endPos
    d = endDist
    while (d) {
        pixels[pos * 4 + 1] = 255
        d = dist[pos = prev[pos]]
    }

    return {
        estimatedLengthPx: Math.floor(endDist / 1000), // on sait qu'on surestime un peu
        distanceMap: dist // renvoyer une fonction qui donne la distance en m pour (x, y), parce que là c'est raw
    }
}

function scanTrack (context2d) {
    const pixelData = context2d.getImageData(0, 0, 1024, 1024)
    const pixels = pixelData.data
    const startLine = locateStartLine(pixels, 1024 * 4)
    const startingPos = locateStartingPositions(pixels, 1024 * 4, startLine)
    // Noircit la piste
    toChroma(pixels)
    blueWalls(pixels, 1024, 1024)
    extendStartLine(pixels, 1024, startLine)
    const distanceData = followTrackPath(pixels, 1024, startLine)
    context2d.putImageData(pixelData, 0, 0)
    return {
        startLine,
        startingPos,
        line: 1024,
        ...distanceData,
        pixels
    }
}

export async function loadAndScanTrack (track, canvas) {
    if (track.startLine) return
    canvas = await loadImage(`src/assets/${track.image}`, { skipTop: 76, canvas })
    sprites = sprites || await prepareSprites()
    const trackGeometry = scanTrack(canvas.getContext('2d'))
    Object.assign(track, trackGeometry)
    track.estimatedLength = trackGeometry.estimatedLengthPx / track.pxPerM
    track.startLineLeft = track.startLine.left / track.pxPerM
    track.startLineRight = track.startLine.right / track.pxPerM
    track.startLineY = track.startLine.y / track.pxPerM
}

export function groundType (x, y, track) {
    const pos = Math.round(y * track.pxPerM) * track.line * 4 + Math.round(x * track.pxPerM) * 4
    // canal bleu
    switch (track.pixels[pos + 2]) {
        case 0: return 0 // track
        case 255: return 2 // wall
        default: return 1 // lawn
    }
}

export function distanceFromStartLine ({ x, y }, track) {
    const xpx = Math.round(x * track.pxPerM)
    const ypx = Math.round(y * track.pxPerM)
    const pos = ypx * track.line + xpx
    const millipixels = track.distanceMap[pos]
    if (millipixels === 0xffffffff) return undefined // code pour hors piste
    return Math.round(millipixels / (1000 * track.pxPerM))
}

export function lapChangeTest (bumper, track) {
    if (bumper.x < track.startLineLeft || bumper.x > track.startLineRight) return 0
    // La startline est considérée dans le nouveau tour. Important pour ne pas avoir
    // de bug chelou quand une voiture oscille dessus.
    if (bumper.y > track.startLineY && bumper.prevy <= track.startLineY) return -1
    if (bumper.y <= track.startLineY && bumper.prevy > track.startLineY) return 1
    return 0
}

function obstacleDistance (x, y, rayx, rayy, track) { // en pixels
    let pos = (Math.round(y) * track.line + Math.round(x)) * 4
    let ground = track.pixels[pos + 2] // 0 (track) 255 (mur) autre (pelouse)
    let groundIsTrack = ground === 0
    const centerIsOnTrack = groundIsTrack
    let d = 0
    // au-delà de 50m on considère que c'est pareil que l'infini
    while (d < 50 && ground < 255 && groundIsTrack === centerIsOnTrack) {
        // avec un step de plus d'1m on trouve + vite mais parfois on saute un mur
        d++
        x += rayx
        y += rayy
        pos = (Math.round(y) * track.line + Math.round(x)) * 4
        ground = track.pixels[pos + 2]
        groundIsTrack = ground === 0
    }
    while (ground === 255 || groundIsTrack !== centerIsOnTrack) {
        d -= 0.125 // puisqu'on est en 8 px/m, le petit step fait 1/8m
        x -= rayx * 0.125
        y -= rayy * 0.125
        pos = (Math.round(y) * track.line + Math.round(x)) * 4
        ground = track.pixels[pos + 2]
        groundIsTrack = ground === 0
    }
    return centerIsOnTrack ? d : -d // en mètres
}

export function detectObstacles (car, track) {
    const x = car.x * track.pxPerM
    const y = car.y * track.pxPerM
    const ux = car.ux * track.pxPerM
    const uy = car.uy * track.pxPerM
    const diagx = (uy + ux) * Math.SQRT1_2
    const diagy = (uy - ux) * Math.SQRT1_2
    car.obstacles[0] = obstacleDistance(x, y, uy, -ux, track)
    car.obstacles[1] = obstacleDistance(x, y, diagx, diagy, track)
    car.obstacles[2] = obstacleDistance(x, y, ux, uy, track)
    car.obstacles[3] = obstacleDistance(x, y, -diagy, diagx, track)
    car.obstacles[4] = obstacleDistance(x, y, -uy, ux, track)
    window.car = car
    window.track = track
    window.detect={
        ux, uy,
        u: Math.hypot(ux,uy),
        diagx, diagy,
        diag: Math.hypot(diagx, diagy)
    }
}

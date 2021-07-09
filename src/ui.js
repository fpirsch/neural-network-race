import { serialize, structure } from './nn.js'
const QUARTER = Math.PI / 2
const DRIFT_SPRITE_CAPACITY = 200
const DRIFT_SPRITE_TTL = 10000
const DRIFT_SPRITE_DECAY = 1000
const osdEl = {}, controlEl = {}, debuggerEl = {}, nnDialogEl = {}
const driftSprites = []
let driftStartIndex = 0, driftSpriteCount = 0
let displayConfig = { rays: false }
const rayStyle = document.getElementsByClassName('rays')[0].style
const START_OSD_CAR = { speed: 0, lap: 0 }

const timeFormat = ms => (Math.round(ms / 10) / 100).toFixed(2)

let debuggedCar, debuggedCarIndex

export function responsive (...elements) {
    const container = document.getElementsByTagName('section')[0]

    const adjustHeight = () => {
        const bbox = container.getBoundingClientRect()
        const dim = Math.min(bbox.width, bbox.height)
        elements.forEach(el => el.style.transform = `scale(${dim / 1024})`)
    }

    adjustHeight()
    window.addEventListener('resize', adjustHeight)
}

// on utilise toujours le même sprite de pneus, c'est pas fou
function initDriftDisplay (trackEl) {
    if (driftSprites.length === 0) {
        const osd = trackEl.querySelector('.osd')
        for (let i = 0; i < DRIFT_SPRITE_CAPACITY; i++) {
            const spriteEl = document.createElement('div')
            spriteEl.className = `tires car-red-tires`
            spriteEl.style.opacity = 0
            trackEl.insertBefore(spriteEl, osd)
            driftSprites.push({ el: spriteEl, time: 0 })
        }
    }
}

function resetDriftDisplay (trackEl) {
    for (let i = 0; i < DRIFT_SPRITE_CAPACITY; i++) {
        driftSprites[i].el.style.opacity = 0
    }
    driftStartIndex = driftSpriteCount = 0
}

// On devrait assumer d'avoir un seul trackEl, et ne pas le passer en param
export function initDisplay (cars, track, trackEl) {
    rayStyle.display = displayConfig.rays ? 'unset' : 'none';
    Object.assign(osdEl, {
        speedInt: document.getElementById('speed-int'),
        speedFrac: document.getElementById('speed-frac'),
        lap: document.getElementById('osd-lap'),
        distance: document.getElementById('osd-dist'),
        time: document.getElementById('osd-time'),
        lastLap: document.getElementById('osd-last-lap'),
    })
    Object.assign(controlEl, {
        genNum: document.getElementById('gen-num'),
        genCount: document.getElementById('gen-count'),
        previous: document.getElementById('control-previous'),
        next: document.getElementById('control-next'),
    })
    Object.assign(debuggerEl, {
        container: document.getElementsByClassName('car-debugger')[0],
        nnButton: document.getElementById('car-debugger-nn'),
        content: document.getElementById('car-debugger-content'),
        carNum: document.getElementById('car-debugger-num'),
        model: document.getElementById('car-debugger-model'),
    })
    Object.assign(nnDialogEl, {
        title: document.getElementById('nn-dialog-title'),
        type: document.getElementById('nn-dialog-type'),
        layers: document.getElementById('nn-dialog-layers'),
        bias: document.getElementById('nn-dialog-bias'),
        activation: document.getElementById('nn-dialog-activation'),
        content: document.getElementById('nn-dialog-content'),
    })

    trackEl.className = `track track-${track.id}`
    initDriftDisplay(trackEl)
    const carDivs = ensureCarsDisplayed(cars.length, trackEl)
    cars.forEach((car, i) => car.div = carDivs[i])

    resetDisplay(cars, trackEl)

    // radar
    if (displayConfig.rays) {
        car0div = cars[0].div
        if (car0Div.childElementCount > 0) {
            car0Div.firstElementChild.style.transform = `scale(${car.pxPerM / track.pxPerM})`
        }
    }
}

export function resetDisplay (cars, trackEl) {
    updateDebug()
    cars.forEach((car, i) => car.div.className = `car ${car.css}`)
    resetDriftDisplay(trackEl)
    debuggedCar = undefined
}

function addDriftSprite (transform, x, y, time) {
    const index = (driftStartIndex + driftSpriteCount) % DRIFT_SPRITE_CAPACITY
    const sprite = driftSprites[index]
    sprite.time = time
    sprite.x = x
    sprite.y = y
    sprite.el.style.transform = transform
    sprite.el.style.opacity = 1
    if (driftSpriteCount === DRIFT_SPRITE_CAPACITY) {
        driftStartIndex = (driftStartIndex + 1) % DRIFT_SPRITE_CAPACITY
    } else {
        driftSpriteCount++
    }
}

function displayRays (car, pxPerM) {
    const rayContainer = car.div.firstElementChild
    rayContainer.style.transform = `rotate(${-car.localRotation}rad)`
    const raysElts = rayContainer.children
    car.obstacles.forEach((d, i) => {
        raysElts[i].style.width = `${Math.abs(d) * pxPerM}px`
        raysElts[i].style.backgroundColor = d >= 0 ? 'yellow' : 'purple'
    })
}

function displayCar (car, track, time) {
    const x = car.x * track.pxPerM
    const y = car.y * track.pxPerM
    const angle = QUARTER + car.angle + car.localRotation
    const carScale = track.pxPerM / car.pxPerM
    const transform = `translate(${x}px,${y}px) rotate(${angle}rad)`

    car.div.style.transform = transform
    car.div.style.backgroundSize = `${carScale*100}%`
    if (car.drifting) addDriftSprite(transform, x, y, time)
    const dead = car.ai && car.stuckSince > 0
    if (dead) car.div.classList.add('car-dead')
}

export function updateCarSprite (car, oldCss) {
    const cl = car.div.classList
    cl.remove(oldCss)
    cl.add(car.css)
}

export function displayAsSelected (car, isSelected = true) {
    car.div.classList.remove('car-dead')
    car.div.classList.toggle('car-selected', isSelected)
}

export function displayForDebug (car, carIndex) {
    if (car === debuggedCar) return
    debuggedCar?.div.classList.remove('car-debug')
    if (car) {
        car.div.classList.add('car-debug')
    }
    debuggedCarIndex = carIndex
    updateDebug(debuggedCar = car)
    if (car.nn) {
        const nnStructure = structure(car.nn)
        nnDialogEl.title.textContent = `Car #${debuggedCarIndex}`
        nnDialogEl.type.textContent = nnStructure.type
        nnDialogEl.layers.textContent = nnStructure.layers
        nnDialogEl.bias.textContent = nnStructure.bias ? 'yes' : 'no'
        nnDialogEl.activation.textContent = nnStructure.activation
        nnDialogEl.content.textContent = serialize(car.nn)
    }
}

function updateDrifts (time) {
    window.driftSprites = driftSprites
    let startIndex = driftStartIndex, count = driftSpriteCount
    for (let i = 0; i < count; i++) {
        const index = (startIndex + i) % DRIFT_SPRITE_CAPACITY
        const sprite = driftSprites[index]
        const spriteAge = time - sprite.time
        if (spriteAge <= DRIFT_SPRITE_TTL) break
        const opacity = Math.max(1 - (spriteAge - DRIFT_SPRITE_TTL) / DRIFT_SPRITE_DECAY, 0)
        sprite.el.style.opacity = opacity
        if (opacity === 0) {
            sprite.time = 0
            driftStartIndex = (index + 1) % DRIFT_SPRITE_CAPACITY
            driftSpriteCount--
        }
    }
}

function updateOSD (car, time) {
    const speedKmH10 = Math.round(car.speed * 36)
    osdEl.speedInt.textContent = speedKmH10 / 10 | 0
    osdEl.speedFrac.textContent = `.${Math.abs(speedKmH10) % 10}`
    osdEl.lap.textContent = car.lap || 1
    const d = car.lap === 0 ? 0 : car.lapDist
    if (d < 100000) { // sinon, hors piste (la vraie valeur est dans les 500000 et des bananes)
        osdEl.distance.textContent = `${d}m`
    }
    osdEl.time.textContent = `${timeFormat(time)}s`
    osdEl.lastLap.textContent = car.lap > 1 ? timeFormat(car.lapTimes[car.lap - 2]) : ''
}

// Sooo schockingly not optimized
function updateDebug (car) {
    debuggerEl.container.style.display = car ? 'unset' : 'none'
    if (!car) return
    debuggerEl.nnButton.style.display = car.nn ? 'unset' : 'none'
    debuggerEl.carNum.textContent = debuggedCarIndex
    debuggerEl.content.innerHTML = car ? `<table>
<tr><td colspan=2 class="car-debugger-title">Position</td></tr>
<tr><td>x</td><td>${Math.round(car.x)}</td></tr>
<tr><td>y</td><td>${Math.round(car.y)}</td></tr>
<tr><td>angle</td><td>${Math.round(car.angle * 180 / Math.PI)}°</td></tr>

<tr><td colspan=2 class="car-debugger-title">Obstacles</td></tr>
<tr><td>left</td><td>${car.obstacles[0]} m</td></tr>
<tr><td>front left</td><td>${car.obstacles[1]} m</td></tr>
<tr><td>front</td><td>${car.obstacles[2]} m</td></tr>
<tr><td>front right</td><td>${car.obstacles[3]} m</td></tr>
<tr><td>right</td><td>${car.obstacles[4]} m</td></tr>

<tr><td colspan=2 class="car-debugger-title">Physics</td></tr>
<tr><td>drifting</td><td>${car.drifting}</td></tr>
<tr><td>speed</td><td>${Math.round(car.speed * 36) / 10} km/h</td></tr>
<tr><td>steering angle</td><td>${Math.round(car.steeringAngle * 180 / Math.PI)}°</td></tr>

<tr><td colspan=2 class="car-debugger-title">Race</td></tr>
<tr><td>lap</td><td>${car.lap}</td></tr>
<tr><td>lapDist</td><td>${car.lapDist || 'N/A'} m</td></tr>
<tr><td>lapStart</td><td>${Math.round(car.lapStart)} ms</td></tr>
<tr><td>lapTimes (ms)</td><td>${car.lapTimes}</td></tr>
</table>` : ''
}

export function updateCarModelDisplay (car) {
    debuggerEl.model.style.display = car ? 'unset' : 'none'
    if (!car) return
    debuggerEl.model.innerHTML = car ? `<table>
    <tr><td colspan="2" class="car-debugger-title">Model</td></tr>
    <tr><td colspan = "2">
        <span class="car-icon car-green ${car.css === 'car-green' ? 'car-selected' : '' }"></span>
        <span class="car-icon car-red ${car.css === 'car-red' ? 'car-selected' : '' }"></span>
        <span class="car-icon car-blue ${car.css === 'car-blue' ? 'car-selected' : '' }"></span>
        <span class="car-icon car-redf1 ${car.css === 'car-redf1' ? 'car-selected' : '' }"></span>
    </td></tr>
    <tr><td>max steering angle</td><td>${Math.round(car.maxSteeringAngle * 180 / Math.PI)}°</td></tr>
    <tr><td>max acceleration</td><td>${car.maxAcceleration} m/s²</td></tr>
    <tr><td>max speed</td><td>${Math.round(car.maxSpeed * 36) / 10} km/h</td></tr>
    <tr><td>max reverse speed</td><td>${Math.round(car.maxReverseSpeed * 36) / 10} km/h</td></tr>
    <tr><td>brake force</td><td>${car.brakeForce} m/s²</td></tr>
</table>` : ''
}

export function updateDisplay (cars, track, time = 0, osdCar = START_OSD_CAR) {
    cars.forEach(car => displayCar(car, track, time))
    if (displayConfig.rays) displayRays(cars[0], track.pxPerM)
    updateDrifts(time)
    updateOSD(osdCar, time)
    updateDebug(debuggedCar)
}

export function updateControls (genNum, genCount, maxGenerations) {
    controlEl.genNum.textContent = genNum
    controlEl.genCount.textContent = genCount
    controlEl.previous.classList.toggle('disabled', genNum === 1)
    controlEl.next.classList.toggle('disabled', genNum >= maxGenerations)
}

export function toggleRadar (on = !displayConfig.rays) {
    rayStyle.display = (displayConfig.rays = on) ? 'unset' : 'none'
    return on
}

function ensureCarsDisplayed (carCount, trackEl) {
    // c'est un peu moche...
    const displayed = trackEl.querySelectorAll('.car')
    if (displayed.length < carCount) {
        const osd = trackEl.querySelector('.osd')
        const fragment = new DocumentFragment()
        for (let i = displayed.length; i < carCount; i++) {
            const div = document.createElement('div')
            div.className = 'car'
            fragment.appendChild(div)
        }
        trackEl.insertBefore(fragment, osd)
    } else if (displayed.length > carCount) {
        for (let i = carCount; i < displayed.length; i++) displayed[i].remove()
    }
    return trackEl.querySelectorAll('.car')
}

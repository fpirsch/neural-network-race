import { lapChangeTest, detectObstacles, distanceFromStartLine, loadAndScanTrack, tracks } from './track.js'
import { makeCar, frontBumper, placeCar, updateCarLap, changeModel } from './car.js'
import { setCarAI, AI } from './nn.js'
import { updateCar } from './physics.js'
import { genetic } from './evolution.js'
import { initDisplay, displayAsSelected, updateControls, updateDisplay, updateCarModelDisplay, updateCarSprite, resetDisplay, toggleRadar, displayForDebug } from './ui.js'
import animate from './animate.js'

const MAX_GENERATIONS = 200
const MAX_TIME_BEFORE_NEXT_GEN = 60 // secondes, uniquement si un tour complet a été effectué
const GAME_MODE_PRACTICE = 1
const GAME_MODE_AI = 2
const GAME_MODE_PVAI = 3


const trackEl = document.getElementsByClassName('track')[0]
const mainScreen = document.getElementsByClassName('main')[0]
const navScreen = document.getElementsByTagName('nav')[0]
const canvas = document.getElementById('track-image-data')
const dialog = {
    container: document.getElementsByClassName('dialog')[0],
    title: document.getElementById('dialog-title'),
    counter: document.getElementById('dialog-counter')
}
const nnDialog = document.getElementById('nn-dialog')

let radarOn, gameMode
const pick = array => array[Math.floor(Math.random() * array.length)]

const routes = {
    practice () {
        navScreen.className = 'hidden'
        mainScreen.className = 'practice'
        startPractice()
    },
    'ai-training' () {
        navScreen.className = 'hidden'
        mainScreen.className = 'ai'
        startTraining()
    },
    pvai () {
        navScreen.className = 'hidden'
        mainScreen.className = 'pvai'
        startPvAI()
    },
    menu () {
        stopCountdown?.()
        stopPractice()
        stopTraining()
        stopPvAI()
        mainScreen.className = 'hidden'
        navScreen.className = ''
    },
    canvas () { canvas.classList.toggle('hidden') },
    radar () { radarOn = toggleRadar() },
    'control-previous': () => animation?.stop('previous'),
    'control-play': () => animation?.pauseResume(),
    'control-replay': () => animation?.stop('replay'),
    'control-next': () => animation?.stop('next'),
    track: onTrackClick,
    'show-nn': () => nnDialog.style.display = 'block',
    'hide-nn': () => nnDialog.style.display = 'none',
    model: onModelClick
};

let track
let cars = [], debuggedCar
let animation, stopCountdown
const keyboard = { up: 0, down: 0, left: 0, right: 0 };

[...document.querySelectorAll('[data-route]')].forEach(
    elt => elt.addEventListener('click', evt => evt.preventDefault(routes[elt.dataset.route]?.(evt)), true)
)

function showCountdown (message) {
    dialog.title.textContent = message
    dialog.container.classList.remove('hidden')
    let count = dialog.counter.textContent = 3
    return new Promise((resolve, reject) => {
        const timer = setInterval(() => {
            dialog.counter.textContent = --count ? count : 'GO'
            if (!count) {
                clearInterval(timer)
                dialog.container.classList.add('hidden')
                resolve()
            }
        }, 1000)
        stopCountdown = () => reject(clearInterval(timer))
    })
}

function selectCarForDebug (i) {
    debuggedCar = cars[i]
    displayForDebug(debuggedCar, i)
    updateCarModelDisplay(debuggedCar)
}

function changeCarModel (car, modelName) {
    const oldCss = car.css
    changeModel(car, modelName)
    updateCarSprite(car, oldCss)
}

function onTrackClick (event) {
    const div = event.target
    if (div.classList.contains('car')) {
        const i = cars.findIndex(c => c.div === div)
        if (i < 0) return
        selectCarForDebug(i)
    }
}

function onModelClick (event) {
    if (event.target.classList.contains('car-icon')) {
        const modelName = event.target.className.replace(/car-(icon|selected)?/g, '').trim()
        // En mode training on change tout le monde
        if (gameMode === GAME_MODE_AI) {
            cars.forEach(car => changeCarModel(car, modelName))
        } else {
            changeCarModel(debuggedCar, modelName)
        }
        updateCarModelDisplay(debuggedCar)
    }
}

function onKeydown (event) {
    switch (event.key) {
        case 'ArrowUp': keyboard.up = 1; break
        case 'ArrowDown': keyboard.down = 1; break
        case 'ArrowLeft': keyboard.left = 1; break
        case 'ArrowRight': keyboard.right = 1; break
        case ' ': animation.pauseResume(); break
        default: return
    }
    event.preventDefault()
}

function onKeyup (event) {
    switch (event.key) {
        case 'ArrowUp': keyboard.up = 0; break
        case 'ArrowDown': keyboard.down = 0; break
        case 'ArrowLeft': keyboard.left = 0; break
        case 'ArrowRight': keyboard.right = 0; break
        case 'R': case 'r': routes.radar(); break
        case 'C': case 'c': routes.canvas(); break
    }
}

const STUCK_DELAY = 3000 // en ms

function updateCarDist (car, track, time, dt,i) {
    const front = frontBumper(car)
    const lapChange = lapChangeTest(front, track)
    updateCarLap(car, lapChange, time)
    let d = distanceFromStartLine(front, track)
    car.lapDist = d
    const onTrack = d !== undefined
    // Au départ on est avant la ligne de départ donc dist dans les 500 et des bananes, avec car.lap === 0
    if (onTrack) {
        car.distScore = car.lap === 0 ? 0 : d + car.lap * 1000 // 1000 ou n'importe quoi > longueur du tour
    }

    // La voiture est considérée bloqué^e quand elle n'améliore pas son score d'au moins 0.1m
    // pendant un certain nombre de frames    
    if (car.distScore > car.maxDistScore + 0.1) {
        car.ticksWithoutImprovement = 0
    } else {
        car.ticksWithoutImprovement++
    }
    car.stuckSince = (car.ticksWithoutImprovement * dt >= STUCK_DELAY) ? time : 0
    if (car.distScore > car.maxDistScore) {
        car.maxDistScore = car.distScore
    }
}

// time : L'unité est la milliseconde et sa précision est en principe de 5 µs
function nextFrame (time, dt) {
    let allDead = true, frontCar, bestScore = -Infinity;
    for (let i = 0; i < cars.length; i++) {
        const car = cars[i]
        const dead = car.ai && car.stuckSince > 0
        if (dead) continue
        allDead = false
        const input = car.ai?.() || keyboard
        updateCar(car, track, input, dt * 0.001) // en secondes, pour la physique
        updateCarDist(car, track, time, dt,i)
        if (car.distScore > bestScore) {
            frontCar = car
            bestScore = car.distScore
        }
        detectObstacles(car, track)
    }
    updateDisplay(cars, track, time, gameMode === GAME_MODE_AI ? frontCar : cars[0])
    if (allDead) return false
    if (gameMode === GAME_MODE_AI && frontCar.lap >= 2 && time >= MAX_TIME_BEFORE_NEXT_GEN * 1000) return false
    if (gameMode === GAME_MODE_PVAI && frontCar.lap > 3) return false
}

async function startPractice () {
    gameMode = GAME_MODE_PRACTICE
    track = tracks[0]
    const car = cars[0] = makeCar('green')
    cars.length = 1
    car.ai = null;
    initDisplay(cars, track, trackEl)
    selectCarForDebug(0)
    await loadAndScanTrack(track, canvas)
    placeCar (car, track, 0)
    // reset la position de la car si elle est réutilisée d'un ancienne course
    updateDisplay(cars, track)
    try { await showCountdown('Get ready !') } catch (e) { return }
    window.addEventListener('keydown', onKeydown, true)
    window.addEventListener('keyup', onKeyup, true)
    animation = animate(nextFrame)
    animation.play()
}

function stopPractice () {
    if (gameMode === GAME_MODE_PRACTICE) {
        animation?.stop()
        window.removeEventListener('keydown', onKeydown, true)
        window.removeEventListener('keyup', onKeyup, true)
        gameMode = undefined
    }
}

const setCarsAI = (cars, evol) => cars.forEach((car, i) => setCarAI(car, evol.population[i]))

async function startTraining () {
    gameMode = GAME_MODE_AI
    track = tracks[0]
    radarOn = toggleRadar(false)
    const evol = genetic({ populationSize: 256 })
    cars = Array.from({ length: evol.populationSize }, makeCar)
    window.cars = cars
    window.evol = evol
    initDisplay(cars, track, trackEl)
    await loadAndScanTrack(track, canvas)
    setCarsAI(cars, evol)
    // reset les positions d'anciennes voitures potentiellement visibles
    cars.forEach((car, i) => placeCar(car, track, i % 8))
    updateDisplay(cars, track)

    while (true) {
        updateControls(evol.gen + 1, evol.gen + 1, MAX_GENERATIONS)
        try { await showCountdown(`Generation ${evol.gen + 1}`) } catch (e) { return }
        animation = animate(nextFrame)
        resetDisplay(cars, trackEl)
        cars.forEach((car, i) => {
            placeCar(car, track, i % 8)
            detectObstacles(car, track)
        })
        updateDisplay(cars, track)
        const stopReason = await animation.play()
        evol.setFitness(cars.map(car => car.distScore))
        if (stopReason === 'previous')
            setCarsAI(cars, evol.prevGen())
        else if (!stopReason || stopReason === 'next') {
            if (evol.gen + 1 < MAX_GENERATIONS) {
                setCarsAI(cars, evol.nextGen())
                evol.selection.forEach(({ i }) => displayAsSelected(cars[i]))
            }
            else break
        } else if (stopReason === 'abort')
            break
        // sinon c'est replay, on rejoue la même génération
    }
}

function stopTraining () {
    if (gameMode === GAME_MODE_AI) {
        animation?.stop('abort')
        gameMode = undefined
    }
}

async function startPvAI () {
    gameMode = GAME_MODE_PVAI
    track = tracks[0]
    radarOn = toggleRadar(false)
    cars = [
        makeCar('green'),
        makeCar('red'),
        makeCar('red'),
        makeCar('blue'),
        makeCar('blue'),
        makeCar('red'),
        makeCar('redf1'),
        makeCar('redf1')
    ]
    for (let i = 1; i < 8; i++) {
        // IA de compète après 20 générations, et qui a fait 2 tours en entraînement,
        setCarAI(cars[i], pick(AI).nn)
    }
    initDisplay(cars, track, trackEl)
    await loadAndScanTrack(track, canvas)
    // reset les positions d'anciennes voitures potentiellement visibles
    cars.forEach((car, i) => placeCar(car, track, i))
    updateDisplay(cars, track)
    try { await showCountdown('Get ready !') } catch (e) { return }
    window.addEventListener('keydown', onKeydown, true)
    window.addEventListener('keyup', onKeyup, true)
    animation = animate(nextFrame)
    animation.play()
}

function stopPvAI () {
    if (gameMode === GAME_MODE_PVAI) {
        animation?.stop()
        window.removeEventListener('keydown', onKeydown, true)
        window.removeEventListener('keyup', onKeyup, true)
        gameMode = undefined
    }
}

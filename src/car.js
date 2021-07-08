// TODO steering angle dépendant de la vitesse ? Genre + serré à basse vitesse pour faciliter les manoeuvres ?
// ou utiliser le drift pour tourner plus serré, pas seulement en faire un effet visuel
// normalement physiquement le drift fait ralentir, mais quel autre effet ?
const DEG = Math.PI / 180

const BASE_CAR_GEOMETRY = {
    w: 2,   // meters
    h: 4,
    frontAxlePx: 11, // in px
    rearAxlePx: 35, // in px
    pxPerM: 13, // sprite scale : 13 pixels / m
}

const BASE_F1_GEOMETRY = {
    w: 2,   // meters
    h: 5,
    frontAxlePx: 11, // in px
    rearAxlePx: 35, // in px
    pxPerM: 13, // sprite scale : 13 pixels / m
}

const BASE_CAR_PHYSICS = {
    maxSteeringAngle: 25 * DEG,
    maxAcceleration: 30, // in m/s²
    maxSpeed: 30, // in m/s
    maxReverseSpeed: 10, // = 36 km/h
    brakeForce: 100, // in m/s²
}

export const CAR_MODELS = {
    green: {
        css: 'car-green',
        ...BASE_CAR_GEOMETRY,
        ...BASE_CAR_PHYSICS,
        maxSpeed: 35, // in m/s
        maxReverseSpeed: 15, // = 54 km/h
    },
    red: {
        css: 'car-red',
        ...BASE_CAR_GEOMETRY,
        ...BASE_CAR_PHYSICS
    },
    blue: {
        css: 'car-blue',
        ...BASE_CAR_GEOMETRY,
        ...BASE_CAR_PHYSICS,
        maxSteeringAngle: 23 * DEG,
        maxAcceleration: 35, // in m/s²
        maxSpeed: 29, // in m/s
        maxReverseSpeed: 15, // = 54 km/h
        brakeForce: 125,
    },
    redf1: {
        css: 'car-redf1',
        ...BASE_F1_GEOMETRY,
        maxSteeringAngle: 27 * DEG,
        maxAcceleration: 50, // in m/s²
        maxSpeed: 55, // in m/s
        maxReverseSpeed: 15,
        brakeForce: 125,
    }
}

export const makeCar = (modelName = 'red') => ({
    ai: null,
    nn: null,
    div: null,
    ...CAR_MODELS[modelName],

    // position and orientation
    x: 0, // car center in meters
    y: 0, // car center in meters
    angle: 0, // initial sprite angle (0=east, π/2=south, π=west, -π/2=north)
    ux: 0, // cos(angle)
    uy: 0, // sin(angle)
    prevx: 0,
    prevy: 0,
    prevux: 0,
    prevuy: 0,

    // obstacle detection (distances in m)
    obstacles: [0, 0, 0, 0, 0],

    // race
    lap: 0,
    lapDist: 0,
    lapStart: 0, // start line crossing timestamp
    lapTimes: [],
    distScore: 0,
    maxDistScore: 0,

    // physics state
    highSpeedTurningTime: 0, // in ticks
    drifting: false,
    speed: 0,
    ticksWithoutImprovement: 0,
    stuckSince: 0,
    steeringAngle: 0,
    localRotation: 0,
})

export function changeModel (car, newModelName) {
    const newModel = CAR_MODELS[newModelName]
    car.css = newModel.css
    car.h = newModel.h
    car.maxSteeringAngle = newModel.maxSteeringAngle
    car.maxAcceleration = newModel.maxAcceleration
    car.maxSpeed = newModel.maxSpeed
    car.maxReverseSpeed = newModel.maxReverseSpeed
    car.brakeForce = newModel.brakeForce
}

// reset complètement la car à une position de départ sur la piste
export function placeCar (car, track, positionIndex) {
    const { x, y } = track.startingPos[positionIndex]
    car.prevx = car.x = x / track.pxPerM
    car.prevy = car.y = y / track.pxPerM + car.h / 2
    car.angle = -90 * DEG // angle du sprite à l'état initial (et "y" descend)
    car.prevux = car.ux = 0 // cos(angle)
    car.prevuy = car.uy = -1 // sin(angle)
    car.lap = car.lapDist = car.lapTimes.length = car.lapStart = car.distScore = car.maxDistScore = 0
    car.highSpeedTurningTime = car.ticksWithoutImprovement = car.stuckSince = 0
    car.drifting = false
    car.speed = car.steeringAngle = car.localRotation = 0
}

// TODO faut le stocker sur car en le calculant dans physics/update
// frontBumperX, frontBumperY, frontBumperPrevY
// NOPE, plutôt stocker prevux/prevuy
export function frontBumper (car) {
    const l = car.h / 2
    return {
        x: car.x + car.ux * l,
        y: car.y + car.uy * l,
        prevx: car.prevx + car.prevux * l,
        prevy: car.prevy + car.prevuy * l
    }
}

export function updateCarLap (car, lapChange, time) {
    car.lap += lapChange
    if (lapChange < 1) return
    if (car.lap > 1) {
        car.lapTimes.push(time - car.lapStart)
    }
    car.lapStart = time
}
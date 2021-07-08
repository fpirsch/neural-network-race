// Adaptation (très très libre) de CarController.cs de Livio De La Cruz

import { groundType, WALL } from './track.js'
const STEERING_ROLLING_RESISTANCE = 0.6
const DRIFT_ANGLE = 20 * Math.PI / 180
const DRIFT_DELAY = 0.100 // en secondes

// TODO maxSteeringAngle plus grand à basse vitesse et moins à haute ?

export function updateCar (car, track, input, dt) {
    if (car.speed !== 0 || input.up || input.down) {
        // wheelGroundType ne devrait jamais renvoyer WALL puisqu'on rebondit avant d'entrer dans un wall.
        const crr = track.rollingResistance[wheelGroundType(car, track)] ?? 0

        if (car.speed > 0 && input.down || car.speed < 0 && input.up) {
            slowDown(car, car.brakeForce, dt)
        } else if (!input.up && !input.down) {
            // hack : un ralentissement proportionnel à la vitesse ça rend pas bien.
            const dragForce = crr * car.maxSpeed
            slowDown(car, dragForce, dt)
        } else {
            const direction = input.up ? 1 : -1
            accelerate(car, direction, crr, dt)
        }

        if (input.left ^ input.right) {
            const angle = car.maxSteeringAngle
            car.steeringAngle = input.left ? -angle : angle
        } else {
            car.steeringAngle = 0
        }

        if (car.speed !== 0) {
            updatePosition(car, track, dt)
        }
    }
}

function wheelGroundType (car, track) {
    // Check all 4 wheels against ground
    const frontAxleDist = car.h / 2 - car.frontAxlePx / car.pxPerM
    const frontAxleCenterX = car.x + car.ux * frontAxleDist
    const frontAxleCenterY = car.y + car.uy * frontAxleDist
    const rearAxleDist = car.h / 2 - car.rearAxlePx / car.pxPerM
    const rearAxleCenterX = car.x - car.ux * rearAxleDist
    const rearAxleCenterY = car.y - car.uy * rearAxleDist
    const wheelDist = car.w / 2
    // Left vector = [-uy, ux], Right vector = [uy, -ux]
    const rightX = car.uy * wheelDist
    const rightY = -car.ux * wheelDist
    const leftX = -rightX
    const leftY = -rightY
    return Math.max(
       groundType(frontAxleCenterX + leftX, frontAxleCenterY + leftY, track),
       groundType(frontAxleCenterX + rightX, frontAxleCenterY + rightY, track),
       groundType(rearAxleCenterX + leftX, rearAxleCenterY + leftY, track),
       groundType(rearAxleCenterX + rightX, rearAxleCenterY + rightY, track),
    );
}

function wallHit (car, track) {
    // Check bumpers
    const frontX = car.x + car.ux * car.h / 2
    const frontY = car.y + car.uy * car.h / 2
    if (groundType(frontX, frontY, track) === WALL) return true

    const rearX = car.x - car.ux * car.h / 2
    const rearY = car.y - car.uy * car.h / 2
    if (groundType(rearX, rearY, track) === WALL) return true

    // check wheels
    return wheelGroundType(car, track) === WALL
}

// direction est absolument nécessaire quand on est à l'arrêt.
function accelerate (car, direction, crr, dt) {
    if (car.steeringAngle) crr += STEERING_ROLLING_RESISTANCE
    const rollingResistance = crr * Math.abs(car.speed)
    const a = car.maxAcceleration - rollingResistance
    car.speed += direction * a * dt
    if (car.speed > car.maxSpeed) car.speed = car.maxSpeed
    else if (car.speed < -car.maxReverseSpeed) car.speed = -car.maxReverseSpeed
}

function slowDown (car, decel, dt) {
    if (car.speed > 0) {
        car.speed -= decel * dt
        // Pour vraiment s'arrêter, sans osciller, quand on laisse filer.
        if (car.speed < 0) car.speed = 0
    } else if (car.speed < 0) {
        car.speed += decel * dt
        if (car.speed > 0) car.speed = 0
    }
}

function updatePosition (car, track, dt) {
    const d = car.speed * dt
    let { x, y, angle, ux, uy } = car
    car.prevx = x
    car.prevy = y
    car.prevux = ux
    parent.prevuy = uy
    if (car.steeringAngle === 0) {
        car.highSpeedTurningTime = 0
        x += ux * d
        y += uy * d
    } else {
        if (car.speed >= car.maxSpeed * 0.95)
            car.highSpeedTurningTime++
        else
            car.highSpeedTurningTime = 0

        // approx : ça devrait être l'entraxe au lieu de la longueur de la voiture
        const steeringAngle = car.steeringAngle + car.localRotation / 3
        const steeringRadius = car.h / Math.sin(steeringAngle)
        const radiansToTravel = d / steeringRadius
        const s = Math.sin(radiansToTravel), c = Math.cos(radiansToTravel)
        x += steeringRadius * (ux * s + uy * (1 - c))
        y += steeringRadius * (uy * s - ux * (1 - c))
        angle += radiansToTravel
        ux = Math.cos(angle)
        uy = Math.sin(angle)
    }
    const updatedCar = { ...car, x, y, angle, ux, uy }
    const hit = wallHit(updatedCar, track)
    if (hit) {
        // Rebond sur un mur. Pas du tout réaliste mais fun.
        car.speed = -car.speed
    } else {
        car.x = x
        car.y = y
        car.angle = angle
        car.ux = ux
        car.uy = uy
    }

    car.drifting = car.highSpeedTurningTime * dt >= DRIFT_DELAY
    car.localRotation = car.drifting
        ? car.steeringAngle > 0 ? DRIFT_ANGLE : -DRIFT_ANGLE
        : 0
}

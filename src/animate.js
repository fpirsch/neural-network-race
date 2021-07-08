// A very cool Promise-based media control style API wrapper for requestAnimationFrame
// Pauses/resumes on visibility changes because requestAnimationFrame gets throttled to 1s instead of 1/60s
// and physics computations don't work with dt = 1000 ms

const pausedWhileInBackground = []

document.addEventListener("visibilitychange", () => {
    pausedWhileInBackground.forEach(anim => anim.resume())
    pausedWhileInBackground.length = 0
}, false);
  
export default function animate (frameCallback) {
    let requestId, resolvePromise, elapsedTime, pauseStart, pauseTime, lastTime

    // time : L'unité est la milliseconde et sa précision est en principe de 5 µs, et ça commence à 0 pile
    function nextFrame (time) {
        if (document.hidden) {
            pause()
            pausedWhileInBackground.push(anim)
        }
        else {
            pauseTime = pauseTime ?? time
            const dt = lastTime >= 0 ? time - lastTime : 0
            lastTime = time
            elapsedTime = time - pauseTime
            requestId = (frameCallback(elapsedTime, dt) === false)
                ? resolvePromise()
                : requestAnimationFrame(nextFrame)
        }
    }

    function pause () {
        requestId = cancelAnimationFrame(requestId)
        pauseStart = performance.now()
        lastTime = undefined
    }

    function resume () {
        pauseTime += performance.now() - pauseStart
        requestId = requestAnimationFrame(nextFrame)
    }

    const anim = {
        play: () => new Promise(resolve => {
            resolvePromise = resolve
            pauseTime = undefined
            lastTime = undefined
            requestId = requestAnimationFrame(nextFrame)
        }),
        pause,
        resume,
        pauseResume: () => (requestId ? pause : resume)(),
        stop (reason) {
            requestId = cancelAnimationFrame(requestId)
            resolvePromise(reason)
        },
        get time () { return elapsedTime }
    }

    return anim
}

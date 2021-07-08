// Le réseau de neurones que j'ai fait pour codingame
// ( https://www.codingame.com/training/hard/binary-neural-network---part-1 et https://www.codingame.com/training/expert/binary-neural-network---part-2 )
// pas du tout optimisé, ni pratique, mais il marche
// vaguement modifié pour l'occasion (initialisation des poids, fonction d'activation)

export function create (inputs, hiddenLayers, outputs) {
    const w = new Array(hiddenLayers.length + 1)
    let prevSize = inputs, column

    // hidden layer weights
    for (let i = 0; i < hiddenLayers.length; i++) {
        const colSize = (hiddenLayers[i])
        column = w[i] = new Array(colSize)
        for (let j = 0; j < colSize; j++) {
            column[j] = Array.from({ length: prevSize+1 }).fill(0) // last is bias
        }
        prevSize = colSize
    }

    // output layer weights
    column = w[hiddenLayers.length] = new Array(outputs)
    for (let j = 0; j < outputs; j++) {
        column[j] = Array.from({ length: prevSize+1 }).fill(0) // last is bias
    }
    return w
}

const random = () => Math.floor(Math.random() * 256) - 128

export function randomInit (nn) {
    // un NN est un tableau de tableaux de tableaux
    // le dernier coeff de chaque liste est le bias
    nn.forEach(
        layer => layer.forEach(
            neuron => {
                for (let i = 0; i < neuron.length - 1; i++) neuron[i] = random()
                neuron[neuron.length - 1] = 0 // le bias est toujours 0
            }
        ))
    return nn
}

export function operate (network, input) {
    let output
    for (let i = 0; i < network.length; i++) {
        const column = network[i]
        output = new Array(column.length)
        for (let j = 0; j < column.length; j++) {
            const w = column[j]
            let o = 0, k
            for (k = 0; k < input.length; k++) {
                o += +input[k] * w[k] / 128
            }
            o += w[k] // last is bias
            //output[j] = 1 / (1 + Math.exp(-o)); // normalize with a sigmoid
            // Leaky ReLU marche très bien, ReLU a l'air de bien marcher aussi
            //output[j] = o >= 0 ? o : 0 // ReLU
            output[j] = o >= 0 ? o : 0.5 * o // Leaky ReLU
        }
        input = output
    }
    return output // output layer
}

export function setCarAI (car, nn) {
    car.nn = nn
    car.ai = () => {
        const output = operate(nn, [car.speed, ...car.obstacles])
        return {
            up: output[0] > 0,
            down: output[1] > 0,
            left: output[2] > 0,
            right: output[3] > 0
        }
    }
}

export function structure (nn) {
    return {
        type: `${nn.length <= 2 ? 'simple' : 'multilayer'} perceptron`,
        layers: `6-${nn.map(layer => layer.length).join('-')}`,
        bias: nn.flat().map(weights => weights[weights.length-1]).some(b => b),
        activation: 'leaky ReLU'
    }
}

export function serialize (nn) {
    return `[
    ${nn.map(
    layer => `[
        ${layer.map(JSON.stringify).join(',\n        ')}
    ]`
).join(',\n    ')}
]`
}

export const AI = [
    {
        description: 'layers: 6-3-3-4, activation: leaky ReLU',
        generations: 20,
        carsUsed: 'red',
        tracksUsed: 'star5',
        nn: [
            [
                [-128,41,35,127,127,-36,-8],
                [-90,21,-70,-54,82,49,-37],
                [-15,-17,108,25,-47,-38,0]
            ],
            [
                [-41,-56,-80,0],
                [-25,105,-11,0],
                [-75,-35,127,0]
            ],
            [
                [85,-110,-2,43],
                [25,126,24,-10],
                [-91,-44,86,0],
                [70,-73,-128,-2]
            ]
        ]
    },
    {
        description: 'layers: 6-3-3-4, activation: leaky ReLU',
        generations: 18,
        carsUsed: 'all',
        tracksUsed: 'star5',
        nn: [
            [
                [29,59,120,-46,-58,-98,0],
                [-50,-24,127,118,-57,57,-15],
                [-4,59,63,-128,-109,6,-11]
            ],
            [
                [22,116,-69,0],
                [108,-25,-20,0],
                [81,52,68,-5]
            ],
            [
                [107,95,92,10],
                [-78,49,36,-51],
                [10,113,119,0],
                [-67,-128,-81,0]
            ]
        ]
    },
    {
        description: 'layers: 6-5-4, activation: leaky ReLU',
        generations: 22,
        carsUsed: 'red,redf1',
        tracksUsed: 'star5',
        nn: [
            [
                [-6,-63,-53,34,-82,-64,0],
                [-106,-108,69,-25,51,104,-2],
                [101,6,-107,-120,80,50,6],
                [90,-21,-112,11,127,45,0],
                [90,-74,0,88,-100,6,-11]
            ],
            [
                [-128,65,42,62,127,3],
                [-104,127,-17,-97,-62,-90],
                [80,-91,-38,-59,3,20],
                [78,7,-46,127,-96,0]
            ]
        ]
    }
]

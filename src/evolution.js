import { create as createNN, randomInit as randomInitNN } from './nn.js'

export function genetic ({
    populationSize = 200,
    selectionSize = 10,
    neuronMutationRatio = 0.15, // prévoir aussi une mutation de structure ?
}) {

    let population = [...Array(populationSize)].map(
        () => {
            const nn = createNN(6, [3, 3], 4)
            randomInitNN(nn)
            return nn
        }
    )

    const generations = [population]
    let currentGeneration = 0, fitnessScores, lastSelection

    function mutateCoeff (c, amplitude = 96) {
        return (c += Math.floor(Math.random() * amplitude - amplitude / 2)) < -128 ? -128 : c > 127 ? 127 : c
    }

    function evolveIndividual (nn) {
        // un NN est un tableau de tableaux de tableaux
        return nn.map(
            layer => layer.map(
                neuron => neuron.map(
                    coeff => Math.random() < neuronMutationRatio
                        ? mutateCoeff(coeff)
                        : coeff // pas mutation
                )
            ))
    }

    function select () {
        lastSelection = fitnessScores
            .sort((a, b) => b.score - a.score)
            .slice(0, selectionSize)
        window.lastSelection = lastSelection
        return lastSelection.map(({ i }) => population[i])
    }

    const pick = array => array[Math.floor(Math.random() * array.length)]

    function evolvePopulation () {
        const selection = select()
        return Array.from(
            { length: populationSize },
            (_, i) => i < selectionSize ? selection[i] : evolveIndividual(pick(selection))
        )
    }

    return {
        populationSize,
        get population () { return population },
        prevGen () {
            if (currentGeneration > 0) population = generations[--currentGeneration]
            return this
        },
        nextGen () {
            currentGeneration++
            if (currentGeneration < generations.length) {
                population = generations[currentGeneration]
            } else {
                generations.push(population = evolvePopulation())
            }
            return this
        },
        get selection () { return lastSelection },
        get gen () { return currentGeneration },
        setFitness: scores => fitnessScores = scores.map((score, i) => ({ score, i }))
    }
}

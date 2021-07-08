import { create as createNN, randomInit as randomInitNN } from './nn.js'

export function genetic ({
    populationSize = 200,
    selectionSize = 10,
    neuronMutationRatio = 0.15, // prévoir aussi une mutation de structure ?
}) {

    let population = [...Array(populationSize)].map(
        () => {
            const nn = createNN(6, [5], 4)
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

/*

Johan Eliasson :
    5 inputs de distance + speed + direction
    "it just accepts 7 numbers as input: speed, direction end 5 distances"
    first generation : 650 cars
    sélection : le ou les bests (manuellement)
    "gen 2 are all his mutated children"
    3 new parents for gen 3 - et il encadre l'ancien parent pour référence
    "only the 3rd gen and it can already navigate a series of turns!" (sa gen 3 fait les 3/4 du circuit à peu près)
    output : 2 numbers ("I parse those 2 numbers into gas/brake pedals end turnig of the steering wheel")
    Gen 4 fait + d'un tour, mais lentement
    Gen 10 est 2-3 * plus rapide (mais se plante encore dans un mur en fin de circuit - 1 seul individu montré)

    Aucune info sur la structure du réseau, le bias, l'activation, la mutation :-(


    Yosh/Trackmania
        donne un autre exemple https://youtu.be/a8Bo2DHrrow?t=85 sans couche cachée mais avec bias (8 neurones en tout)
        il référence Johan Eliasson :-)
        autre exemple https://youtu.be/a8Bo2DHrrow?t=102 avec structure 5-4-3-2 sans bias. Output turn entre -1 et 1, engine entre ? et 1

        Il prend 8 inputs (7 distances + speed) => obviously la direction de Eliasson sert à rien
        3 actions en output : left, right, accel (1/0)
        random structure + random connexions between neurons (pas des fully-connected)

        population 100, 13 s de conduite
        fitness function de base = distance (défaut : ça va favoriser des stratégies inefficaces, tant qu'elles vont loin)
        il sélectionne les meilleurs et élimine les moins bons
        NEAT + mutations + crossover
        Gen1 : 294m, Gen4 : 532m (1st checkpoint) Gen12 (5 heures) : 654 m

        fitness function suivante : checkpoint times (4 cp + finish, il en choisit un)
        40 générations : son IA est efficace au début mais est naze en milieu de parcours et ne finit pas la piste
            => il augmente la durée de la course à 21s
            => intéressant : généralisation de la conduite apprise sur la première partie du circuit
            => on n'est pas dans l'overmachin
        de la gen 30 à la gen 60, son IA ne fait pas bcp de progrès (il montre les graphiques de meilleur temps par génération)

        Il en a fait d'autres : https://twitter.com/yoshtm1
        Il dit pas comment il fait ses vidéos, ni comment il contrôle le jeu (récupérer les inputs de la voiture, les renvoyer dans le jeu...)





Mario AI https://www.youtube.com/watch?v=CI3FRsSAa_U
Sur un NES emulateur
inputs : 80 (7*10 blocks de 16*16 pixels + 10 incompréhensible)
	- sur quelle ligne est mario
	- "10 from a one hot encoded variable depicting the row" ???
	- inputs given a specific value based off the block type
	https://fr.wikipedia.org/wiki/Encodage_one-hot
	https://machinelearningmastery.com/why-one-hot-encode-data-in-machine-learning/
hidden 9
output 6 (touches UDLRAB, il peut en presser plusieurs en même temps)
trainable params : 789 ? avec un bias sur l'output ça ferait 720+6*10=780


Mutation : static 5%
Crossover : roulette (https://www.tutorialspoint.com/genetic_algorithms/genetic_algorithms_parent_selection.htm)
    chaque parent a une probabilité de sélection proportionnelle à sa fitness
    il dit pas combien de points pour son crossover
Generations : environ 10000


3 semaines de training (total playtime 5 years)

*/
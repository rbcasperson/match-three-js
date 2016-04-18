'use strict';
import * as _ from 'lodash';
let SortedSet = require('collections/sorted-set');

// checks for one row of the iterchunk board for a match like [0010].
export function hasMatchInSingleRow (row) {
    return _.max(_.values(_.countBy(row))) > 2;
};

// return the index of all occurrences of `value` in `list`. [5, 3, 7, 5], 5 -> [0, 3]
export function indexOfAll (list, value) {
    return _.reduce(list, (acc, e, i) => {
        if (e === value) {
            acc.push(i);
        }

        return acc;
    }, []);
};

// checks across both rows for a match, like [0101]
//                                           [2031]
export function hasMatchInPairOfRows (pairOfRows) {
    let allValues = _.uniq(_.flatten(pairOfRows));
    let allMatches = _.map(allValues, value => {
        return _.uniq([...indexOfAll(pairOfRows[0], value),
                       ...indexOfAll(pairOfRows[1], value)]).sort();
    });

    return _.some(allMatches, match => {
        return _.some([
            _.isEqual(match, [0, 1, 2]),
            _.isEqual(match, [1, 2, 3]),
            _.isEqual(match, [0, 1, 2, 3]),
        ]);
    });
};

/**
 * @private
 * @description Used to provide more granularity to functions that need to call iterchunks
 * on a non-transposed set of orbs, as well as a transposed set of orbs.
 * @see findMatches
 */
let _iterchunks = (orbs, chunkLimitRange, includePositionInformation, isTransposed) => {
    let chunks = [];
    let [width, height] = chunkLimitRange;
    let [finalPositionWidth, finalPositionHeight] = [orbs[0].length - width, orbs.length - height];
    _.each(_.range(0, finalPositionHeight + 1), heightIndex => {
        _.each(_.range(0, finalPositionWidth + 1), widthIndex => {
            let chunkData = orbs.slice(heightIndex, heightIndex + height).map(row => {
                return row.slice(widthIndex, widthIndex + width);
            });

            if (includePositionInformation) {
                let startingCoordinates = [heightIndex, widthIndex];
                let endingCoordinates = [heightIndex + height - 1, widthIndex + width - 1];
                if (isTransposed) {
                    startingCoordinates = startingCoordinates.reverse();
                    endingCoordinates = endingCoordinates.reverse();
                }

                chunkData.push({
                    position: {
                        first: startingCoordinates,
                        last: endingCoordinates
                    }
                });
            }

            chunks.push(chunkData);
        });
    });
    return chunks;
};

/**
 * With `orbs` being
 * [ [ 6, 5, 4 ],
 *   [ 3, 2, 2 ],
 *   [ 6, 4, 0 ] ]
 * And with a [3, 2] `chunkLimitRange`, this will yield each 3x2
 * grouping, and then, each available 2x3 grouping.
 * [ [ [6, 5, 4], [3, 2, 2] ], [ [3, 2, 2], [6, 4, 0] ],
 *   [ [6, 3, 6], [5, 2, 4] ], [ [5, 2, 4], [4, 2, 0] ] ]
 *
 * If you want to also return the position of the first member of the chunk,
 * as row/col coordinates, pass in `includePositionInformation`. That will return the
 * same data as above, but with a final piece of information, an object with a `position`
 * key that maps to the first and last row/col coordinates of that chunk.
 * [
 *     [
 *         [6, 5, 4], [3, 2, 2],
 *         {
 *             position: {
 *                 first: [0, 0],
 *                 last: [1, 2]
 *             }
 *         }
 *     ],
 *     [
 *         [3, 2, 2], [6, 4, 0],
 *         {
 *             position: {
 *                 first: [1, 0],
 *                 last: [2, 2]
 *             }
 *         }
 *     ],
 *     [
 *         [6, 3, 6], [5, 2, 4],
 *         {
 *             position: {
 *                 first: [0, 0],
 *                 last: [2, 1]
 *             }
 *         }
 *     ],
 *     [
 *         [5, 2, 4], [4, 2, 0]
 *         {
 *             position: {
 *                 first: [0, 1],
 *                 last: [2, 2]
 *             }
 *         }
 *     ]
 * ]
 */
export function iterchunks (orbs, chunkLimitRange = [4, 2], includePositionInformation = false) {
    let transposedOrbs = _.zip(...orbs);
    return [
            ..._iterchunks(orbs, chunkLimitRange, includePositionInformation, false),
            ..._iterchunks(transposedOrbs, chunkLimitRange, includePositionInformation, true)
    ]
};

let _findMatches = (chunks, isTransposed) => {
    let matches = [];

    _.each(chunks, chunk => {
        let orbs = _.first(chunk);
        let metadata = _.last(chunk);
        if (_.uniq(orbs).length === 1) {
            let anchor = metadata.position.first;
            let firstOrb = anchor;
            let secondOrb;
            let thirdOrb;

            if (isTransposed) {
                secondOrb = [anchor[0] + 1, anchor[1]];
                thirdOrb = [anchor[0] + 2, anchor[1]];
            } else {
                secondOrb = [anchor[0], anchor[1] + 1];
                thirdOrb = [anchor[0], anchor[1] + 2];
            }

            let absolutePositions = [
                firstOrb,
                secondOrb,
                thirdOrb
            ];
            matches.push(absolutePositions);
        }
    });

    return matches;
};

export function findMatches(orbs) {
    let chunksOriginal = _iterchunks(orbs, [3, 1], true);
    let chunksTransposed = _iterchunks(_.zip(...orbs), [3, 1], true, true);

    return [
            ..._findMatches(chunksOriginal, false),
            ..._findMatches(chunksTransposed, true)
    ];

};

export function combineMatches(matches) {
    let combinedMatches = [];
    let unused = matches;
    let couldMatch, before, currentMatch;

    while (unused[0] != null) {
        currentMatch = new SortedSet(unused[0]);
        unused.shift();
        couldMatch = _.clone(unused);

        _.each(couldMatch, m => { //only union if there is an overlap!
            if (currentMatch.intersection(m).toArray()[0] != null) {
                before = currentMatch.toArray();
                currentMatch.swap(0, currentMatch.length, currentMatch.union(m));
                if (before != currentMatch.toArray()) {
                    unused.splice(unused.indexOf(m), 1);
                }
            }
        });
        combinedMatches.push(currentMatch.toArray());
    }
    return combinedMatches;
};

export class Board {
    constructor (width = 8, height = 8, types = _.range(7)) {
        this.width = width;
        this.height = height;
        this.types = types;
        this.createValidOrbs();
        // this.evaluateAll(this.orbs);
    }

    get size() {
        return [this.width, this.height];
    }

    get availableTypes() {
        return _.uniq(_.flatten(this.orbs)).sort();
    }

    /**
      * 1. logs data for each match and replaces each orb with 'X'
      * 2. replaces each 'X' and all above orbs with either the orb directly above or a random new orb
      * 3. returns the match data -> [[match1Type, match1Amount], [match2Type, match2Amount], ...]
      */
    evaluate(matches, dropOptions = this.types) {
        let matchData = [];

        _.each(matches, match => {
            // log data
            matchData.push([this.orbs[match[0][0]][match[0][1]], match.length]);
            // replace each coordinate with 'X'
            _.each(match, coord => {
                let [row, col] = coord;
                this.orbs[row][col] = 'X'
            })
        });

        /**
          * drop down and generate matches
          * 1. reads across starting from the top
          * 2. when it hits 'X', loops from that position directly up
          * 3. if the row isn't 0, it takes the orb from above
          * 4. if the row is 0, it creates a random orb
        */
        _.each(_.range(this.height), row =>{
            _.each(_.range(this.width), col => { //1
                if (this.orbs[row][col] == 'X') {
                    for (var z = row; z >= 0; z--) { //2
                        if (z > 0) { //3
                            this.orbs[z][col] = this.orbs[z - 1][col];
                        } else { //4
                            this.orbs[z][col] = _.sample(dropOptions);;
                        };
                    };
                };
            });
        });

        return matchData;
    }

    evaluateAll() {
        var matchEvents = [];
        while (this.hasMatch()) {
            matchEvents.push(this.evaluate());
        }
    }

    needsShuffle() {
        return !this.hasMatch();
    }

    hasMatch() {
        let chunks = iterchunks(this.orbs);
        // [[[1, 2, 3], [2, 3, 4]], [[3, 4, 5], [4, 5, 6]]] becomes
        //  [[1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6]]
        let flatChunks = _.flattenDepth(chunks, 1);
        let hasWideStyleMatch = _.some(_.map(flatChunks, hasMatchInSingleRow));
        return hasWideStyleMatch || _.some(_.map(chunks), hasMatchInPairOfRows);
    }
    
    hasMatchEvent() {
        if (findMatches(this.orbs)[0]) { return true };
    }

    swap(swapOrbs, playerSwap = true) {
        let [[row1, col1], [row2, col2]] = swapOrbs;
        let orbsBefore = _.cloneDeep(this.orbs);
        this.orbs[row1][col1] = orbsBefore[row2][col2]
        this.orbs[row2][col2] = orbsBefore[row1][col1]

        // undo the swap if it did not yeild a match
        if (playerSwap && !this.hasMatchEvent()) {
            this.orbs = orbsBefore;
        };
    }
    
    
    _unmatch(row, col, match) {
        let thisOrb = this.orbs[row][col];
        let swapped = false;
        let directions = _.shuffle(['up', 'down', 'left', 'right']);
        for (let i = 0; i < 4; i++) {
            if (directions[i] === 'up' && !_.isUndefined(this.orbs[row - 1]) && this.orbs[row - 1][col] !== thisOrb) {
                this.swap([[row, col], [row - 1, col]], false);
                swapped = true;
                console.log('swapped up');
                break;
            } else if (directions[i] === 'down' && !_.isUndefined(this.orbs[row + 1]) && this.orbs[row + 1][col] !== thisOrb) {
                this.swap([[row, col], [row + 1, col]], false);
                swapped = true;
                console.log('swapped down');
                break;
            } else if (directions[i] === 'left' && !_.isUndefined(this.orbs[row][col - 1]) && this.orbs[row][col - 1] !== thisOrb) {
                this.swap([[row, col], [row, col - 1]], false);
                swapped = true;
                console.log('swapped left');
                break;
            } else if (directions[i] === 'right' && !_.isUndefined(this.orbs[row][col + 1]) && this.orbs[row][col + 1] !== thisOrb) {
                this.swap([[row, col], [row, col + 1]], false);
                swapped = true;
                console.log('swapped right');
                break;
            }
        }
        while (!swapped) {
            let [randomRow, randomCol] = [_.random(this.height - 1), _.random(this.width - 1)];
            if (!_.includes(match, [randomRow, randomcol]) && this.orbs[randomRow][randomCol] !== thisOrb) {
                this.swap([[row, col], [randomRow, randomCol]], false);
                swapped = true;
            }
        }
    }
    
    shuffle() {
        this.orbs = _.map(this.orbs, row => _.shuffle(row));
        while (this.hasMatchEvent()) {
            let match = combineMatches(findMatches(this.orbs))[0];
            let [firstRow, firstCol] = match[0];
            let [rowCoords, colCoords] = _.zip(...match);
            if (_.uniq(rowCoords).length === 1 || _.uniq(colCoords).length === 1) {
                this._unmatch(...match[Math.floor(match.length / 2)], []);
            } else {
                // gather intersections
                this._unmatch(..._.sample(intersections), match);
            };
        };
        if (this.needsShuffle()) {
            this.shuffle();
        };
    }

    createValidOrbs() {
        do {
            let chooseOrb = () => { return _.sample(this.types); };
            let sampleRow = () => { return _.times(this.width, chooseOrb); };
            this.orbs = _.zip(..._.times(this.height, sampleRow));
        }
        while (this.hasMatchEvent() || this.needsShuffle());
    }
};

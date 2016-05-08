'use strict';
import * as _ from 'lodash';
let SortedSet = require('collections/sorted-set');

export class Board {
    constructor (width = 8, height = 8, types = _.range(7)) {
        this.width = width;
        this.height = height;
        this.types = types;
        let chooseOrb = () => { return _.sample(this.types); };
        let sampleRow = () => { return _.times(this.width, chooseOrb); };
        this.orbs = _.zip(..._.times(this.height, sampleRow));
        if (this.hasMatch() || this.needsShuffle()) {
            this.shuffle();
        };
    }

    get size() {
        return [this.width, this.height];
    }

    get availableTypes() {
        return _.uniq(_.flatten(this.orbs)).sort();
    }

    /**
      * 1. logs data for each match and replaces each orb with '\u241a'
      * 2. replaces each '\u241a' and all above orbs with either the orb directly above or a random new orb
      * 3. returns the match data -> [[match1Type, match1Amount], [match2Type, match2Amount], ...]
      */
    evaluate(matches, dropOptions = this.types) {
        let matchData = [];

        _.each(matches, match => {
            // log data
            matchData.push([this.orbs[match[0][0]][match[0][1]], match.length]);
            // replace each coordinate with '\u241a'
            _.each(match, coord => {
                let [row, col] = coord;
                this.orbs[row][col] = '\u241a'
            })
        });

        /**
          * drop down and generate matches
          * 1. reads across starting from the top
          * 2. when it hits '\u241a', loops from that position directly up
          * 3. if the row isn't 0, it takes the orb from above
          * 4. if the row is 0, it creates a random orb
        */
        _.each(_.range(this.height), row =>{
            _.each(_.range(this.width), col => { //1
                if (this.orbs[row][col] == '\u241a') {
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

    needsShuffle() {
        return !this.hasPotentialMatch();
    }

    hasPotentialMatch() {
        let chunks = iterchunks(this.orbs);
        // [[[1, 2, 3], [2, 3, 4]], [[3, 4, 5], [4, 5, 6]]] becomes
        //  [[1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6]]
        let flatChunks = _.flattenDepth(chunks, 1);
        let hasWideStyleMatch = _.some(_.map(flatChunks, hasPotentialMatchInSingleRow));
        return hasWideStyleMatch || _.some(_.map(chunks), hasPotentialMatchInPairOfRows);
    }
    
    hasMatch() {
        return Boolean(findTriples(this.orbs)[0]);
    }

    swap(swapOrbs, playerSwap = true) {
        let [[row1, col1], [row2, col2]] = swapOrbs;
        let orbsBefore = _.cloneDeep(this.orbs);
        this.orbs[row1][col1] = orbsBefore[row2][col2]
        this.orbs[row2][col2] = orbsBefore[row1][col1]

        // undo the swap if it did not yeild a match
        if (playerSwap && !this.hasMatch()) {
            this.orbs = orbsBefore;
        };
    }
    
    /**
      * @private
      * @description Does the dirty work for unmatch by taking a given orb and swapping with a neighbor
      * of a different type, or a random orb on the board if there are no valid neighbors.
      * @see unmatch
      */
    _unmatch(row, col, match, skipToRandom = false) {
        let thisOrb = this.orbs[row][col];
        let swapped = false;
        let directions = _.shuffle(['up', 'down', 'left', 'right']);
        for (let i = 0; i < 4; i++) {
            // abandons the process and jumps to swapping a random orb
            if (skipToRandom) { break };
            if (directions[i] === 'up' && !_.isUndefined(this.orbs[row - 1]) && this.orbs[row - 1][col] !== thisOrb) {
                this.swap([[row, col], [row - 1, col]], false);
                swapped = true;
                break;
            } else if (directions[i] === 'down' && !_.isUndefined(this.orbs[row + 1]) && this.orbs[row + 1][col] !== thisOrb) {
                this.swap([[row, col], [row + 1, col]], false);
                swapped = true;
                break;
            } else if (directions[i] === 'left' && !_.isUndefined(this.orbs[row][col - 1]) && this.orbs[row][col - 1] !== thisOrb) {
                this.swap([[row, col], [row, col - 1]], false);
                swapped = true;
                break;
            } else if (directions[i] === 'right' && !_.isUndefined(this.orbs[row][col + 1]) && this.orbs[row][col + 1] !== thisOrb) {
                this.swap([[row, col], [row, col + 1]], false);
                swapped = true;
                break;
            }
        }
        while (!swapped) {
            let [randomRow, randomCol] = [_.random(this.height - 1), _.random(this.width - 1)];
            if (!_.includes(match, [randomRow, randomCol]) && this.orbs[randomRow][randomCol] !== thisOrb) {
                this.swap([[row, col], [randomRow, randomCol]], false);
                swapped = true;
            }
        }
    }
    
    /**
      * @description Removes all match events one at a time by swapping a median or intersecting orb
      * with its neighbor or a random orb if necessary. 
      *
      * Intersectiions only occur if the match is not a simple match, i.e. it only spans one
      * column or one row.
      *
      * @example A simple match could go from 
      *         [ 1, 2, 3, 4 ],             [ 1, 2, 5, 4 ],
      *         [ 2, 5, 5, 5 ],             [ 2, 5, 3, 5 ],
      *         [ 3, 4, 1, 2 ],     to      [ 3, 4, 1, 2 ],
      *         [ 4, 1, 2, 3 ]              [ 4, 1, 2, 3 ]
      *
      * @example A multidimensional match could go from 
      *         [ 1, 2, 3, 4 ],             [ 1, 5, 3, 4 ],
      *         [ 2, 5, 5, 5 ],             [ 2, 2, 5, 5 ],
      *         [ 3, 5, 1, 2 ],     to      [ 3, 5, 1, 2 ],     this.orbs[1][1] was the
      *         [ 4, 5, 2, 3 ]              [ 4, 5, 2, 3 ]      intersection swapped
      *
      * @example A side-by-side match could go from 
      *         [ 1, 5, 5, 5 ],             [ 1, 5, 4, 5 ],                 [ 1, 5, 4, 5 ],
      *         [ 2, 5, 5, 5 ],             [ 2, 5, 5, 5 ],                 [ 2, 5, 1, 5 ],
      *         [ 3, 4, 1, 2 ],     to      [ 3, 4, 1, 2 ],    and then     [ 3, 4, 5, 2 ],
      *         [ 4, 1, 2, 3 ]              [ 5, 1, 2, 3 ]                  [ 5, 1, 2, 3 ]
      */
    unmatch() {
        while (this.hasMatch()) {
            let intersections = [];
            let match = combineMatches(findTriples(this.orbs))[0];
            // it is a simple match if all of the coords have only 1 rowCoord or 1 colCoord
            let [rowCoords, colCoords] = _.zip(...match);
            let isSimpleMatch = _.uniq(rowCoords).length === 1 || _.uniq(colCoords).length === 1;
            if (isSimpleMatch) {
                // finds the median orb in the match
                let median = Math.floor(match.length / 2);
                let [midRow, midCol] = match[median];

                // Checks for a side-by-side match, which could cause and endless loop.
                // In that case, the skipToRandom argument in _unmatch is triggered.
                let midNeighbors;
                if (_.uniq(rowCoords).length === 1) {
                    midNeighbors = [this.orbs[midRow][midCol - 1], this.orbs[midRow][midCol + 1]];
                } else {
                    midNeighbors = [this.orbs[midRow - 1][midCol], this.orbs[midRow + 1][midCol]];
                }
                let isSideBySideMatch = _.includes(midNeighbors, this.orbs[midRow][midCol]);

                this._unmatch(...match[median], match, isSideBySideMatch);
            } else {
                // collects which rows and columns have matches in them
                let matchRows = [];
                let matchCols = [];
                _.each(_.countBy(rowCoords), (v, k) => {
                    if (v > 2) {
                        matchRows.push(_.toInteger(k));
                    };
                });
                _.each(_.countBy(colCoords), (v, k) => {
                    if (v > 2) {
                        matchCols.push(_.toInteger(k));
                    };
                });
                // if a coordinate is in a row match and a column match, it is an intersection
                _.each(match, coords => {
                    if (_.includes(matchRows, coords[0]) && _.includes(matchCols, coords[1])) {
                        intersections.push(coords);
                    };
                });
                // chooses a random intersection to unmatch 
                this._unmatch(..._.sample(intersections), match);
            };
        };
    }

    shuffle() {
        this.orbs = _.map(this.orbs, row => _.shuffle(row));
        this.unmatch();
        if (this.needsShuffle()) {
            this.shuffle();
        };
    }
};

import {QueryToken, TOKEN_TYPE} from "./queryTokens";

export interface TokenVisitor {
    visit(query: string, index: number, tokens: QueryToken[]): number;
}

export class ObjectTokenVisitor implements TokenVisitor {
    private static readonly _literalStartRegex = /[a-zA-Z_$]/;
    private static readonly _literalRegex = /[a-zA-Z_$0-9.?!]/;

    visit(query: string, index: number, tokens: QueryToken[]): number {
        if (query.charCodeAt(index) >= 0 && query.charCodeAt(index) <= 32) {
            return index + 1;
        }

        let positionOffset = 0
        for(let i = 0; i < 3; i++) {
            if (index + i >= query.length || query[index + i] !== '.') {
                positionOffset = 0;
                break;
            }

            positionOffset++;
        }

        if (ObjectTokenVisitor._literalStartRegex.test(query[index + positionOffset])) {
            let endIndex = positionOffset + index + 1;
            while (endIndex < query.length && ObjectTokenVisitor._literalRegex.test(query[endIndex])) {
                endIndex++;
            }

            const value = query.slice(positionOffset + index, endIndex);
            switch (value) {
                case "null": {
                    if (positionOffset !== 0) {
                        throw Error('Spread operator is not supported with the null-value');
                    }

                    tokens.push({
                        tokenType: "NullValue",
                        index: index,
                        length: endIndex - index
                    });
                    break;
                }

                case "undefined": {
                    if (positionOffset !== 0) {
                        throw Error('Spread operator is not supported with the undefined-value');
                    }

                    tokens.push({
                        tokenType: "Undefined",
                        index: index,
                        length: endIndex - index
                    });
                    break;
                }

                default: {
                    tokens.push({
                        tokenType: "Object",
                        index: index,
                        length: endIndex - index
                    });
                    break;
                }
            }

            index = endIndex;
        }

        return index;
    }
}

export class CommaTokenVisitor implements TokenVisitor {
    visit(query: string, index: number, tokens: QueryToken[]): number {
        if (query[index] === ',') {
            tokens.push({
                tokenType: "CommaSeparator",
                index: index++,
                length: 1
            });
        }

        return index;
    }
}

export class BooleanValueTokenVisitor implements TokenVisitor {

    visit(query: string, index: number, tokens: QueryToken[]): number {
        let endIndex = index;
        let length = 0;
        if (index + 'true'.length <= query.length && query.slice(index, index + 'true'.length) === 'true') {
            length = 'true'.length;
        }
        else if (index + 'false'.length <= query.length && query.slice(index, index + 'false'.length) === 'false') {
            length = 'false'.length;
        }

        if (length != 0) {
            tokens.push({
                tokenType: "ConstantValue",
                index: index,
                length: length
            });

            endIndex = index + length;
        }

        return endIndex;
    }
}

export class StringTokenVisitor implements TokenVisitor {
    visit(query: string, index: number, tokens: QueryToken[]): number {
        let endIndex = index;
        let isEnclosed = false;
        if (query[index] === `'` || query[index] === '`' || query[index] === '"') {
            const closeStringChar = query[index];
            let escape = false;
            while (endIndex < query.length) {
                const nextChar = query[++endIndex];
                if (nextChar === '\\') {
                    escape = true;
                    continue;
                }

                if (escape) {
                    escape = false;
                    continue;
                }

                if (nextChar === closeStringChar) {
                    isEnclosed = true;
                    break;
                }
            }

            if (!isEnclosed) {
                throw Error(`Enclosing quote was expected`);
            }

            tokens.push({
                tokenType: "ConstantValue",
                index: index + 1,
                length: endIndex - index - 1
            });
            endIndex++;
        }

        return endIndex;
    }
}

export class NumberTokenVisitor implements TokenVisitor {
    private static readonly _NumberRegex = /[0-9e.]/;

    visit(query: string, index: number, tokens: QueryToken[]): number {
        let endIndex = index;
        if (/[0-9]/.test(query[endIndex])) {
            for (; endIndex < query.length; endIndex++) {
                if (!NumberTokenVisitor._NumberRegex.test(query[endIndex])) {
                    break;
                }
            }

            tokens.push({
                tokenType: "ConstantValue",
                index: index,
                length: endIndex - index
            });
        }

        return endIndex;
    }
}

export class GroupTokenVisitor implements TokenVisitor {
    visit(query: string, index: number, tokens: QueryToken[]): number {
        if (query[index] === '(') {
            tokens.push({
                index: index++,
                tokenType: 'GroupStart',
                length: 1
            })
        } else if (query[index] === ')') {
            tokens.push({
                index: index++,
                tokenType: 'GroupEnd',
                length: 1
            })
        }

        return index;
    }
}

export class LogicalOperatorTokenVisitor implements TokenVisitor {
    visit(query: string, index: number, tokens: QueryToken[]): number {
        if (query.slice(index, index + 2) === '||' || query.slice(index, index + 2) === '&&') {
            tokens.push({
                tokenType: query[index] === '|' ? 'OR' : 'AND',
                index: index,
                length: 2
            });

            index += 2;
        }

        return index;
    }
}

export class CompareOperatorVisitor implements TokenVisitor {
    visit(query: string, index: number, tokens: QueryToken[]): number {
        let tokenType: TOKEN_TYPE | undefined;
        let nextIndex = index;
        switch (query[index]) {
            case '!': {
                if (query[nextIndex + 1] === '=') {
                    nextIndex++;
                    tokenType = 'NotEquals';

                    if (query[nextIndex + 1] === '=') {
                        nextIndex++;
                    }
                }

                break;
            }
            case '=': {
                if (query[nextIndex + 1] === '>') {
                    tokenType = 'LambdaInitializer';
                    nextIndex++;
                }
                else if (query[nextIndex + 1] === '=') {
                    nextIndex++;
                    tokenType = "Equals";
                    if (query[nextIndex + 1] === '=') {
                        nextIndex++;
                    }
                }
                else {
                    tokenType = 'Assign';
                }

                break;
            }
            case '>': {
                if (query[nextIndex + 1] === '=') {
                    nextIndex++;
                    tokenType = 'GreaterThanOrEquals';
                }
                else {
                    tokenType = 'GreaterThan';
                }

                break;
            }
            case '<': {
                if (query[nextIndex + 1] === '=') {
                    nextIndex++;
                    tokenType = 'LessThanOrEquals';
                }
                else {
                    tokenType = 'LessThanOrEquals';
                }

                break;
            }
        }

        if (!!tokenType) {
            nextIndex++;
            tokens.push({
                tokenType: tokenType!,
                index: index,
                length: nextIndex - index
            })
        }

        return nextIndex;
    }
}

export class NotTokenVisitor implements TokenVisitor {
    visit(query: string, index: number, tokens: QueryToken[]): number {
        if (query[index] === '!' && query[index + 1] !== '=') {
            tokens.push({
                index: index++,
                tokenType: "Inverse",
                length: 1
            });
        }

        return index;
    }
}

export class MathOperatorTokenVisitor implements TokenVisitor {
    private static readonly _MathOperators: string[] = ["/", "*", "-", "+"];
    visit(query: string, index: number, tokens: QueryToken[]): number {
        if (MathOperatorTokenVisitor._MathOperators.includes(query[index])) {
            tokens.push({
                tokenType: "MathOperator",
                index: index++,
                length: 1
            });
        }

        return index;
    }

}

import {QueryToken, TokenType} from "./queryTokens";

export interface TokenVisitor {
    visit(query: string, index: number, tokens: QueryToken[]): number;
}

export class ObjectTokenVisitor implements TokenVisitor {
    private static readonly _literalStartRegex = /[a-zA-Z_$]/;
    private static readonly _literalRegex = /[a-zA-Z_$0-9.]/;

    visit(query: string, index: number, tokens: QueryToken[]): number {
        if (query.charCodeAt(index) >= 0 && query.charCodeAt(index) <= 32) {
            return index + 1;
        }

        if (ObjectTokenVisitor._literalStartRegex.test(query[index])) {
            let startIndex = index++;
            while(index < query.length && ObjectTokenVisitor._literalRegex.test(query[index])) {
                index++;
            }

            const value = query.slice(startIndex, startIndex + index);
            switch (value) {
                case "null": {
                    tokens.push({
                        tokenType: "NullValue",
                        index: startIndex,
                        length: index - startIndex
                    });
                    break;
                }

                case "undefined": {
                    tokens.push({
                        tokenType: "Undefined",
                        index: startIndex,
                        length: index - startIndex
                    });
                    break;
                }
                default: {
                    tokens.push({
                        tokenType: "Object",
                        index: startIndex,
                        length: index - startIndex
                    });
                    break;
                }
            }
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

export class StringTokenVisitor implements TokenVisitor{
    visit(query: string, index: number, tokens: QueryToken[]): number {
        let endIndex = index;
        if (query[index] === `'` || query[index] === '`' || query[index] === '"') {
            const closeStringChar = query[index];
            let escape = false;
            while(endIndex < query.length) {
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
                    endIndex++;
                    break;
                }
            }

            tokens.push({
                tokenType: closeStringChar === '`' ? 'FormatString' : 'String',
                index: index,
                length: endIndex - index
            });
        }

        return endIndex;
    }
}

export class NumberTokenVisitor implements TokenVisitor {
    private static readonly _NumberRegex = /[0-9e.]/;
    visit(query: string, index: number, tokens: QueryToken[]): number {
        let endIndex = index;
        if (/[0-9]/.test(query[endIndex])) {
            for(;endIndex < query.length; endIndex++) {
                if (!NumberTokenVisitor._NumberRegex.test(query[endIndex])) {
                    break;
                }
            }

            tokens.push({
                tokenType: "Number",
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
        }
        else if (query[index] === ')') {
            tokens.push({
                index: index++,
                tokenType: 'GroupEnd',
                length: 1
            })
        }

        return index;
    }
}

export class LambdaTokenVisitor implements TokenVisitor {
    visit(query: string, index: number, tokens: QueryToken[]): number {
        if (query[index] === '=' && query.length >= index + 1 && query[index + 1] === '>') {
            tokens.push({
                tokenType: 'LambdaInitializer',
                index: index,
                length: 2
            });

            index += 2;
        }

        return index;
    }
}

export class LogicalOperatorTokenVisitor implements TokenVisitor {
    visit(query: string, index: number, tokens: QueryToken[]): number {
        if (query.slice(index, index + 2) === '||' || query.slice(index, index + 2) === '&&') {
            tokens.push({
                tokenType: query[index] === '|' ? 'Or' : 'And',
                index: index,
                length: 2
            });

            index += 2;
        }

        return index;
    }
}

export class BooleanOperatorTokenVisitor implements TokenVisitor {
    visit(query: string, index: number, tokens: QueryToken[]): number {
        let tokenType: TokenType;
        let endIndex = index;
        switch (query[index]) {
            case '>': {
                if (query[++endIndex] === '=') {
                    tokenType = 'GreaterOrEquals';
                    endIndex++;
                }
                else {
                    tokenType = 'GreaterThan';
                }

                break;
            }

            case '<': {
                if (query[++endIndex] === '=') {
                    tokenType = 'LessThanOrEquals';
                    endIndex++;
                }
                else {
                    tokenType = 'LessThan';
                }

                break;
            }

            case '=': {
                if (query[++endIndex] !== '=') {
                    --endIndex;
                }
                else {
                    tokenType = "Equals";
                    if (query[++endIndex] === '=') {
                        ++endIndex;
                    }
                    else {
                        --endIndex;
                    }
                }

                break;
            }

            case '!': {
                if (query[++endIndex] !== '=') {
                    --endIndex;
                }
                else {
                    tokenType = "NotEquals";
                    if (query[++endIndex] === '=') {
                        ++endIndex;
                    }
                    else {
                        --endIndex;
                    }
                }

                break;
            }
        }

        if (endIndex !== index) {
            tokens.push({
                tokenType: tokenType!,
                index: index,
                length: endIndex - index
            })
        }

        return endIndex;
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
import TokenVisitor from "./tokenVisitor";
import {QueryToken, TokenType} from "../queryTokens";

export default class BooleanOperatorTokenVisitor implements TokenVisitor {
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

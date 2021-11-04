import TokenVisitor from "./tokenVisitor";
import {QueryToken} from "../queryTokens";

export default class GroupTokenVisitor implements TokenVisitor {
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

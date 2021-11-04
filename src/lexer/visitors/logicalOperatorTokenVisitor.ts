import TokenVisitor from "./tokenVisitor";
import {QueryToken} from "../queryTokens";

export default class LogicalOperatorTokenVisitor implements TokenVisitor {
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

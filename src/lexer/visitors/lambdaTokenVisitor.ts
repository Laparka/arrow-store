import TokenVisitor from "./tokenVisitor";
import {QueryToken} from "../queryTokens";

export default class LambdaTokenVisitor implements TokenVisitor {
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

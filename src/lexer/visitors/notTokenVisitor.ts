import TokenVisitor from "./tokenVisitor";
import {QueryToken} from "../queryTokens";

export default class NotTokenVisitor implements TokenVisitor {
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

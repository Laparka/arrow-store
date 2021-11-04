import TokenVisitor from "./tokenVisitor";
import {QueryToken} from "../queryTokens";

const literalStartRegex = /[a-zA-Z_$]/;
const literalRegex = /[a-zA-Z_$0-9.]/;
export default class ObjectTokenVisitor implements TokenVisitor {
    visit(query: string, index: number, tokens: QueryToken[]): number {
        if (query.charCodeAt(index) >= 0 && query.charCodeAt(index) <= 32) {
            return index + 1;
        }

        if (literalStartRegex.test(query[index])) {
            let startIndex = index++;
            while(index < query.length && literalRegex.test(query[index])) {
                index++;
            }

            tokens.push({
                tokenType: "Object",
                index: startIndex,
                length: index - startIndex
            });
        }

        return index;
    }
}

import TokenVisitor from "./tokenVisitor";
import {QueryToken} from "../queryTokens";

const numberRegex = /[0-9e.]/;
export default class NumberTokenVisitor implements TokenVisitor {
    visit(query: string, index: number, tokens: QueryToken[]): number {
        let endIndex = index;
        if (/[0-9]/.test(query[endIndex])) {
            for(;endIndex < query.length; endIndex++) {
                if (!numberRegex.test(query[endIndex])) {
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

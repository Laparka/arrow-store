import TokenVisitor from "./tokenVisitor";
import {QueryToken} from "../queryTokens";

export default class StringTokenVisitor implements TokenVisitor{
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

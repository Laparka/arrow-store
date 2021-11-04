import {QueryToken} from "./queryTokens";
import TokenVisitor from "./visitors/tokenVisitor";
import ObjectTokenVisitor from "./visitors/objectTokenVisitor";
import GroupTokenVisitor from "./visitors/groupTokenVisitor";
import NotTokenVisitor from "./visitors/notTokenVisitor";
import StringTokenVisitor from "./visitors/stringTokenVisitor";
import NumberTokenVisitor from "./visitors/numberTokenVisitor";
import LambdaTokenVisitor from "./visitors/lambdaTokenVisitor";
import LogicalOperatorTokenVisitor from "./visitors/logicalOperatorTokenVisitor";
import BooleanOperatorTokenVisitor from "./visitors/booleanOperatorTokenVisitor";

const tokenVisitors: TokenVisitor[] = [
    new BooleanOperatorTokenVisitor(),
    new GroupTokenVisitor(),
    new LambdaTokenVisitor(),
    new ObjectTokenVisitor(),
    new LogicalOperatorTokenVisitor(),
    new NotTokenVisitor(),
    new NumberTokenVisitor(),
    new StringTokenVisitor()
];
export class LambdaExpressionLexer {
    tokenize(query: string): ReadonlyArray<QueryToken> {
        if (!query) {
            return [];
        }

        query = query.trim();
        if (query.length === 0) {
            return [];
        }

        const tokens: QueryToken[] = [];
        for(let i = 0; i < query.length;) {
            const next = this._visit(query, i, tokens);
            if (next <= i) {
                throw Error(`Infinite loop detected`);
            }

            i = next;
        }

        return tokens;
    }

    private _visit(query: string, currentIndex: number, tokens: QueryToken[]): number {
        if (!query || currentIndex > query.length) {
            return query.length;
        }

        for(let i = 0; i < tokenVisitors.length; i++) {
            const processedUpTo = tokenVisitors[i].visit(query, currentIndex, tokens);
            if (processedUpTo === currentIndex) {
                continue;
            }

            if (processedUpTo > currentIndex) {
                return processedUpTo;
            }

            throw Error(`The token visitor moved the index to the back. Query: "${query}", at ${currentIndex}`);
        }

        throw Error(`Failed to process the query ..."${query.slice(currentIndex, query.length)}" at ${currentIndex}-position`);
    }
}

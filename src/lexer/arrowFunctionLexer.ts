import {QueryToken} from "./queryTokens";
import {
    CompareOperatorVisitor,
    CommaTokenVisitor,
    GroupTokenVisitor,
    LogicalOperatorTokenVisitor,
    NotTokenVisitor,
    NumberTokenVisitor,
    ObjectTokenVisitor,
    StringTokenVisitor,
    TokenVisitor,
    MathOperatorTokenVisitor, BooleanValueTokenVisitor
} from "./tokenVisitors";

export default class ArrowFunctionLexer {
    private static readonly _TokenVisitors: TokenVisitor[] = [
        new CompareOperatorVisitor(),
        new MathOperatorTokenVisitor(),
        new GroupTokenVisitor(),
        new LogicalOperatorTokenVisitor(),
        new NotTokenVisitor(),
        new NumberTokenVisitor(),
        new StringTokenVisitor(),
        new BooleanValueTokenVisitor(),
        new CommaTokenVisitor(),
        new ObjectTokenVisitor()
    ];

    public static readonly Instance: ArrowFunctionLexer = new ArrowFunctionLexer();

    private constructor() {
    }

    tokenize(query: string): ReadonlyArray<QueryToken> {
        if (!query) {
            return [];
        }

        query = query.trim();
        if (query.length === 0) {
            return [];
        }

        const tokens: QueryToken[] = [];
        for (let i = 0; i < query.length;) {
            const next = ArrowFunctionLexer._visit(query, i, tokens);
            if (next <= i) {
                throw Error(`Infinite loop detected`);
            }

            i = next;
        }

        return tokens;
    }

    private static _visit(query: string, currentIndex: number, tokens: QueryToken[]): number {
        if (!query || currentIndex > query.length) {
            return query.length;
        }

        for (let i = 0; i < this._TokenVisitors.length; i++) {
            const processedUpTo = this._TokenVisitors[i].visit(query, currentIndex, tokens);
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

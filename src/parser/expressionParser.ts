import {QueryToken} from "../lexer/queryTokens";
import {ParserNode} from "./nodes";

export class NodeExpressionIterator {
    constructor(query: string, tokens: ReadonlyArray<QueryToken>) {
        this.index = 0;
        this.query = query;
        this.tokens = tokens
    }

    index: number;
    query: string;
    tokens: ReadonlyArray<QueryToken>;

    getCurrentToken(): QueryToken {
        if (this.index > this.tokens.length - 1) {
            return {tokenType: "Terminator", index: this.index, length: 0};
        }

        if (this.index === this.tokens.length) {
            throw Error(`Never reachable`);
        }

        return this.tokens[this.index];
    }

    stringify(token: QueryToken): string {
        if (!token) {
            throw Error(`The token parameter is missing`);
        }

        if (token.index >= this.query.length || token.index + token.length > this.query.length) {
            throw Error(`The token length is greater than the query itself. Query:${this.query}, Token: ${token.index}-${token.length}`);
        }

        if (token.length === 0) {
            return '';
        }

        return this.query.slice(token.index, token.index + token.length);
    }
}

export type ExpressionParser = {
    parse(query: string, lexerTokens: ReadonlyArray<QueryToken>): ParserNode;
}

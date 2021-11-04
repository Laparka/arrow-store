import {QueryToken} from "../queryTokens";

export default interface TokenVisitor {
    visit(query: string, index: number, tokens: QueryToken[]): number;
}

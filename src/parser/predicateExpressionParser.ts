import {QueryToken, TokenType} from "../lexer/queryTokens";
import {
    BooleanOperationNode,
    CompareOperationNode,
    StringValueNode,
    GroupNode,
    ObjectAccessorNode,
    ParserNode,
    LambdaExpressionNode,
    NumberValueNode,
    FunctionNode,
    InverseNode, ArgumentsNode, NullValueNode, UndefinedValueNode, BoolValueNode
} from "./nodes";

type NodeIterator = {
    index: number;
    query: string;
    lastIndex: number;
    tokens: ReadonlyArray<QueryToken>;
};

const _comparisonTokens: TokenType[] = ['Equals', 'NotEquals', 'GreaterThan', 'GreaterOrEquals', 'LessThan', 'LessThanOrEquals'];

export default class PredicateExpressionParser {
    parse(query: string, tokens: ReadonlyArray<QueryToken>): ParserNode {
        return this._lambda({ query: query, index: 0, lastIndex: tokens.length - 1, tokens: tokens});
    }

    private _lambda(iterator: NodeIterator): ParserNode {
        const left = this._or(iterator);
        const token = this._getCurrentToken(iterator);
        if (token.tokenType === 'LambdaInitializer') {
            iterator.index++;
            const right = this._lambda(iterator);
            return new LambdaExpressionNode(left, right);
        }

        return left;
    }

    private _or(iterator: NodeIterator): ParserNode {
        const left = this._and(iterator);
        const token = this._getCurrentToken(iterator);
        if (token.tokenType === 'Or') {
            iterator.index++;
            const right = this._or(iterator);
            return new BooleanOperationNode('Or', left, right)
        }

        return left;
    }

    private _and(iterator: NodeIterator): ParserNode {
        const left = this._compare(iterator);
        const token = this._getCurrentToken(iterator);
        if (token.tokenType === 'And') {
            iterator.index++;
            const right = this._and(iterator);
            return new BooleanOperationNode('And', left, right)
        }

        return left;
    }

    private _compare(iterator: NodeIterator): ParserNode {
        const left = this._argument(iterator);
        const token = this._getCurrentToken(iterator);
        if (_comparisonTokens.findIndex(x => x === token.tokenType) >= 0) {
            iterator.index++;
            const right = this._compare(iterator);
            return new CompareOperationNode(token.tokenType, left, right);
        }

        return left;
    }

    private _argument(iterator: NodeIterator): ParserNode {
        const left = this._function(iterator);
        const token = this._getCurrentToken(iterator);
        if (token.tokenType === "CommaSeparator") {
            iterator.index++;
            const rightArgs = this._argument(iterator);
            const leftArgs = left.nodeType === "Arguments" ? (<ArgumentsNode>left).args : [left];
            return new ArgumentsNode([...leftArgs, rightArgs]);
        }

        return left;
    }
    private _function(iterator: NodeIterator): ParserNode {
        const left = this._value(iterator);
        const token = this._getCurrentToken(iterator);
        if (token.tokenType === "GroupStart") {
            iterator.index++;
            const argumentsNode = this._argument(iterator);
            const closingToken = this._getCurrentToken(iterator);
            if (closingToken.tokenType !== "GroupEnd") {
                throw Error(`A closing parenthesis token is expected in function's arguments node: ${this._stringify(iterator.query, closingToken)}`)
            }

            iterator.index++;
            const memberSegments = (<ObjectAccessorNode>left).value.split('.');
            const functionName = memberSegments[memberSegments.length - 1];
            const instanceAccessorNode = new ObjectAccessorNode(memberSegments.slice(0, memberSegments.length - 1).join('.'))
            return new FunctionNode(functionName, instanceAccessorNode, argumentsNode)
        }

        return left;
    }

    private _value(iterator: NodeIterator): ParserNode {
        const left = this._groupStart(iterator);
        if (!!left){
            return left;
        }

        const token = this._getCurrentToken(iterator);
        switch (token.tokenType){
            case "Object": {
                iterator.index++;
                return new ObjectAccessorNode(this._stringify(iterator.query, token));
            }

            case "NullValue": {
                iterator.index++;
                return new NullValueNode();
            }

            case "Boolean": {
                iterator.index++;
                return new BoolValueNode(this._stringify(iterator.query, token) === "true");
            }

            case "FormatString":
            case "String":{
                iterator.index++;
                return new StringValueNode(this._stringify(iterator.query, token), token.tokenType === "FormatString");
            }

            case "Number": {
                iterator.index++;
                return new NumberValueNode(parseFloat(this._stringify(iterator.query, token)));
            }

            case "Undefined": {
                iterator.index++;
                return new UndefinedValueNode();
            }
        }

        throw Error(`Expected an object accessor or a value token, but received ${this._stringify(iterator.query, token)}`);
    }

    private _groupStart(iterator: NodeIterator): ParserNode | null {
        const left = this._inverse(iterator);
        const token = this._getCurrentToken(iterator);
        if (token.tokenType === "GroupStart") {
            iterator.index++;
            const groupNode = new GroupNode(this._lambda(iterator));
            const groupEndToken = this._getCurrentToken(iterator);
            if (groupEndToken.tokenType !== "GroupEnd") {
                throw Error(`No closing parenthesis was found for the group expression: ${this._stringify(iterator.query, groupEndToken)}`);
            }

            iterator.index++;
            return groupNode;
        }

        return left;
    }

    private _inverse(iterator: NodeIterator): ParserNode | null {
        const token = this._getCurrentToken(iterator);
        if (token.tokenType === "Inverse") {
            iterator.index++;
            return new InverseNode(this._function(iterator));
        }

        return null;
    }

    private _getCurrentToken(iterator: NodeIterator): QueryToken {
        if (iterator.index > iterator.lastIndex) {
            return {tokenType: "Terminator", index: iterator.index, length: 0};
        }

        if (iterator.index === iterator.tokens.length){
            throw Error(`Never reachable`);
        }

        return iterator.tokens[iterator.index];
    }

    private _stringify(query: string, token: QueryToken): string {
        if (!query || !token) {
            throw Error(`The query or token parameters are missing`);
        }

        if (token.index  >= query.length || token.index + token.length > query.length) {
            throw Error(`The token length is greater than the query itself. Query:${query}, Token: ${token.index}-${token.length}`);
        }

        return query.slice(token.index, token.index + token.length);
    }
}

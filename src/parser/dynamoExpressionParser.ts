import {QueryToken, TokenType} from "../lexer/queryTokens";
import {
    BooleanOperationNode,
    CompareOperationNode,
    StringValueNode,
    GroupNode,
    ObjectAccessorNode,
    ParserNode,
    LambdaExpressionNode, ParameterNode, NumberValueNode, FunctionNode
} from "./nodes";

type NodeIterator = {
    index: number;
    query: string;
    lastIndex: number;
    tokens: ReadonlyArray<QueryToken>;
};

const _comparisonTokens: TokenType[] = ['Equals', 'NotEquals', 'GreaterThan', 'GreaterOrEquals', 'LessThan', 'LessThanOrEquals'];

export default class DynamoDBExpressionParser {
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
            const right = this._lambda(iterator);
            return new BooleanOperationNode('Or', left, right)
        }

        return left;
    }

    private _and(iterator: NodeIterator): ParserNode {
        const left = this._function(iterator);
        const token = this._getCurrentToken(iterator);
        if (token.tokenType === 'And') {
            iterator.index++;
            const right = this._lambda(iterator);
            return new BooleanOperationNode('And', left, right)
        }

        return left;
    }

    private _function(iterator: NodeIterator): ParserNode {
        const left = this._compare(iterator);
        const token = this._getCurrentToken(iterator);
        if (token.tokenType === 'GroupStart' && left.nodeType === 'ObjectAccessor') {
            iterator.index++;
            const objectSegments = (<ObjectAccessorNode>left).accessor.split(/[.]/g);
            const functionName = objectSegments[objectSegments.length - 1];
            const instance = new ObjectAccessorNode(objectSegments.slice(0, objectSegments.length - 1).join('.'));
            const argument = this._functionArgNode(iterator);
            return new FunctionNode(functionName, instance, argument);
        }

        return left;
    }

    private _functionArgNode(iterator: NodeIterator): ParserNode {
        const left = this._operand(iterator);
        const token = this._getCurrentToken(iterator);
        if (token.tokenType === 'GroupEnd') {
            iterator.index++;
        }

        return left;
    }

    private _compare(iterator: NodeIterator): ParserNode {
        const left = this._operand(iterator);
        const token = this._getCurrentToken(iterator);
        if (_comparisonTokens.findIndex(x => token.tokenType === x) >= 0) {
            iterator.index++;
            const right = this._function(iterator);
            return new CompareOperationNode(token.tokenType, left, right);
        }

        return left;
    }

    private _operand(iterator: NodeIterator): ParserNode {
        const token = this._getCurrentToken(iterator);
        switch (token.tokenType) {
            case 'String':
            case 'FormatString':
            {
                iterator.index++;
                return new StringValueNode(this._stringify(iterator.query, token), token.tokenType === 'FormatString');
                break
            }

            case 'Number':{
                iterator.index++;
                return new NumberValueNode(parseFloat(this._stringify(iterator.query, token)));
            }

            case 'Boolean': {
                iterator.index++;
                throw Error(`Not implemented`);
            }

            case 'Object': {
                return this._object(iterator);
            }

            case 'GroupStart': {
                iterator.index++;
                const group = this._lambda(iterator);
                const endToken = this._getCurrentToken(iterator);
                if (endToken.tokenType !== 'GroupEnd') {
                    throw Error(`The closing-parenthesis was not found`);
                }

                iterator.index++;
                return new GroupNode(group);
            }
        }

        throw Error(`Not supported constant value token`);
    }

    private _object(iterator: NodeIterator): ParserNode {
        const token = this._getCurrentToken(iterator);
        if (token.tokenType !== "Object") {
            throw Error(`An object token was expected`);
        }

        iterator.index++;
        return new ObjectAccessorNode(this._stringify(iterator.query, token));
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

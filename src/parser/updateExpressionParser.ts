import {ExpressionParser, NodeExpressionIterator} from "./expressionParser";
import {QueryToken} from "../lexer/queryTokens";
import {
    ArgumentsExpressionNode,
    AssignExpressionNode, FunctionExpressionNode,
    GroupExpressionNode,
    LambdaExpressionNode,
    MathExpressionNode,
    NullValueNode,
    ObjectAccessorNode,
    ParserNode,
    ConstantValueNode, IncrementExpressionNode
} from "./nodes";

export default class UpdateExpressionParser implements ExpressionParser {
    public static Instance: UpdateExpressionParser = new UpdateExpressionParser();

    private constructor() {
    }

    parse(query: string, lexerTokens: ReadonlyArray<QueryToken>): ParserNode {
        const iterator = new NodeExpressionIterator(query, lexerTokens);
        return this._lambda(iterator);
    }

    private _lambda(iterator: NodeExpressionIterator): ParserNode {
        // x => x.collection
        const left = this._assign(iterator);
        const token = iterator.getCurrentToken();
        if (token.tokenType === "LambdaInitializer") {
            iterator.index++;
            const right = this._assign(iterator);
            return new LambdaExpressionNode(left, right);
        }

        return left;
    }

    private _assign(iterator: NodeExpressionIterator): ParserNode {
        // (x, ctx) => x.item = ctx.value + 1
        // (x, ctx) => x.collection = x.collection.concat('item')
        const assignee = this._math(iterator);
        const token = iterator.getCurrentToken();
        if (token.tokenType === "Assign") {
            iterator.index++;
            const value = this._assign(iterator);
            return new AssignExpressionNode(assignee, value);
        }

        return assignee;
    }

    private _math(iterator: NodeExpressionIterator): ParserNode {
        // (x, ctx) => x.item = 3 + (ctx.value + 1) - 2
        // (x, ctx) => x.collection = x.collection.concat('item')
        const left = this._args(iterator);
        if (left === null) {
            throw Error(`No known token found at ${iterator.index}-position`);
        }

        const token = iterator.getCurrentToken();
        if (token.tokenType === "MathOperator") {
            iterator.index++;
            const operator = iterator.stringify(token);
            const increment = operator === '+' && iterator.getCurrentToken().tokenType === "Assign";
            if (increment) {
                iterator.index++;
            }

            const right = this._math(iterator);
            if (increment) {
                return new IncrementExpressionNode(left!, right!);
            }

            return new MathExpressionNode(left, right, iterator.stringify(token));
        }

        return left;
    }

    private _args(iterator: NodeExpressionIterator): ParserNode | null {
        const left = this._group(iterator);
        const token = iterator.getCurrentToken();
        if (token.tokenType === "CommaSeparator") {
            iterator.index++;
            const arg = this._args(iterator);
            if (left === null) {
                throw Error(`Can't parse the function argument`);
            }

            if (arg === null) {
                throw Error(`Can't parse the next argument after the ${left.nodeType}`);
            }

            return new ArgumentsExpressionNode([left, arg])
        }

        return left;
    }

    private _group(iterator: NodeExpressionIterator): ParserNode | null {
        const left = this._variable(iterator);
        const token = iterator.getCurrentToken();
        if (token.tokenType === "GroupStart") {
            iterator.index++;
            const body = this._args(iterator);
            if (body === null) {
                throw Error(`Group body was expected`);
            }

            if (iterator.getCurrentToken().tokenType !== "GroupEnd") {
                throw Error(`The enclosing group bracket was expected`);
            }

            iterator.index++;
            if (left !== null) {
                return this._toFunction(left, body);
            }

            return new GroupExpressionNode(body);
        }

        if (left === null) {
            throw Error(`No known token was found at ${iterator.index}-position. A constant value or object accessor was expected`);
        }

        return left;
    }

    private _variable(iterator: NodeExpressionIterator): ParserNode | null {
        const token = iterator.getCurrentToken();
        let variable: ParserNode;
        switch (token.tokenType) {
            case "ConstantValue": {
                variable = new ConstantValueNode(iterator.stringify(token));
                break;
            }
            case "NullValue": {
                variable = new NullValueNode();
                break;
            }
            case "Object": {
                const value = iterator.stringify(token);
                variable = new ObjectAccessorNode(value);
                break;
            }
            default: {
                return null;
            }
        }

        iterator.index++;
        return variable;
    }

    private _toFunction(instanceNode: ParserNode, argsNode: ParserNode): FunctionExpressionNode {
        if (instanceNode.nodeType !== "ObjectAccessor") {
            throw Error(`Function operation can be performed only on instance members. But received ${instanceNode.nodeType}`);
        }

        const instanceSegments = (<ObjectAccessorNode>instanceNode).value.split('.');
        const instanceName = instanceSegments.slice(0, instanceSegments.length - 1).join('.');
        const functionName = instanceSegments[instanceSegments.length - 1];
        return new FunctionExpressionNode(functionName, new ObjectAccessorNode(instanceName), argsNode);
    }
}

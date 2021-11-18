import {QueryToken, TOKEN_TYPE} from "../lexer/queryTokens";
import {
    ArgumentsNode,
    BooleanOperationNode,
    BoolValueNode,
    CompareOperationNode,
    FunctionNode,
    GroupNode,
    InverseNode,
    LambdaExpressionNode,
    NullValueNode,
    NumberValueNode,
    ObjectAccessorNode,
    ParserNode,
    StringValueNode,
    UndefinedValueNode
} from "./nodes";
import {COMPARE_OPERATOR_TYPE} from "../records/record";
import {ExpressionParser, NodeExpressionIterator} from "./expressionParser";

const _comparisonTokens: TOKEN_TYPE[] = ['Equals', 'NotEquals', 'GreaterThan', 'GreaterThanOrEquals', 'LessThan', 'LessThanOrEquals'];

export default class FilterExpressionParser implements ExpressionParser {
    public static readonly Instance: FilterExpressionParser = new FilterExpressionParser();

    private constructor() {
    }

    parse(query: string, tokens: ReadonlyArray<QueryToken>): ParserNode {
        const iterator = new NodeExpressionIterator(query, tokens);
        return this._lambda(iterator);
    }

    private _lambda(iterator: NodeExpressionIterator): ParserNode {
        const left = this._or(iterator);
        const token = iterator.getCurrentToken();
        if (token.tokenType === 'LambdaInitializer') {
            iterator.index++;
            const right = this._lambda(iterator);
            return new LambdaExpressionNode(left, right);
        }

        return left;
    }

    private _or(iterator: NodeExpressionIterator): ParserNode {
        const left = this._and(iterator);
        const token = iterator.getCurrentToken();
        if (token.tokenType === 'Or') {
            iterator.index++;
            const right = this._or(iterator);
            return new BooleanOperationNode('Or', left, right)
        }

        return left;
    }

    private _and(iterator: NodeExpressionIterator): ParserNode {
        const left = this._compare(iterator);
        const token = iterator.getCurrentToken();
        if (token.tokenType === 'And') {
            iterator.index++;
            const right = this._and(iterator);
            return new BooleanOperationNode('And', left, right)
        }

        return left;
    }

    private _compare(iterator: NodeExpressionIterator): ParserNode {
        const left = this._argument(iterator);
        const token = iterator.getCurrentToken();
        if (_comparisonTokens.findIndex(x => x === token.tokenType) >= 0) {
            iterator.index++;
            const right = this._compare(iterator);
            return new CompareOperationNode(<COMPARE_OPERATOR_TYPE>token.tokenType, left, right);
        }

        return left;
    }

    private _argument(iterator: NodeExpressionIterator): ParserNode {
        const left = this._function(iterator);
        const token = iterator.getCurrentToken();
        if (token.tokenType === "CommaSeparator") {
            iterator.index++;
            const rightArgs = this._argument(iterator);
            const leftArgs = left.nodeType === "Arguments" ? (<ArgumentsNode>left).args : [left];
            return new ArgumentsNode([...leftArgs, rightArgs]);
        }

        return left;
    }

    private _function(iterator: NodeExpressionIterator): ParserNode {
        const left = this._value(iterator);
        const token = iterator.getCurrentToken();
        if (token.tokenType === "GroupStart") {
            iterator.index++;
            const argumentsNode = this._argument(iterator);
            const closingToken = iterator.getCurrentToken();
            if (closingToken.tokenType !== "GroupEnd") {
                throw Error(`A closing parenthesis token is expected in function's arguments node: ${iterator.stringify(closingToken)}`)
            }

            iterator.index++;
            const memberSegments = (<ObjectAccessorNode>left).value.split('.');
            const functionName = memberSegments[memberSegments.length - 1];
            const instanceAccessorNode = new ObjectAccessorNode(memberSegments.slice(0, memberSegments.length - 1).join('.'))
            return new FunctionNode(functionName, instanceAccessorNode, argumentsNode)
        }

        return left;
    }

    private _value(iterator: NodeExpressionIterator): ParserNode {
        const left = this._groupStart(iterator);
        if (!!left) {
            return left;
        }

        const token = iterator.getCurrentToken();
        switch (token.tokenType) {
            case "Object": {
                iterator.index++;
                return new ObjectAccessorNode(iterator.stringify(token));
            }

            case "NullValue": {
                iterator.index++;
                return new NullValueNode();
            }

            case "Boolean": {
                iterator.index++;
                return new BoolValueNode(iterator.stringify(token) === "true");
            }

            case "String": {
                iterator.index++;
                const value = iterator.stringify(token);
                const isEnquote = value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '`' || value[0] === `'` || value[0] === '"');
                return new StringValueNode(value, isEnquote);
            }

            case "Number": {
                iterator.index++;
                return new NumberValueNode(parseFloat(iterator.stringify(token)));
            }

            case "Undefined": {
                iterator.index++;
                return new UndefinedValueNode();
            }
        }

        throw Error(`Expected an object accessor or a value token, but received ${iterator.stringify(token)}`);
    }

    private _groupStart(iterator: NodeExpressionIterator): ParserNode | null {
        const left = this._inverse(iterator);
        const token = iterator.getCurrentToken();
        if (token.tokenType === "GroupStart") {
            iterator.index++;
            const groupNode = new GroupNode(this._lambda(iterator));
            const groupEndToken = iterator.getCurrentToken();
            if (groupEndToken.tokenType !== "GroupEnd") {
                throw Error(`No closing parenthesis was found for the group expression: ${iterator.stringify(groupEndToken)}`);
            }

            iterator.index++;
            return groupNode;
        }

        return left;
    }

    private _inverse(iterator: NodeExpressionIterator): ParserNode | null {
        const token = iterator.getCurrentToken();
        if (token.tokenType === "Inverse") {
            iterator.index++;
            return new InverseNode(this._function(iterator));
        }

        return null;
    }

}

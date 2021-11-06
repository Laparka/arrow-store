import {
    ArgumentsNode, BooleanOperationNode, BoolValueNode, CompareOperationNode,
    FunctionNode,
    GroupNode,
    InverseNode,
    LambdaExpressionNode, NullValueNode, NumberValueNode,
    ObjectAccessorNode,
    ParserNode, StringValueNode
} from "./nodes";

export type FilterExpression = {
    expression: string;
    values: Map<string, string>;
};

type TraversalContext = {
    stack: string[],
    recordSchema: any,
    contextParameters: any | undefined,
    filterAttributes: Map<string, string>,
    rootParameterName?: string,
    contextParameterName?: string
};

export class DynamoDBExpressionTransformer {
    transform(expression: ParserNode, recordSchema: any, parametersMap: any | undefined): FilterExpression {
        const stack: string[] = [];
        const ctx = {stack: stack, contextParameters: parametersMap, filterAttributes: new Map<string, string>(), recordSchema: recordSchema};
        this._visit(expression, ctx);

        if (stack.length !== 1) {
            throw Error(`Expression parsing failed. Only 1 element must be in the stack: ${stack.join(', ')}`);
        }

        return {
            expression: stack.pop()!,
            values: ctx.filterAttributes
        }
    }

    private _visit(expression: ParserNode, context: TraversalContext): void {
        switch (expression.nodeType) {
            case "LambdaExpression": {
                this._visitLambda(<LambdaExpressionNode>expression, context);
                break;
            }
            case "GroupExpression": {
                this._visitGroup(<GroupNode>expression, context);
                break;
            }
            case "Function": {
                this._visitFunction(<FunctionNode>expression, context);
                break;
            }
            case "Inverse": {
                this._visitInverse(<InverseNode>expression, context);
                break;
            }
            case "BooleanOperation": {
                this._visitBooleanOperation(<BooleanOperationNode>expression, context);
                break;
            }
            case "CompareOperation": {
                this._visitCompare(<CompareOperationNode>expression, context);
                break;
            }
            case "Arguments": {
                this._visitArgs(<ArgumentsNode>expression, context);
                break;
            }
            case "ObjectAccessor": {
                this._visitObject(<ObjectAccessorNode>expression, context);
                break;
            }
            case "StringValue": {
                this._visitStringValue(<StringValueNode>expression, context);
                break;
            }
            case "NumberValue": {
                this._visitNumberValue(<NumberValueNode>expression, context);
                break;
            }
            case "BooleanValue": {
                this._visitBoolValue(<BoolValueNode>expression, context);
                break;
            }
            case "NullValue": {
                this._visitNullValue(<NullValueNode>expression, context);
                break;
            }
        }
    }

    private _visitLambda(node: LambdaExpressionNode, context: TraversalContext) {
        this._visit(node.parameter, context);
        if (context.stack.length === 2) {
            context.contextParameterName = context.stack.pop();
        }
        else if (context.stack.length !== 1) {
            throw Error(`The lambda expression's root parameters are invalid`)
        }

        context.rootParameterName = context.stack.pop();
        this._visit(node.body, context);
    }

    private _visitGroup(node: GroupNode, context: TraversalContext) {
        this._visit(node.body, context);
        if (context.stack.length === 0) {
            return;
        }

        if (context.stack.length === 1) {
            context.stack.push(`(${context.stack.pop()})`);
        }
    }

    private _visitFunction(node: FunctionNode, context: TraversalContext) {

    }

    private _visitInverse(node: InverseNode, context: TraversalContext) {

    }

    private _visitObject(node: ObjectAccessorNode, context: TraversalContext) {
        const accessor = node.accessor;
        const tokens = accessor.split('.');
        let value: string | undefined;
        if (tokens.length > 1) {
            if (tokens[0] === context.contextParameterName) {
                value = this._getContextValue(context, tokens.slice(1, tokens.length));
            } else if (tokens[0] === context.rootParameterName) {
                value = this._getRecordParameterSchema(context, tokens.slice(1, tokens.length));
            }
            else {
                throw Error(`Unknown object accessor. Only the DynamoDB record or context object accessor is allowed`);
            }
        }

        if (!value) {
            value = node.accessor;
        }

        context.stack.push(value);
    }

    private _visitBooleanOperation(node: BooleanOperationNode, context: TraversalContext) {
        this._visit(node.left, context);
        this._visit(node.right, context);
        let operator: string;
        switch (node.operator) {
            case "And": {
                operator = 'AND';
                break;
            }

            case "Or": {
                operator = "OR";
                break;
            }

            default: {
                throw Error(`Invalid boolean operator ${node.operator}`);
            }
        }

        if (context.stack.length !== 2) {
            throw Error(`The left and right parts are required in the boolean operation: ${context.stack.join(', ')}`);
        }

        const right = context.stack.pop();
        const left = context.stack.pop();
        return `${left} ${operator} ${right}`;
    }

    private _visitStringValue(node: StringValueNode, context: TraversalContext) {
        context.stack.push(node.value);
    }

    private _visitNumberValue(node: NumberValueNode, context: TraversalContext) {
        context.stack.push(`${node.value}`);
    }

    private _visitBoolValue(node: BoolValueNode, context: TraversalContext) {
        context.stack.push(`${node.value}`);
    }

    private _visitNullValue(node: NullValueNode, context: TraversalContext) {
        throw Error(`Not implemented`);
    }

    private _visitCompare(node: CompareOperationNode, context: TraversalContext) {
        this._visit(node.left, context);
        this._visit(node.right, context);
        if (context.stack.length !== 2) {
            throw Error(`The stack must contain left and right compare operands`)
        }

        const right = context.stack.pop();
        const left = context.stack.pop();
        let operator: string;
        switch (node.operator) {
            case "Equals": {
                operator = "==";
                break;
            }
            case "NotEquals": {
                operator = "!=";
                break;
            }
            case "GreaterThan": {
                operator = ">";
                break;
            }
            case "GreaterThanOrEquals": {
                operator = ">=";
                break;
            }
            case "LessThan": {
                operator = "<";
                break;
            }
            case "LessThanOrEquals": {
                operator = "<=";
                break;
            }
            default: {
                throw Error(`Unknown comparison operator: ${node.operator}`);
            }
        }

        context.stack.push(`${left} ${operator} ${right}`);
    }

    private _visitArgs(node: ArgumentsNode, context: TraversalContext) {
        node.args.forEach(arg => this._visit(arg, context));
    }

    private _getContextValue(context: TraversalContext, accessorProperties: string[]): string {
        return "";
    }

    private _getRecordParameterSchema(context: TraversalContext, accessorProperties: string[]): string {
        return "";
    }
}

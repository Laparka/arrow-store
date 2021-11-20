import {DynamoDBAttributeSchema} from "../mappers/schemaBuilders";
import {
    ArgumentsNode,
    AssignExpressionNode, FunctionNode,
    GroupNode,
    LambdaExpressionNode,
    ObjectAccessorNode,
    ParserNode,
    MathOperationNode, NumberValueNode, StringValueNode, BoolValueNode
} from "./nodes";
import {ExpressionTransformer, TraversalContext} from "./expressionTransformer";
import {AttributeValue} from "aws-sdk/clients/dynamodb";

export class DynamoDBUpdateExpressionTransformer implements ExpressionTransformer {
    private readonly _paramPrefix: string;
    private readonly _attributeValues: Map<string, AttributeValue>;
    private readonly _attributeValueRefs: Map<string, string>;
    private readonly _attributeNameRefs: Map<string, DynamoDBAttributeSchema>;

    constructor(paramPrefix: string) {
        this._paramPrefix = paramPrefix;
        this._attributeValues = new Map<string, AttributeValue>();
        this._attributeValueRefs = new Map<string, string>();
        this._attributeNameRefs = new Map<string, DynamoDBAttributeSchema>();
    }

    transform(recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>, expression: ParserNode, parametersMap?: any): string {
        const context: TraversalContext = {
            stack: [],
            contextParameters: parametersMap,
            recordSchema: recordSchema
        };

        this._visit(expression, context);
        if (context.stack.length === 0) {
            throw Error(`The expression was not transformed`);
        }

        if (context.stack.length !== 1) {
            throw Error(`Invalid operation: the stack contains more than one expression`);
        }

        return context.stack.pop()!;
    }

    private _visit(expression: ParserNode, context: TraversalContext) {
        switch (expression.nodeType) {
            case "LambdaExpression": {
                this._visitLambda(<LambdaExpressionNode>expression, context);
                break;
            }

            case "ObjectAccessor": {
                this._visitObjectAccessor(<ObjectAccessorNode>expression, context)
                break;
            }

            case "GroupExpression": {
                this._visitGroup(<GroupNode>expression, context);
                break;
            }

            case "Arguments": {
                this._visitArguments(<ArgumentsNode>expression, context)
                break
            }

            case "Assign": {
                this._visitAssign(<AssignExpressionNode>expression, context);
                break;
            }

            case "Function": {
                this._visitFunction(<FunctionNode>expression, context);
                break;
            }

            case "MathOperation": {
                this._visitMath(<MathOperationNode>expression, context);
                break;
            }

            case "NumberValue": {
                context.stack.push((<NumberValueNode>expression).value.toString());
                break;
            }

            case "StringValue": {
                let value = (<StringValueNode>expression).value;
                if (value[value.length - 1] === value[0] && (value[0] === '`' || value[0] === `'` || value[0] === `"`)) {
                    value = value.slice(1, value.length - 1);
                }

                context.stack.push(value);
                break;
            }

            case "NullValue": {
                context.stack.push("null");
                break;
            }
            case "BooleanValue": {
                context.stack.push((<BoolValueNode>expression).value.toString());
                break;
            }

            default: {
                throw Error(`Not supported node expression type ${expression.nodeType}`);
            }
        }
    }

    private _visitLambda(lambdaExp: LambdaExpressionNode, context: TraversalContext) {
        this._visit(lambdaExp.parameter, context);
        if (context.stack.length === 2) {
            context.contextParameterName = context.stack.pop();
        }
        else if (context.stack.length === 0) {
            throw Error(`The lambda root parameters expression is empty`);
        }

        context.rootParameterName = context.stack.pop()!;
        if (context.stack.length !== 0) {
            throw Error(`Maximum two lambda root params are supported`);
        }

        this._visit(lambdaExp.body, context);
    }

    private _visitObjectAccessor(accessorExp: ObjectAccessorNode, context: TraversalContext) {
        const segments = accessorExp.value.split('.');
        if (segments[0] === context.rootParameterName) {
            context.stack.push(this._toMemberSchema(segments.slice(1, segments.length), context));
        }
        else if (segments[0] === context.contextParameterName) {
            context.stack.push(this._toContextParamValue(segments.slice(1, segments.length), context));
        }
        else {
            context.stack.push(accessorExp.value);
        }
    }

    private _visitArguments(argsExp: ArgumentsNode, context: TraversalContext) {
        for(let i = 0; i < argsExp.args.length; i++) {
            this._visit(argsExp.args[i], context);
        }
    }

    private _visitGroup(groupExp: GroupNode, context: TraversalContext) {
        this._visit(groupExp.body, context);
    }

    private _visitAssign(assignExp: AssignExpressionNode, context: TraversalContext) {
        this._visit(assignExp.member, context);
        if (context.stack.length !== 1) {
            throw Error(`The stack must contain one member accessor assignee expression. But contains ${context.stack.join(', ')}`);
        }

        const beforeAttributes = this._attributeValues.size;
        const memberAccessor = context.stack.pop()!;
        this._visit(assignExp.value, context);
        if (context.stack.length !== 1) {
            throw Error(`The stack must contain one value expression for the assigning. But contains ${context.stack.join(', ')}`);
        }

        let value = beforeAttributes === this._attributeValues.size ? this._tryAppendToAttributeNames(memberAccessor, context.stack) : context.stack.pop()!;
        context.stack.push(`SET ${memberAccessor} = ${value}`);
    }

    private _visitFunction(functionExp: FunctionNode, context: TraversalContext) {
        this._visit(functionExp.instance, context);
        if (context.stack.length !== 1) {
            throw Error(`The stack must contain one function callee expression. But contains ${context.stack.join(', ')}`);
        }

        const calleeExp = context.stack.pop()!;
        functionExp.args.forEach(x => this._visit(x, context));
        switch (functionExp.functionName) {
            case Array.prototype.splice.name: {
                const length = context.stack.pop();
                const startIndex = context.stack.pop();
                if (startIndex === undefined) {
                    throw Error(`The startIndex argument is missing`);
                }

                const startFrom = parseInt(startIndex);
                if (isNaN(startFrom) || startFrom < 0) {
                    throw Error(`Invalid startIndex-parameter format`);
                }

                if (length === undefined) {
                    throw Error(`The length argument is missing`);
                }

                const take = parseInt(length);
                if (isNaN(take) || take <= 0) {
                    throw Error(`Invalid length-parameter format`)
                }

                const args: string[] = [];
                for(let i = 0; i < take; i++) {
                    args.push(`${calleeExp}[${i}]`);
                }

                if (context.stack.length > 0) {
                    throw Error(`The stack must be empty`);
                }

                context.stack.push(`REMOVE ${args.join(', ')}`);
                break;
            }

            case Array.prototype.concat.name: {
                const argRefs = this._tryAppendToAttributeNames(calleeExp, context.stack);
                const args = [calleeExp, ...argRefs].join(', ');
                context.stack.push(`list_append(${args})`)
                break;
            }

            default: {
                throw Error(`The function is not supported ${functionExp.functionName}`);
            }
        }
    }

    private _visitMath(mathExp: MathOperationNode, context: TraversalContext) {
        this._visit(mathExp.left, context);
        if (context.stack.length !== 1) {
            throw Error(`The stack must contain one left math operand expression. But contains ${context.stack.join(', ')}`);
        }

        const leftOperand = context.stack.pop()!;
        this._visit(mathExp.right, context);
        if (context.stack.length !== 1) {
            throw Error(`The stack must contain one right math operand expression. But contains ${context.stack.join(', ')}`);
        }

        context.stack.push(`${leftOperand} ${mathExp.operator} ${this._tryAppendToAttributeNames(leftOperand, context.stack)}`);
    }

    private _toMemberSchema(pathSegments: string[], context: TraversalContext): string {
        let memberSchema = context.recordSchema.get(pathSegments.join('.'));
        if (memberSchema && memberSchema.lastChildAttributeType !== "M") {
            const attributePath = this._toAttributePath(memberSchema);
            this._attributeNameRefs.set(attributePath, memberSchema);
            return attributePath;
        }

        throw Error(`No ${pathSegments.join('.')} member was found in the writing schema`);
    }

    private _toContextParamValue(pathSegments: string[], context: TraversalContext): any {
        return  this._evalObject(pathSegments, context.contextParameters);
    }

    private _toAttributePath(memberSchema: DynamoDBAttributeSchema): string {
        const segments = [memberSchema.attributeName];
        if (memberSchema.nested) {
            segments.push(this._toAttributePath(memberSchema.nested));
        }

        return segments.join('.');
    }

    private _evalObject(pathSegments: string[], obj: any): any {
        if (obj === undefined) {
            throw Error(`The evaluated object is undefined`);
        }

        if (!pathSegments || pathSegments.length === 0) {
            throw Error(`The member accessor is missing`);
        }

        obj = obj[pathSegments[0]];
        if (pathSegments.length > 1) {
            return this._evalObject(pathSegments.slice(1, pathSegments.length), obj);
        }

        return obj
    }

    private _tryAppendToAttributeNames(memberAccessor: string, stack: string[]): string[] {
        const attributeRef = this._attributeNameRefs.get(memberAccessor);
        // empty the stack
        const values = stack.splice(0, stack.length);
        if (!attributeRef) {
            return values;
        }

        const refKey = `${attributeRef.lastChildAttributeType}:${values.join('|')}`;
        let attributeValueRef = this._attributeValueRefs.get(refKey);
        if (attributeValueRef !== undefined) {
            return [`:${attributeValueRef}`];
        }

        let attributeValue: AttributeValue;
        switch (attributeRef.lastChildAttributeType) {
            case "S": {
                if (values.length !== 1) {
                    throw Error(`The value type mismatch. String (S) was expected`);
                }

                attributeValue = {S: values[0]};
                break;
            }

            case "BOOL": {
                if (values.length !== 1 || (values[0] !== "true" && values[0] !== "false")) {
                    throw Error(`The value type mismatch. Boolean (BOOL) was expected`);
                }

                attributeValue = {BOOL: values[0] === "true"};
                break;
            }

            case "N": {
                if (values.length !== 1 || isNaN(parseFloat(values[0]))) {
                    throw Error(`The value type mismatch. Number (N) was expected`);
                }

                attributeValue = {N: values[0]};
                break;
            }

            case "NS": {
                attributeValue = {NS: []};
                for(let i = 0; i < values.length; i++) {
                    const numbersArray = <Array<number>><any>values[i];
                    attributeValue.NS!.push(...numbersArray.map(n => n.toString()));
                }

                break;
            }

            case "SS": {
                attributeValue = {SS: []};
                for(let i = 0; i < values.length; i++) {
                    if (Array.isArray(values[i])) {
                        const strings = <Array<string>><any>values[i];
                        attributeValue.SS!.push(...strings);
                    }
                    else {
                        attributeValue.SS?.push(values[i]);
                    }
                }
                break;
            }

            default: {
                throw Error(`Not supported attribute type`);
            }
        }

        const key = [this._paramPrefix, this._attributeValues.size].join('_');
        this._attributeValues.set(key, attributeValue);
        this._attributeValueRefs.set(refKey, key);
        return [`:${key}`];
    }
}

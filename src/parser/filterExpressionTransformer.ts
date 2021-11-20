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
    StringValueNode
} from "./nodes";
import {DYNAMODB_ATTRIBUTE_TYPE, DynamoDBAttributeSchema} from "../mappers/schemaBuilders";
import {COMPARE_OPERATOR_TYPE} from "../records/record";
import {AttributeValue} from "aws-sdk/clients/dynamodb";
import {ExpressionTransformer, TraversalContext} from "./expressionTransformer";

const compareOperatorMap = new Map<COMPARE_OPERATOR_TYPE, string>([
    ["Equals", "="],
    ["NotEquals", "!="],
    ["LessThan", "<"],
    ["LessThanOrEquals", "<="],
    ["GreaterThan", ">"],
    ["GreaterThanOrEquals", ">="]
]);

export class DynamoDBFilterExpressionTransformer implements ExpressionTransformer {
    private readonly _expressionAttributeValues: Map<string, AttributeValue>;
    private readonly _expressionAttributeParamPrefix: string;

    constructor(expressionAttributeParamPrefix: string) {
        this._expressionAttributeValues = new Map<string, AttributeValue>();
        if (expressionAttributeParamPrefix) {
            this._expressionAttributeParamPrefix = expressionAttributeParamPrefix;
        }
        else {
            this._expressionAttributeParamPrefix = "p";
        }
    }
    getExpressionAttributeValues(): ReadonlyMap<string, AttributeValue> {
        return this._expressionAttributeValues;
    }

    transform(recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>, expression: ParserNode, parametersMap?: any): string {
        const ctx = {stack: [], contextParameters: parametersMap, recordSchema: recordSchema};
        this._visit(expression, ctx);

        if (ctx.stack.length !== 1) {
            throw Error(`Expression parsing failed. Only 1 element must be in the stack: ${ctx.stack.join(', ')}`);
        }

        return ctx.stack.pop()!;
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
        } else if (context.stack.length !== 1) {
            throw Error(`The lambda expression's root parameters are invalid`)
        }

        context.rootParameterName = context.stack.pop()!;
        this._visit(node.body, context);
        if (node.body.nodeType === 'ObjectAccessor') {
            context.stack.push(this._tryAsBool(node.body, context.stack.pop()!, context));
        }
    }

    private _visitGroup(node: GroupNode, context: TraversalContext) {
        this._visit(node.body, context);
        if (context.stack.length === 0) {
            return;
        }

        if (node.body.nodeType === 'ObjectAccessor') {
            context.stack.push(this._tryAsBool(node.body, context.stack.pop()!, context));
        }

        context.stack.push(`(${context.stack.pop()})`)
    }

    private _visitFunction(node: FunctionNode, context: TraversalContext) {
        this._visit(node.instance, context);
        if (context.stack.length === 0) {
            throw Error(`The function callee is not defined`);
        }

        const instance = context.stack.pop()!;
        let functionName: string;
        switch (node.functionName) {
            case Object.prototype.hasOwnProperty.name: {
                if (instance === Object.name) {
                    functionName = "attribute_exists";
                } else {
                    throw Error(`hasOwnProperty must be called on Object type only`);
                }

                break;
            }

            case String.prototype.includes.name: {
                functionName = "contains";
                break;
            }

            case String.prototype.startsWith.name: {
                functionName = "begins_with";
                break;
            }

            default: {
                throw Error(`Not supported DynamoDB comparison function ${node.functionName}`);
            }
        }

        const args: string[] = [];
        if (functionName !== "attribute_exists") {
            args.push(instance);
        }

        node.args.forEach(arg => {
            this._visit(arg, context);
            if (context.stack.length === 0) {
                throw Error(`The function argument was not evaluated`);
            }

            args.push(context.stack.pop()!);
        });

        context.stack.push(`${functionName}(${args.join(',')})`);
    }

    private _visitInverse(node: InverseNode, context: TraversalContext) {
        let inverseTimes = 0;
        let childNode: ParserNode = node;
        while (childNode.nodeType === 'Inverse') {
            childNode = (<InverseNode>childNode).body;
            inverseTimes++;
        }

        switch (childNode.nodeType) {
            case 'ObjectAccessor': {
                const objectAccessor = <ObjectAccessorNode>childNode;
                let schema = this._tryFindSchemaByPath(context.recordSchema, objectAccessor.value, context.rootParameterName);
                if (!schema) {
                    throw Error(`The member schema was not found. Failed to inverse ${objectAccessor.value}`);
                }

                if (inverseTimes > 1 || schema.lastChildAttributeType !== "BOOL") {
                    const attributeExists = inverseTimes % 2 === 0 ? "attribute_exists" : "attribute_not_exists";
                    context.stack.push(`${attributeExists}(${DynamoDBFilterExpressionTransformer._joinAttributesPath(schema)})`);
                } else {
                    const parameter = this._setFilterAttributeValue(inverseTimes % 2 === 0, "BOOL");
                    context.stack.push(`${DynamoDBFilterExpressionTransformer._joinAttributesPath(schema)} == ${parameter}`);
                }

                return;
            }
        }

        this._visit(childNode, context);
        const toInverse = context.stack.pop();
        if (!toInverse) {
            throw Error(`The inverse body was not found in the stack`);
        }

        context.stack.push(`not ${toInverse}`);
    }

    private _visitObject(node: ObjectAccessorNode, context: TraversalContext) {
        const objectValue = this._evalObjectAccessorValue(node.value, context)
        context.stack.push(objectValue);
    }

    private _visitBooleanOperation(node: BooleanOperationNode, context: TraversalContext) {
        this._visit(node.left, context);
        if (context.stack.length !== 1) {
            throw Error(`The left boolean operand is required: ${context.stack.join(', ')}`);
        }

        const left = context.stack.pop()!;
        this._visit(node.right, context);
        if (context.stack.length !== 1) {
            throw Error(`The right boolean operand is required: ${context.stack.join(', ')}`);
        }
        const right = context.stack.pop()!;

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

        context.stack.push(`${this._tryAsBool(node.left, left, context)} ${operator} ${this._tryAsBool(node.right, right, context)}`);
    }

    private _visitStringValue(node: StringValueNode, context: TraversalContext) {
        let value: string;
        if (node.isEnquote) {
            value = node.value.slice(1, node.value.length - 1);
        }
        else {
            value = node.value;
        }

        context.stack.push(this._setFilterAttributeValue(value, "S"));
    }

    private _visitNumberValue(node: NumberValueNode, context: TraversalContext) {
        context.stack.push(this._setFilterAttributeValue(`${node.value}`, "N"));
    }

    private _visitBoolValue(node: BoolValueNode, context: TraversalContext) {
        context.stack.push(this._setFilterAttributeValue(node.value, "BOOL"));
    }

    private _visitNullValue(node: NullValueNode, context: TraversalContext) {
        context.stack.push(this._setFilterAttributeValue(true, "NULL"));
    }

    private _visitCompare(node: CompareOperationNode, context: TraversalContext) {
        this._visit(node.left, context);
        if (context.stack.length !== 1) {
            throw Error(`The left compare operand is required: ${context.stack.join(', ')}`);
        }

        const left = context.stack.pop()!;
        this._visit(node.right, context);
        if (context.stack.length !== 1) {
            throw Error(`The right compare operand is required: ${context.stack.join(', ')}`);
        }

        const right = context.stack.pop()!;
        const operator: string = compareOperatorMap.get(node.operator)!;
        context.stack.push(`${this._tryGetAsFilterAttribute(node.right, left, context)} ${operator} ${this._tryGetAsFilterAttribute(node.left, right, context)}`);
    }

    private _visitArgs(node: ArgumentsNode, context: TraversalContext) {
        node.args.forEach(arg => this._visit(arg, context));
    }

    private _tryAsBool(node: ParserNode, value: string, context: TraversalContext): string {
        if (node.nodeType !== 'ObjectAccessor' || value && value.startsWith(':')) {
            return value;
        }

        const memberAccessor = (<ObjectAccessorNode>node).value;
        const schema = this._tryFindSchemaByPath(context.recordSchema, memberAccessor, context.rootParameterName);
        if (schema) {
            if (schema.lastChildAttributeType === "BOOL") {
                return `${value} = ${this._setFilterAttributeValue(true, "BOOL")}`;
            }

            return `attribute_exists(${value})`;
        }

        throw Error(`Invalid operation with the member ${memberAccessor}`);
    }

    private _tryGetAsFilterAttribute(objectSchemaNode: ParserNode, value: string, context: TraversalContext): string {
        if (value && value.startsWith(':') || objectSchemaNode.nodeType !== 'ObjectAccessor') {
            return value;
        }

        if (value === "null") {
            return this._setFilterAttributeValue(true, "NULL");
        }

        const memberAccessor = (<ObjectAccessorNode>objectSchemaNode).value;
        let schema = this._tryFindSchemaByPath(context.recordSchema, memberAccessor, context.rootParameterName);
        if (schema) {
            return this._setFilterAttributeValue(value, schema.lastChildAttributeType);
        }

        schema = this._tryFindSchemaByPath(context.recordSchema, (<ObjectAccessorNode>objectSchemaNode).value, context.rootParameterName, "length");
        if (schema) {
            return this._setFilterAttributeValue(value, "N");
        }

        return value;
    }

    private _tryGetContextValue(memberAccessPath: string, context: TraversalContext): string | null {
        let ctxObject = context.contextParameters;
        const segments = this._cleanup(memberAccessPath);
        for (let i = 0; i < segments.length; i++) {
            const propertyName = segments[i];
            if (i === 0) {
                if (propertyName === context.contextParameterName) {
                    continue;
                }

                return null;
            }

            ctxObject = ctxObject[propertyName];
            if (!ctxObject) {
                if (segments.length - 1 === i) {
                    if (ctxObject === null) {
                        return "null";
                    }
                }

                throw Error(`No value is available within the parameters object path ${segments.join('.')}`);
            }
        }

        return ctxObject;
    }

    private _tryFindSchemaByPath(recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>, memberAccessPath: string, rootParameterName: string | undefined, byFunctionType?: string): DynamoDBAttributeSchema | null {
        if (!rootParameterName) {
            return null;
        }

        let pathSegments = this._cleanup(memberAccessPath);
        if (pathSegments.length <= 1 || pathSegments[0] !== rootParameterName) {
            return null;
        }

        pathSegments = pathSegments.slice(1, pathSegments.length);
        let accessorPath;
        let attributeSchema: DynamoDBAttributeSchema | undefined;
        let isSizeFunction = false;
        let len = pathSegments.length;
        for (; len > 0; len--) {
            accessorPath = pathSegments.slice(0, len).join('.');
            attributeSchema = recordSchema.get(accessorPath);
            if (attributeSchema) {
                break;
            } else if (byFunctionType && len === pathSegments.length && pathSegments[pathSegments.length - 1] === byFunctionType) {
                isSizeFunction = true;
            } else {
                return null;
            }
        }

        if (!attributeSchema) {
            return null;
        }

        return attributeSchema;
    }

    private _setFilterAttributeValue(attributeValue: any, attributeType: DYNAMODB_ATTRIBUTE_TYPE): string {
        let matchingAttribute: AttributeValue | undefined;
        const keysIterator = this._expressionAttributeValues.keys();
        let keyEntry = keysIterator.next();
        while (!keyEntry.done) {
            const value: any = this._expressionAttributeValues.get(keyEntry.value);
            if (Object.hasOwnProperty(attributeType) && value[attributeType] === attributeValue) {
                matchingAttribute = value;
                break;
            }

            keyEntry = keysIterator.next();
        }

        if (matchingAttribute) {
            return keyEntry.value;
        }

        const newAttribute: any = {};
        newAttribute[attributeType] = attributeValue;
        const newKey = `:${this._expressionAttributeParamPrefix}${this._expressionAttributeValues.size}`;
        this._expressionAttributeValues.set(newKey, newAttribute);
        return newKey;
    }

    private _evalObjectAccessorValue(accessor: string, context: TraversalContext): string {
        const contextValue = this._tryGetContextValue(accessor, context);
        if (contextValue) {
            return contextValue;
        }

        let schema = this._tryFindSchemaByPath(context.recordSchema, accessor, context.rootParameterName);
        if (schema) {
            return DynamoDBFilterExpressionTransformer._joinAttributesPath(schema);
        }

        schema = this._tryFindSchemaByPath(context.recordSchema, accessor, context.rootParameterName, "length");
        if (schema) {
            return `size(${DynamoDBFilterExpressionTransformer._joinAttributesPath(schema)})`;
        }

        return accessor;
    }

    private static _joinAttributesPath(attributeSchema: DynamoDBAttributeSchema | undefined) {
        if (!attributeSchema) {
            throw Error(`The attributeSchema argument is required`);
        }

        const attributePathSegments: string[] = [];
        do {
            attributePathSegments.push(attributeSchema.attributeName);
            attributeSchema = attributeSchema.nested;
        } while (!!attributeSchema);

        return attributePathSegments.join('.');
    }

    private _cleanup(memberAccessPath: string): string[] {
        const segments: string[] = [];
        if (memberAccessPath) {
            memberAccessPath.split('.').forEach(value => {
                if (value[value.length - 1] === '?' || value[value.length - 1] === '!') {
                    value = value.slice(0, value.length - 1);
                }

                segments.push(value);
            });
        }

        return segments;
    }

    toValueNode(attributeType: DYNAMODB_ATTRIBUTE_TYPE, attributeValue: any): ParserNode {
        switch (attributeType) {
            case "BOOL": {
                return new BoolValueNode(attributeValue);
            }

            case "S": {
                return new StringValueNode(attributeValue, false);
            }

            case "N": {
                return new NumberValueNode(attributeValue);
            }

            case "NULL": {
                return new NullValueNode();
            }
        }

        throw Error(`Not supported attribute type as a constant value type`);
    }
}

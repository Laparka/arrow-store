import {ExpressionAttribute, ExpressionTransformer, TraversalContext} from "./expressionTransformer";
import {DYNAMODB_ATTRIBUTE_TYPE, DynamoDBAttributeSchema} from "../mappers/schemaBuilders";
import {
    ArgumentsExpressionNode, AssignExpressionNode, ConstantValueNode, FunctionExpressionNode,
    GroupExpressionNode, IncrementExpressionNode,
    LambdaExpressionNode, MathExpressionNode,
    ObjectAccessorNode,
    ParserNode, SetWhenNotExistsExpression
} from "../parser/nodes";
import {AttributeValue} from "aws-sdk/clients/dynamodb";

export class UpdateExpressionTransformer implements ExpressionTransformer {
    private readonly _attributeNamePrefix: string;
    private readonly _attributeNames: Map<string, string>;
    private readonly _attributeNameAliases: Map<string, ExpressionAttribute>;
    private readonly _attributeValues: Map<string, AttributeValue>;
    private readonly _attributeValueAliases: Map<string, string>;
    private readonly _attributePathSchema: Map<string, DynamoDBAttributeSchema>;

    constructor(attributeNamePrefix: string,
                attributeNames: Map<string, string>,
                attributeNameAliases: Map<string, ExpressionAttribute>,
                attributeValues: Map<string, AttributeValue>,
                attributeValueAliases: Map<string, string>) {
        if (attributeNamePrefix) {
            this._attributeNamePrefix = attributeNamePrefix;
        }
        else {
            this._attributeNamePrefix = `attr_name`;
        }

        this._attributeNames = attributeNames;
        this._attributeNameAliases = attributeNameAliases;
        this._attributeValues = attributeValues;
        this._attributeValueAliases = attributeValueAliases;
        this._attributePathSchema = new Map<string, DynamoDBAttributeSchema>();
    }

    transform(recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>, expression: ParserNode, parametersMap?: any): string {
        const ctx: TraversalContext = {
            stack: [],
            contextParameters: parametersMap,
            recordSchema: recordSchema,
            attributeNames: this._attributeNames,
            attributeNameAliases: this._attributeNameAliases,
            attributeValues: this._attributeValues,
            attributeValueAliases: this._attributeValueAliases
        };

        this._visitRootNode(expression, ctx);

        if (ctx.stack.length !== 1) {
            throw Error(`Expression parsing failed. Only 1 element must left in the stack after processing: \"${ctx.stack.join(', ')}\"`);
        }

        return ctx.stack.pop()!;
    }

    private _visitRootNode(expression: ParserNode, context: TraversalContext): void {
        switch (expression.nodeType) {
            case "LambdaExpression": {
                this._visitLambda(<LambdaExpressionNode>expression, context);
                break;
            }

            case "Assign": {
                this._visitAssign(<AssignExpressionNode>expression, context);
                break;
            }

            case "Increment": {
                this._visitIncrement(<IncrementExpressionNode>expression, context);
                break;
            }

            case "Function": {
                this._visitFunction(<FunctionExpressionNode>expression, context);
                break;
            }

            case "SetWhenNotExists": {
                this._visitSetWhenNotExists(<SetWhenNotExistsExpression>expression, context);
                break;
            }

            case "ObjectAccessor": {
                this._visitObjectAccessor(<ObjectAccessorNode>expression, context);
                break;
            }

            default: {
                throw Error(`Not supported expression '${expression.nodeType}'`);
            }
        }
    }

    private _visitLambda(expression: LambdaExpressionNode, context: TraversalContext): void {
        const args: string[] = [];
        switch (expression.parameter.nodeType) {
            case "ObjectAccessor": {
                args.push((<ObjectAccessorNode>expression.parameter).value);
                break;
            }

            case "GroupExpression": {
                const body = (<GroupExpressionNode>expression.parameter).body;
                if (body.nodeType === "Arguments") {
                    const argNodes = (<ArgumentsExpressionNode>body).args;
                    for (let i = 0; i < argNodes.length; i++) {
                        if (argNodes[i].nodeType !== "ObjectAccessor") {
                            throw Error(`The arrow function root argument must be an object`);
                        }

                        const argAccessor = <ObjectAccessorNode>argNodes[i];
                        args.push(argAccessor.value)
                    }
                }
                else if (body.nodeType === "ObjectAccessor") {
                    args.push((<ObjectAccessorNode>body).value);
                }

                break;
            }

            default: {
                throw Error(`The arrow function must have at least one root element`);
            }
        }

        if (args.length === 2) {
            context.contextParameterName = args[1];
        }
        else if (args.length === 0) {
            throw Error(`No context and root parameter names`);
        }

        context.rootParameterName = args[0];
        this._visitRootNode(expression.body, context);
    }

    private _visitAssign(expression: AssignExpressionNode, context: TraversalContext): void {
        const accessorSegments = expression.member.value.split(/[.]/g);
        if (accessorSegments.shift() !== context.rootParameterName) {
            throw Error(`The member accessor must be a record's member: '${expression.member.value}'`);
        }

        const memberPath = accessorSegments.join('.');
        const attributePath = this._getOrSetAttributePath(memberPath, context);
        if (!attributePath) {
            throw Error(`Failed to parse the member accessor attributes path`);
        }

        switch (expression.value.nodeType) {
            case "Function": {
                this._visitFunction(<FunctionExpressionNode>expression.value, context);
                break;
            }

            case "ConstantValue": {
                this._visitConstant(attributePath, <ConstantValueNode>expression.value, context);
                break;
            }

            case "ObjectAccessor": {
                this._visitContextAccessor(attributePath, <ObjectAccessorNode>expression.value, context);
                break;
            }

            case "MathOperation": {
                this._visitMath(<MathExpressionNode>expression.value, context);
                break;
            }

            default: {
                throw Error(`Not supported assigning arguments: ${expression.value.nodeType}`);
            }
        }

        if (context.stack.length !== 1) {
            throw Error(`The function expression must be in the stack: ${context.stack.join(', ')}`);
        }

        context.stack.push(`SET ${attributePath} = ${context.stack.pop()}`);
    }

    private _visitFunction(expression: FunctionExpressionNode, context: TraversalContext): void {
        const instanceValue = this._getOrSetAttributeReference(expression.instance, context);
        switch (expression.functionName) {
            case Array.prototype.concat.name: {
                if (expression.args.length !== 1) {
                    throw Error(`The concat-function must have one argument`);
                }

                const argValue = this._getOrSetAttributeReference(expression.args[0], context)
                if (argValue.isRecordAccessor) {
                    const attributeType = this._getAttributeTypeByPath(argValue.value, context);
                    if (attributeType !== "L") {
                        throw Error(`The concat-operation is not allowed on ${attributeType}-attribute type. Only L-type is supported`);
                    }

                    const valueRef = this._getOrSetAttributeValue(instanceValue, attributeType, context);
                    context.stack.push(`list_append(${valueRef}, ${argValue.value})`);
                }
                else  if (instanceValue.isRecordAccessor) {
                    const attributeType = this._getAttributeTypeByPath(instanceValue.value, context);
                    if (attributeType !== "L") {
                        throw Error(`The concat-operation is not allowed on ${attributeType}-attribute type. Only L-type is supported`);
                    }

                    const valueRef = this._getOrSetAttributeValue(argValue, attributeType, context);
                    context.stack.push(`list_append(${instanceValue.value}, ${valueRef})`);
                }
                else {
                    throw Error(`Invalid "contains"-function usage`);
                }

                // list_append(#attr, :list)
                // list_append(:list, #attr)
                break;
            }

            case Array.prototype.splice.name: {
                if (!instanceValue.isRecordAccessor) {
                    throw Error(`The REMOVE-operation must be performed on the record's set-members only`);
                }

                const instanceAttrType = this._getAttributeTypeByPath(instanceValue.value, context);
                if (instanceAttrType !== "SS" && instanceAttrType !== "NS" && instanceAttrType !== "L") {
                    throw Error(`The member attribute type is not supported by the REMOVE-operation`);
                }

                if (expression.args.length !== 2) {
                    throw Error(`The splice-operation must contain the start index and the size to delete`);
                }

                const args = expression.args.map(arg => this._getOrSetAttributeReference(arg, context));
                const startArg = args[0];
                const sizeArg = args[1];
                if (!startArg || !sizeArg || startArg.isRecordAccessor || sizeArg.isRecordAccessor) {
                    throw Error(`The splice-function arguments has invalid integer values`);
                }

                const start = parseInt(startArg.value)
                const size = parseInt(sizeArg.value);
                if (isNaN(start)) {
                    throw Error(`The start-argument is not a number`)
                }

                if (isNaN(size)) {
                    throw Error(`The size-argument is not a number`)
                }

                const removeExpr: string[] = [];
                for(let i = start; i < start + size; i++) {
                    removeExpr.push(`${instanceValue.value}[${i}]`);
                }

                context.stack.push(`REMOVE ${removeExpr.join(', ')}`);
                break;
            }

            case Array.prototype.push.name: {
                if (expression.args.length === 0) {
                    throw Error(`The ADD-operation on the set-attribute must have values to concat`);
                }

                const args = expression.args.map(arg => this._getOrSetAttributeReference(arg, context));
                const instanceAttrType = this._getAttributeTypeByPath(instanceValue.value, context);
                const arrayValues: string[] = [];
                for(let i = 0; i < args.length; i++) {
                    if (args[i].isRecordAccessor) {
                        throw Error(`Only constant values are allowed in the ADD-operation`);
                    }

                    try {
                        const values = JSON.parse(args[i].value);
                        arrayValues.push(...values);
                    }
                    catch {
                        arrayValues.push(args[i].value);
                    }
                }

                const attrValue = this._getOrSetAttributeValue({value: JSON.stringify(arrayValues), isRecordAccessor: false}, instanceAttrType, context);
                context.stack.push(`ADD ${instanceValue.value} ${attrValue}`);
                break;
            }
        }
    }

    private _visitConstant(attributePath: string, expression: ConstantValueNode, context: TraversalContext): void {
        const attributeType = this._getAttributeTypeByPath(attributePath, context);
        const attributeValue = this._getOrSetAttributeReference(expression, context);
        context.stack.push(this._getOrSetAttributeValue(attributeValue, attributeType, context));
    }

    private _visitContextAccessor(attributePath: string, expression: ObjectAccessorNode, context: TraversalContext): void {
        throw Error(`Not implemented`);
    }

    private _visitMath(expression: MathExpressionNode, context: TraversalContext): void {
        const attributePath = this._getOrSetAttributeReference(expression.left, context);
        if (!attributePath.isRecordAccessor) {
            throw Error(`No attribute path was found for the '${expression.left.nodeType}'-expression`);
        }

        const numericValue = this._getOrSetAttributeReference(expression.right, context);
        if (numericValue.isRecordAccessor) {
            throw Error(`Failed to parse the incrementing value`);
        }

        const attributeValue = this._getOrSetAttributeValue(numericValue, "N", context);
        context.stack.push([attributePath.value, expression.operator, attributeValue].join(' '));
    }

    private _visitIncrement(expression: IncrementExpressionNode, context: TraversalContext): void {
        const attributePath = this._getOrSetAttributeReference(expression.member, context);
        if (!attributePath.isRecordAccessor) {
            throw Error(`No attribute path was found for the '${expression.member.nodeType}'-expression`);
        }

        const incrementValue = this._getOrSetAttributeReference(expression.incrementValue, context);
        if (incrementValue.isRecordAccessor) {
            throw Error(`Failed to parse the incrementing value`);
        }

        const value = parseInt(incrementValue.value);
        if (isNaN(value)) {
            throw Error(`Invalid incrementing value: ${incrementValue.value}`);
        }

        const attributeValue = this._getOrSetAttributeValue(incrementValue, "N", context);
        context.stack.push(`ADD ${attributePath.value} ${attributeValue}`);
    }

    private _visitSetWhenNotExists(expression: SetWhenNotExistsExpression, context: TraversalContext): void {
        this._visitRootNode(expression.conditionExpression, context);
        if (context.stack.length !== 1) {
            throw Error(`Failed to process the if_not_exists-expression`);
        }

        const conditionalAccessor = context.stack.pop()!;
        this._visitRootNode(expression.updateExpression, context);
        if (context.stack.length !== 1) {
            throw Error(`Failed to process the SET-expression`);
        }

        const setExpression = context.stack.pop()!;
        const setExpressionSegments = setExpression.split(/[=]/g);
        if (setExpressionSegments.length !== 2) {
            throw Error(`Invalid SET-expression format: ${setExpression}`);
        }

        setExpressionSegments[setExpressionSegments.length - 1] = `if_not_exists(${conditionalAccessor}, ${setExpressionSegments[setExpressionSegments.length - 1]})`;
        context.stack.push(setExpressionSegments.join('= '));
    }

    private _visitObjectAccessor(expression: ObjectAccessorNode, context: TraversalContext): void {
        const attribute = this._getOrSetAttributeReference(expression, context);
        if (attribute.isRecordAccessor) {
            context.stack.push(attribute.value);
        }
        else {
            throw Error(`The accessor must belong to a record's member`);
        }
    }

    private _getOrSetAttributeReference(expression: ParserNode, context: TraversalContext): ObjectAccessorValue {
        if (expression.nodeType === "ObjectAccessor") {
            const accessorPath = (<ObjectAccessorNode>expression).value;
            const segments = accessorPath.split(/[.]/g);
            while(segments.length !== 0 && !segments[0]) {
                segments.shift();
            }

            if (segments[0] === context.rootParameterName) {
                const attributePath = this._getOrSetAttributePath(segments.slice(1, segments.length).join('.'), context);
                if (!attributePath) {
                    throw Error(`Failed to find the member attribute path: '${accessorPath}'`);
                }

                return {
                    isRecordAccessor: true,
                    value: attributePath
                };
            }

            if (context.contextParameterName && segments[0] === context.contextParameterName) {
                return {
                    value: this._evaluateContextValue(segments.slice(1, segments.length), context.contextParameters),
                    isRecordAccessor: false
                };
            }

            throw Error(`The member accessor must be a record member accessor or a context value accessor`);
        }
        else if (expression.nodeType === "ConstantValue") {
            return {
                value: (<ConstantValueNode>expression).value,
                isRecordAccessor: false
            }
        }

        throw Error(`Failed to get the expression's value: ${expression.nodeType}`);
    }

    private _getAttributeTypeByPath(attributePath: string, context: TraversalContext): DYNAMODB_ATTRIBUTE_TYPE {
        if (!attributePath) {
            throw Error(`The attribute path is missing`);
        }

        const schema = this._attributePathSchema.get(attributePath);
        if (!schema) {
            throw Error(`The attribute schema was not found for the given path '${attributePath}'`);
        }

        return schema.lastChildAttributeType;
    }

    private _getOrSetAttributeValue(accessorValue: ObjectAccessorValue, attributeType: DYNAMODB_ATTRIBUTE_TYPE, context: TraversalContext): string {
        if (accessorValue.isRecordAccessor) {
            throw Error(`Only constant or context values are supported`);
        }

        const value = accessorValue.value;
        if (value === undefined) {
            throw Error(`The value is undefined`);
        }

        let typeRef: string;
        let attributeValue: AttributeValue = {};
        if (value === null) {
            typeRef = "NULL";
            attributeValue.NULL = true;
        }
        else {
            switch (attributeType) {
                case "SS": {
                    const ss = JSON.parse(value);
                    if (!Array.isArray(ss)) {
                        throw Error(`The String Set was expected: ${value}`);
                    }

                    typeRef = `SS${value}`;
                    attributeValue.SS = ss;
                    break;
                }

                case "NS": {
                    const ns = JSON.parse(value);
                    if (!Array.isArray(ns)) {
                        throw Error(`The Numbers Set was expected: ${value}`);
                    }

                    typeRef = `NS${value}`;
                    attributeValue.NS = ns;
                    break;
                }

                case "S": {
                    typeRef = `S${value}`;
                    attributeValue.S = value;
                    break;
                }

                case "N": {
                    typeRef = `N${value}`;
                    const numberValue = parseFloat(value);
                    if (isNaN(numberValue)) {
                        throw Error(`Not a number ${value}`);
                    }

                    attributeValue.N = value;
                    break;
                }

                case "BOOL": {
                    typeRef = `BOOL${value}`;
                    if (value === "true") {
                        attributeValue.BOOL = true;
                    }
                    else if (value === "false") {
                        attributeValue.BOOL = false;
                    }
                    else {
                        throw Error(`Invalid boolean value ${value}`);
                    }

                    break;
                }

                default: {
                    throw Error(`Not supported attribute type ${attributeValue}`);
                }
            }
        }

        let existingAttributeName = context.attributeValueAliases.get(typeRef);
        if (!existingAttributeName) {
            existingAttributeName = `:${this._attributeNamePrefix}_${context.attributeValues!.size + 1}`;
            context.attributeValues!.set(existingAttributeName, attributeValue);
            context.attributeValueAliases.set(typeRef, existingAttributeName);
        }

        return existingAttributeName;
    }

    private _getOrSetAttributePath(memberPath: string, context: TraversalContext): string | null {
        let attributeNamePath = context.attributeNameAliases.get(memberPath);
        if (!attributeNamePath) {
            const memberSchema = context.recordSchema.get(memberPath);
            if (!memberSchema) {
                return null;
            }

            const aliases: string[] = [];
            let nestedSchema: DynamoDBAttributeSchema | undefined = memberSchema;
            while (nestedSchema) {
                const accessorSegments = nestedSchema.attributeName.split(/[.]/g);
                for (let i = 0; i < accessorSegments.length; i++) {
                    const attributeName = accessorSegments[i];
                    let attributeRef = context.attributeNames.get(attributeName);
                    if (!attributeRef) {
                        attributeRef = `#${this._attributeNamePrefix}_${context.attributeNames.size}`;
                        context.attributeNames.set(attributeName, attributeRef);
                    }

                    aliases.push(attributeRef);
                }

                nestedSchema = nestedSchema.nested;
            }

            attributeNamePath = {
                accessor: aliases.join('.'),
                schema: memberSchema!
            };

            context.attributeNameAliases.set(memberPath, attributeNamePath);
        }

        if (!this._attributePathSchema.get(attributeNamePath.accessor)) {
            this._attributePathSchema.set(attributeNamePath.accessor, attributeNamePath.schema);
        }

        return attributeNamePath.accessor;
    }

    private _evaluateContextValue(accessors: string[], contextParameters: any): string {
        if (contextParameters === undefined) {
            throw Error(`Context parameters value is undefined`);
        }

        if (accessors.length === 0) {
            if (Array.isArray(contextParameters)) {
                const array: string[] = [];
                for(let i in contextParameters) {
                    array.push(contextParameters[i].toString());
                }

                return JSON.stringify(array);
            }

            return contextParameters.toString();
        }

        contextParameters = contextParameters[accessors[0]];
        return this._evaluateContextValue(accessors.slice(1, accessors.length), contextParameters);
    }
}

type ObjectAccessorValue = {
    isRecordAccessor: boolean;
    value: string;
};
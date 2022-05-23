import {
    ArgumentsExpressionNode, AttributeExistsNode, AttributeNotExistsNode,
    BooleanExpressionNode,
    CompareExpressionNode,
    ConstantValueNode,
    FunctionExpressionNode,
    GroupExpressionNode,
    InverseExpressionNode,
    LambdaExpressionNode,
    ObjectAccessorNode,
    ParserNode, SizeExpressionNode
} from "../parser/nodes";
import {DYNAMODB_ATTRIBUTE_TYPE, DynamoDBAttributeSchema} from "../mappers/schemaBuilders";
import {AttributeValue} from "aws-sdk/clients/dynamodb";
import {ExpressionAttribute, ExpressionTransformer, TraversalContext} from "./expressionTransformer";

export class WhereCauseExpressionTransformer implements ExpressionTransformer {
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

            case "Inverse": {
                this._visitInverse(<InverseExpressionNode>expression, context);
                break;
            }

            case "GroupExpression": {
                this._visitGroup(<GroupExpressionNode>expression, context);
                break;
            }

            case "BooleanOperation": {
                this._visitBoolean(<BooleanExpressionNode>expression, context);
                break;
            }

            case "CompareOperation": {
                this._visitCompare(<CompareExpressionNode>expression, context);
                break;
            }

            case "Function": {
                this._visitFunction(<FunctionExpressionNode>expression, context);
                break;
            }

            case "AttributeExists": {
                this._visitAttributeExists((<AttributeExistsNode>expression).attribute, true, context);
                break;
            }

            case "AttributeNotExists": {
                this._visitAttributeExists((<AttributeNotExistsNode>expression).attribute, false, context);
                break;
            }

            default: {
                throw Error(`Unknown expression type ${expression.nodeType}`);
            }
        }
    }

    private _visitLambda(lambdaExp: LambdaExpressionNode, context: TraversalContext): void {
        const args: string[] = [];
        switch (lambdaExp.parameter.nodeType) {
            case "ObjectAccessor": {
                args.push((<ObjectAccessorNode>lambdaExp.parameter).value);
                break;
            }

            case "GroupExpression": {
                const body = (<GroupExpressionNode>lambdaExp.parameter).body;
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
        this._visitRootNode(lambdaExp.body, context);
    }

    private _visitBoolean(expression: BooleanExpressionNode, context: TraversalContext): void {
        this._visitRootNode(this._tryExpandSyntaxSugar(expression.left, context), context);
        if (context.stack.length !== 1) {
            throw Error(`Failed to process the left boolean argument. One stack element was expected: ${context.stack.join(', ')}`);
        }

        const left = context.stack.pop()!;
        this._visitRootNode(this._tryExpandSyntaxSugar(expression.right, context), context);
        if (context.stack.length !== 1) {
            throw Error(`Failed to process the right boolean argument. One stack element was expected: ${context.stack.join(', ')}`);
        }

        const right = context.stack.pop()!;
        context.stack.push([left, expression.operator, right].join(' '));
    }

    private _visitCompare(expression: CompareExpressionNode, context: TraversalContext): void {
        let operator: string;
        switch (expression.operator) {
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
                operator = "<";
                break;
            }

            case "Equals": {
                operator = "=";
                break;
            }

            case "NotEquals": {
                operator = "<>";
                break;
            }

            default: {
                throw Error(`Not supported compare operator: ${expression.operator}`);
            }
        }

        const leftExpr = this._tryExpandAccessorFunc(expression.left, context);
        const rightExpr = this._tryExpandAccessorFunc(expression.right, context);
        const left = this._evaluateAsAttributeReference(leftExpr, rightExpr, context);
        const right = this._evaluateAsAttributeReference(rightExpr, leftExpr, context);
        if (context.stack.length !== 0) {
            throw Error(`Failed to process the compare expression. No elements must be in the stack`);
        }

        context.stack.push([left, operator, right].join(' '));
    }

    private _visitFunction(expression: FunctionExpressionNode, context: TraversalContext): void {
        const instanceAccessor = this._getOrSetAttributeReference(expression.instance, context);
        if (!instanceAccessor.isRecordAccessor) {
            throw Error(`Could not apply the "contains"-function to a non-record member`);
        }

        if (!instanceAccessor.value) {
            throw Error(`Failed to evaluate the record's member schema`);
        }

        const instanceAttrType = this._getAttributeTypeByPath(instanceAccessor.value, context);
        const argValues = expression.args.map(arg => this._getOrSetAttributeReference(arg, context));
        switch (expression.functionName) {
            case String.prototype.includes.name: {
                // contains(RECORD_DATA.SomeString, "SomeValue")
                // contains(RECORD_DATA.SomeSet, {S: "Test"})
                if (instanceAttrType !== "SS" && instanceAttrType !== "S" && instanceAttrType !== "NS") {
                    throw Error(`Not supported member schema type for the "contains"-function. String and Sets are supported only`);
                }

                let setItemType: DYNAMODB_ATTRIBUTE_TYPE = instanceAttrType;
                if (setItemType === "SS") {
                    setItemType = "S";
                }
                else if (setItemType == "NS") {
                    setItemType = "N";
                }

                if (argValues.length !== 1 || argValues[0].isRecordAccessor) {
                    throw Error(`Only one constant argument is allowed in "contains"-operation`);
                }

                const argValueRef = this._getOrSetAttributeValue(argValues[0], setItemType, context);
                context.stack.push(`contains(${instanceAccessor.value}, ${argValueRef})`);
                break;
            }

            case String.prototype.startsWith.name: {
                // begins_with(RECORD_DATA.SomeString, "SomeValue")
                // begins_with(RECORD_DATA.SomeSet)
                if (instanceAttrType !== "S") {
                    throw Error(`Not supported member schema type for the "begins_with"-function. String type is supported only`);
                }

                if (argValues.length !== 1 || argValues[0].isRecordAccessor) {
                    throw Error(`Only one constant argument value is allowed in "begins_with"-operation`);
                }

                const argValueRef = this._getOrSetAttributeValue(argValues[0], instanceAttrType, context);
                context.stack.push(`begins_with(${instanceAccessor.value}, ${argValueRef})`);
                break;
            }

            default: {
                throw Error(`Not supported function: "${expression.functionName}"`);
            }
        }
    }

    private _visitGroup(expression: GroupExpressionNode, context: TraversalContext): void {
        const bodyNode = this._tryExpandSyntaxSugar(expression.body, context);
        this._visitRootNode(bodyNode, context);
        if (context.stack.length !== 1) {
            throw Error(`Failed to process the group body expression. Only one element must be in the stack after processing: ${context.stack.join(', ')}`);
        }

        const body = context.stack.pop()!;
        context.stack.push(`(${body})`);
    }

    private _visitInverse(expression: InverseExpressionNode, context: TraversalContext): void {
        const inversed = this._expandInverse(expression, context, 0);
        if (inversed.nodeType === "Inverse") {
            this._visitRootNode((<InverseExpressionNode>inversed).body, context);
        }
        else {
            this._visitRootNode(inversed, context);
        }

        if (context.stack.length !== 1) {
            throw Error(`Failed to process the inverse-expression. One element must be in the stack`);
        }

        const body = context.stack.pop()!;
        if (inversed.nodeType === "Inverse") {
            context.stack.push(`not ${body}`);
        }
        else {
            context.stack.push(body);
        }
    }

    private _visitAttributeExists(expression: ObjectAccessorNode, exists: boolean, context: TraversalContext): void{
        const segments = expression.value.split(/[.]/g);
        if (context.rootParameterName !== segments[0]) {
            throw Error(`An attribute accessor was expected`);
        }

        const attributePath = this._getOrSetAttributePath(segments.slice(1, segments.length).join('.'), context);
        if (exists) {
            context.stack.push(`attribute_exists(${attributePath})`);
        }
        else {
            context.stack.push(`attribute_not_exists(${attributePath})`);
        }
    }

    private _tryExpandSyntaxSugar(expression: ParserNode, context: TraversalContext): ParserNode {
        if (expression.nodeType === "ObjectAccessor") {
            const segments = (<ObjectAccessorNode>expression).value.split(/[.]/g);
            if (context.rootParameterName === segments[0]) {
                const attributePath = this._getOrSetAttributePath(segments.slice(1, segments.length).join('.'), context);
                if (attributePath === null) {
                    throw Error(`No member schema was found for the ${segments.join('.')}-member`);
                }

                const attributeType = this._getAttributeTypeByPath(attributePath, context);
                if (attributeType === "BOOL") {
                    return new CompareExpressionNode("Equals", expression, new ConstantValueNode('true'));
                }

                return new AttributeExistsNode(<ObjectAccessorNode>expression);
            }

            throw Error(`The record schema accessor was expected`);
        }

        return expression;
    }

    private _tryExpandAccessorFunc(expression: ParserNode, context: TraversalContext): ParserNode {
        if (expression.nodeType === 'ObjectAccessor') {
            const memberPath = (<ObjectAccessorNode>expression).value
            const accessorSegments = memberPath.split(/[.]/g);
            if (accessorSegments.length > 1 && accessorSegments[0] === context.rootParameterName) {
                let attributePath = this._getOrSetAttributePath(accessorSegments.join('.'), context);
                if (attributePath === null && accessorSegments.pop() === 'length' && accessorSegments.length > 1) {
                    const slicedAccessor = accessorSegments.join('.');
                    attributePath =this._getOrSetAttributePath(accessorSegments.slice(1, accessorSegments.length).join('.'), context);
                    if (attributePath !== null) {
                        return new SizeExpressionNode(new ObjectAccessorNode(slicedAccessor));
                    }
                }
            }
        }

        return expression;
    }

    private _expandInverse(expression: ParserNode, context: TraversalContext, inversedTimes: number): ParserNode {
        if (expression.nodeType === "Inverse") {
            return this._expandInverse((<InverseExpressionNode>expression).body, context, inversedTimes + 1);
        }

        const adjusted = this._tryExpandSyntaxSugar(expression, context);
        if (adjusted.nodeType === "AttributeExists") {
            if (inversedTimes % 2 === 1) {
                const accessor = (<AttributeExistsNode>adjusted).attribute;
                return new AttributeNotExistsNode(accessor);
            }
        }

        if (inversedTimes % 2 === 1) {
            return new InverseExpressionNode(adjusted);
        }

        return adjusted;
    }

    private _evaluateAsAttributeReference(valueExpression: ParserNode, memberExpression: ParserNode, context: TraversalContext): string {
        let value: ObjectAccessorValue;
        switch (valueExpression.nodeType) {
            case "ConstantValue": {
                value = {
                    value: (<ConstantValueNode>valueExpression).value,
                    isRecordAccessor: false
                }
                break;
            }

            case "ObjectAccessor": {
                const accessorValue = this._getOrSetAttributeReference(valueExpression, context);
                if (accessorValue.isRecordAccessor) {
                    return accessorValue.value!;
                }

                if (accessorValue.value === null) {
                    return this._getOrSetAttributeValue(accessorValue, "NULL", context);
                }

                value = accessorValue;
                break;
            }

            case "Size": {
                const sizeNode = <SizeExpressionNode>valueExpression;
                return `size(${this._evaluateAsAttributeReference(sizeNode.instanceAccessor, memberExpression, context)})`;
            }

            case "NullValue": {
                return this._getOrSetAttributeValue({isRecordAccessor: false, value: null}, "NULL", context);
            }

            default: {
                throw Error(`Not supported expression type ${valueExpression.nodeType}`)
            }
        }

        let attributeType: DYNAMODB_ATTRIBUTE_TYPE;
        switch (memberExpression.nodeType) {
            case "ObjectAccessor": {
                const accessorValue = this._getOrSetAttributeReference(memberExpression, context);
                if (!accessorValue.isRecordAccessor) {
                    throw Error(`The member accessor expression must be a record member accessor`);
                }

                attributeType = this._getAttributeTypeByPath(accessorValue.value!, context);
                break;
            }

            case "Size": {
                attributeType = "N";
                break;
            }

            default: {
                throw Error(`Failed to cast the value to the member type from the given member expression. Value=${value}`);
            }
        }

        return this._getOrSetAttributeValue(value, attributeType, context);
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
    value: string | null;
};

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
import {AttributeValue} from "aws-sdk/clients/dynamodb";
import {
    ExpressionAttribute,
    ExpressionTransformer,
    ExpressionTransformerBase,
    TraversalContext
} from "./expressionTransformer";
import {DYNAMODB_ATTRIBUTE_TYPE, DynamoDBAttributeSchema} from "../mappers/schemaBuilders";

export class WhereCauseExpressionTransformer extends ExpressionTransformerBase implements ExpressionTransformer {
    private readonly _attributeNames: Map<string, string>;
    private readonly _attributeNameAliases: Map<string, ExpressionAttribute>;
    private readonly _attributeValues: Map<string, AttributeValue>;
    private readonly _attributeValueAliases: Map<string, string>;

    constructor(attributeNamePrefix: string,
                attributeNames: Map<string, string>,
                attributeNameAliases: Map<string, ExpressionAttribute>,
                attributeValues: Map<string, AttributeValue>,
                attributeValueAliases: Map<string, string>) {
        super(attributeNamePrefix, new Map<string, DynamoDBAttributeSchema>());
        this._attributeNames = attributeNames;
        this._attributeNameAliases = attributeNameAliases;
        this._attributeValues = attributeValues;
        this._attributeValueAliases = attributeValueAliases;
    }

    transform(recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>, expression: ParserNode, context?: any): string {
        const ctx: TraversalContext = {
            stack: [],
            contextParameters: context,
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

            case "ObjectAccessor": {
                const expandedExpr = this._tryExpandSyntaxSugar(expression, context);
                if (expandedExpr.nodeType === "ObjectAccessor") {
                    throw Error(`The expression ${expression.nodeType} is not a boolean value check or attribute_exists: ${(<ObjectAccessorNode>expression).value}`);
                }

                this._visitRootNode(expandedExpr, context);
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
        const instanceAccessor = this.getOrSetAttributeReference(expression.instance, context);
        if (!instanceAccessor.isRecordAccessor) {
            throw Error(`Could not apply the "contains"-function to a non-record member`);
        }

        if (!instanceAccessor.value) {
            throw Error(`Failed to evaluate the record's member schema`);
        }

        const instanceAttrType = this.getAttributeTypeByPath(instanceAccessor.value, context);
        const argValues = expression.args.map(arg => this.getOrSetAttributeReference(arg, context));
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

                const argValueRef = this.getOrSetAttributeValue(argValues[0], setItemType, context);
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

                const argValueRef = this.getOrSetAttributeValue(argValues[0], instanceAttrType, context);
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

        const attributePath = this.getOrSetAttributePath(segments.slice(1, segments.length).join('.'), context);
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
                const attributePath = this.getOrSetAttributePath(segments.slice(1, segments.length).join('.'), context);
                if (attributePath === null) {
                    throw Error(`No member schema was found for the ${segments.join('.')}-member`);
                }

                const attributeType = this.getAttributeTypeByPath(attributePath, context);
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
                let attributePath = this.getOrSetAttributePath(accessorSegments.join('.'), context);
                if (attributePath === null && accessorSegments.pop() === 'length' && accessorSegments.length > 1) {
                    const slicedAccessor = accessorSegments.join('.');
                    attributePath =this.getOrSetAttributePath(accessorSegments.slice(1, accessorSegments.length).join('.'), context);
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

        let adjusted = this._tryExpandSyntaxSugar(expression, context);
        if (adjusted.nodeType === "AttributeExists") {
            if (inversedTimes % 2 === 1) {
                const accessor = (<AttributeExistsNode>adjusted).attribute;
                adjusted = new AttributeNotExistsNode(accessor);
            }
        }
        else if (inversedTimes > 1 && adjusted.nodeType === "CompareOperation" && expression.nodeType === "ObjectAccessor") {
            // !!x.clockDetails => attribute_exists
            //!!!x.clockDetails => attribute_not_exists
            const accessor = <ObjectAccessorNode>expression;
            if (inversedTimes % 2 === 0) {
                adjusted = new AttributeExistsNode(accessor);
            }
            else {
                adjusted = new AttributeNotExistsNode(accessor);
            }
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
                const accessorValue = this.getOrSetAttributeReference(valueExpression, context);
                if (accessorValue.isRecordAccessor) {
                    return accessorValue.value!;
                }

                if (accessorValue.value === null) {
                    return this.getOrSetAttributeValue(accessorValue, "NULL", context);
                }

                value = accessorValue;
                break;
            }

            case "Size": {
                const sizeNode = <SizeExpressionNode>valueExpression;
                return `size(${this._evaluateAsAttributeReference(sizeNode.instanceAccessor, memberExpression, context)})`;
            }

            case "NullValue": {
                return this.getOrSetAttributeValue({isRecordAccessor: false, value: null}, "NULL", context);
            }

            default: {
                throw Error(`Not supported expression type ${valueExpression.nodeType}`)
            }
        }

        let attributeType: DYNAMODB_ATTRIBUTE_TYPE;
        switch (memberExpression.nodeType) {
            case "ObjectAccessor": {
                const accessorValue = this.getOrSetAttributeReference(memberExpression, context);
                if (!accessorValue.isRecordAccessor) {
                    throw Error(`The member accessor expression must be a record member accessor`);
                }

                attributeType = this.getAttributeTypeByPath(accessorValue.value!, context);
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

        return this.getOrSetAttributeValue(value, attributeType, context);
    }
}

type ObjectAccessorValue = {
    isRecordAccessor: boolean;
    value: string | null;
};

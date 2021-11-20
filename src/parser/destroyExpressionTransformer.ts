import {ExpressionTransformer, TraversalContext} from "./expressionTransformer";
import {DynamoDBAttributeSchema} from "../mappers/schemaBuilders";
import {LambdaExpressionNode, ObjectAccessorNode, ParserNode} from "./nodes";
import {AttributeValue} from "aws-sdk/clients/dynamodb";

export class DynamoDBDestroyExpressionTransformer implements ExpressionTransformer {
    getExpressionAttributeValues(): ReadonlyMap<string, AttributeValue> {
        throw Error(`Not supported`);
    }

    transform(recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>, expression: ParserNode): string {
        const ctx: TraversalContext = {
            stack: [],
            contextParameters: null,
            recordSchema: recordSchema
        };

        this._visit(expression, ctx);
        if (ctx.stack.length !== 1) {
            throw Error(`The stack must contain a member accessor expression`);
        }

        return ctx.stack.pop()!;
    }

    private _visit(expression: ParserNode, ctx: TraversalContext) {
        switch (expression.nodeType) {
            case "LambdaExpression": {
                this._visitLambda(<LambdaExpressionNode>expression, ctx);
                break;
            }

            case "ObjectAccessor": {
                this._visitAccessor(<ObjectAccessorNode>expression, ctx);
                break;
            }
            default: {
                throw Error(`Not supported expression for the destroy operation`);
            }
        }
    }

    private _visitLambda(expression: LambdaExpressionNode, ctx: TraversalContext) {
        this._visit(expression.parameter, ctx);
        ctx.rootParameterName = ctx.stack.pop();
        if (!ctx.rootParameterName) {
            throw Error(`The lambda root parameter is missing`);
        }

        if (ctx.stack.length !== 0) {
            throw Error(`The stack must be empty`);
        }

        this._visit(expression.body, ctx);
    }

    private _visitAccessor(expression: ObjectAccessorNode, ctx: TraversalContext) {
        const segments = expression.value.split('.');
        if (segments[0] === ctx.rootParameterName) {
            ctx.stack.push(this._toMemberSchema(segments.slice(1, segments.length), ctx));
        }
        else{
            ctx.stack.push(expression.value);
        }
    }

    private _toMemberSchema(pathSegments: string[], context: TraversalContext): string {
        let memberSchema = context.recordSchema.get(pathSegments.join('.'));
        if (memberSchema) {
            const attributePath = this._toAttributePath(memberSchema);
            return attributePath;
        }

        throw Error(`No ${pathSegments.join('.')} member was found in the writing schema`);
    }

    private _toAttributePath(memberSchema: DynamoDBAttributeSchema): string {
        const segments = [memberSchema.attributeName];
        if (memberSchema.nested) {
            segments.push(this._toAttributePath(memberSchema.nested));
        }

        return segments.join('.');
    }
}

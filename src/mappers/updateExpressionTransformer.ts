import {ExpressionTransformer} from "../parser/expressionTransformer";
import {DynamoDBAttributeSchema} from "./schemaBuilders";
import {ParserNode} from "../parser/nodes";

export class UpdateExpressionTransformer implements ExpressionTransformer {
    transform(recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>, expression: ParserNode, parametersMap?: any): string {
        return "";
    }

}

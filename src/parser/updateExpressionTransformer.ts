import {UpdateExpressionTransformer} from "../mappers/updateExpressionTransformer";
import {DynamoDBAttributeSchema} from "../mappers/schemaBuilders";
import {ParserNode} from "./nodes";

export class DynamoDBUpdateExpressionTransformer implements UpdateExpressionTransformer {
    private readonly _paramPrefix: string;
    constructor(paramPrefix: string) {
        this._paramPrefix = paramPrefix;
    }

    transform(recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>, expression: ParserNode, parametersMap?: any): string {
        return "";
    }

}

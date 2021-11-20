import {DynamoDBAttributeSchema} from "../mappers/schemaBuilders";
import {ParserNode} from "./nodes";
import {AttributeValue} from "aws-sdk/clients/dynamodb";

export type TraversalContext = {
    stack: string[],
    contextParameters: any | undefined,
    rootParameterName?: string,
    contextParameterName?: string,
    recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>
};

export type ExpressionTransformer = {
    transform(recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>, expression: ParserNode, parametersMap?: any): string
    getExpressionAttributeValues(): ReadonlyMap<string, AttributeValue>;
};

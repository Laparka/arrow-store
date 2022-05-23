import {DynamoDBAttributeSchema} from "../mappers/schemaBuilders";
import {ParserNode} from "../parser/nodes";
import {AttributeValue} from "aws-sdk/clients/dynamodb";

export type ExpressionAttribute = {
    accessor: string,
    schema: DynamoDBAttributeSchema
};

export type TraversalContext = {
    stack: string[],
    contextParameters: any | undefined,
    rootParameterName?: string,
    contextParameterName?: string,
    recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>,
    attributeNames: Map<string, string>,
    attributeNameAliases: Map<string, ExpressionAttribute>,
    attributeValues: Map<string, AttributeValue>,
    attributeValueAliases: Map<string, string>
};

export type ExpressionTransformer = {
    transform(recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>, expression: ParserNode, parametersMap?: any): string
};

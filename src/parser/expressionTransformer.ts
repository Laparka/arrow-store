import {DynamoDBAttributeSchema} from "../mappers/schemaBuilders";
import {ParserNode} from "./nodes";

export type TraversalContext = {
    stack: string[],
    contextParameters: any | undefined,
    rootParameterName?: string,
    contextParameterName?: string,
    recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>
};

export type ExpressionTransformer = {
    transform(recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>, expression: ParserNode, parametersMap?: any): string
};

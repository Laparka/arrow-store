import {DYNAMODB_ATTRIBUTE_TYPE, DynamoDBAttributeSchema} from "../mappers/schemaBuilders";
import {ConstantValueNode, ObjectAccessorNode, ParserNode} from "../parser/nodes";
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

export type ObjectAccessorValue = {
    isRecordAccessor: boolean;
    value: string | null;
};

export type ExpressionTransformer = {
    transform(recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>, expression: ParserNode, parametersMap?: any): string
};

export abstract class ExpressionTransformerBase implements ExpressionTransformer {
    private readonly _attributeNamePrefix: string;
    private readonly _attributePathSchema: Map<string, DynamoDBAttributeSchema>;

    protected constructor(attributeNamePrefix: string, attributePathSchema: Map<string, DynamoDBAttributeSchema>) {
        if (attributeNamePrefix) {
            this._attributeNamePrefix = attributeNamePrefix;
        }
        else {
            this._attributeNamePrefix = 'attr_name';
        }

        this._attributePathSchema = attributePathSchema;
    }

    abstract transform(recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>, expression: ParserNode, parametersMap?: any): string;

    protected getOrSetAttributeReference(expression: ParserNode, context: TraversalContext): ObjectAccessorValue {
        if (expression.nodeType === "ObjectAccessor") {
            const accessorPath = (<ObjectAccessorNode>expression).value;
            const segments = accessorPath.split(/[.]/g);
            while(segments.length !== 0 && !segments[0]) {
                segments.shift();
            }

            if (segments[0] === context.rootParameterName) {
                const attributePath = this.getOrSetAttributePath(segments.slice(1, segments.length).join('.'), context);
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
                    value: this.evaluateContextValue(segments.slice(1, segments.length), context.contextParameters),
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

    protected getAttributeTypeByPath(attributePath: string | null, context: TraversalContext): DYNAMODB_ATTRIBUTE_TYPE {
        if (!attributePath) {
            throw Error(`The attribute path is missing`);
        }

        const schema = this._attributePathSchema.get(attributePath);
        if (!schema) {
            throw Error(`The attribute schema was not found for the given path '${attributePath}'`);
        }

        return schema.lastChildAttributeType;
    }

    protected getOrSetAttributeValue(accessorValue: ObjectAccessorValue, attributeType: DYNAMODB_ATTRIBUTE_TYPE, context: TraversalContext): string {
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

    protected getOrSetAttributePath(memberPath: string, context: TraversalContext): string | null {
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

    protected evaluateContextValue(accessors: string[], contextParameters: any): string {
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
        return this.evaluateContextValue(accessors.slice(1, accessors.length), contextParameters);
    }
}

import {
    COMPARE_OPERATOR_TYPE, Ctor,
    DynamoDBPrimaryKeyExpression,
    DynamoDBRecord,
    FUNCTION_OPERATOR_TYPE,
    PRIMARY_ATTRIBUTE_TYPE,
    PrimaryKeysMap,
    PrimaryKeyValue
} from "../records/record";
import {DYNAMODB_ATTRIBUTE_TYPE, DynamoDBAttributeSchema, DynamoDBSchemaProvider} from "./schemaBuilders";
import {DynamoDB} from "aws-sdk";
import {AttributeMap, AttributeValue} from "aws-sdk/clients/dynamodb";
import {DynamoDBExpressionTransformer} from "../parser/expressionTransformer";
import {
    BooleanOperationNode,
    CompareOperationNode,
    FunctionNode,
    ObjectAccessorNode,
    ParserNode
} from "../parser/nodes";

export type KeyExpression = {
    expression: string,
    attributeValues: ReadonlyMap<string, AttributeValue>
};

export interface DynamoDBRecordMapper {
    toKeyExpression(primaryKeys: ReadonlyArray<DynamoDBPrimaryKeyExpression>): KeyExpression;

    toRecord<TRecord extends DynamoDBRecord>(recordCtor: Ctor<TRecord>, recordTypeId: symbol, attributes: DynamoDB.AttributeMap): TRecord;

    toAttributeMap<TRecord extends DynamoDBRecord>(recordTypeId: symbol, record: TRecord): DynamoDB.AttributeMap;

    toKeyAttribute(primaryKeys: ReadonlyArray<DynamoDBPrimaryKeyExpression>): DynamoDB.Key;

    toPrimaryKey(primaryKeyAttribute: DynamoDB.Key | undefined): PrimaryKeysMap | null;
}

class PrimaryKeyValueImpl implements PrimaryKeyValue {
    private readonly _attributeName: string;
    private readonly _attributeType: DYNAMODB_ATTRIBUTE_TYPE;
    private readonly _attributeValue: any;

    constructor(attributeName: string, attributeType: DYNAMODB_ATTRIBUTE_TYPE, attributeValue: any) {
        this._attributeName = attributeName;
        this._attributeType = attributeType;
        this._attributeValue = attributeValue;
    }

    getAttributeName(): string {
        return this._attributeName;
    }

    getAttributeType(): DYNAMODB_ATTRIBUTE_TYPE {
        return this._attributeType;
    }

    getAttributeValue(): any {
        return this._attributeValue;
    }
}

export class DefaultDynamoDBRecordMapper implements DynamoDBRecordMapper {
    private readonly _schemaProvider: DynamoDBSchemaProvider;

    constructor(schemaProvider: DynamoDBSchemaProvider) {
        this._schemaProvider = schemaProvider;
    }

    toAttributeType(attributeType: string): DYNAMODB_ATTRIBUTE_TYPE {
        switch (attributeType) {
            case "S": {
                return "S";
            }
            case "N": {
                return "N";
            }
            case "B": {
                return "B";
            }
            case "SS": {
                return "SS";
            }
            case "NS": {
                return "NS";
            }
            case "BS": {
                return "BS";
            }
            case "M": {
                return "M";
            }
            case "L": {
                return "L";
            }
            case "NULL": {
                return "NULL";
            }
            case "BOOL": {
                return "BOOL";
            }
        }

        throw Error(`Unknown attribute type ${attributeType}`);
    }

    castValue(attributeValue: any, attributeType: DYNAMODB_ATTRIBUTE_TYPE): any {
        switch (attributeType) {
            case "S": {
                return `${attributeValue}`;
            }

            case "N": {
                return parseFloat(attributeValue);
            }

            case "BOOL": {
                return new Boolean(attributeValue);
            }

            case "NULL": {
                return null;
            }
        }

        throw Error(`Not a primitive type ${attributeType}`);
    }

    tryGetFunctionName(operator: COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE): string | null {
        switch (operator) {
            case "BeginsWith": {
                return "begins_with";
            }
            case "Contains": {
                return "contains";
            }

            case "Exists": {
                return "attribute_exists";
            }

            case "NotExists": {
                return "attribute_not_exists";
            }
        }

        return null;
    }

    toPrimaryKey(primaryKeyAttribute: DynamoDB.Key | undefined): PrimaryKeysMap | null {
        if (!primaryKeyAttribute) {
            return null;
        }

        const properties = Object.getOwnPropertyNames(primaryKeyAttribute);
        if (properties.length !== 2) {
            throw Error('Partition and range keys are required');
        }

        const rangeKey = this._toPrimaryKey(properties[1], primaryKeyAttribute, "Range");
        const partitionKey = this._toPrimaryKey(properties[0], primaryKeyAttribute, "Partition");
        return {
            partition: partitionKey,
            range: rangeKey
        };
    }

    toKeyAttribute(primaryKeys: readonly DynamoDBPrimaryKeyExpression[]): DynamoDB.Key {
        if (!primaryKeys || primaryKeys.length !== 2) {
            throw Error(`Both partition and range keys are required`);
        }

        const keys: DynamoDB.Key = {};
        let partitionExists = false;
        let rangeExists = false;
        for (let i = 0; i < primaryKeys.length; i++) {
            const primaryKey = primaryKeys[i];
            if (primaryKey.getCompareOperator() !== "Equals") {
                throw Error(`The primary key operator must be always Equals when saving or reading by the RecordId`);
            }

            if (primaryKey.getPrimaryKeyType() === "Partition") {
                partitionExists = true;
            }

            if (primaryKey.getPrimaryKeyType() === "Range") {
                rangeExists = true;
            }

            const value = {};
            keys[primaryKey.getAttributeName()] = value;
            value[primaryKey.getAttributeType()] = primaryKey.getAttributeValue();
        }

        if (!partitionExists || !rangeExists) {
            throw Error(`Both partition and range keys are required`);
        }

        return keys;
    }

    toKeyExpression(primaryKeys: readonly DynamoDBPrimaryKeyExpression[]): KeyExpression {
        const dummySchema: ReadonlyMap<string, DynamoDBAttributeSchema> = new Map<string, DynamoDBAttributeSchema>();
        const keyExpressionTransformer = new DynamoDBExpressionTransformer(dummySchema, "primary");
        const expressions: ParserNode[] = [];
        for (let i = 0; i < primaryKeys.length; i++) {
            const key = primaryKeys[i];
            let node: ParserNode;
            const attributeNode = new ObjectAccessorNode(key.getAttributeName());
            const valueNode = keyExpressionTransformer.toValueNode(key.getAttributeType(), key.getAttributeValue());
            const functionName = this.tryGetFunctionName(key.getCompareOperator());
            if (functionName) {
                node = new FunctionNode(functionName, attributeNode, valueNode)
            } else {
                node = new CompareOperationNode(<COMPARE_OPERATOR_TYPE>key.getCompareOperator(), attributeNode, valueNode);
            }

            expressions.push(node);
        }

        let evaluateNode: ParserNode;
        if (expressions.length === 2) {
            evaluateNode = new BooleanOperationNode("And", expressions[0], expressions[1])
        } else if (expressions.length === 1) {
            evaluateNode = expressions[0];
        } else {
            throw Error(`One or two query keys are required, but received ${expressions.length}`);
        }

        const keyExpression = keyExpressionTransformer.transform(evaluateNode);
        return {
            expression: keyExpression,
            attributeValues: keyExpressionTransformer.expressionAttributeValues
        };
    }

    toAttributeMap<TRecord extends DynamoDBRecord>(recordTypeId: symbol, record: TRecord): DynamoDB.AttributeMap {
        if (!recordTypeId) {
            throw Error(`The record type ID is missing`);
        }

        if (!record || !record.getRecordId) {
            throw Error(`The record object is missing`)
        }

        const recordId = record.getRecordId();
        if (!recordId) {
            throw Error(`The recordId is missing`);
        }

        const writingSchema = this._schemaProvider.getWritingSchema(recordTypeId);
        const result: AttributeMap = {};
        const propertiesIterator = writingSchema.keys();
        let entry = propertiesIterator.next();
        while(!entry.done) {
            const propertyName = entry.value;
            const attributePath = writingSchema.get(propertyName)!;
            this._setAttribute(propertyName, attributePath, record, result);
            entry = propertiesIterator.next();
        }

        const primaryKeys = recordId.getPrimaryKeys();
        for(let i = 0; i < primaryKeys.length; i++) {
            const primaryAttributeName = primaryKeys[i].getAttributeName();
            const primaryAttributeType = primaryKeys[i].getAttributeType();
            const primaryAttributeValue = primaryKeys[i].getAttributeValue();
            result[primaryAttributeName] = this.castValue(primaryAttributeValue, primaryAttributeType);
        }

        return result;
    }

    toRecord<TRecord extends DynamoDBRecord>(recordCtor: Ctor<TRecord>, recordTypeId: symbol, attributes: DynamoDB.AttributeMap): TRecord {
        if (!recordTypeId) {
            throw Error(`The record type ID is missing`);
        }

        if (!attributes) {
            throw Error(`The attribute map is missing`)
        }

        const readingSchema = this._schemaProvider.getReadingSchema(recordTypeId);
        if (!readingSchema) {
            throw Error(`Failed to find a reading schema for the ${Symbol.keyFor(recordTypeId)}`);
        }

        const result = new recordCtor();
        const propertyNameIterator = readingSchema.keys();
        let propertyEntry = propertyNameIterator.next();
        let anySet = false;
        while (!propertyEntry.done) {
            const propertyAtt = readingSchema.get(propertyEntry.value);
            if (!propertyAtt) {
                throw Error(`The member schema is not defined at ${propertyEntry.value}`);
            }

            if (this._setProperty(attributes, propertyEntry.value, propertyAtt, result)) {
                anySet = true;
            }

            propertyEntry = propertyNameIterator.next();
        }

        if (!anySet) {
            throw Error(`None of the record's properties were set while reading from the DynamoDB Item`);
        }

        return <TRecord>result;
    }

    private _setAttribute(propertyName: string, schema: DynamoDBAttributeSchema, source: any, attributeMap: DynamoDB.AttributeMap) {
        if (schema.lastChildAttributeType === "M") {
            return;
        }

        if (!propertyName) {
            throw Error(`The property name is missing`);
        }

        const accessors = propertyName.split('.');
        if (accessors.length > 1) {
            for(let i = 0; i < accessors.length - 1; i++) {
                if (source === null) {
                    throw Error(`The object ${propertyName} has null-value`);
                }

                if (!source.hasOwnProperty(accessors[i])) {
                    throw Error(`The object does not have the ${accessors[i]} value`);
                }

                source = source[accessors[i]];
            }
        }

        propertyName = accessors[accessors.length - 1];
        if (source === null) {
            throw Error(`The object has a null-value under ${propertyName}`);
        }

        if (!source.hasOwnProperty(propertyName)) {
            throw Error(`The object does not have the ${propertyName} value`);
        }

        const sourceValue = source[propertyName];
        if (sourceValue === undefined) {
            throw Error(`The object has no ${propertyName} member defined`);
        }

        let attributeNameSegments = this._getSchemaFullPath(schema);
        let lastAttribute: AttributeValue = attributeMap;
        for(let i = 0; i < attributeNameSegments.length - 1 && attributeNameSegments.length > 1; i++) {
            if (!lastAttribute[attributeNameSegments[i]]) {
                lastAttribute[attributeNameSegments[i]] = {M: {}};
            }

            lastAttribute = lastAttribute[attributeNameSegments[i]].M;
        }

        const attributeValue = this.castValue(sourceValue, schema.lastChildAttributeType);
        lastAttribute[attributeNameSegments[attributeNameSegments.length - 1]] = attributeValue;
    }

    private _setProperty(source: DynamoDB.AttributeMap, propertyName: string, propertySchema: DynamoDBAttributeSchema, result: any): boolean {
        if (!source) {
            throw Error(`The DynamoDB Attribute Map is missing`);
        }

        if (!propertyName) {
            throw Error(`The record member name is missing`);
        }

        if (!propertySchema) {
            throw Error(`The record member mapping schema is missing`);
        }

        if (!result) {
            throw Error(`The target record object is missing`);
        }

        const segments = propertyName.split('.');
        if (segments.length === 1) {
            const dynamoDBAttr = this._findAttribute(propertySchema, source);
            if (dynamoDBAttr[propertySchema.lastChildAttributeType] === undefined) {
                throw Error(`The DynamoDB Item's attribute does not have the ${propertySchema.lastChildAttributeType} type`);
            }

            let value: any;
            switch (propertySchema.lastChildAttributeType) {
                case "N": {
                    value = parseFloat(dynamoDBAttr.N!);
                    break;
                }

                case "BOOL": {
                    value = new Boolean(dynamoDBAttr.BOOL);
                    break;
                }

                case "M": {
                    return false;
                }

                case "S": {
                    value = dynamoDBAttr.S;
                    break;
                }

                case "NULL": {
                    value = null;
                    break;
                }

                default: {
                    throw Error(`The ${propertySchema.lastChildAttributeType} type is not supported`);
                }
            }

            result[segments[0]] = value;
            return true;
        }

        if (segments.length > 1) {
            let temp = result;
            for (let i = 0; i < segments.length - 1; i++) {
                if (!temp.hasOwnProperty(segments[i])) {
                    temp[segments[i]] = {};
                }

                temp = temp[segments[i]];
            }

            return this._setProperty(source, segments[segments.length - 1], propertySchema, temp);
        }

        return false;
    }

    private _findAttribute(memberSchema: DynamoDBAttributeSchema, source: DynamoDB.AttributeMap): AttributeValue {
        let totalIterated = 0;
        const pathSegments: string[] = [];
        while (++totalIterated <= 10) {
            pathSegments.push(memberSchema.attributeName);
            if (memberSchema.nested) {
                memberSchema = memberSchema.nested;
            } else {
                break;
            }
        }

        const attributePath = pathSegments.join('.').split('.');
        let attribute: AttributeValue | undefined;
        for (let i = 0; i < attributePath.length; i++) {
            if (i === 0) {
                attribute = source[attributePath[i]];
                continue;
            }

            if (!attribute) {
                throw Error(`The DynamoDB Item's attribute ${attributePath[i - 1]} could not be found`);
            }

            if (!attribute.M) {
                throw Error(`The DynamoDB Item's attribute ${attributePath[i]} could not be found`);
            }

            attribute = attribute.M[attributePath[i]];
        }

        if (!attribute) {
            throw Error(`The DynamoDB Item's attribute could not be found at the given path ${attributePath.join('.')}`);
        }

        return attribute;
    }

    private _toPrimaryKey(attributeName: string, keyAttributeMap: DynamoDB.Key, primaryKeyType: PRIMARY_ATTRIBUTE_TYPE): PrimaryKeyValue {
        if (!attributeName) {
            throw Error(`The attribute name is missing`);
        }

        if (!keyAttributeMap) {
            throw Error(`The key map attribute is missing`);
        }

        if (!primaryKeyType) {
            throw Error(`The primary key type is missing`);
        }

        const attribute = keyAttributeMap[attributeName];
        if (!attribute) {
            throw Error(`The attribute ${attributeName} was not found in the key-map`);
        }

        const valueAccessors = Object.getOwnPropertyNames(attribute);
        if (!valueAccessors || valueAccessors.length !== 1) {
            throw Error(`The key attribute ${attributeName} must have one value accessor`);
        }

        const attributeType = this.toAttributeType(valueAccessors[0]);
        return new PrimaryKeyValueImpl(attributeName, attributeType, this.castValue(attribute[attributeType], attributeType));
    }

    private _getSchemaFullPath(schema: DynamoDBAttributeSchema): string[] {
        const result: string[] = [];
        while(schema.nested) {
            result.push(...schema.attributeName.split('.'));
            schema = schema.nested;
        }

        result.push(...schema.attributeName.split('.'));
        return result;
    }
}

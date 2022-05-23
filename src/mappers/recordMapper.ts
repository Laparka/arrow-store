import {
    AttributeDescriptor,
    Ctor,
    DynamoDBRecord
} from "../records/record";
import {DYNAMODB_ATTRIBUTE_TYPE, DynamoDBAttributeSchema, DynamoDBSchemaProvider} from "./schemaBuilders";
import {DynamoDB} from "aws-sdk";
import {AttributeValue} from "aws-sdk/clients/dynamodb";

export type DynamoDBRecordMapper = {
    toRecord<TRecord extends DynamoDBRecord>(recordCtor: Ctor<TRecord>, recordTypeId: symbol, attributes: DynamoDB.AttributeMap): TRecord;
    toAttributeMap<TRecord extends DynamoDBRecord>(recordTypeId: symbol, record: TRecord): DynamoDB.AttributeMap;
    toKeyAttribute(primaryKeys: ReadonlyArray<AttributeDescriptor>): DynamoDB.Key;
}

export class DefaultDynamoDBRecordMapper implements DynamoDBRecordMapper {
    private readonly _schemaProvider: DynamoDBSchemaProvider;

    constructor(schemaProvider: DynamoDBSchemaProvider) {
        this._schemaProvider = schemaProvider;
    }

    toAttributeMap<TRecord extends DynamoDBRecord>(recordTypeId: symbol, record: TRecord): DynamoDB.AttributeMap {
        const writingSchema = this._schemaProvider.getWritingSchema(recordTypeId);
        if (!writingSchema) {
            throw Error(`Writing schema was not found for the record type ID "${Symbol.keyFor(recordTypeId)}"`);
        }

        const attributesMap: DynamoDB.AttributeMap = {};
        const iterator = writingSchema.entries();
        let current = iterator.next();
        let isAnySet = false;
        while(!current.done) {
            const memberPath = current.value[0];
            const schema = current.value[1];
            current = iterator.next();
            if (schema.lastChildAttributeType === "M") {
                continue;
            }

            const value = this._evaluate(memberPath.split('.'), record);
            if(value === undefined) {
                continue;
            }

            isAnySet = true;
            if (value === null) {
                this._setAttributeValue(attributesMap, schema, true, "NULL");
            }
            else {
                this._setAttributeValue(attributesMap, schema, value, schema.lastChildAttributeType);
            }
        }

        if (!isAnySet) {
            throw Error(`The record was not mapped to attribute values`);
        }

        const primaryKeys = this.toKeyAttribute(record.getRecordId().getPrimaryKeys());
        return Object.assign(attributesMap, primaryKeys);
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
        const iterator = readingSchema.entries();
        let anySet = false;
        let schemaEntry = iterator.next();
        while (!schemaEntry.done) {
            const memberName = schemaEntry.value[0];
            const attributeSchema = schemaEntry.value[1];
            schemaEntry = iterator.next();
            if (attributeSchema.lastChildAttributeType === "M") {
                continue;
            }

            const attributeValue = this._findAttributeValueInMap(attributes, attributeSchema);
            if (!attributeValue) {
                continue;
            }

            const memberNameSegments = memberName.split('.');
            const targetMember = this._initMembers(result, memberNameSegments);
            targetMember[memberNameSegments[memberNameSegments.length - 1]] = this._fromAttributeValue(attributeValue);
            anySet = true;
        }

        if (!anySet) {
            throw Error(`None of the record's properties were set while reading from the DynamoDB Item`);
        }

        return result;
    }

    toKeyAttribute(primaryKeys: ReadonlyArray<AttributeDescriptor>): DynamoDB.Key {
        if (!primaryKeys || primaryKeys.length !== 1 && primaryKeys.length !== 2) {
            throw Error(`The query key expression must have one or two attributes`);
        }

        const key: DynamoDB.Key = {};
        for(let i = 0; i < primaryKeys.length; i++) {
            const attribute = primaryKeys[i];
            const attributeValue: AttributeValue = {};
            attributeValue[attribute.getAttributeType()] = attribute.getAttributeValue();
            key[attribute.getAttributeName()] = attributeValue;
        }

        return key;
    }

    public static toListAttributeItem(value: any): AttributeValue {
        if (value === null) {
            return {NULL: true};
        }

        switch (typeof value) {
            case "string": {
                return {S: value};
            }

            case "bigint":
            case "number": {
                return {N: value.toString()};
            }

            case "boolean": {
                return {BOOL: value};
            }
        }

        if (Array.isArray(value)) {
            return {
                L: (<any[]>value).map(v => DefaultDynamoDBRecordMapper.toListAttributeItem(v))
            };
        }

        throw Error(`Not supported type for the L-attribute value: "${value}". Only primitive types are supported`);
    }

    private _findAttributeValueInMap(attributes: DynamoDB.AttributeMap, attributeSchema: DynamoDBAttributeSchema): AttributeValue | null {
        if (!attributeSchema) {
            return null;
        }

        const nameSegments = attributeSchema.attributeName.split('.');
        let attributeValue;
        for(let i = 0; i < nameSegments.length; i++) {
            if (i === 0) {
                attributeValue = attributes[nameSegments[i]];
                continue;
            }
            else if (i + 1 < nameSegments.length && attributeValue) {
                attributeValue = attributeValue.M;
            }

            if (!attributeValue) {
                break;
            }

            attributeValue = attributeValue[nameSegments[i]];
        }

        if (!attributeValue) {
            return null;
        }

        if (attributeSchema.nested) {
            return this._findAttributeValueInMap(attributeValue.M, attributeSchema.nested);
        }

        return attributeValue;
    }

    private _initMembers(target: any, memberAccessor: string[]): any {
        if (target === undefined || target === null) {
            throw Error(`The target record object is not defined`);
        }

        if (memberAccessor.length === 0) {
            throw Error(`The member accessor segments are missing`);
        }

        if (memberAccessor.length === 1) {
            return target;
        }

        const rootMemberName = memberAccessor[0];
        if (target[rootMemberName] === undefined || target[rootMemberName] === null) {
            target[rootMemberName] = {};
        }

        target = target[rootMemberName];
        return this._initMembers(target, memberAccessor.slice(1, memberAccessor.length));
    }

    private _fromAttributeValue(attributeValue: DynamoDB.AttributeValue): any {
        if (!attributeValue || attributeValue.NULL === true) {
            return null;
        }

        const keys = Object.getOwnPropertyNames(attributeValue);
        if (keys.length !== 1) {
            throw Error(`The attribute type accessor was not found: ${keys.join(', ')}`);
        }

        const rawValue = attributeValue[keys[0]];
        switch (keys[0]) {
            case "N": {
                return parseFloat(rawValue.toString());
            }

            case "BOOL": {
                return rawValue === true;
            }

            case "S": {
                return rawValue;
            }

            case "L": {
                const listValues = <AttributeValue[]>rawValue;
                return listValues.map(x => this._fromAttributeValue(x));
            }

            case "SS": {
                return <string[]>rawValue;
            }

            case "NS": {
                return (<string[]>rawValue).map(num => {
                    const n = parseFloat(num);
                    if (isNaN(n)) {
                        throw Error(`Number value was expected: "${num}"`);
                    }

                    return n;
                });
            }
        }

        throw Error(`The ${keys[0]}-accessor is not supported`);
    }

    private _evaluate(memberPath: string[], record: any): any {
        if (!memberPath || memberPath.length === 0) {
            throw Error(`Member path is missing`);
        }

        if (!record) {
            throw Error(`Record object is missing`);
        }

        const value = record[memberPath[0]];
        if (memberPath.length === 1) {
            return value;
        }

        if (value === null) {
            return null;
        }

        if (value === undefined) {
            return undefined;
        }

        return this._evaluate(memberPath.slice(1, memberPath.length), value);
    }

    private _setAttributeValue(target: DynamoDB.AttributeMap, schema: DynamoDBAttributeSchema, value: any, lastChildAttributeType: DYNAMODB_ATTRIBUTE_TYPE): void {
        let nestedAttribute = target[schema.attributeName];
        if (!nestedAttribute) {
            nestedAttribute = {};
            target[schema.attributeName] = nestedAttribute;
        }

        if (schema.nested) {
            if (!nestedAttribute.M) {
                nestedAttribute.M = {};
            }

            this._setAttributeValue(nestedAttribute.M, schema.nested, value, schema.lastChildAttributeType);
            return;
        }

        switch (lastChildAttributeType) {
            case "L": {
                nestedAttribute.L = (<any[]>value).map(v => DefaultDynamoDBRecordMapper.toListAttributeItem(v));
                break;
            }

            case "SS": {
                nestedAttribute.SS = (<string[]>value);
                break;
            }

            case "N": {
                nestedAttribute.N = value.toString();
                break;
            }

            case "NS": {
                nestedAttribute.NS = (<number[]>value).map(v => {
                    if (isNaN(v)) {
                        throw Error(`Not a number ${v}`);
                    }

                    return v.toString();
                });
                break;
            }

            default: {
                nestedAttribute[lastChildAttributeType] = value;
                break;
            }
        }
    }
}

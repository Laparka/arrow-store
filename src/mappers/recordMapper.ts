import {DynamoDBRecord} from "../records/record";
import {DynamoDBAttributeSchema, DynamoDBSchemaProvider} from "./schemaBuilders";
import {DynamoDB} from "aws-sdk";
import {AttributeValue} from "aws-sdk/clients/dynamodb";

export interface DynamoDBRecordMapper {
    mapAttributes<TRecord extends DynamoDBRecord>(recordTypeId: symbol, attributes: DynamoDB.AttributeMap): TRecord;
}

export class DefaultDynamoDBRecordMapper implements DynamoDBRecordMapper {
    private readonly _schemaProvider: DynamoDBSchemaProvider;

    constructor(schemaProvider: DynamoDBSchemaProvider) {
        this._schemaProvider = schemaProvider;
    }

    mapAttributes<TRecord extends DynamoDBRecord>(recordTypeId: symbol, attributes: DynamoDB.AttributeMap): TRecord {
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

        const result: any = {};
        const propertyNameIterator = readingSchema.keys();
        let propertyEntry = propertyNameIterator.next();
        let anySet = false;
        while(!propertyEntry.done) {
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
            for(let i = 0; i < segments.length - 1; i++) {
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
        while(++totalIterated <= 10) {
            pathSegments.push(memberSchema.attributeName);
            if (memberSchema.nested) {
                memberSchema = memberSchema.nested;
            }
            else {
                break;
            }
        }

        const attributePath = pathSegments.join('.').split('.');
        let attribute: AttributeValue | undefined;
        for(let i = 0; i < attributePath.length; i++) {
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
}

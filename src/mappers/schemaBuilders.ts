import {DynamoDB} from "aws-sdk";
import {DynamoDBRecord} from "../records/record";

export interface DynamoDBRecordMapper {
    writeAttribute(record: any, attributeValue: DynamoDB.MapAttributeValue): void;
    readFromAttribute(attributeValue: DynamoDB.MapAttributeValue): any;
}

export abstract class DynamoDBRecordMapperBase<TRecord> implements DynamoDBRecordMapper {
    readFromAttribute(attributeValue: DynamoDB.MapAttributeValue): any {
        return this.doReadAs(attributeValue);
    }

    writeAttribute(record: any, attributeValue: DynamoDB.MapAttributeValue): void {
        this.doWriteAs(<TRecord>record, attributeValue);
    }

    protected fromStringAttr(attributeValue: DynamoDB.AttributeValue, required: boolean): string | null {
        if (required && !attributeValue) {
            throw Error(`The required attribute does not exist`);
        }

        let value: string | null = null;
        if (attributeValue && !attributeValue.NULL) {
            value = attributeValue.S ?? null;
        }

        return value;
    }

    protected toNumberAttr(num: number | null): DynamoDB.AttributeValue {
        const attribute: DynamoDB.AttributeValue = {};
        if (num !== null) {
            attribute.N = `${num}`;
        }
        else {
            attribute.NULL = true;
        }

        return attribute;
    }

    protected abstract doReadAs(attributeValue: DynamoDB.MapAttributeValue): TRecord;
    protected abstract doWriteAs(record: TRecord, attributeValue: DynamoDB.MapAttributeValue): void;
}

export interface DynamoDBRecordSchemaBuilder<TRecord> {
    forMember<TMember>(memberAccessor: (record: TRecord) => TMember, map: (attribute: DynamoDBMemberSchemaBuilder<TMember>) => void): DynamoDBRecordSchemaBuilder<TRecord>;
    getRecordSchema(): Map<string, DynamoDBAttributeSchema>;
}

export interface DynamoDBMemberSchemaBuilder<TMember> {
    asObject(attributeName: string, map: (attribute:DynamoDBRecordSchemaBuilder<TMember>) => DynamoDBRecordSchemaBuilder<TMember>): void;
    asNumber(attributeName: string): void;
    asString(attributeName: string): void;
    asBool(attributeName: string): void;
    getSchema(): Map<string, DynamoDBAttributeSchema>;
}

export interface DynamoDBMappingProvider {
}

export interface MappingBuilder {
    use<TRecord extends DynamoDBRecord>(typeId: symbol, mapper: DynamoDBRecordMapperBase<TRecord>): void;
    createReaderFor<TRecord extends DynamoDBRecord>(typeId: symbol): DynamoDBRecordSchemaBuilder<TRecord>;
    createWriterFor<TRecord extends DynamoDBRecord>(typeId: symbol): DynamoDBRecordSchemaBuilder<TRecord>;
    buildMappingProvider(): DynamoDBMappingProvider;
}

export interface DynamoDBMappingProfile {
    register(builder: MappingBuilder): void;
}

export type DYNAMODB_ATTRIBUTE_TYPE = "S" |  "N" |  "B" |  "SS" |  "NS" |  "BS" |  "M" |  "L" |  "NULL" |  "BOOL";

export type DynamoDBAttributeSchema = {
    attributeName: string,
    attributeType: DYNAMODB_ATTRIBUTE_TYPE,
    nested?: DynamoDBAttributeSchema
};

export interface DynamoDBReadingSchema {
    findByPath(memberAccessor: string[]): DynamoDBAttributeSchema;
}

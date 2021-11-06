import {DynamoDB} from "aws-sdk";
import {DynamoDBRecord} from "../records/record";

export interface DynamoDBRecordMapper {
    writeAs(record: any, attributeValue: DynamoDB.MapAttributeValue): void;
    readAs(attributeValue: DynamoDB.MapAttributeValue): any;
}

export abstract class DynamoDBRecordMapperBase<TRecord> implements DynamoDBRecordMapper {
    readAs(attributeValue: DynamoDB.MapAttributeValue): any {
        return this.doReadAs(attributeValue);
    }

    writeAs(record: any, attributeValue: DynamoDB.MapAttributeValue): void {
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
    forMember<TMember>(memberAccessor: (record: TRecord) => TMember, map: (attribute: DynamoDBMemberSchemaBuilder<TMember>) => DynamoDBMemberSchemaBuilder<TMember>): DynamoDBRecordSchemaBuilder<TRecord>;
}

export interface DynamoDBMemberSchemaBuilder<TMember> {
    nestedIn(nestedAttributeName: string): DynamoDBMemberSchemaBuilder<TMember>;
    asObject(nestedAttributeName: string, map: (attribute:DynamoDBRecordSchemaBuilder<TMember>) => DynamoDBRecordSchemaBuilder<TMember>): DynamoDBMemberSchemaBuilder<TMember>;
    asNumber(attributeName: string): DynamoDBMemberSchemaBuilder<TMember>;
    asString(attributeName: string): DynamoDBMemberSchemaBuilder<TMember>;
    asBool(attributeName: string): DynamoDBMemberSchemaBuilder<TMember>;
}

export interface MappingBuilder {
    use<TRecord extends DynamoDBRecord>(typeId: symbol, mapper: DynamoDBRecordMapperBase<TRecord>): void;
    createReaderFor<TRecord extends DynamoDBRecord>(typeId: symbol): DynamoDBRecordSchemaBuilder<TRecord>;
    createWriterFor<TRecord extends DynamoDBRecord>(typeId: symbol): DynamoDBRecordSchemaBuilder<TRecord>;
}

export interface DynamoDBMappingProfile {
    register(builder: MappingBuilder): void;
}

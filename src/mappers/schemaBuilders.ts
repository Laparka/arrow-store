import {DynamoDBRecord} from "../records/record";

export abstract class DynamoDBRecordSchemaSourceBase<TRecord extends DynamoDBRecord> {
    abstract getSchema(): ReadonlyMap<string, DynamoDBAttributeSchema>;
}

export interface DynamoDBRecordSchemaBuilder<TRecord> {
    forMember<TMember>(memberAccessor: (record: TRecord) => TMember, map: (attribute: DynamoDBMemberSchemaBuilder<TMember>) => void): DynamoDBRecordSchemaBuilder<TRecord>;

    getRecordSchema(): ReadonlyMap<string, DynamoDBAttributeSchema>;
}

export interface DynamoDBMemberSchemaBuilder<TMember> {
    asObject(attributeName: string, map: (attribute: DynamoDBRecordSchemaBuilder<TMember>) => DynamoDBRecordSchemaBuilder<TMember>): void;

    asNumber(attributeName: string): void;

    asString(attributeName: string): void;

    asBool(attributeName: string): void;

    getMemberSchema(): ReadonlyMap<string, DynamoDBAttributeSchema>;
}

export interface DynamoDBSchemaProvider {
    getReadingSchema(recordTypeId: symbol): ReadonlyMap<string, DynamoDBAttributeSchema>;

    getWritingSchema(recordTypeId: symbol): ReadonlyMap<string, DynamoDBAttributeSchema>;
}

export interface MappingBuilder {
    use<TRecord extends DynamoDBRecord>(typeId: symbol, schemaSource: DynamoDBRecordSchemaSourceBase<TRecord>): void;

    createReaderFor<TRecord extends DynamoDBRecord>(typeId: symbol): DynamoDBRecordSchemaBuilder<TRecord>;

    createWriterFor<TRecord extends DynamoDBRecord>(typeId: symbol): DynamoDBRecordSchemaBuilder<TRecord>;
}

export interface DynamoDBMappingProfile {
    register(builder: MappingBuilder): void;
}

export type DYNAMODB_ATTRIBUTE_TYPE = "S" | "N" | "B" | "SS" | "NS" | "BS" | "M" | "L" | "NULL" | "BOOL";

export type DynamoDBAttributeSchema = {
    attributeName: string,
    attributeType: DYNAMODB_ATTRIBUTE_TYPE,
    lastChildAttributeType: DYNAMODB_ATTRIBUTE_TYPE,
    nested?: DynamoDBAttributeSchema
};

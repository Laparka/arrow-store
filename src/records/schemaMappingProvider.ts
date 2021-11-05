import {Record} from "./record";

export interface SchemaMappingProvider {
    findMappingSchema(typeId: symbol): any;
}

export interface DynamoDBAttributeBuilder {
    inside(nestedAttributeName: string): DynamoDBAttributeBuilder;

    asNumber(attributeName: string, required?: boolean): DynamoDBAttributeBuilder;

    asString(brand: string, required?: boolean): DynamoDBAttributeBuilder;
}

export interface ToDatabaseMappingBuilder<TRecord extends Record> {
    for(source: (record: TRecord) => any, map: (builder: DynamoDBAttributeBuilder) => any): ToDatabaseMappingBuilder<TRecord>;
}

export interface  ToRecordMappingBuilder<TRecord extends Record> {
    for(target: (record: TRecord) => any, map: (builder: DynamoDBAttributeBuilder) => any): ToRecordMappingBuilder<TRecord>;
}

export interface SchemaMappingBuilder {
    build(): SchemaMappingProvider;

    toAttributeValues<TRecord extends Record>(typeId: symbol): ToDatabaseMappingBuilder<TRecord>;

    toRecord<TRecord extends Record>(typeId: symbol): ToRecordMappingBuilder<TRecord>;
}

export interface SchemaMappingProfile {
    registerSchema(builder: SchemaMappingBuilder): void;
}

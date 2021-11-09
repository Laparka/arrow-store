import {
    DynamoDBAttributeSchema, DynamoDBMappingProvider,
    DynamoDBRecordSchemaBuilder, DynamoDBRecordSchemaSourceBase,
    MappingBuilder
} from "./schemaBuilders";
import {DynamoDBRecord} from "../records/record";
import FromAttributeSchemaBuilder from "./fromAttributeSchemaBuilder";
import DefaultSchemaSource from "./defaultSchemaSource";

class DefaultMappingProvider implements DynamoDBMappingProvider {
    private readonly _readingSchema: ReadonlyMap<symbol, DynamoDBRecordSchemaSourceBase<any>>;
    constructor(readingSchema: ReadonlyMap<symbol, DynamoDBRecordSchemaSourceBase<any>>) {
        this._readingSchema = readingSchema;
    }

}

export default class DynamoDBMappingBuilder implements MappingBuilder {
    private readonly _fromAttributeReaders: Map<symbol, DynamoDBRecordSchemaBuilder<any>>;
    private readonly _toAttributeWriters: Map<symbol, DynamoDBRecordSchemaBuilder<any>>;
    private readonly _schemaSources: Map<symbol, DynamoDBRecordSchemaSourceBase<any>>;
    constructor() {
        this._fromAttributeReaders = new Map<symbol, DynamoDBRecordSchemaBuilder<any>>();
        this._toAttributeWriters = new Map<symbol, DynamoDBRecordSchemaBuilder<any>>();
        this._schemaSources = new Map<symbol, DynamoDBRecordSchemaSourceBase<any>>();
    }

    createReaderFor<TRecord extends DynamoDBRecord>(typeId: symbol): DynamoDBRecordSchemaBuilder<TRecord> {
        const builder = new FromAttributeSchemaBuilder<TRecord>();
        this._fromAttributeReaders.set(typeId, builder);
        return builder;
    }

    createWriterFor<TRecord extends DynamoDBRecord>(typeId: symbol): DynamoDBRecordSchemaBuilder<TRecord> {
        throw Error(`Not implemented`);
    }

    use<TRecord extends DynamoDBRecord>(typeId: symbol, schemaSource: DynamoDBRecordSchemaSourceBase<TRecord>): void {
        if (!typeId) {
            throw Error(`The record registration type ID is required`);
        }

        if (!schemaSource) {
            throw Error(`The schema source is required`);
        }

        this._schemaSources.set(typeId, schemaSource);
    }

    buildMappingProvider(): DynamoDBMappingProvider {
        this._fromAttributeReaders.forEach((builder, typeId) => {
            this._schemaSources.set(typeId, new DefaultSchemaSource(builder.getRecordSchema()));
        });

        return new DefaultMappingProvider(this._schemaSources);
    }
}

import {
    DynamoDBAttributeSchema, DynamoDBMappingProvider,
    DynamoDBRecordMapper,
    DynamoDBRecordMapperBase,
    DynamoDBRecordSchemaBuilder,
    MappingBuilder
} from "./schemaBuilders";
import {DynamoDBRecord} from "../records/record";
import FromAttributeSchemaBuilder from "./fromAttributeSchemaBuilder";

class DefaultMappingProvider implements DynamoDBMappingProvider {
    private readonly _readingSchema: Map<symbol, Map<string, DynamoDBAttributeSchema>>;
    constructor(readingSchema: Map<symbol, Map<string, DynamoDBAttributeSchema>>) {
        this._readingSchema = readingSchema;
    }

}

export default class DynamoDBMappingBuilder implements MappingBuilder {
    private readonly _fromAttributeReaders: Map<symbol, DynamoDBRecordSchemaBuilder<any>>;
    private readonly _toAttributeWriters: Map<symbol, DynamoDBRecordSchemaBuilder<any>>;
    private readonly _mappers: Map<symbol, DynamoDBRecordMapper>;
    constructor() {
        this._fromAttributeReaders = new Map<symbol, DynamoDBRecordSchemaBuilder<any>>();
        this._toAttributeWriters = new Map<symbol, DynamoDBRecordSchemaBuilder<any>>();
        this._mappers = new Map<symbol, DynamoDBRecordMapper>();
    }

    createReaderFor<TRecord extends DynamoDBRecord>(typeId: symbol): DynamoDBRecordSchemaBuilder<TRecord> {
        const builder = new FromAttributeSchemaBuilder<TRecord>();
        this._fromAttributeReaders.set(typeId, builder);
        return builder;
    }

    createWriterFor<TRecord extends DynamoDBRecord>(typeId: symbol): DynamoDBRecordSchemaBuilder<TRecord> {
        throw Error(`Not implemented`);
    }

    use<TRecord>(typeId: symbol, mapper: DynamoDBRecordMapperBase<TRecord>): void {
        if (!mapper) {
            throw Error(`The record mapper is required`);
        }

        this._mappers.set(typeId, mapper);
    }

    buildMappingProvider(): DynamoDBMappingProvider {
        const readingSchema = new Map<symbol, Map<string, DynamoDBAttributeSchema>>();
        this._fromAttributeReaders.forEach((builder, typeId) => {
            readingSchema.set(typeId, builder.getRecordSchema());
        });

        return new DefaultMappingProvider(readingSchema);
    }
}

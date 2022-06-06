import {
    DefaultSchemaProvider,
    DefaultSchemaSource,
    DynamoDBRecordSchemaBuilder,
    DynamoDBRecordSchemaSourceBase,
    DynamoDBSchemaProvider,
    MappingBuilder
} from "./schemaBuilders";
import {DynamoDBRecord} from "../records/record";
import {AttributeSchemaBuilder} from "./attributeSchemaBuilder";

export default class DynamoDBMappingBuilder implements MappingBuilder {
    private readonly _fromAttributeReaders: Map<symbol, DynamoDBRecordSchemaBuilder<any>>;
    private readonly _toAttributeWriters: Map<symbol, DynamoDBRecordSchemaBuilder<any>>;

    private readonly _readingSchemaSources: Map<symbol, DynamoDBRecordSchemaSourceBase<any>>;
    private readonly _writingSchemaSources: Map<symbol, DynamoDBRecordSchemaSourceBase<any>>;

    constructor() {
        this._fromAttributeReaders = new Map<symbol, DynamoDBRecordSchemaBuilder<any>>();
        this._toAttributeWriters = new Map<symbol, DynamoDBRecordSchemaBuilder<any>>();
        this._readingSchemaSources = new Map<symbol, DynamoDBRecordSchemaSourceBase<any>>();
        this._writingSchemaSources = new Map<symbol, DynamoDBRecordSchemaSourceBase<any>>();
    }

    createReaderFor<TRecord extends DynamoDBRecord>(typeId: symbol): DynamoDBRecordSchemaBuilder<TRecord> {
        const builder = new AttributeSchemaBuilder<TRecord>();
        this._fromAttributeReaders.set(typeId, builder);
        return builder;
    }

    createWriterFor<TRecord extends DynamoDBRecord>(typeId: symbol): DynamoDBRecordSchemaBuilder<TRecord> {
        const builder = new AttributeSchemaBuilder<TRecord>();
        this._toAttributeWriters.set(typeId, builder);
        return builder;
    }

    use<TRecord extends DynamoDBRecord>(typeId: symbol, schemaSource: DynamoDBRecordSchemaSourceBase<TRecord>): void {
        if (!typeId) {
            throw Error(`The record registration type ID is required`);
        }

        if (!schemaSource) {
            throw Error(`The schema source is required`);
        }

        this._readingSchemaSources.set(typeId, schemaSource);
        this._writingSchemaSources.set(typeId, schemaSource);
    }

    buildSchemaProvider(): DynamoDBSchemaProvider {
        this._fromAttributeReaders.forEach((builder, typeId) => {
            this._readingSchemaSources.set(typeId, new DefaultSchemaSource(builder.getRecordSchema()));
        });

        this._toAttributeWriters.forEach((builder, typeId) => {
            this._writingSchemaSources.set(typeId, new DefaultSchemaSource(builder.getRecordSchema()));
        });

        return new DefaultSchemaProvider(this._readingSchemaSources, this._writingSchemaSources);
    }
}

import {
    DynamoDBRecordMapper,
    DynamoDBRecordMapperBase,
    DynamoDBRecordSchemaBuilder,
    MappingBuilder
} from "./schemaBuilders";
import {DynamoDBRecord} from "../records/record";
import FromAttributeSchemaBuilder from "./fromAttributeSchemaBuilder";

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
}

import {DynamoDBAttributeSchema, DynamoDBSchemaProvider, DynamoDBRecordSchemaSourceBase} from "./schemaBuilders";

export class DefaultSchemaProvider implements DynamoDBSchemaProvider {
    private readonly _readingSchemaSources: ReadonlyMap<symbol, DynamoDBRecordSchemaSourceBase<any>>;
    private readonly _writingSchemaSources: ReadonlyMap<symbol, DynamoDBRecordSchemaSourceBase<any>>;

    constructor(readingSchemaSources: ReadonlyMap<symbol, DynamoDBRecordSchemaSourceBase<any>>, writingSchemaSources: ReadonlyMap<symbol, DynamoDBRecordSchemaSourceBase<any>>) {
        this._readingSchemaSources = readingSchemaSources;
        this._writingSchemaSources = writingSchemaSources;
    }

    getReadingSchema(recordTypeId: symbol): ReadonlyMap<string, DynamoDBAttributeSchema> {
        const schemaSource = this._readingSchemaSources.get(recordTypeId);
        if (!schemaSource) {
            throw Error(`The schema source was not found: ${Symbol.keyFor(recordTypeId)}`)
        }

        const readingSchema = schemaSource.getSchema();
        if (!readingSchema) {
            throw Error(`The reading schema is not defined: ${Symbol.keyFor(recordTypeId)}`)
        }

        return readingSchema;
    }

    getWritingSchema(recordTypeId: symbol): ReadonlyMap<string, DynamoDBAttributeSchema> {
        const schemaSource = this._writingSchemaSources.get(recordTypeId);
        if (!schemaSource) {
            throw Error(`The schema source was not found: ${Symbol.keyFor(recordTypeId)}`)
        }

        const writingSchema = schemaSource.getSchema();
        if (!writingSchema) {
            throw Error(`The writing schema is not defined: ${Symbol.keyFor(recordTypeId)}`)
        }

        return writingSchema;
    }
}

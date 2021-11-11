import {DynamoDBAttributeSchema, DynamoDBSchemaProvider, DynamoDBRecordSchemaSourceBase} from "./schemaBuilders";

export class DefaultSchemaProvider implements DynamoDBSchemaProvider {
    private readonly _schemaSources: ReadonlyMap<symbol, DynamoDBRecordSchemaSourceBase<any>>;

    constructor(_schemaSources: ReadonlyMap<symbol, DynamoDBRecordSchemaSourceBase<any>>) {
        this._schemaSources = _schemaSources;
    }

    getReadingSchema(recordTypeId: symbol): ReadonlyMap<string, DynamoDBAttributeSchema> {
        const schemaSource = this._schemaSources.get(recordTypeId);
        if (!schemaSource) {
            throw Error(`The schema source was not found: ${Symbol.keyFor(recordTypeId)}`)
        }

        const readingSchema = schemaSource.getReadingSchema();
        if (!readingSchema) {
            throw Error(`The reading schema is not defined: ${Symbol.keyFor(recordTypeId)}`)
        }

        return readingSchema;
    }
}

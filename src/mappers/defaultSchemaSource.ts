import {DynamoDBAttributeSchema, DynamoDBRecordSchemaSourceBase} from "./schemaBuilders";

export default class DefaultSchemaSource extends DynamoDBRecordSchemaSourceBase<any> {
    private readonly _readingSchemaSource: ReadonlyMap<string, DynamoDBAttributeSchema>;
    constructor(readingSchemaSource: ReadonlyMap<string, DynamoDBAttributeSchema>) {
        super();
        this._readingSchemaSource = readingSchemaSource;
    }
    getReadingSchema(): ReadonlyMap<string, DynamoDBAttributeSchema> {
        return this._readingSchemaSource;
    }

}

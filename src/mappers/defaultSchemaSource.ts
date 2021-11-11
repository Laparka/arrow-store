import {DynamoDBAttributeSchema, DynamoDBRecordSchemaSourceBase} from "./schemaBuilders";

export default class DefaultSchemaSource extends DynamoDBRecordSchemaSourceBase<any> {
    private readonly _schema: ReadonlyMap<string, DynamoDBAttributeSchema>;
    constructor(schema: ReadonlyMap<string, DynamoDBAttributeSchema>) {
        super();
        this._schema = schema;
    }

    getSchema(): ReadonlyMap<string, DynamoDBAttributeSchema> {
        return this._schema;
    }

}

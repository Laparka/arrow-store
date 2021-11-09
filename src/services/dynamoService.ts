import {DynamoDBRecord, DynamoDBQueryIndexBase} from "../records/record";
import {DynamoQuery} from "./dynamoQuery";
import {DynamoDBRecordSchemaSourceBase} from "../mappers/schemaBuilders";

export class DynamoService {
    private readonly _schemaSources: ReadonlyMap<symbol, DynamoDBRecordSchemaSourceBase<any>>;

    constructor(schemaSources: ReadonlyMap<symbol, DynamoDBRecordSchemaSourceBase<any>>) {
        this._schemaSources = schemaSources;
    }

    query<TRecord extends DynamoDBRecord>(query: DynamoDBQueryIndexBase<TRecord>): DynamoQuery<TRecord>{
        const recordSchema  = this._schemaSources.get(query.getRecordTypeId())?.getReadingSchema();
        if (!recordSchema) {
            throw Error(`The record schema was not found`);
        }

        return new DynamoQuery<TRecord>(query, recordSchema);
    }
}

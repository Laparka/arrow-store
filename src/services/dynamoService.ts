import {DynamoDBRecord, DynamoDBQueryIndexBase} from "../records/record";
import {DynamoQuery} from "./dynamoQuery";
import {DynamoDBRecordSchemaSourceBase} from "../mappers/schemaBuilders";
import {DynamoDBClientResolver} from "./dynamoResolver";

export class DynamoService {
    private readonly _clientResolver: DynamoDBClientResolver;
    private readonly _schemaSources: ReadonlyMap<symbol, DynamoDBRecordSchemaSourceBase<any>>;

    constructor(clientResolver: DynamoDBClientResolver, schemaSources: ReadonlyMap<symbol, DynamoDBRecordSchemaSourceBase<any>>) {
        this._clientResolver = clientResolver;
        this._schemaSources = schemaSources;
    }

    query<TRecord extends DynamoDBRecord>(query: DynamoDBQueryIndexBase<TRecord>): DynamoQuery<TRecord>{
        const recordSchema  = this._schemaSources.get(query.getRecordTypeId())?.getReadingSchema();
        if (!recordSchema) {
            throw Error(`The record schema was not found`);
        }

        return new DynamoQuery<TRecord>(query, recordSchema, this._clientResolver);
    }
}

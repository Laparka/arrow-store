import {DynamoDBRecord, DynamoDBRecordIndexBase} from "../records/record";
import {DynamoQuery} from "./dynamoQuery";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBClientResolver} from "./dynamoResolver";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";

export class DynamoService {
    private readonly _clientResolver: DynamoDBClientResolver;
    private readonly _schemaProvider: DynamoDBSchemaProvider;
    private readonly _recordMapper: DynamoDBRecordMapper;

    constructor(clientResolver: DynamoDBClientResolver, schemaProvider: DynamoDBSchemaProvider, recordMapper: DynamoDBRecordMapper) {
        this._clientResolver = clientResolver;
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;
    }

    query<TRecord extends DynamoDBRecord>(query: DynamoDBRecordIndexBase<TRecord>): DynamoQuery<TRecord>{
        return new DynamoQuery<TRecord>(query, this._schemaProvider, this._recordMapper, this._clientResolver);
    }
}

import {DynamoDBRecord, DynamoDBRecordIndexBase} from "../records/record";
import {DynamoDBListQueryBuilder, ListQueryBuilder} from "./listQueryBuilder";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBClientResolver} from "./dynamoResolver";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDBUpdateBuilder, UpdateBuilder} from "./updateBuilder";
import {DeleteBuilder} from "./deleteBuilder";
import {DynamoDBPutBuilder, PutBuilder} from "./putBuilder";

export interface DatabaseService {
    query<TRecord extends DynamoDBRecord>(query: DynamoDBRecordIndexBase<TRecord>): ListQueryBuilder<TRecord>;
    put<TRecord extends DynamoDBRecord>(record: TRecord): PutBuilder<TRecord>;
    update<TRecord extends DynamoDBRecord>(recordId: DynamoDBRecordIndexBase<TRecord>): UpdateBuilder<TRecord>;
    delete<TRecord extends DynamoDBRecord>(recordId: DynamoDBRecordIndexBase<TRecord>): DeleteBuilder<TRecord>
}

export class DynamoDBService implements DatabaseService {
    private readonly _clientResolver: DynamoDBClientResolver;
    private readonly _schemaProvider: DynamoDBSchemaProvider;
    private readonly _recordMapper: DynamoDBRecordMapper;

    constructor(clientResolver: DynamoDBClientResolver, schemaProvider: DynamoDBSchemaProvider, recordMapper: DynamoDBRecordMapper) {
        this._clientResolver = clientResolver;
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;
    }

    query<TRecord extends DynamoDBRecord>(query: DynamoDBRecordIndexBase<TRecord>): ListQueryBuilder<TRecord> {
        return new DynamoDBListQueryBuilder<TRecord>(query, this._schemaProvider, this._recordMapper, this._clientResolver);
    }

    delete<TRecord extends DynamoDBRecord>(recordId: DynamoDBRecordIndexBase<TRecord>): DeleteBuilder<TRecord> {
        throw Error(`Not implemented`);
    }

    put<TRecord extends DynamoDBRecord>(record: TRecord): PutBuilder<TRecord> {
        return new DynamoDBPutBuilder<TRecord>(record, this._schemaProvider, this._recordMapper, this._clientResolver);
    }

    update<TRecord extends DynamoDBRecord>(recordId: DynamoDBRecordIndexBase<TRecord>): UpdateBuilder<TRecord> {
        return new DynamoDBUpdateBuilder(recordId, this._schemaProvider, this._recordMapper, this._clientResolver);
    }
}

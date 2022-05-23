import {DynamoDBRecord, DynamoDBRecordIndexBase} from "../records/record";
import {DynamoDBListQueryBuilder, ListQueryBuilder} from "../builders/listQueryBuilder";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBClientResolver} from "./dynamoResolver";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDBUpdateBuilder, UpdateBuilder} from "../builders/updateBuilder";
import {DeleteBuilder, DynamoDBDeleteItemBuilder} from "../builders/deleteBuilder";
import {DynamoDBPutBuilder, PutBuilder} from "../builders/putBuilder";
import {ExpressionAttributeNameMap, GetItemInput, Key, QueryInput, QueryOutput} from "aws-sdk/clients/dynamodb";
import {AttributesBuilderBase} from "../builders/attributesBuilderBase";

export interface DatabaseService {
    getAsync<TRecord extends DynamoDBRecord>(recordId: DynamoDBRecordIndexBase<TRecord>): Promise<TRecord | null>;
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

    async getAsync<TRecord extends DynamoDBRecord>(recordId: DynamoDBRecordIndexBase<TRecord>): Promise<TRecord | null> {
        if (!recordId) {
            throw Error(`The recordId is missing`);
        }

        const tableName: string | undefined = recordId.getTableName();
        if (!tableName) {
            throw Error(`The DynamoDB Table name was not found in the record's ID`);
        }

        const primaryKeys = recordId.getPrimaryKeys();
        const getInput: GetItemInput = {
            TableName: tableName,
            ConsistentRead: recordId.isConsistentRead(),
            Key: this._recordMapper.toKeyAttribute(primaryKeys)
        };

        const client = this._clientResolver.resolve();
        const response = await client.getItem(getInput).promise();
        if (!response.Item) {
            return null;
        }

        return this._recordMapper.toRecord<TRecord>(recordId.getRecordType(), recordId.getRecordTypeId(), response.Item);
    }

    query<TRecord extends DynamoDBRecord>(query: DynamoDBRecordIndexBase<TRecord>): ListQueryBuilder<TRecord> {
        return new DynamoDBListQueryBuilder<TRecord>(query, this._schemaProvider, this._recordMapper, this._clientResolver);
    }

    delete<TRecord extends DynamoDBRecord>(recordId: DynamoDBRecordIndexBase<TRecord>): DeleteBuilder<TRecord> {
        return new DynamoDBDeleteItemBuilder<TRecord>(recordId, this._schemaProvider, this._recordMapper, this._clientResolver);
    }

    put<TRecord extends DynamoDBRecord>(record: TRecord): PutBuilder<TRecord> {
        return new DynamoDBPutBuilder<TRecord>(record, this._schemaProvider, this._recordMapper, this._clientResolver);
    }

    update<TRecord extends DynamoDBRecord>(recordId: DynamoDBRecordIndexBase<TRecord>): UpdateBuilder<TRecord> {
        return new DynamoDBUpdateBuilder(recordId, this._schemaProvider, this._recordMapper, this._clientResolver);
    }
}
